import { z } from 'zod'
import { makeClient } from './http.js'
import { cache } from '../cache/cache.js'
import type { StoreAdapter, Product, StoreLocation, SearchOptions } from './types.js'

// ---------------------------------------------------------------------------
// Zod schemas — validates API responses; any mismatch surfaces immediately
// ---------------------------------------------------------------------------

const WoolworthsProductSchema = z.object({
  Stockcode: z.number(),
  Barcode: z.string().optional(),
  Name: z.string(),
  Brand: z.string().optional(),
  Price: z.number().optional(),
  WasPrice: z.number().optional(),
  CupPrice: z.number().optional(),
  CupMeasure: z.string().optional(),
  PackageSize: z.string().optional(),
  IsInStock: z.boolean().optional(),
  ImageFile: z.string().optional(),
  Description: z.string().optional(),
})

const WoolworthsSearchResponseSchema = z.object({
  Products: z.array(
    z.object({
      Products: z.array(WoolworthsProductSchema),
    }),
  ).optional(),
  SearchResultsCount: z.number().optional(),
})

const WoolworthsStoreSchema = z.object({
  StoreId: z.string(),
  Name: z.string(),
  AddressLine1: z.string().optional(),
  SuburbName: z.string().optional(),
  State: z.string().optional(),
  Postcode: z.string().optional(),
  Latitude: z.number().optional(),
  Longitude: z.number().optional(),
})

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class WoolworthsAdapter implements StoreAdapter {
  readonly storeId = 'woolworths' as const
  readonly storeName = 'Woolworths'
  readonly supportsOrdering = true

  private readonly client = makeClient('https://www.woolworths.com.au/apis/ui', {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Referer': 'https://www.woolworths.com.au/',
    'Origin': 'https://www.woolworths.com.au',
  })

  async searchProducts(query: string, options: SearchOptions = {}): Promise<Product[]> {
    const cached = cache.getSearch('woolworths', query)
    if (cached) return cached

    const { data } = await this.client.get('/2/ui/search/products', {
      params: {
        searchTerm: query,
        pageNumber: 1,
        pageSize: options.limit ?? 20,
        sortType: 'TraderRelevance',
        isMobile: false,
        filters: '',
      },
    })

    const parsed = WoolworthsSearchResponseSchema.safeParse(data)
    if (!parsed.success) {
      console.error('[woolworths] Unexpected search response shape:', parsed.error.issues[0])
      return []
    }

    const products: Product[] = []
    for (const group of parsed.data.Products ?? []) {
      for (const p of group.Products) {
        if (p.Price === undefined) continue
        products.push(this.mapProduct(p))
      }
    }

    cache.setSearch('woolworths', query, products)
    return products
  }

  async getProduct(id: string): Promise<Product | null> {
    const cached = cache.getProduct('woolworths', id)
    if (cached) return cached

    const { data } = await this.client.get(`/2/ui/products/${id}`)
    const parsed = WoolworthsProductSchema.safeParse(data)
    if (!parsed.success) return null

    const product = this.mapProduct(parsed.data)
    cache.setProduct(product)
    return product
  }

  async getStores(suburb: string): Promise<StoreLocation[]> {
    const { data } = await this.client.get('/ui/storelocator/stores', {
      params: { suburb, count: 20 },
    })

    const stores = z.array(WoolworthsStoreSchema).safeParse(data?.Stores ?? data)
    if (!stores.success) return []

    return stores.data.map((s) => ({
      id: s.StoreId,
      storeId: 'woolworths' as const,
      name: s.Name,
      address: s.AddressLine1 ?? '',
      suburb: s.SuburbName ?? '',
      state: s.State ?? '',
      postcode: s.Postcode ?? '',
      lat: s.Latitude,
      lng: s.Longitude,
    }))
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.get('/ui/uptime')
      return true
    } catch {
      return false
    }
  }

  private mapProduct(p: z.infer<typeof WoolworthsProductSchema>): Product {
    return {
      id: String(p.Stockcode),
      storeId: 'woolworths',
      name: p.Name,
      brand: p.Brand,
      price: Math.round((p.Price ?? 0) * 100),
      pricePerUnit:
        p.CupPrice !== undefined && p.CupMeasure
          ? `$${p.CupPrice.toFixed(2)} / ${p.CupMeasure}`
          : undefined,
      unit: p.PackageSize,
      imageUrl: p.ImageFile
        ? `https://cdn0.woolworths.media/content/wowproductimages/large/${p.ImageFile}`
        : undefined,
      sku: String(p.Stockcode),
      inStock: p.IsInStock ?? true,
      fetchedAt: new Date(),
    }
  }
}
