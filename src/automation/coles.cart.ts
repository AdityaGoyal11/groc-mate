import type { Page } from 'patchright'
import { getBrowserContext, humanDelay } from './browser.js'
import type { CartResult } from '../adapters/types.js'
import type { CartItem } from './woolworths.cart.js'

const BASE_URL = 'https://www.coles.com.au'
const CART_URL = `${BASE_URL}/cart`

export async function fillColesCart(
  items: CartItem[],
  sessionCookie?: string | null,
  headless = true,
): Promise<CartResult> {
  const context = await getBrowserContext('coles', sessionCookie, headless)

  // Inject Coles-specific domain for cookies
  if (sessionCookie) {
    const existing = await context.cookies()
    const updated = existing.map((c) => ({
      ...c,
      domain: c.domain.includes('coles') ? c.domain : '.coles.com.au',
    }))
    await context.clearCookies()
    await context.addCookies(updated)
  }

  try {
    const page = await context.newPage()
    await setupPage(page)

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
    await humanDelay(1000, 2000)
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

    await page.goto(CART_URL, { waitUntil: 'domcontentloaded' })
    await humanDelay(500, 1000)

    return {
      store: 'coles',
      cartUrl: CART_URL,
      itemsFilled: itemsFilled.length,
      itemsSkipped,
    }
  } finally {
    await context.close()
  }
}

async function addToCart(page: Page, item: CartItem): Promise<boolean> {
  const productUrl = `${BASE_URL}/product/details/${item.sku}`
  await page.goto(productUrl, { waitUntil: 'domcontentloaded' })
  await humanDelay(600, 1200)

  if (await isCaptchaPresent(page)) {
    await handleCaptcha(page)
  }

  const addBtn = page
    .locator('[data-testid="add-to-cart"], button:has-text("Add to cart"), button:has-text("Add")')
    .first()

  const isVisible = await addBtn.isVisible().catch(() => false)
  if (!isVisible) return false

  await addBtn.click()
  await humanDelay(400, 900)

  return true
}

async function dismissModals(page: Page): Promise<void> {
  const acceptBtn = page.locator('button:has-text("Accept all"), button:has-text("Accept")').first()
  if (await acceptBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await acceptBtn.click()
    await humanDelay(300, 600)
  }
}

async function isCaptchaPresent(page: Page): Promise<boolean> {
  const title = await page.title()
  return title.toLowerCase().includes('captcha') || title.toLowerCase().includes('blocked')
}

async function handleCaptcha(page: Page): Promise<void> {
  console.error('\n⚠️  CAPTCHA detected. Please solve it in the browser window.')
  console.error('   groc-mate will continue automatically once solved.\n')
  await page.waitForFunction(
    () =>
      !document.title.toLowerCase().includes('captcha') &&
      !document.title.toLowerCase().includes('blocked'),
    { timeout: 180_000 },
  )
}

async function setupPage(page: Page): Promise<void> {
  await page.route('**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf}', (route) => route.abort())
}
