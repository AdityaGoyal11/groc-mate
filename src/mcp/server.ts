#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import keytar from 'keytar'

import { adapters } from '../adapters/index.js'
import { compareQuery, compareList } from '../services/price-comparison.service.js'
import { addItem, getList, clearList } from '../services/grocery-list.service.js'
import { buildAndFillCart } from '../services/cart.service.js'
import { extractIngredients } from '../services/meal-plan.service.js'
import { formatCents } from '../config/config.js'
import type { StoreId } from '../adapters/types.js'

const KEYTAR_SERVICE = 'groc-mate'

const server = new Server(
  { name: 'groc-mate', version: '0.1.0' },
  { capabilities: { tools: {} } },
)

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'search_products',
      description:
        'Search for grocery products across Australian supermarkets. Returns product names, prices, and SKUs.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search term e.g. "oat milk 1L"' },
          stores: {
            type: 'array',
            items: { type: 'string', enum: ['woolworths', 'coles', 'aldi'] },
            description: 'Stores to search. Defaults to woolworths and coles.',
          },
          limit: { type: 'number', description: 'Max results per store (default 5)' },
        },
        required: ['query'],
      },
    },
    {
      name: 'compare_prices',
      description:
        'Compare the price of a single item across Woolworths, Coles, and/or Aldi. Returns prices and which store is cheapest.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Item to compare e.g. "free range eggs 12 pack"' },
          stores: {
            type: 'array',
            items: { type: 'string', enum: ['woolworths', 'coles', 'aldi'] },
            description: 'Stores to compare (default: woolworths, coles)',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'list_add',
      description: 'Add one or more items to the grocery list.',
      inputSchema: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: { type: 'string' },
            description: 'Items to add e.g. ["milk", "eggs", "sourdough bread"]',
          },
        },
        required: ['items'],
      },
    },
    {
      name: 'list_view',
      description:
        'View the current grocery list with prices from Woolworths and Coles and estimated totals.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'list_clear',
      description: 'Clear all items from the grocery list.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'fill_cart',
      description:
        'Fill a Woolworths or Coles online cart with every item on the grocery list. ' +
        'Returns a URL — the user must click it to review and pay on the retailer site. ' +
        'A browser window will open if the user is not yet logged in. ' +
        'Note: automated cart access may violate the retailer\'s Terms of Service.',
      inputSchema: {
        type: 'object',
        properties: {
          store: {
            type: 'string',
            enum: ['woolworths', 'coles'],
            description: 'Which store to fill the cart at',
          },
        },
        required: ['store'],
      },
    },
    {
      name: 'plan_meal',
      description:
        'Extract grocery ingredients from a meal description using Claude, ' +
        'then optionally add them to the grocery list.',
      inputSchema: {
        type: 'object',
        properties: {
          meal: {
            type: 'string',
            description: 'Meal description e.g. "pasta carbonara for 4 people"',
          },
          serves: { type: 'number', description: 'Number of servings (default 4)' },
          add_to_list: {
            type: 'boolean',
            description: 'Add the extracted ingredients to the grocery list (default true)',
          },
        },
        required: ['meal'],
      },
    },
    {
      name: 'find_stores',
      description: 'Find nearby Woolworths and Coles stores by suburb.',
      inputSchema: {
        type: 'object',
        properties: {
          suburb: {
            type: 'string',
            description: 'Suburb and state e.g. "Newtown NSW" or "Fitzroy VIC"',
          },
        },
        required: ['suburb'],
      },
    },
  ],
}))

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  try {
    switch (name) {
      case 'search_products': {
        const storeIds = ((args?.stores as string[]) ?? ['woolworths', 'coles']) as StoreId[]
        const limit = (args?.limit as number) ?? 5
        const query = args?.query as string

        const results = await Promise.allSettled(
          storeIds.map((id) => adapters[id].searchProducts(query, { limit })),
        )

        const lines: string[] = [`Search results for "${query}":\n`]
        storeIds.forEach((id, i) => {
          const r = results[i]
          if (r?.status !== 'fulfilled' || !r.value.length) {
            lines.push(`${id}: no results`)
            return
          }
          lines.push(`${id.toUpperCase()}:`)
          r.value.slice(0, limit).forEach((p) => {
            const unit = p.pricePerUnit ? ` (${p.pricePerUnit})` : ''
            lines.push(`  • ${p.name} — ${formatCents(p.price)}${unit} [SKU: ${p.sku}]`)
          })
        })

        return { content: [{ type: 'text', text: lines.join('\n') }] }
      }

      case 'compare_prices': {
        const storeIds = ((args?.stores as string[]) ?? ['woolworths', 'coles']) as StoreId[]
        const row = await compareQuery(args?.query as string, storeIds)

        const lines: string[] = [`Price comparison for "${row.query}":\n`]
        if (row.woolworths) {
          const unit = row.woolworths.pricePerUnit ? ` (${row.woolworths.pricePerUnit})` : ''
          lines.push(`  Woolworths: ${row.woolworths.price} — ${row.woolworths.name}${unit}`)
        }
        if (row.coles) {
          const unit = row.coles.pricePerUnit ? ` (${row.coles.pricePerUnit})` : ''
          lines.push(`  Coles:      ${row.coles.price} — ${row.coles.name}${unit}`)
        }
        if (row.aldi) {
          lines.push(`  Aldi:       ${row.aldi.price} — ${row.aldi.name}`)
        }
        if (row.cheapest) {
          lines.push(`\n  Cheapest: ${row.cheapest}`)
        }

        return { content: [{ type: 'text', text: lines.join('\n') }] }
      }

      case 'list_add': {
        const items = args?.items as string[]
        for (const item of items) {
          addItem('default', item)
        }
        return {
          content: [{
            type: 'text',
            text: `Added ${items.length} item(s) to your grocery list: ${items.join(', ')}`,
          }],
        }
      }

      case 'list_view': {
        const list = getList('default')
        if (!list.items.length) {
          return { content: [{ type: 'text', text: 'Your grocery list is empty.' }] }
        }

        const rows = await compareList(list.items.map((i) => i.query))
        const lines: string[] = [`Your grocery list (${list.items.length} item(s)):\n`]

        let totalWW = 0
        let totalColes = 0

        for (const row of rows) {
          const ww = row.woolworths?.price ?? 'N/A'
          const coles = row.coles?.price ?? 'N/A'
          const cheapest = row.cheapest ? ` ← cheapest at ${row.cheapest}` : ''
          lines.push(`  • ${row.query}: Woolworths ${ww} | Coles ${coles}${cheapest}`)

          if (row.woolworths) totalWW += parseFloat(row.woolworths.price.replace('$', ''))
          if (row.coles) totalColes += parseFloat(row.coles.price.replace('$', ''))
        }

        lines.push(`\nEstimated totals:`)
        lines.push(`  Woolworths: $${totalWW.toFixed(2)}`)
        lines.push(`  Coles:      $${totalColes.toFixed(2)}`)

        return { content: [{ type: 'text', text: lines.join('\n') }] }
      }

      case 'list_clear': {
        clearList('default')
        return { content: [{ type: 'text', text: 'Grocery list cleared.' }] }
      }

      case 'fill_cart': {
        const storeId = args?.store as StoreId
        const list = getList('default')

        if (!list.items.length) {
          return {
            content: [{ type: 'text', text: 'Your grocery list is empty. Add items first with list_add.' }],
          }
        }

        const sessionCookie = await keytar.getPassword(KEYTAR_SERVICE, `cookie-${storeId}`)

        const result = await buildAndFillCart(list, storeId, sessionCookie, true)

        const lines: string[] = [
          `Cart filled at ${storeId}: ${result.itemsFilled} of ${list.items.length} item(s) added.`,
          ``,
          `Cart URL: ${result.cartUrl}`,
          ``,
          `Click the URL above to review your cart and pay on the ${storeId} website.`,
        ]

        if (result.itemsSkipped.length) {
          lines.push(`\nSkipped (${result.itemsSkipped.length} item(s)):`)
          for (const s of result.itemsSkipped) {
            lines.push(`  • ${s.query}: ${s.reason}`)
          }
        }

        return { content: [{ type: 'text', text: lines.join('\n') }] }
      }

      case 'plan_meal': {
        const apiKey = await keytar.getPassword(KEYTAR_SERVICE, 'anthropic-key')
        if (!apiKey) {
          return {
            content: [{
              type: 'text',
              text: 'Anthropic API key not configured. Run: groc config set-anthropic-key',
            }],
          }
        }

        const plan = await extractIngredients(
          args?.meal as string,
          apiKey,
          (args?.serves as number) ?? 4,
        )

        const lines: string[] = [`Meal plan: ${plan.meal} (serves ${plan.serves})\n`, 'Ingredients:']
        for (const ing of plan.ingredients) {
          const note = ing.notes ? ` — ${ing.notes}` : ''
          lines.push(`  • ${ing.quantity} ${ing.name}${note}`)
        }

        const addToList = args?.add_to_list !== false
        if (addToList) {
          for (const ing of plan.ingredients) {
            addItem('default', `${ing.quantity} ${ing.name}`)
          }
          lines.push(`\n${plan.ingredients.length} ingredient(s) added to your grocery list.`)
        }

        return { content: [{ type: 'text', text: lines.join('\n') }] }
      }

      case 'find_stores': {
        const suburb = args?.suburb as string
        const [ww, coles] = await Promise.allSettled([
          adapters.woolworths.getStores(suburb),
          adapters.coles.getStores(suburb),
        ])

        const lines: string[] = [`Stores near ${suburb}:\n`]

        if (ww.status === 'fulfilled' && ww.value.length) {
          lines.push('WOOLWORTHS:')
          ww.value.slice(0, 3).forEach((s) => {
            lines.push(`  • ${s.name} — ${s.address}, ${s.suburb} ${s.postcode}`)
          })
        }

        if (coles.status === 'fulfilled' && coles.value.length) {
          lines.push('\nCOLES:')
          coles.value.slice(0, 3).forEach((s) => {
            lines.push(`  • ${s.name} — ${s.address}, ${s.suburb} ${s.postcode}`)
          })
        }

        return { content: [{ type: 'text', text: lines.join('\n') }] }
      }

      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    }
  }
})

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport()
await server.connect(transport)
