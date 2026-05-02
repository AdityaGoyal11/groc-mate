import { z } from 'zod'
import { makeClient, randomUA, jitter } from './http.js'
import { cache } from '../cache/cache.js'
import { appConfig } from '../config/config.js'
import type { StoreAdapter, Product, StoreLocation, SearchOptions } from './types.js'

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const ColesProductSchema = z.object({
  id: z.string().or(z.number()).transform(String),
  name: z.string(),
  brand: z.string().optional(),
  pricing: z
    .object({
      now: z.number().optional(),
      unit: z
        .object({
          price: z.number().optional(),
          ofMeasureType: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  imageUris: z.array(z.object({ uri: z.string() })).optional(),
  availability: z.object({ isInStock: z.boolean() }).optional(),
  size: z.string().optional(),
})

const ColesSearchResponseSchema = z.object({
  results: z.array(ColesProductSchema).optional(),
  noOfResults: z.number().optional(),
})

const ColesStoreSchema = z.object({
  id: z.string().or(z.number()).transform(String),
  name: z.string(),
  address: z
    .object({
      addressLine1: z.string().optional(),
      suburb: z.string().optional(),
      state: z.string().optional(),
      postCode: z.string().optional(),
    })
    .optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
})

// ---------------------------------------------------------------------------
// Rate limiter — token bucket at configurable RPM
// ---------------------------------------------------------------------------

class RateLimiter {
  private queue: Array<() => void> = []
  private tokens: number
  private readonly max: number

  constructor(rpm: number) {
    this.max = rpm
    this.tokens = rpm
    setInterval(() => {
      this.tokens = Math.min(this.max, this.tokens + this.max)
      this.flush()
    }, 60_000)
  }

  async acquire(): Promise<void> {
    if (this.tokens > 0) {
      this.tokens--
      return
    }
    return new Promise((resolve) => this.queue.push(resolve))
  }

  private flush() {
    while (this.tokens > 0 && this.queue.length > 0) {
      this.tokens--
      this.queue.shift()?.()
    }
  }
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class ColesAdapter implements StoreAdapter {
  readonly storeId = 'coles' as const
  readonly storeName = 'Coles'
  readonly supportsOrdering = true

  private consecutiveFailures = 0
  private unavailableUntil = 0

  private readonly client = makeClient('https://api.coles.com.au/customer/v1/coles', {
    'User-Agent': randomUA(),
    'Origin': 'https://www.coles.com.au',
    'Referer': 'https://www.coles.com.au/',
  })

  private readonly limiter = new RateLimiter(appConfig.get('colesRPMLimit'))

  async searchProducts(query: string, options: SearchOptions = {}): Promise<Product[]> {
    const cached = cache.getSearch('coles', query)
    if (cached) return cached

    if (!await this.isAvailable()) return []

    await this.limiter.acquire()
    await jitter(200, 600)

    try {
      const { data } = await this.client.get('/products/search', {
        params: {
          q: query,
          pageSize: options.limit ?? 20,
          pageNumber: 1,
        },
      })

      const parsed = ColesSearchResponseSchema.safeParse(data)
      if (!parsed.success) {
        console.error('[coles] Unexpected search response shape:', parsed.error.issues[0])
        this.recordFailure()
        return []
      }

      this.consecutiveFailures = 0
      const products = (parsed.data.results ?? []).map((p) => this.mapProduct(p))
      cache.setSearch('coles', query, products)
      return products
    } catch (err: unknown) {
      this.recordFailure()
      if (isAxiosError(err) && err.response?.status === 429) {
        // Respect rate limit signal from server
        this.unavailableUntil = Date.now() + 15 * 60 * 1000
      }
      return []
    }
  }

  async getProduct(id: string): Promise<Product | null> {
    const cached = cache.getProduct('coles', id)
    if (cached) return cached

    if (!await this.isAvailable()) return null

    await this.limiter.acquire()
    await jitter()

    const { data } = await this.client.get(`/products/${id}`)
    const parsed = ColesProductSchema.safeParse(data)
    if (!parsed.success) return null

    const product = this.mapProduct(parsed.data)
    cache.setProduct(product)
    return product
  }

  async getStores(suburb: string): Promise<StoreLocation[]> {
    if (!await this.isAvailable()) return []
    await this.limiter.acquire()

    const { data } = await this.client.get('/stores', {
      params: { suburb, radius: 10 },
    })

    const stores = z.array(ColesStoreSchema).safeParse(data?.results ?? data)
    if (!stores.success) return []

    return stores.data.map((s) => ({
      id: s.id,
      storeId: 'coles' as const,
      name: s.name,
      address: s.address?.addressLine1 ?? '',
      suburb: s.address?.suburb ?? '',
      state: s.address?.state ?? '',
      postcode: s.address?.postCode ?? '',
      lat: s.latitude,
      lng: s.longitude,
    }))
  }

  async isAvailable(): Promise<boolean> {
    if (Date.now() < this.unavailableUntil) return false
    return true
  }

  private recordFailure() {
    this.consecutiveFailures++
    if (this.consecutiveFailures >= 3) {
      this.unavailableUntil = Date.now() + 15 * 60 * 1000
      this.consecutiveFailures = 0
    }
  }

  private mapProduct(p: z.infer<typeof ColesProductSchema>): Product {
    const price = p.pricing?.now ?? 0
    const unitPrice = p.pricing?.unit?.price
    const unitMeasure = p.pricing?.unit?.ofMeasureType

    return {
      id: p.id,
      storeId: 'coles',
      name: p.name,
      brand: p.brand,
      price: Math.round(price * 100),
      pricePerUnit:
        unitPrice !== undefined && unitMeasure
          ? `$${unitPrice.toFixed(2)} / ${unitMeasure}`
          : undefined,
      unit: p.size,
      imageUrl: p.imageUris?.[0]?.uri,
      sku: p.id,
      inStock: p.availability?.isInStock ?? true,
      fetchedAt: new Date(),
    }
  }
}

function isAxiosError(err: unknown): err is { response?: { status: number } } {
  return typeof err === 'object' && err !== null && 'response' in err
}
