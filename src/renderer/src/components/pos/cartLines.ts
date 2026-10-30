import type { ProductRecord } from '../../../../shared/ipc'
import { lineSubtotal, resolveUnitPrice, roundQtyKg } from '../../../../shared/stock'
import type { CartLine } from './CartPanel'

type PricedProduct = Pick<ProductRecord, 'retailPricePerKg' | 'wholesalePricePerKg' | 'priceBreaks'>

/** A line at `quantityKg`, priced for that whole weight — so a merge or a +/- that
 * crosses the wholesale threshold (or lands on a fraction price) re-tiers. */
export function priceLine(line: CartLine, quantityKg: number, product: PricedProduct | undefined): CartLine {
  const qty = roundQtyKg(quantityKg)
  const unitPricePerKg = product
    ? resolveUnitPrice(qty, product.retailPricePerKg, product.wholesalePricePerKg, product.priceBreaks).price
    : line.unitPricePerKg
  return { ...line, quantityKg: qty, unitPricePerKg, subtotal: lineSubtotal(qty, unitPricePerKg) }
}

// One line per product. Merging used to key on product *and* price, so 3 kg
// then another 3 kg became one 6 kg line still charged at retail — wholesale
// starts at 5 kg, and the customer paid the higher rate for all six.
export function mergeLine(items: CartLine[], line: CartLine, product: PricedProduct | undefined): CartLine[] {
  const existingIndex = items.findIndex((item) => item.productId === line.productId)
  if (existingIndex === -1) return [...items, line]
  const next = [...items]
  const merged = next[existingIndex]
  next[existingIndex] = priceLine(merged, merged.quantityKg + line.quantityKg, product)
  return next
}
