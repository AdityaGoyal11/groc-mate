# groc-mate — Research Document

> **Status:** Research & Planning phase. Implementation will happen in a dedicated new repo.

A CLI tool for Australian consumers to search, compare, and plan groceries — then automatically fill a cart on Woolworths or Coles and hand back a direct link so the user just clicks, reviews, and pays.

---

## The Core Flow

```
1. groc search "chicken breast"     → compare prices across Woolworths + Coles
2. groc plan "pasta carbonara"      → AI extracts ingredients → search each one
3. groc list show                   → review your list
4. groc cart --store woolworths     → Playwright fills your Woolworths cart
                                    → returns: https://woolworths.com.au/shop/cart
5. User clicks link → cart is pre-filled → they pay directly on the retailer site
```

**groc-mate never touches a payment.** It just fills the cart. The user does the final step.

---

## Why This Approach Is Clean

| Concern | Old approach (full checkout) | This approach (cart fill + link) |
|---|---|---|
| Payment handling | groc-mate had to manage checkout | User pays directly on retailer site |
| Stripe needed | Yes ($9.99/mo subscription) | **No** |
| AFSL/AUSTRAC registration | Needed to be investigated | **Not applicable** |
| Legal risk | High — automating a financial transaction | Low — just populating a cart |
| User trust required | High — user must hand over card details | **None** — user never gives payment info |
| ToS violation severity | High — completing a purchase | Moderate — filling a cart |

The user still makes the final purchasing decision. groc-mate is a smart shopping assistant, not a payment agent.

---

## Two Cart-Fill Modes

### Mode A — Guest Cart (No Login Required)
Playwright opens the retailer site without logging in, adds items to a guest/anonymous cart, and returns the cart URL. The user clicks the link, logs into their account (or stays as guest), and checks out.

- Zero credential management
- Works immediately, no setup
- Cart may reset on login (retailer-dependent — needs testing)

### Mode B — Logged-In Cart (Session Cookie)
User provides their session cookie once (via `groc auth set-cookie --store woolworths`). Playwright uses it to add items directly to the user's logged-in cart. The returned URL goes straight to their pre-filled cart, delivery preferences and all.

- Better UX — cart is already attached to their account, delivery slots available
- No password stored — just a session cookie (short-lived, easily revoked)
- User pastes cookie from their own browser DevTools

---

## Store Coverage

| Store | Search/Compare | Cart Fill | Notes |
|---|---|---|---|
| **Woolworths** | Official API (`apiportal.woolworths.com.au`) | Patchright automation | Primary target — best API + largest online share |
| **Coles** | Reverse-engineered `api.coles.com.au` | Patchright automation | API can break; 20 RPM cap |
| **Aldi** | Weekly-scraped specials | Not possible | No online ordering on aldi.com.au |
| **IGA** | Not supported | Not supported | Franchise network, no central system |

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Language | TypeScript + Node.js | Single language for CLI + public API server |
| CLI framework | Commander.js | Subcommand support, widely used |
| Browser automation | **Patchright** | Playwright fork with V8-level anti-detection patches; consistent Cloudflare bypass |
| HTTP client | axios + axios-retry | Retry logic, interceptors for rate limiting |
| CLI output | chalk + cli-table3 | Colour tables for price comparison |
| Local config/cache | `conf` + `better-sqlite3` | XDG-compliant config, SQLite for price history |
| Cookie storage | `keytar` | OS keychain — never stored in plaintext |
| Schema validation | Zod | Validates API responses — detects adapter breakage early |
| API server | Fastify | Public REST API for monetisation |
| Meal planning | Claude API (Anthropic) | Ingredient extraction from meal names |
| Testing | Vitest | TypeScript-native, fast |
| Build | tsup | Node.js bundler |
| IaC | AWS CDK (TypeScript) | Lambda + API Gateway + DynamoDB + ElastiCache |

---

## Architecture

