import { randomUUID } from 'node:crypto'
import { cache } from '../cache/cache.js'
import type { GroceryList, GroceryItem } from '../adapters/types.js'

function now(): Date {
  return new Date()
}

export function getList(name: string): GroceryList {
  const stored = cache.getList(name) as GroceryList | null
  if (stored) return stored

  const list: GroceryList = {
    name,
    items: [],
    createdAt: now(),
    updatedAt: now(),
  }
  cache.setList(name, list)
  return list
}

export function saveList(list: GroceryList): void {
  list.updatedAt = now()
  cache.setList(list.name, list)
}

export function addItem(listName: string, query: string): GroceryItem {
  const list = getList(listName)
  const item: GroceryItem = {
    id: randomUUID(),
    query,
    addedAt: now(),
  }
  list.items.push(item)
  saveList(list)
  return item
}

export function removeItem(listName: string, itemId: string): boolean {
  const list = getList(listName)
  const before = list.items.length
  list.items = list.items.filter((i) => i.id !== itemId)
  if (list.items.length !== before) {
    saveList(list)
    return true
  }
  return false
}

export function clearList(listName: string): void {
  const list = getList(listName)
  list.items = []
  saveList(list)
}

export function listAllNames(): string[] {
  return cache.listNames()
}

export function deleteList(name: string): void {
  cache.deleteList(name)
}

export function exportCsv(list: GroceryList): string {
  const rows = [
    ['Item', 'Woolworths', 'Woolworths SKU', 'Coles', 'Coles SKU', 'Cheapest'],
    ...list.items.map((item) => [
      item.query,
      item.resolved?.woolworths?.price !== undefined
        ? `$${(item.resolved.woolworths.price / 100).toFixed(2)}`
        : '',
      item.resolved?.woolworths?.sku ?? '',
      item.resolved?.coles?.price !== undefined
        ? `$${(item.resolved.coles.price / 100).toFixed(2)}`
        : '',
      item.resolved?.coles?.sku ?? '',
      '', // cheapest column left for user to fill or computed separately
    ]),
  ]
  return rows.map((r) => r.map((cell) => `"${cell}"`).join(',')).join('\n')
}
