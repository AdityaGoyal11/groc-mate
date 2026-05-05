# groc-mate

Search, compare, and auto-fill grocery carts across Woolworths, Coles, and Aldi — from your terminal.

## Requirements

- Node.js ≥ 20
- A Woolworths account (for cart-fill)
- An Anthropic API key (for `groc plan` only)

## Setup

```bash
npm install
npx playwright install chromium   # Patchright uses the Playwright browser binary
npm run build
npm link                          # makes the `groc` command available globally
```

## Commands

```bash
groc search "oat milk"            # search across Woolworths + Coles
groc compare "oat milk 1L"        # side-by-side price table, cheapest highlighted
groc list add "milk, eggs, bread" # add items to your grocery list
groc list show                    # show current list
groc list compare                 # compare list prices across stores
groc plan "pasta carbonara"       # Claude extracts ingredients → searches prices → adds to list
groc cart --store woolworths      # fills your Woolworths cart via browser automation, returns URL
groc cart --store coles           # fills your Coles cart via browser automation, returns URL
groc stores --suburb "Newtown NSW" # find nearby stores
groc config set anthropic-key <key>
groc config set woolworths-email <email>
groc config get
```

## Architecture

```
src/
  adapters/       # Woolworths (official API), Coles (reverse-engineered), Aldi (local JSON cache)
  automation/     # Patchright browser automation for cart-fill
  cache/          # SQLite cache + price history (WAL mode)
  cli/            # Commander CLI entry point + display helpers
  services/       # Price comparison, grocery list, cart, meal-plan
  config/         # XDG-compliant config via conf + OS keychain via keytar
```

**Cart-fill model:** groc-mate fills the cart using Patchright (a Playwright fork with V8-level anti-detection) and hands back a direct URL. You click it, review the cart, and pay on the retailer's site. groc-mate never touches payment.

**CAPTCHA handling:** if a CAPTCHA appears during automation, groc-mate pauses, opens a visible browser window for you to solve it, then continues.

**Session cookies** are stored in the OS keychain via `keytar` — no passwords in plaintext.

## Woolworths API

The Woolworths adapter uses the official API endpoint. For higher rate limits, register at [apiportal.woolworths.com.au](https://apiportal.woolworths.com.au) and set your key:

```bash
groc config set woolworths-api-key <key>
```

Without a key the adapter falls back to the public endpoint (lower rate limits).

## Legal

Cart automation is a ToS violation for Woolworths and Coles. groc-mate shows a warning before every cart fill. Use at your own risk. See `GROC_MATE_RESEARCH.md` for the full legal analysis.
