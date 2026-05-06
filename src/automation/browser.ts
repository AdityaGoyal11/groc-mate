import { chromium } from 'patchright'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { mkdirSync } from 'node:fs'
import type { BrowserContext, Page } from 'patchright'

const profileDir = join(homedir(), '.config', 'groc-mate', 'browser-profiles')
mkdirSync(profileDir, { recursive: true })

/**
 * Returns a persistent browser context for a given store.
 * Persistent contexts reuse cookies between sessions — this makes the browser
 * look like a returning user rather than a new bot.
 */
export async function getBrowserContext(
  storeId: string,
  sessionCookie?: string | null,
  headless = true,
): Promise<BrowserContext> {
  const userDataDir = join(profileDir, storeId)
  mkdirSync(userDataDir, { recursive: true })

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless,
    viewport: { width: 1280, height: 800 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-AU',
    timezoneId: 'Australia/Sydney',
    geolocation: { latitude: -33.8688, longitude: 151.2093 }, // Sydney
    permissions: ['geolocation'],
    extraHTTPHeaders: {
      'Accept-Language': 'en-AU,en;q=0.9',
    },
  })

  if (sessionCookie) {
    await injectCookieString(context, sessionCookie)
  }

  return context
}

async function injectCookieString(context: BrowserContext, raw: string): Promise<void> {
  const cookies = raw
    .split(';')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const idx = pair.indexOf('=')
      return {
        name: pair.slice(0, idx).trim(),
        value: pair.slice(idx + 1).trim(),
        domain: '.woolworths.com.au', // overridden per-store by callers
        path: '/',
      }
    })

  await context.addCookies(cookies)
}

/** Human-like delay: random ms between min and max */
export function humanDelay(minMs = 500, maxMs = 1500): Promise<void> {
  return new Promise((r) => setTimeout(r, minMs + Math.random() * (maxMs - minMs)))
}

// ---------------------------------------------------------------------------
// Login detection + guided login flow
// ---------------------------------------------------------------------------

const LOGIN_URLS: Record<string, string> = {
  woolworths: 'https://www.woolworths.com.au/account/login',
  coles: 'https://www.coles.com.au/sign-in',
}

const ACCOUNT_URLS: Record<string, string> = {
  woolworths: 'https://www.woolworths.com.au/account/dashboard',
  coles: 'https://www.coles.com.au/account',
}

// URL path fragments that indicate the user is on a login page (i.e. not logged in)
const LOGIN_FRAGMENTS: Record<string, string[]> = {
  woolworths: ['/account/login', '/signin'],
  coles: ['/sign-in', '/login'],
}

/**
 * Checks whether the persistent browser profile already has a valid session.
 * If not, opens a visible window so the user can log in, then closes the window —
 * cookies persist to disk in the persistent profile and are reused for headless automation.
 */
export async function ensureLoggedIn(storeId: string): Promise<void> {
  // Always use a visible context here so the user can interact if needed
  const context = await getBrowserContext(storeId, null, false)
  const page = await context.newPage()

  try {
    const loggedIn = await checkLoginState(page, storeId)
    if (!loggedIn) {
      process.stdout.write(
        `\n[groc-mate] Not logged in to ${storeId}. Please log in using the browser window that opened.\n` +
        `           groc-mate will continue automatically once login is complete.\n\n`,
      )
      await page.goto(LOGIN_URLS[storeId]!, { waitUntil: 'domcontentloaded' })
      await waitForLogin(page, storeId)
      process.stdout.write(`[groc-mate] Logged in to ${storeId}. Starting cart fill…\n\n`)
    }
  } finally {
    await context.close()
  }
}

async function checkLoginState(page: Page, storeId: string): Promise<boolean> {
  const fragments = LOGIN_FRAGMENTS[storeId]!
  try {
    await page.goto(ACCOUNT_URLS[storeId]!, { waitUntil: 'domcontentloaded', timeout: 15_000 })
  } catch {
    // Network timeout — assume not logged in to be safe
    return false
  }
  const url = page.url()
  return !fragments.some((f) => url.includes(f))
}

async function waitForLogin(page: Page, storeId: string): Promise<void> {
  const fragments = LOGIN_FRAGMENTS[storeId]!
  // Poll until the URL is no longer a login page
  await page.waitForFunction(
    (frags: string[]) => !frags.some((f) => window.location.href.includes(f)),
    fragments,
    { timeout: 300_000, polling: 1500 },
  )
  // Let session cookies settle before we close the context and flush to disk
  await humanDelay(2000, 3000)
}
