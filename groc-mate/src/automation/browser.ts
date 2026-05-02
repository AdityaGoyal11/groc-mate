import { chromium } from 'patchright'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { mkdirSync } from 'node:fs'
import type { BrowserContext } from 'patchright'

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
