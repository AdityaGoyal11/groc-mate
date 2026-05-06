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

## MCP server (Claude / AI chatbot integration)

groc-mate ships an [MCP server](https://modelcontextprotocol.io) so AI assistants like Claude can call it as a tool with natural language — no commands needed.

### Setup in Claude Desktop

Add this to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "groc-mate": {
      "command": "groc-mcp"
    }
  }
}
```

Then restart Claude Desktop. You can now ask Claude things like:

> "What's the cheapest oat milk at Woolworths or Coles?"
> "Add ingredients for pasta carbonara to my grocery list"
> "Fill my Woolworths cart and give me the link"

### Available MCP tools

| Tool | What it does |
|---|---|
| `search_products` | Search across Woolworths, Coles, Aldi |
| `compare_prices` | Side-by-side price for one item, highlights cheapest |
| `list_add` | Add items to grocery list |
| `list_view` | Show list with live prices and estimated totals |
| `list_clear` | Clear the list |
| `fill_cart` | Fill Woolworths/Coles cart, return URL to click and pay |
| `plan_meal` | Extract ingredients from a meal description (uses Claude API) |
| `find_stores` | Find nearby stores by suburb |

### Cart fill + login

The first time you run `fill_cart`, groc-mate opens a visible browser window and waits for you to log in to Woolworths or Coles. Once you're logged in, the session is saved and subsequent cart fills run in the background automatically.

## Legal

Cart automation is a ToS violation for Woolworths and Coles. groc-mate shows a warning before every cart fill. Use at your own risk. See `GROC_MATE_RESEARCH.md` for the full legal analysis.
