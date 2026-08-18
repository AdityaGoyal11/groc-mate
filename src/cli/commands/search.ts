import { Command } from 'commander'
import ora from 'ora'
import chalk from 'chalk'
import { adapters } from '../../adapters/index.js'
import { appConfig } from '../../config/config.js'
import { printSearchResults } from '../display.js'
import type { StoreId } from '../../adapters/types.js'

export function searchCommand(): Command {
  return new Command('search')
    .description('Search for a product across stores')
    .argument('<query>', 'Product to search for')
    .option('-s, --stores <stores>', 'Comma-separated stores: woolworths,coles,aldi')
    .option('-l, --limit <n>', 'Max results per store', '10')
    .option('--json', 'Output raw JSON')
    .action(async (query: string, opts: { stores?: string; limit: string; json?: boolean }) => {
      const storeIds = parseStores(opts.stores)
      const limit = parseInt(opts.limit, 10)

      if (opts.json) {
        const results: Record<string, unknown> = {}
        await Promise.all(
          storeIds.map(async (id) => {
            results[id] = await adapters[id].searchProducts(query, { limit })
          }),
        )
        console.log(JSON.stringify(results, null, 2))
        return
      }

      for (const id of storeIds) {
        const spinner = ora(`Searching ${adapters[id].storeName}…`).start()
        try {
          const products = await adapters[id].searchProducts(query, { limit })
          spinner.stop()
          console.log(chalk.bold(`\n${adapters[id].storeName}`))
          printSearchResults(products, id)
        } catch {
          spinner.fail(`${adapters[id].storeName} unavailable`)
        }
      }
    })
}

function parseStores(raw?: string): StoreId[] {
  if (!raw) return appConfig.get('defaultStores')
  return raw.split(',').map((s) => s.trim()) as StoreId[]
}
