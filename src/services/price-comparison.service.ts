import { adapters } from '../adapters/index.js'
import { formatCents } from '../config/config.js'
import type { StoreId, Product, CompareRow } from '../adapters/types.js'

export async function compareQuery(
  query: string,
  storeIds: StoreId[] = ['woolworths', 'coles'],
): Promise<CompareRow> {
  const results = await Promise.allSettled(
    storeIds.map((id) => adapters[id].searchProducts(query, { limit: 5 })),
  )

  const row: CompareRow = { query }

  storeIds.forEach((id, i) => {
    const result = results[i]
    if (result?.status !== 'fulfilled') return
    const top = result.value[0]
    if (!top) return

    if (id === 'woolworths') {
      row.woolworths = {
        name: top.name,
        price: formatCents(top.price),
        pricePerUnit: top.pricePerUnit,
        sku: top.sku,
      }
    } else if (id === 'coles') {
      row.coles = {
        name: top.name,
        price: formatCents(top.price),
        pricePerUnit: top.pricePerUnit,
        sku: top.sku,
      }
    } else if (id === 'aldi') {
      row.aldi = {
        name: top.name,
        price: formatCents(top.price),
      }
    }
  })

  row.cheapest = findCheapest(row, storeIds)
  return row
}

export async function compareList(
  queries: string[],
  storeIds: StoreId[] = ['woolworths', 'coles'],
): Promise<CompareRow[]> {
  return Promise.all(queries.map((q) => compareQuery(q, storeIds)))
}

function findCheapest(row: CompareRow, storeIds: StoreId[]): StoreId | undefined {
  let cheapestStore: StoreId | undefined
  let cheapestCents = Infinity

  for (const id of storeIds) {
    let priceStr: string | undefined
    if (id === 'woolworths') priceStr = row.woolworths?.price
    else if (id === 'coles') priceStr = row.coles?.price
    else if (id === 'aldi') priceStr = row.aldi?.price

    if (!priceStr) continue
    const cents = parsePriceToCents(priceStr)
    if (cents < cheapestCents) {
      cheapestCents = cents
      cheapestStore = id
    }
  }

  return cheapestStore
}

function parsePriceToCents(price: string): number {
  return Math.round(parseFloat(price.replace('$', '')) * 100)
}

export function getBestProductForStore(products: Product[]): Product | undefined {
  return products[0]
}
