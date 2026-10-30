import { describe, expect, it } from 'vitest'
import {
  changeDue,
  formatReceiptNumber,
  lineSubtotal,
  priceSaleLines,
  resolveQtyFromAmount,
  resolveUnitPrice,
  summarizeStock,
} from './stock'

const maize = {
  name: 'Maize',
  retailPricePerKg: 100,
  wholesalePricePerKg: 80,
  priceBreaks: [{ quantityKg: 0.25, price: 30 }],
}
const products = new Map([[1, maize]])

describe('lineSubtotal', () => {
  it('rounds each line to the whole shilling', () => {
    expect(lineSubtotal(1.25, 101)).toBe(126)
    expect(lineSubtotal(2, 100)).toBe(200)
  })
})

describe('resolveUnitPrice', () => {
  it('uses retail below the wholesale threshold', () => {
    expect(resolveUnitPrice(4.9, 100, 80)).toEqual({ price: 100, mode: 'retail' })
  })

  it('switches to wholesale at 5 kg', () => {
    expect(resolveUnitPrice(5, 100, 80)).toEqual({ price: 80, mode: 'wholesale' })
  })

  it('uses a fraction price for its exact weight only', () => {
    expect(resolveUnitPrice(0.25, 100, 80, maize.priceBreaks).mode).toBe('fraction')
    expect(resolveUnitPrice(0.3, 100, 80, maize.priceBreaks).mode).toBe('retail')
  })
})

describe('resolveQtyFromAmount', () => {
  it('turns an amount that matches a fraction price into that weight', () => {
    expect(resolveQtyFromAmount(30, 100, 80, maize.priceBreaks)).toEqual({ qty: 0.25, mode: 'fraction' })
  })

  it('derives weight from the retail price otherwise', () => {
    expect(resolveQtyFromAmount(200, 100, 80)).toEqual({ qty: 2, mode: 'retail' })
  })
})

describe('priceSaleLines', () => {
  it('prices a retail line from the product list', () => {
    const [line] = priceSaleLines([{ productId: 1, quantityKg: 2, unitPricePerKg: 100 }], products)
    expect(line).toEqual({ productId: 1, quantityKg: 2, unitPricePerKg: 100, subtotal: 200 })
  })

  it('prices 5 kg at the wholesale rate', () => {
    const [line] = priceSaleLines([{ productId: 1, quantityKg: 5, unitPricePerKg: 80 }], products)
    expect(line.subtotal).toBe(400)
  })

  it('prices split lines of one product on their combined weight', () => {
    const lines = priceSaleLines(
      [
        { productId: 1, quantityKg: 3, unitPricePerKg: 80 },
        { productId: 1, quantityKg: 3, unitPricePerKg: 80 },
      ],
      products
    )
    expect(lines.reduce((sum, line) => sum + line.subtotal, 0)).toBe(480)
  })

  it('refuses a price that does not match the product list', () => {
    expect(() => priceSaleLines([{ productId: 1, quantityKg: 2, unitPricePerKg: 50 }], products)).toThrow(
      /has changed since it was added/
    )
  })

  it('refuses the retail price on a line that now qualifies for wholesale', () => {
    expect(() => priceSaleLines([{ productId: 1, quantityKg: 5, unitPricePerKg: 100 }], products)).toThrow(
      /has changed since it was added/
    )
  })

  it('refuses a product that does not exist', () => {
    expect(() => priceSaleLines([{ productId: 9, quantityKg: 1, unitPricePerKg: 100 }], products)).toThrow(
      /no longer exists/
    )
  })
})

describe('changeDue', () => {
  it('returns what is handed back above the total', () => {
    expect(changeDue({ totalAmount: 430, cashPaid: 500, mpesaPaid: 0 })).toBe(70)
  })

  it('is zero when the customer pays exactly or owes', () => {
    expect(changeDue({ totalAmount: 430, cashPaid: 430, mpesaPaid: 0 })).toBe(0)
    expect(changeDue({ totalAmount: 430, cashPaid: 100, mpesaPaid: 0 })).toBe(0)
  })
})

describe('summarizeStock', () => {
  it('splits weight into bags and a loose remainder', () => {
    expect(summarizeStock(840).label).toBe('9 bags 30 kg (840 kg)')
  })

  it('shows a plain weight under one bag', () => {
    expect(summarizeStock(50).label).toBe('50 kg')
  })
})

describe('formatReceiptNumber', () => {
  it('gives every sale its own five-digit code', () => {
    const codes = new Set<string>()
    for (let id = 1; id <= 10000; id++) codes.add(formatReceiptNumber(id))
    expect(codes.size).toBe(10000)
    expect(formatReceiptNumber(1)).toMatch(/^#[0-9A-F]{5}$/)
  })
})
