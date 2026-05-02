import Conf from 'conf'
import type { StoreId } from '../adapters/types.js'

interface GrocMateConfig {
  defaultSuburb: string
  defaultStores: StoreId[]
  cacheTTLMinutes: number
  anthropicKeySet: boolean
  colesRPMLimit: number
}

const defaults: GrocMateConfig = {
  defaultSuburb: '',
  defaultStores: ['woolworths', 'coles'],
  cacheTTLMinutes: 60,
  anthropicKeySet: false,
  colesRPMLimit: 20,
}

export const appConfig = new Conf<GrocMateConfig>({
  projectName: 'groc-mate',
  defaults,
  schema: {
    defaultSuburb: { type: 'string' },
    defaultStores: { type: 'array', items: { type: 'string' } },
    cacheTTLMinutes: { type: 'number', minimum: 5, maximum: 1440 },
    anthropicKeySet: { type: 'boolean' },
    colesRPMLimit: { type: 'number', minimum: 1, maximum: 60 },
  },
})

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export function getActiveStores(): StoreId[] {
  return appConfig.get('defaultStores')
}
