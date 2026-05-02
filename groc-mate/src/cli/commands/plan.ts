import { Command } from 'commander'
import chalk from 'chalk'
import Table from 'cli-table3'
import ora from 'ora'
import { createInterface } from 'node:readline/promises'
import { extractIngredients } from '../../services/meal-plan.service.js'
import { compareList } from '../../services/price-comparison.service.js'
import { addItem, getList } from '../../services/grocery-list.service.js'
import { printCompareTable } from '../display.js'
import { getAnthropicKey } from './config.js'
import { appConfig } from '../../config/config.js'
import type { StoreId } from '../../adapters/types.js'

export function planCommand(): Command {
  return new Command('plan')
    .description('Extract ingredients from a meal and add them to your list')
    .argument('<meal>', 'Meal description, e.g. "pasta carbonara for 4"')
    .option('-s, --serves <n>', 'Number of servings', '4')
    .option('-l, --list <name>', 'List to add ingredients to', 'default')
    .option('--stores <stores>', 'Comma-separated stores for comparison')
    .option('--no-add', 'Show ingredients and prices but don\'t add to list')
    .action(
      async (meal: string, opts: { serves: string; list: string; stores?: string; add: boolean }) => {
        const apiKey = await getAnthropicKey()
        if (!apiKey) {
          console.error(
            chalk.red('No Anthropic API key found.'),
            '\nRun: groc config set-anthropic-key',
          )
          process.exit(1)
        }

        const serves = parseInt(opts.serves, 10)
        const spinner = ora(`Planning "${meal}" for ${serves}…`).start()

        let plan
        try {
          plan = await extractIngredients(meal, apiKey, serves)
          spinner.stop()
        } catch (err) {
          spinner.fail('Failed to extract ingredients')
          console.error(err)
          process.exit(1)
        }

        // Show ingredient list
        console.log(chalk.bold(`\n${plan.meal} (serves ${plan.serves})\n`))
        const ingTable = new Table({
          head: ['Ingredient', 'Quantity', 'Notes'],
          style: { head: [], border: [] },
          colWidths: [30, 18, 30],
          wordWrap: true,
        })
        for (const ing of plan.ingredients) {
          ingTable.push([ing.name, ing.quantity, ing.notes ?? ''])
        }
        console.log(ingTable.toString())

        // Compare prices
        const storeIds = opts.stores
          ? (opts.stores.split(',').map((s) => s.trim()) as StoreId[])
          : appConfig.get('defaultStores')

        const compareSpinner = ora('Looking up prices…').start()
        const rows = await compareList(plan.ingredients.map((i) => i.name), storeIds)
        compareSpinner.stop()
        printCompareTable(rows)

        if (!opts.add) {
          console.log(chalk.dim('\nRun without --no-add to save these ingredients to your list.'))
          return
        }

        // Ask user to confirm before adding to list
        const rl = createInterface({ input: process.stdin, output: process.stdout })
        const answer = await rl.question(
          `\nAdd ${plan.ingredients.length} ingredient(s) to list "${opts.list}"? [Y/n] `,
        )
        rl.close()

        if (answer.trim().toLowerCase() === 'n') {
          console.log(chalk.dim('Nothing added.'))
          return
        }

        for (const ing of plan.ingredients) {
          addItem(opts.list, `${ing.name} ${ing.quantity}`.trim())
        }

        const list = getList(opts.list)
        console.log(
          chalk.green(`\n✓ Added ${plan.ingredients.length} ingredient(s) to "${opts.list}"`),
          chalk.dim(`(${list.items.length} total items)`),
        )
        console.log(chalk.dim(`\nNext: groc cart --store woolworths --list ${opts.list}`))
      },
    )
}
