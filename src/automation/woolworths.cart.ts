import type { BrowserContext, Page } from 'patchright'
import { getBrowserContext, humanDelay, ensureLoggedIn } from './browser.js'
import type { CartResult } from '../adapters/types.js'

const BASE_URL = 'https://www.woolworths.com.au'
const CART_URL = `${BASE_URL}/shop/cart`

export interface CartItem {
  sku: string
  name: string
  quantity?: number
}

export async function fillWoolworthsCart(
  items: CartItem[],
  sessionCookie?: string | null,
  headless = true,
): Promise<CartResult> {
  // Check login state and guide user through login if needed.
  // The persistent profile stores cookies on disk, so the headless context below
  // will automatically pick them up.
  await ensureLoggedIn('woolworths')

  const context = await getBrowserContext('woolworths', sessionCookie, headless)

  try {
    const page = await context.newPage()
    await setupPage(page)

    // Navigate to homepage first to establish session
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
    await humanDelay(1000, 2000)

    // Handle cookie/location modal if present
    await dismissModals(page)

    const itemsFilled: string[] = []
    const itemsSkipped: CartResult['itemsSkipped'] = []

    for (const item of items) {
      try {
        const added = await addToCart(page, item)
        if (added) {
          itemsFilled.push(item.sku)
        } else {
          itemsSkipped.push({ query: item.name, reason: 'Product not found or out of stock' })
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        itemsSkipped.push({ query: item.name, reason: msg })
      }

      await humanDelay(800, 1800)
    }

    // Navigate to cart to get the final URL
    await page.goto(CART_URL, { waitUntil: 'domcontentloaded' })
    await humanDelay(500, 1000)

    return {
      store: 'woolworths',
      cartUrl: CART_URL,
      itemsFilled: itemsFilled.length,
      itemsSkipped,
    }
  } finally {
    await context.close()
  }
}

async function addToCart(page: Page, item: CartItem): Promise<boolean> {
  // Try adding via product page URL (most reliable)
  const productUrl = `${BASE_URL}/shop/productdetails/${item.sku}`
  await page.goto(productUrl, { waitUntil: 'domcontentloaded' })
  await humanDelay(600, 1200)

  // Check for CAPTCHA
  if (await isCaptchaPresent(page)) {
    await handleCaptcha(page)
  }

  // Look for Add to Cart button
  const addBtn = page.locator('[data-testid="add-to-cart-button"], button:has-text("Add to cart")').first()
  const isVisible = await addBtn.isVisible().catch(() => false)

  if (!isVisible) return false

  const qty = item.quantity ?? 1
  if (qty > 1) {
    // Set quantity before adding if needed
    const qtyInput = page.locator('[data-testid="quantity-input"], input[type="number"]').first()
    if (await qtyInput.isVisible().catch(() => false)) {
      await qtyInput.fill(String(qty))
      await humanDelay(300, 600)
    }
  }

  await addBtn.click()
  await humanDelay(400, 800)

  return true
}

async function dismissModals(page: Page): Promise<void> {
  // Dismiss cookie consent banner
  const acceptBtn = page.locator('button:has-text("Accept"), button:has-text("Accept all")').first()
  if (await acceptBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await acceptBtn.click()
    await humanDelay(300, 600)
  }

  // Dismiss location modal
  const closeBtn = page.locator('[aria-label="Close"], button:has-text("Close")').first()
  if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await closeBtn.click()
    await humanDelay(300, 600)
  }
}

async function isCaptchaPresent(page: Page): Promise<boolean> {
  const title = await page.title()
  if (title.toLowerCase().includes('captcha') || title.toLowerCase().includes('robot')) return true

  const captchaFrame = page.frameLocator('iframe[src*="captcha"], iframe[src*="recaptcha"]')
  return captchaFrame.locator('body').isVisible({ timeout: 500 }).catch(() => false)
}

async function handleCaptcha(page: Page): Promise<void> {
  // Open a visible window so the user can solve it
  console.error('\n⚠️  CAPTCHA detected. Please solve it in the browser window that opened.')
  console.error('   groc-mate will continue automatically once solved.\n')

  // Wait up to 3 minutes for the user to solve it
  await page.waitForFunction(
    () => !document.title.toLowerCase().includes('captcha'),
    { timeout: 180_000 },
  )
}

async function setupPage(page: Page): Promise<void> {
  // Block unnecessary resources for speed (but don't block JS — that triggers detection)
  await page.route('**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf}', (route) => route.abort())
}
