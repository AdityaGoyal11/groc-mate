import { adapters } from '../adapters/index.js'
import { fillWoolworthsCart } from '../automation/woolworths.cart.js'
import { fillColesCart } from '../automation/coles.cart.js'
import type { GroceryList, CartResult, StoreId } from '../adapters/types.js'
import type { CartItem } from '../automation/woolworths.cart.js'

/**
 * For each item in the list, find the best matching SKU at the given store,
 * then fill the cart and return the cart URL.
 */
export async function buildAndFillCart(
  list: GroceryList,
  storeId: StoreId,
  sessionCookie: string | null,
  headless: boolean,
  onProgress?: (msg: string) => void,
): Promise<CartResult> {
  const cartItems: CartItem[] = []
  const unresolved: Array<{ query: string; reason: string }> = []

  onProgress?.(`Resolving ${list.items.length} item(s) against ${storeId}…`)

  for (const item of list.items) {
    const products = await adapters[storeId].searchProducts(item.query, { limit: 1 })
    const top = products[0]
    if (!top) {
      unresolved.push({ query: item.query, reason: 'No matching product found' })
      continue
    }
    cartItems.push({ sku: top.sku, name: top.name, quantity: 1 })
    onProgress?.(`  ✓ "${item.query}" → ${top.name} (${formatCents(top.price)})`)
  }

  if (!cartItems.length) {
    return {
      store: storeId,
      cartUrl: storeId === 'woolworths' ? 'https://www.woolworths.com.au/shop/cart' : 'https://www.coles.com.au/cart',
      itemsFilled: 0,
      itemsSkipped: unresolved,
    }
  }

  onProgress?.(`\nOpening ${storeId} and filling cart…`)

  const result =
    storeId === 'woolworths'
      ? await fillWoolworthsCart(cartItems, sessionCookie, headless)
      : await fillColesCart(cartItems, sessionCookie, headless)

  return {
    ...result,
    itemsSkipped: [...result.itemsSkipped, ...unresolved],
  }
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}