```
groc-mate/
├── src/
│   ├── cli/commands/
│   │   ├── search.ts          # groc search <query>
│   │   ├── compare.ts         # groc compare <query>
│   │   ├── list.ts            # groc list add/show/compare/export
│   │   ├── plan.ts            # groc plan <meal> — Claude extracts ingredients
│   │   ├── cart.ts            # groc cart --store → fill cart + return URL
│   │   ├── stores.ts          # groc stores --suburb
│   │   └── config.ts
│   ├── adapters/
│   │   ├── base.adapter.ts    # StoreAdapter interface + Product type
│   │   ├── woolworths.adapter.ts
│   │   ├── coles.adapter.ts
│   │   └── aldi.adapter.ts
│   ├── automation/
│   │   ├── browser.ts         # Patchright browser pool manager
│   │   ├── woolworths.cart.ts # Add items to Woolworths cart, return URL
│   │   └── coles.cart.ts      # Add items to Coles cart, return URL
│   ├── services/
│   │   ├── price-comparison.service.ts
│   │   ├── meal-plan.service.ts   # Claude API: meal → ingredient list
│   │   ├── grocery-list.service.ts
│   │   └── cart.service.ts        # Orchestrates item matching + cart filling
│   └── api/                   # Public REST API (for developer monetisation)
│       ├── server.ts
│       ├── middleware/        # API key auth + rate limiting
│       └── routes/            # search, compare, stores
```

---

## Detailed Cart-Fill Flow

```
groc cart --store woolworths
```

1. `cart.service.ts` reads the default grocery list
2. For each item, calls `woolworths.adapter.searchProducts()` to find the best-matching SKU
3. Presents a confirmation table: item → matched product → price → user approves
4. `woolworths.cart.ts` spins up a Patchright Chromium instance
5. Navigates to `woolworths.com.au`
6. If session cookie exists → injects it; if not → proceeds as guest
7. For each SKU, adds to cart via the add-to-cart button (or API call if available)
8. Once all items are added, captures the cart/trolley URL
9. Returns URL to CLI: `Cart ready → https://woolworths.com.au/shop/cart`
10. CLI opens the URL in the user's default browser (or just prints it)

**If an item can't be found:** CLI asks user to pick an alternative or skip, before the cart fill begins. No surprises mid-automation.

---

## Patchright Anti-Detection Strategy

| Technique | Implementation |
|---|---|
| V8 runtime patches | Patchright eliminates all `navigator.webdriver` + headless signals |
| Human-like timing | 500ms–2s random delays between add-to-cart actions |
| Realistic mouse curves | Bezier-curve movement between elements |
| Persistent browser profile | Reuse cookies between sessions — looks like a returning user |
| No proxy rotation | Single consistent IP — proxies trigger location-change detection |
| Full resource loading | Don't skip JS/CSS/images — behave like a real browser |

---

## Meal Planning (Claude API)

```bash
groc plan "pasta carbonara for 4"
```

1. Sends prompt to Claude API: *"List ingredients for pasta carbonara for 4 people. Return JSON array with name and approximate quantity."*
2. Each ingredient passed to `searchProducts()` across selected stores
3. Cheapest option per ingredient shown in a table
4. User confirms list → `groc cart --store woolworths` fills cart

User provides their own Anthropic API key via `groc config set anthropic-key sk-ant-...` (stored in OS keychain). This keeps groc-mate free — no meal planning subscription needed.

---

## Features by Tier

### Tier 1 — Core (Free, No Auth)

| Feature | Details |
|---|---|
| Product search | Woolworths + Coles via their respective APIs |
| Price comparison | Side-by-side table across stores |
| Aldi weekly specials | Weekly-scraped cache |
| Grocery list management | add / show / compare / export CSV |
| Store locator | Find stores near a suburb |
| Local price history | SQLite tracks prices over time |
| **Cart fill + link** | Playwright fills cart, returns URL — user clicks and pays |

### Tier 2 — With Session Cookie

| Feature | Details |
|---|---|
| Logged-in cart fill | Items added to user's account cart, delivery slots available |
| Meal plan → cart | Claude extracts ingredients → compare → fill cart |
| Multi-store split | Fill Woolworths cart with items cheapest there, Coles with the rest |

### Tier 3 — Blocked (Needs Official Partnership)

| Feature | Why Blocked |
|---|---|
| Completing checkout | Retailer keeps payment behind a closed wall — this is intentional in our design |
| Loyalty points (Everyday Rewards / Flybuys) | Account OAuth scopes not publicly documented |
| Personalised member pricing | Requires authenticated account API |
| Aldi cart fill | No online ordering on aldi.com.au |
| IGA | No central system |

