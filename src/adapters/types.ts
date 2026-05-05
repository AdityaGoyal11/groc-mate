export type StoreId = 'woolworths' | 'coles' | 'aldi'

export interface Product {
  id: string
  storeId: StoreId
  name: string
  brand?: string
  /** Price in cents to avoid float precision issues */
  price: number
  /** e.g. "$1.20 / 100g" */
  pricePerUnit?: string
  unit?: string
  imageUrl?: string
  sku: string
  inStock: boolean
  category?: string
  fetchedAt: Date
}

export interface StoreLocation {
  id: string
  storeId: StoreId
  name: string
  address: string
  suburb: string
  state: string
  postcode: string
  lat?: number
  lng?: number
}

export interface SearchOptions {
  limit?: number
  storeLocationId?: string
}

export interface StoreAdapter {
  readonly storeId: StoreId
  readonly storeName: string
  readonly supportsOrdering: boolean

  searchProducts(query: string, options?: SearchOptions): Promise<Product[]>
  getProduct(id: string): Promise<Product | null>
  getStores(suburb: string): Promise<StoreLocation[]>
  /** Health check — returns false if the adapter is currently rate-limited or broken */
  isAvailable(): Promise<boolean>
}

export interface GroceryItem {
  id: string
  query: string
  /** Resolved product per store (populated after a compare run) */
  resolved?: Partial<Record<StoreId, Product>>
  addedAt: Date
}

export interface GroceryList {
  name: string
  items: GroceryItem[]
  createdAt: Date
  updatedAt: Date
}

export interface CartResult {
  store: StoreId
  cartUrl: string
  itemsFilled: number
  itemsSkipped: Array<{ query: string; reason: string }>
}

/** Formatted for display — prices as strings, not raw cents */
export interface CompareRow {
  query: string
  woolworths?: { name: string; price: string; pricePerUnit?: string; sku: string }
  coles?: { name: string; price: string; pricePerUnit?: string; sku: string }
  aldi?: { name: string; price: string; note?: string }
  cheapest?: StoreId
}
