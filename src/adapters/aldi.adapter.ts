import { z } from 'zod'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { readFileSync, existsSync } from 'node:fs'
import type { StoreAdapter, Product, StoreLocation } from './types.js'

const cacheDir = join(homedir(), '.config', 'groc-mate')
const SPECIALS_FILE = join(cacheDir, 'aldi-specials.json')

const AldiSpecialSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number(),
  category: z.string().optional(),
  imageUrl: z.string().optional(),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
})

const AldiSpecialsFileSchema = z.object({
  fetchedAt: z.string(),
  specials: z.array(AldiSpecialSchema),
})

type AldiSpecial = z.infer<typeof AldiSpecialSchema>

export class AldiAdapter implements StoreAdapter {
  readonly storeId = 'aldi' as const
  readonly storeName = 'Aldi'
  readonly supportsOrdering = false

  private specials: AldiSpecial[] | null = null
  private fetchedAt: Date | null = null

  async searchProducts(query: string): Promise<Product[]> {
    const specials = this.loadSpecials()
    if (!specials.length) return []

    const q = query.toLowerCase()
    const matches = specials
      .filter((s) => s.name.toLowerCase().includes(q))
      .slice(0, 20)

    return matches.map((s) => this.mapProduct(s))
  }

  async getProduct(id: string): Promise<Product | null> {
    const specials = this.loadSpecials()
    const special = specials.find((s) => s.id === id)
    return special ? this.mapProduct(special) : null
  }

  // Aldi stores don't have useful location data accessible without scraping
  async getStores(_suburb: string): Promise<StoreLocation[]> {
    return []
  }

  async isAvailable(): Promise<boolean> {
    return existsSync(SPECIALS_FILE)
  }

  getSpecialsAge(): { fetchedAt: Date; isStale: boolean } | null {
    if (!this.fetchedAt) {
      this.loadSpecials()
    }
    if (!this.fetchedAt) return null
    const sevenDays = 7 * 24 * 60 * 60 * 1000
    return {
      fetchedAt: this.fetchedAt,
      isStale: Date.now() - this.fetchedAt.getTime() > sevenDays,
    }
  }

  private loadSpecials(): AldiSpecial[] {
    if (this.specials) return this.specials

    if (!existsSync(SPECIALS_FILE)) return []

    try {
      const raw = readFileSync(SPECIALS_FILE, 'utf-8')
      const parsed = AldiSpecialsFileSchema.safeParse(JSON.parse(raw))
      if (!parsed.success) return []

      this.specials = parsed.data.specials
      this.fetchedAt = new Date(parsed.data.fetchedAt)
      return this.specials
    } catch {
      return []
    }
  }

  private mapProduct(s: AldiSpecial): Product {
    return {
      id: s.id,
      storeId: 'aldi',
      name: s.name,
      price: Math.round(s.price * 100),
      sku: s.id,
      inStock: true,
      imageUrl: s.imageUrl,
      category: s.category,
      fetchedAt: this.fetchedAt ?? new Date(),
    }
  }
}
