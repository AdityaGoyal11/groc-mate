import { WoolworthsAdapter } from './woolworths.adapter.js'
import { ColesAdapter } from './coles.adapter.js'
import { AldiAdapter } from './aldi.adapter.js'
import type { StoreAdapter, StoreId } from './types.js'

export const adapters: Record<StoreId, StoreAdapter> = {
  woolworths: new WoolworthsAdapter(),
  coles: new ColesAdapter(),
  aldi: new AldiAdapter(),
}

export function getAdapter(storeId: StoreId): StoreAdapter {
  return adapters[storeId]
}

export * from './types.js'
