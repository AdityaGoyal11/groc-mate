import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { createInterface } from 'node:readline/promises'
import { getList } from '../../services/grocery-list.service.js'
import { buildAndFillCart } from '../../services/cart.service.js'
import { getSessionCookie } from './config.js'
import { compareList } from '../../services/price-comparison.service.js'
import { printCompareTable } from '../display.js'
import { openUrl } from '../open.js'
import type { StoreId } from '../../adapters/types.js'

export function cartCommand(): Command {
  return new Command('cart')
    .description('Fill a store cart with your grocery list and get a direct link')
    .option('-s, --store <store>', 'Target store: woolworths or coles', 'woolworths')
    .option('-l, --list <name>', 'List to use', 'default')
    .option('--dry-run', 'Show what would be ordered without filling the cart')
    .option('--headless', 'Run browser in headless mode (default: true)', true)
    .option('--no-headless', 'Show the browser window while filling the cart')
    .option('--no-open', 'Print the cart URL but don\'t open it in your browser')
    .action(
      async (opts: {
        store: string
        list: string
        dryRun?: boolean
        headless: boolean
        open: boolean
      }) => {
        const storeId = opts.store as StoreId
        if (!['woolworths', 'coles'].includes(storeId)) {
          console.error(chalk.red(`Cart filling is only supported for woolworths and coles.`))
          process.exit(1)
        }

        const list = getList(opts.list)
        if (!list.items.length) {
          console.log(chalk.yellow('Your list is empty. Add items with: groc list add "milk"'))
          return
        }

        // Always show a dry-run preview first
        const spinner = ora(`Looking up prices for ${list.items.length} item(s)…`).start()
        const rows = await compareList(list.items.map((i) => i.query), [storeId])
        spinner.stop()

        console.log(chalk.bold(`\nCart preview — ${storeId}\n`))
        printCompareTable(rows)

        const total = rows.reduce((sum, row) => {
          const price =
            storeId === 'woolworths'
              ? row.woolworths?.price
              : row.coles?.price
          if (!price) return sum
          return sum + parseFloat(price.replace('$', ''))
        }, 0)

        const found = rows.filter((r) => (storeId === 'woolworths' ? r.woolworths : r.coles)).length
        const missing = rows.length - found

        console.log(
          `\n  Items found: ${chalk.green(found)}  |  Not found: ${missing > 0 ? chalk.red(missing) : chalk.dim(missing)}  |  Est. total: ${chalk.bold('$' + total.toFixed(2))}`,
        )

        const hasSessionCookie = !!(await getSessionCookie(storeId))
        if (!hasSessionCookie) {
          console.log(
            chalk.dim(
              `\n  Tip: run "groc config set-cookie ${storeId}" to add items to your logged-in cart.`,
            ),
          )
        }

        if (opts.dryRun) {
          console.log(chalk.dim('\n  Dry run — no cart was filled.'))
          return
        }

        // Confirm before filling
        const rl = createInterface({ input: process.stdin, output: process.stdout })
        const answer = await rl.question(
          `\nFill ${chalk.bold(storeId)} cart with ${found} item(s)? [y/N] `,
        )
        rl.close()

        if (!answer.trim().toLowerCase().startsWith('y')) {
          console.log(chalk.dim('Cancelled.'))
          return
        }

        // Warn about ToS
        console.log(
          chalk.yellow(
            '\n⚠️  Note: automated access may violate the retailer\'s Terms of Service.\n   groc-mate acts as your personal browser agent.\n',
          ),
        )

        const sessionCookie = await getSessionCookie(storeId)
        const fillSpinner = ora(`Opening ${storeId} and filling cart…`).start()

        try {
          const result = await buildAndFillCart(
            list,
            storeId,
            sessionCookie,
            opts.headless,
            (msg) => {
              fillSpinner.text = msg
            },
          )

          fillSpinner.succeed(`Cart filled — ${result.itemsFilled} item(s) added`)

          if (result.itemsSkipped.length) {
            console.log(chalk.yellow(`\nSkipped ${result.itemsSkipped.length} item(s):`))
            for (const s of result.itemsSkipped) {
              console.log(`  ${chalk.dim('•')} ${s.query} — ${chalk.red(s.reason)}`)
            }
          }

          console.log(`\n  ${chalk.bold('Cart URL:')} ${chalk.cyan(result.cartUrl)}`)

          if (opts.open) {
            await openUrl(result.cartUrl)
            console.log(chalk.dim('  Opened in your browser.'))
          } else {
            console.log(chalk.dim('  Copy the URL above and paste it in your browser.'))
          }
        } catch (err) {
          fillSpinner.fail('Cart fill failed')
          console.error(err)
        }
      },
    )
}
