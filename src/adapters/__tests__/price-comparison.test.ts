import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Product } from '../types.js'

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: '123',
    storeId: 'woolworths',
    name: 'Full Cream Milk 2L',
    price: 350, // $3.50
    sku: '123',
    inStock: true,
    fetchedAt: new Date(),
    ...overrides,
  }
}

describe('Product price formatting', () => {
  it('formats cents to dollar string correctly', () => {
    const p = makeProduct({ price: 350 })
    expect(`$${(p.price / 100).toFixed(2)}`).toBe('$3.50')
  })

  it('handles zero price', () => {
    const p = makeProduct({ price: 0 })
    expect(`$${(p.price / 100).toFixed(2)}`).toBe('$0.00')
  })

  it('handles price without float precision issues', () => {
    // $2.70 stored as 270 cents
    const p = makeProduct({ price: 270 })
    expect(p.price).toBe(270)
    expect(`$${(p.price / 100).toFixed(2)}`).toBe('$2.70')
  })
})

describe('Product inStock', () => {
  it('defaults to inStock = true', () => {
    expect(makeProduct().inStock).toBe(true)
  })

  it('can be out of stock', () => {
    expect(makeProduct({ inStock: false }).inStock).toBe(false)
  })
})
