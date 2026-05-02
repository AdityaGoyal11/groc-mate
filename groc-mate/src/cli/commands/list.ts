import { Command } from 'commander'
import Table from 'cli-table3'
import chalk from 'chalk'
import ora from 'ora'
import { writeFileSync } from 'node:fs'
import {
  addItem,
  removeItem,
  clearList,
  getList,
  listAllNames,
  deleteList,
  exportCsv,
} from '../../services/grocery-list.service.js'
import { compareList } from '../../services/price-comparison.service.js'
import { printCompareTable } from '../display.js'
import { appConfig } from '../../config/config.js'
import type { StoreId } from '../../adapters/types.js'

export function listCommand(): Command {
  const cmd = new Command('list').description('Manage your grocery lists')

  cmd
    .command('add <items...>')
    .description('Add items to a list')
    .option('-l, --list <name>', 'List name', 'default')
    .action((items: string[], opts: { list: string }) => {
      for (const item of items) {
        addItem(opts.list, item)
        console.log(chalk.green(`✓ Added "${item}" to list "${opts.list}"`))
      }
    })

  cmd
    .command('remove <itemId>')
    .description('Remove an item by its ID')
    .option('-l, --list <name>', 'List name', 'default')
    .action((itemId: string, opts: { list: string }) => {
      const removed = removeItem(opts.list, itemId)
      console.log(removed ? chalk.green('Removed.') : chalk.yellow('Item not found.'))
    })

  cmd
    .command('show')
    .description('Show items in a list')
    .option('-l, --list <name>', 'List name', 'default')
    .action((opts: { list: string }) => {
      const list = getList(opts.list)
      if (!list.items.length) {
        console.log(chalk.dim(`List "${opts.list}" is empty. Add items with: groc list add "milk"`))
        return
      }

      console.log(chalk.bold(`\nList: ${opts.list}`))
      const table = new Table({
        head: ['#', 'Item', 'ID'],
        style: { head: [], border: [] },
        colWidths: [4, 40, 38],
      })
      list.items.forEach((item, i) => {
        table.push([i + 1, item.query, chalk.dim(item.id)])
      })
      console.log(table.toString())
      console.log(chalk.dim(`${list.items.length} item(s) — updated ${list.updatedAt}`))
    })

  cmd
    .command('compare')
    .description('Compare prices for every item in a list')
    .option('-l, --list <name>', 'List name', 'default')
    .option('-s, --stores <stores>', 'Comma-separated stores')
    .action(async (opts: { list: string; stores?: string }) => {
      const list = getList(opts.list)
      if (!list.items.length) {
        console.log(chalk.yellow('List is empty.'))
        return
      }

      const storeIds = opts.stores
        ? (opts.stores.split(',').map((s) => s.trim()) as StoreId[])
        : appConfig.get('defaultStores')

      const spinner = ora(`Comparing ${list.items.length} item(s)…`).start()
      const rows = await compareList(list.items.map((i) => i.query), storeIds)
      spinner.stop()
      printCompareTable(rows)
    })

  cmd
    .command('export')
    .description('Export list to CSV')
    .option('-l, --list <name>', 'List name', 'default')
    .option('-o, --output <file>', 'Output file path (default: stdout)')
    .action((opts: { list: string; output?: string }) => {
      const list = getList(opts.list)
      const csv = exportCsv(list)
      if (opts.output) {
        writeFileSync(opts.output, csv, 'utf-8')
        console.log(chalk.green(`Saved to ${opts.output}`))
      } else {
        console.log(csv)
      }
    })

  cmd
    .command('clear')
    .description('Clear all items from a list')
    .option('-l, --list <name>', 'List name', 'default')
    .action((opts: { list: string }) => {
      clearList(opts.list)
      console.log(chalk.green('List cleared.'))
    })

  cmd
    .command('ls')
    .description('Show all saved lists')
    .action(() => {
      const names = listAllNames()
      if (!names.length) {
        console.log(chalk.dim('No lists yet.'))
        return
      }
      names.forEach((n) => console.log(chalk.green('•'), n))
    })

  cmd
    .command('delete <name>')
    .description('Delete a list')
    .action((name: string) => {
      deleteList(name)
      console.log(chalk.green(`Deleted list "${name}".`))
    })

  return cmd
}
