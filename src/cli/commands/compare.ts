import { Command } from 'commander'
import ora from 'ora'
import { compareQuery } from '../../services/price-comparison.service.js'
import { appConfig } from '../../config/config.js'
import { printCompareTable } from '../display.js'
import type { StoreId } from '../../adapters/types.js'

export function compareCommand(): Command {
  return new Command('compare')
    .description('Compare a product price across stores side-by-side')
    .argument('<query>', 'Product to compare')
    .option('-s, --stores <stores>', 'Comma-separated stores: woolworths,coles,aldi')
    .option('--json', 'Output raw JSON')
    .action(async (query: string, opts: { stores?: string; json?: boolean }) => {
      const storeIds = opts.stores
        ? (opts.stores.split(',').map((s) => s.trim()) as StoreId[])
        : appConfig.get('defaultStores')

      const spinner = ora(`Comparing "${query}"…`).start()

      try {
        const row = await compareQuery(query, storeIds)
        spinner.stop()

        if (opts.json) {
          console.log(JSON.stringify(row, null, 2))
          return
        }

        printCompareTable([row])
      } catch (err) {
        spinner.fail('Compare failed')
        console.error(err)
      }
    })
}