---

## Limitations

### Technical

| Limitation | Detail |
|---|---|
| Guest cart may reset on login | Woolworths/Coles may not merge a guest cart with a logged-in account — needs testing |
| Patchright not bulletproof | Retailers can update anti-bot systems; cart filling may need periodic maintenance |
| Coles API instability | Reverse-engineered endpoint breaks on Coles mobile app updates |
| Item matching isn't perfect | "chicken breast 500g" may match multiple products; needs disambiguation logic |
| UI changes break automation | Cart-fill scripts depend on retailer web UI staying consistent |
| Aldi is read-only | No online ordering = no cart to fill |

### Legal / ToS

| Limitation | Detail |
|---|---|
| Woolworths ToS | Prohibits automated access — account suspension risk if using session cookie mode |
| Coles ToS | Same |
| Must disclose to users | groc-mate must warn users that automation may violate retailer ToS |
| Coles data in paid public API | ToS prohibits commercial resale — Woolworths-only for the public API at launch |
| Browsewrap ToS | Low enforceability in Australia, but not zero risk |

**Filling a cart is much lower risk than completing a checkout.** The user still makes the purchasing decision. This is closer to a "shopping list to cart" assistant than a purchasing bot.

---

## Public REST API (Monetisation)

The adapter layer is decoupled from the CLI and can be exposed as a paid API for developers building their own grocery tools.

### Endpoints

```
GET /v1/products/search?q=chicken+breast&stores=woolworths,coles
GET /v1/products/compare?q=oat+milk+1L
GET /v1/products/{store}/{productId}
GET /v1/stores?suburb=Newtown+NSW
GET /v1/specials/aldi
GET /v1/price-history/{store}/{productId}?days=30
```

**Cart-fill is not exposed via API** — it requires a browser session and is CLI-only.

### Developer Pricing Tiers (AUD)

| Tier | Price | Req/month | Req/min |
|---|---|---|---|
| Free | $0 | 500 | 5 |
| Starter | $9/mo | 10,000 | 30 |
| Pro | $49/mo | 100,000 | 100 |
| Business | $199/mo | 1,000,000 | 500 |

Stripe Subscriptions used for API tier billing only — no grocery payment handling.

### Infrastructure (AWS)

```
API Gateway → Lambda → ElastiCache Redis (cache + rate limits) → DynamoDB
EventBridge weekly cron → Lambda (Playwright Aldi scraper) → S3 → CloudFront
```

~$15–20 AUD/month pre-revenue.

---

## Distribution

```bash
npm install -g groc-mate
groc search "milk"

# or without install
npx groc-mate search "milk"

# Homebrew tap (macOS)
brew install adityagoyal11/groc-mate/groc-mate
```

---

## Build Order

1. New repo `groc-mate`, TypeScript strict, Vitest, tsup
2. `StoreAdapter` interface + `Product` type
3. Woolworths adapter (official API) + mocked unit tests
4. Coles adapter (rate limited, Zod validated)
5. CLI: search, compare, list commands
6. SQLite cache layer
7. Patchright browser pool
8. `woolworths.cart.ts` — add items, capture cart URL
9. `coles.cart.ts` — same
10. `groc cart` command with confirmation prompt + item disambiguation
11. `groc plan` command with Claude API integration
12. Session cookie mode (`groc auth set-cookie`)
13. Fastify API routes + AWS CDK deployment
14. Next.js dashboard for developer API key sign-up

---

## Legal Summary

| Concern | Status |
|---|---|
| Cart filling (guest) | Low risk — adding items to a public cart, user still pays |
| Cart filling (session cookie) | Moderate — ToS violation possible; must disclose to users |
| Woolworths official API for search | Clean |
| Coles reverse-engineered API | Grey area — personal/CLI use acceptable |
| Coles data in paid API | Risky — launch Woolworths-only, seek Coles partnership after traction |
| Payment handling | **Not applicable** — groc-mate never touches payments |
| AFSL/AUSTRAC | **Not applicable** — no financial services involved |

---

*Research completed: May 2026. Implementation repository to be initialised separately.*
