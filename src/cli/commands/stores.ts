import { Command } from 'commander'
import Table from 'cli-table3'
import chalk from 'chalk'
import ora from 'ora'
import { adapters } from '../../adapters/index.js'
import { appConfig } from '../../config/config.js'
import type { StoreId } from '../../adapters/types.js'

export function storesCommand(): Command {
  return new Command('stores')
    .description('Find stores near a suburb')
    .option('--suburb <suburb>', 'Suburb to search near')
    .option('-s, --store <store>', 'Specific store: woolworths or coles')
    .option('--json', 'Output raw JSON')
    .action(async (opts: { suburb?: string; store?: string; json?: boolean }) => {
      const suburb = opts.suburb ?? appConfig.get('defaultSuburb')
      if (!suburb) {
        console.error(chalk.red('Provide --suburb or set a default: groc config set defaultSuburb "Newtown NSW 2042"'))
        process.exit(1)
      }

      const storeIds: StoreId[] = opts.store
        ? [opts.store as StoreId]
        : ['woolworths', 'coles']

      const spinner = ora(`Finding stores near "${suburb}"…`).start()

      const results = await Promise.allSettled(
        storeIds.map((id) => adapters[id].getStores(suburb)),
      )
      spinner.stop()

      if (opts.json) {
        const out: Record<string, unknown> = {}
        storeIds.forEach((id, i) => {
          const r = results[i]
          out[id] = r?.status === 'fulfilled' ? r.value : []
        })
        console.log(JSON.stringify(out, null, 2))
        return
      }

      storeIds.forEach((id, i) => {
        const r = results[i]
        if (r?.status !== 'fulfilled' || !r.value.length) return

        console.log(chalk.bold(`\n${adapters[id].storeName}`))
        const table = new Table({
          head: ['Name', 'Address', 'Suburb', 'State'],
          style: { head: [], border: [] },
          colWidths: [30, 35, 20, 8],
          wordWrap: true,
        })
        for (const s of r.value) {
          table.push([s.name, s.address, s.suburb, s.state])
        }
        console.log(table.toString())
      })
    })
}
