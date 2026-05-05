import Table from 'cli-table3'
import chalk from 'chalk'
import type { CompareRow, StoreId } from '../adapters/types.js'
import type { Product } from '../adapters/types.js'

const STORE_COLORS: Record<StoreId, (s: string) => string> = {
  woolworths: chalk.green,
  coles: chalk.red,
  aldi: chalk.blue,
}

export function printSearchResults(products: Product[], storeId: StoreId): void {
  if (!products.length) {
    console.log(chalk.dim('  No results found.'))
    return
  }

  const color = STORE_COLORS[storeId]
  const table = new Table({
    head: [color('Name'), color('Price'), color('Per Unit'), color('In Stock')],
    style: { head: [], border: [] },
    colWidths: [45, 10, 18, 10],
    wordWrap: true,
  })

  for (const p of products.slice(0, 10)) {
    table.push([
      p.name,
      `$${(p.price / 100).toFixed(2)}`,
      p.pricePerUnit ?? '',
      p.inStock ? chalk.green('✓') : chalk.red('✗'),
    ])
  }

  console.log(table.toString())
}

export function printCompareTable(rows: CompareRow[]): void {
  const table = new Table({
    head: [
      chalk.white('Item'),
      chalk.green('Woolworths'),
      chalk.red('Coles'),
      chalk.blue('Aldi'),
      chalk.yellow('Cheapest'),
    ],
    style: { head: [], border: [] },
    colWidths: [28, 22, 22, 20, 14],
    wordWrap: true,
  })

  for (const row of rows) {
    const wPrice = row.woolworths?.price ?? chalk.dim('—')
    const cPrice = row.coles?.price ?? chalk.dim('—')
    const aPrice = row.aldi?.price ?? chalk.dim('—')

    const wLabel =
      row.woolworths
        ? `${row.woolworths.price}\n${chalk.dim(truncate(row.woolworths.name, 20))}`
        : chalk.dim('—')
    const cLabel =
      row.coles
        ? `${row.coles.price}\n${chalk.dim(truncate(row.coles.name, 20))}`
        : chalk.dim('—')
    const aLabel =
      row.aldi
        ? `${row.aldi.price}\n${chalk.dim(truncate(row.aldi.name, 18))}`
        : chalk.dim('—')

    const cheapest = row.cheapest
      ? STORE_COLORS[row.cheapest](row.cheapest.charAt(0).toUpperCase() + row.cheapest.slice(1))
      : ''

    void wPrice; void cPrice; void aPrice

    table.push([truncate(row.query, 26), wLabel, cLabel, aLabel, cheapest])
  }

  console.log(table.toString())
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str
}
