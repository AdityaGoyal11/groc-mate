import Database from 'better-sqlite3'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { mkdirSync } from 'node:fs'
import type { Product, StoreId } from '../adapters/types.js'
import { appConfig } from '../config/config.js'

const cacheDir = join(homedir(), '.config', 'groc-mate')
mkdirSync(cacheDir, { recursive: true })

const db = new Database(join(cacheDir, 'cache.db'))

db.pragma('journal_mode = WAL')
db.pragma('synchronous = NORMAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    store_id    TEXT NOT NULL,
    sku         TEXT NOT NULL,
    data        TEXT NOT NULL,
    fetched_at  INTEGER NOT NULL,
    PRIMARY KEY (store_id, sku)
  );

  CREATE TABLE IF NOT EXISTS search_results (
    store_id    TEXT NOT NULL,
    query       TEXT NOT NULL,
    results     TEXT NOT NULL,
    fetched_at  INTEGER NOT NULL,
    PRIMARY KEY (store_id, query)
  );

  CREATE TABLE IF NOT EXISTS price_history (
    store_id    TEXT NOT NULL,
    sku         TEXT NOT NULL,
    price       INTEGER NOT NULL,
    recorded_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_price_history ON price_history (store_id, sku, recorded_at);

  CREATE TABLE IF NOT EXISTS grocery_lists (
    name        TEXT PRIMARY KEY,
    data        TEXT NOT NULL,
    updated_at  INTEGER NOT NULL
  );
`)

const ttlMs = () => appConfig.get('cacheTTLMinutes') * 60 * 1000

export const cache = {
  getSearch(storeId: StoreId, query: string): Product[] | null {
    const row = db
      .prepare('SELECT results, fetched_at FROM search_results WHERE store_id = ? AND query = ?')
      .get(storeId, query.toLowerCase()) as { results: string; fetched_at: number } | undefined

    if (!row) return null
    if (Date.now() - row.fetched_at > ttlMs()) return null
    return JSON.parse(row.results) as Product[]
  },

  setSearch(storeId: StoreId, query: string, results: Product[]): void {
    db.prepare(
      'INSERT OR REPLACE INTO search_results (store_id, query, results, fetched_at) VALUES (?, ?, ?, ?)',
    ).run(storeId, query.toLowerCase(), JSON.stringify(results), Date.now())

    // Record price history for each result
    const insertHistory = db.prepare(
      'INSERT INTO price_history (store_id, sku, price, recorded_at) VALUES (?, ?, ?, ?)',
    )
    const insertMany = db.transaction((products: Product[]) => {
      for (const p of products) {
        insertHistory.run(storeId, p.sku, p.price, Date.now())
      }
    })
    insertMany(results)
  },

  getProduct(storeId: StoreId, sku: string): Product | null {
    const row = db
      .prepare('SELECT data, fetched_at FROM products WHERE store_id = ? AND sku = ?')
      .get(storeId, sku) as { data: string; fetched_at: number } | undefined

    if (!row) return null
    if (Date.now() - row.fetched_at > ttlMs()) return null
    return JSON.parse(row.data) as Product
  },

  setProduct(product: Product): void {
    db.prepare(
      'INSERT OR REPLACE INTO products (store_id, sku, data, fetched_at) VALUES (?, ?, ?, ?)',
    ).run(product.storeId, product.sku, JSON.stringify(product), Date.now())
  },

  getPriceHistory(
    storeId: StoreId,
    sku: string,
    days = 30,
  ): Array<{ price: number; recordedAt: Date }> {
    const since = Date.now() - days * 24 * 60 * 60 * 1000
    const rows = db
      .prepare(
        'SELECT price, recorded_at FROM price_history WHERE store_id = ? AND sku = ? AND recorded_at > ? ORDER BY recorded_at ASC',
      )
      .all(storeId, sku, since) as Array<{ price: number; recorded_at: number }>

    return rows.map((r) => ({ price: r.price, recordedAt: new Date(r.recorded_at) }))
  },

  getList(name: string): unknown | null {
    const row = db
      .prepare('SELECT data FROM grocery_lists WHERE name = ?')
      .get(name) as { data: string } | undefined
    return row ? (JSON.parse(row.data) as unknown) : null
  },

  setList(name: string, data: unknown): void {
    db.prepare(
      'INSERT OR REPLACE INTO grocery_lists (name, data, updated_at) VALUES (?, ?, ?)',
    ).run(name, JSON.stringify(data), Date.now())
  },

  listNames(): string[] {
    const rows = db.prepare('SELECT name FROM grocery_lists ORDER BY updated_at DESC').all() as Array<{ name: string }>
    return rows.map((r) => r.name)
  },

  deleteList(name: string): void {
    db.prepare('DELETE FROM grocery_lists WHERE name = ?').run(name)
  },
}
