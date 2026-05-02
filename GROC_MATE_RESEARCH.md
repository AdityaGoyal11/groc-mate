# groc-mate — Research Document

> **Status:** Research & Planning phase. Implementation will happen in a dedicated new repo.

A CLI tool for Australian consumers to search, compare, plan, and **automatically place grocery orders** across Woolworths, Coles, and Aldi — with Stripe handling subscription billing.

---

## What Is groc-mate?

```bash
groc search "chicken breast"           # search across all stores
groc compare "oat milk 1L"             # side-by-side price table
groc list add "eggs dozen"             # manage a grocery list
groc plan "pasta carbonara"            # AI extracts ingredients → compare
groc order --list default              # Playwright places the order for you
groc order --dry-run                   # preview cart, don't place
```

The key differentiator: `groc order` uses Playwright browser automation to act as a user agent — it logs into the retailer's website **with the user's own credentials** and places the order on their behalf. The grocery payment goes directly to the retailer. groc-mate only charges a subscription fee.

---

## Store Coverage

| Store | Search/Compare | Ordering | Notes |
|---|---|---|---|
| **Woolworths** | Official API (`apiportal.woolworths.com.au`) | Playwright automation | Safest path — official API for data, Patchright for checkout |
| **Coles** | Reverse-engineered `api.coles.com.au` | Playwright automation | API can break on Coles app updates; rate limited at 20 RPM |
| **Aldi** | Weekly-scraped specials | Not possible | No online ordering on aldi.com.au; prices refreshed weekly |
| **IGA** | Not supported | Not supported | Franchise network, no central API or web checkout |

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Language | TypeScript + Node.js | Single language for CLI + API server |
| CLI framework | Commander.js | Battle-tested subcommand support |
| Browser automation | **Patchright** | Playwright fork with V8-level anti-detection patches; ~0% headless detection vs Cloudflare |
| HTTP client | axios + axios-retry | Retry logic, interceptors |
| CLI output | chalk + cli-table3 | Colour tables for price comparison |
| Local config/cache | `conf` + `better-sqlite3` | XDG-compliant config, SQLite for price history |
| Secrets | `keytar` | OS keychain (macOS Keychain, Windows Credential Manager, Linux libsecret) |
| Schema validation | Zod | Validates API responses — catches adapter breakage early |
| API server | Fastify | TypeScript-first, faster than Express |
| Payments | Stripe Subscriptions | Convenience fees only — grocery payments stay with retailers |
| Testing | Vitest | Fast, TypeScript-native |
| Build | tsup | Node.js bundler (not Vite — that's browser-oriented) |
| IaC | AWS CDK (TypeScript) | Lambda + API Gateway + DynamoDB + ElastiCache |

---

## Architecture

```
groc-mate/
├── src/
│   ├── cli/commands/          # search, compare, list, plan, order, stores, config
│   ├── adapters/              # StoreAdapter interface + Woolworths/Coles/Aldi impl
│   ├── automation/            # Patchright browser pool + checkout scripts per store
│   ├── services/              # Price comparison, meal planning (LLM), order orchestration
│   ├── api/                   # Fastify REST API (public monetisation layer)
│   ├── payments/              # Stripe subscription billing
│   └── cache/                 # SQLite (CLI) or Redis (API)
```

### Core Adapter Interface

```typescript
interface StoreAdapter {
  readonly storeId: 'woolworths' | 'coles' | 'aldi';
  searchProducts(query: string): Promise<Product[]>;
  getProduct(id: string): Promise<Product | null>;
  getStores(suburb: string): Promise<StoreLocation[]>;
  isAvailable(): Promise<boolean>;
  supportsOrdering: boolean;
}

interface Product {
  id: string;
  storeId: string;
  name: string;
  price: number;       // always in cents — no float issues
  pricePerUnit?: string;
  inStock: boolean;
  fetchedAt: Date;
}
```

The adapter layer is **decoupled from the CLI** — the same adapters power the public REST API.

---

## How Ordering Works

1. `groc order --list default` triggers `order.service.ts`
2. Service runs `compare` on each list item, selects cheapest available store per item
3. Dry-run summary shown: cart contents, total estimate, delivery slot options
4. User confirms (`y`)
5. Patchright spins up a patched Chromium instance
6. `woolworths.checkout.ts` (or `coles.checkout.ts`):
   - Navigates to the store's website
   - Signs in using credentials retrieved from OS keychain via `keytar`
   - Adds each product to cart by SKU
   - Selects delivery slot
   - Proceeds to checkout — **payment is made by the user's own saved card on their retailer account**
7. Order confirmation number stored in local SQLite

**groc-mate never sees or handles grocery payment details.** The user's card is saved on their Woolworths/Coles account, not in groc-mate.

### CAPTCHA Handling

If a CAPTCHA appears mid-automation, Patchright pauses and opens a **visible browser window** for the user to solve it manually, then continues. The user is notified in the CLI.

---

## Playwright Anti-Detection Strategy

Vanilla Playwright has ~20–30% success against Cloudflare-protected sites. **Patchright** patches the V8 runtime itself, eliminating all headless signals.

| Technique | Implementation |
|---|---|
| Patchright | Drop-in Playwright fork; consistent Cloudflare bypass |
| Human timing | 500ms–2s random delays between interactions |
| Realistic mouse curves | Bezier-curve mouse movement |
| Persistent browser profile | Reuses cookies between orders (looks like returning user) |
| No proxy rotation | Single consistent IP per user — proxies trigger location-change detection |
| Rate limiting | Max 1 order attempt per 10 minutes per store |

---

## Stripe Integration

Stripe is used **only for groc-mate's subscription and convenience fees**.

```
User ──Stripe──▶ groc-mate (subscription fee)
User ──retailer checkout (automated by Patchright)──▶ Woolworths/Coles (grocery payment)
```

### Pricing Tiers (AUD)

| Tier | Price | Features |
|---|---|---|
| Free | $0 | Search + compare only, 500 API calls/month |
| Pro | $9.99/mo | + Price history, list management, meal planning |
| Order | $19.99/mo | + Automated ordering, all Pro features |
| Per-order fee | $0.50/order | Optional convenience fee (on top of subscription) |

### Regulatory Position

- Collecting subscription fees for software = **no AFSL or AUSTRAC registration required**
- groc-mate is never a payment intermediary — it never holds or transfers grocery funds
- Stripe AU (AFSL 500105) covers Stripe's payment obligations
- **Do not implement a wallet/top-up model** — that would trigger AUSTRAC registration requirements

---

## Features by Tier

### Tier 1 — MVP (Search & Compare, No Auth)

| Feature | Stores |
|---|---|
| Product search | Woolworths, Coles |
| Price comparison table | Woolworths, Coles |
| Aldi weekly specials | Aldi (cached) |
| Local grocery list (add/show/compare/export CSV) | — |
| Store location lookup | Woolworths, Coles |
| Local price history (SQLite) | Woolworths, Coles |

### Tier 2 — With Auth & Ordering

| Feature | Notes |
|---|---|
| Retailer login | Credentials in OS keychain via `keytar` |
| Automated cart + checkout | Patchright; dry-run mode available |
| Delivery slot selection | Interactive CLI prompt |
| Meal plan → order | LLM extracts ingredients → compare → order cheapest |
| Order history | Stored in local SQLite |
| Cloud sync of grocery lists | DynamoDB backend |

### Tier 3 — Blocked (Needs Official Partnership)

| Feature | Why Blocked |
|---|---|
| Placing orders via API | Requires user session — can't be delegated to third-party API callers |
| Loyalty points (Everyday Rewards / Flybuys) | Account OAuth scopes not publicly documented |
| Personalised member pricing | Requires authenticated account via official API |
| Coles data in paid public API | ToS prohibits commercial resale of scraped data |
| IGA | No central system, hundreds of disparate store sites |

---

## Limitations

### Hard Technical Limits

| Limitation | Detail |
|---|---|
| No order API | Woolworths/Coles have no checkout API for third parties — automation is the only path |
| Patchright not 100% | Retailers can update anti-bot systems; ordering may need maintenance |
| Coles API instability | Reverse-engineered endpoint breaks on Coles mobile app updates |
| Aldi ordering impossible | aldi.com.au has no online ordering |
| Shelf prices only | Personalised loyalty pricing is not accessible |
| UI changes break automation | Checkout automation depends on retailer web UI not changing significantly |

### Legal / ToS Limits

| Limitation | Detail |
|---|---|
| Woolworths ToS | Prohibits automated access — account suspension risk |
| Coles ToS | Same — must disclose this risk to users prominently |
| No Coles data in paid public API | ToS prohibits commercial use of scraped data |
| No data resale verbatim | API must transform/aggregate, not re-serve raw retailer data |
| browsewrap ToS | Low enforceability in Australia, but not zero risk |

**groc-mate must display a clear disclaimer before enabling the ordering feature**, informing users of the ToS risk.

---

## Public REST API (Monetisation Layer)

The adapter logic is fully decoupled and can be deployed as a public API for other developers.

### Endpoints

```
GET /v1/products/search?q=chicken+breast&stores=woolworths,coles
GET /v1/products/compare?q=oat+milk+1L
GET /v1/products/{store}/{productId}
GET /v1/stores?suburb=Newtown+NSW
GET /v1/specials/aldi
GET /v1/price-history/{store}/{productId}?days=30
```

**Ordering is not exposed via API** — it requires a real user session and is CLI-only.

### Developer Pricing Tiers

| Tier | Price | Req/month | Req/min |
|---|---|---|---|
| Free | $0 | 500 | 5 |
| Starter | $9/mo | 10,000 | 30 |
| Pro | $49/mo | 100,000 | 100 |
| Business | $199/mo | 1,000,000 | 500 |

### Go-to-Market Strategy

1. **Launch:** Woolworths-only public API (clean ToS). Coles is CLI-only, personal use only.
2. **After traction:** Use user numbers + ACCC pricing-transparency narrative to approach Coles for a formal data partnership.
3. **Avoid:** Launching Coles in the paid public API without a partnership — cease-and-desist risk.

---

## Distribution

```bash
# npm (primary)
npm install -g groc-mate
groc search "milk"

# npx (no install)
npx groc-mate search "milk"

# Homebrew tap (macOS, adds polish)
brew install adityagoyal11/groc-mate/groc-mate
```

---

## Build Order

1. New repo `groc-mate`, TypeScript strict, Vitest, tsup, eslint
2. `StoreAdapter` interface + `Product` type
3. Woolworths adapter (official API) + mocked unit tests
4. Coles adapter (rate limited, Zod validated) + tests
5. CLI commands: search, compare, list (Commander.js)
6. SQLite cache layer
7. `groc auth login` + keytar integration
8. Patchright browser pool + Woolworths checkout automation
9. Coles checkout automation
10. `groc order` with dry-run, confirmation prompt, CAPTCHA detection
11. Stripe subscription billing + webhook handlers
12. Fastify API routes
13. AWS CDK deployment (Lambda + API Gateway + DynamoDB + ElastiCache)
14. Next.js API key dashboard

---

## Infrastructure (AWS CDK)

```
API Gateway (rate limiting, API key validation)
  └── Lambda (Fastify adapter routes)
      ├── ElastiCache Redis (response cache + rate limit counters)
      └── DynamoDB (API keys, users, price history, grocery lists)

EventBridge weekly cron
  └── Lambda (Playwright Aldi scraper)
      └── S3 (specials JSON) → CloudFront
```

**Estimated pre-revenue cost:** ~$15–20 AUD/month

---

## Legal Summary

| Concern | Status |
|---|---|
| Ordering automation (personal use) | Legal in AU; ToS violation only — disclose to users |
| Subscription fees via Stripe | Clean — standard SaaS, no AFSL/AUSTRAC needed |
| Woolworths data via official API | Clean |
| Coles data (reverse-engineered) | Grey area — CLI personal use acceptable; paid API resale is risky |
| Aldi scraping | Grey area — weekly cache reduces exposure |
| Payment intermediary | Not applicable — grocery payments never touch groc-mate |

> **Recommendation:** Consult an Australian IP/tech lawyer before launching the paid Coles API tier and before going live with the automated ordering feature commercially.

---

*Research completed: May 2026. Implementation repository to be initialised separately.*
