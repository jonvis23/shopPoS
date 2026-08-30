export const KG_PER_BAG = 90

export interface StockSummary {
  totalKg: number
  bags: number
  remainderKg: number
  /** "9 bags" — the headline figure; the shop counts stock in bags. */
  bagsLabel: string
  /** "30 kg" — the loose remainder, or '' when the bags come out even. */
  remainderLabel: string
  /** "840 kg" — the exact weight, kept for reconciliation. */
  totalLabel: string
  /** "9 bags 30 kg (840 kg)" — the three above, joined. */
  label: string
}

const roundKg = (value: number): number => Math.round(value * 1000) / 1000

// 840 not 840.00, but 30.5 keeps its half — trailing zeros are noise in a column
// that's scanned rather than read.
function trimKg(value: number): string {
  return formatThousands(String(roundKg(value)))
}

export function summarizeStock(totalKg: number, kgPerBag: number = KG_PER_BAG): StockSummary {
  const normalizedKg = Math.max(0, roundKg(totalKg))
  const bagSize = kgPerBag > 0 ? kgPerBag : KG_PER_BAG
  const bags = Math.floor(normalizedKg / bagSize)
  const remainderKg = roundKg(normalizedKg - bags * bagSize)

  const bagsLabel = `${bags} ${bags === 1 ? 'bag' : 'bags'}`
  const remainderLabel = remainderKg > 0 ? `${trimKg(remainderKg)} kg` : ''
  const totalLabel = `${trimKg(normalizedKg)} kg`

  // Under one full bag the total would just repeat the remainder, so the
  // parenthesised weight is dropped rather than printed twice.
  const parts = [bagsLabel, remainderLabel].filter(Boolean)
  const label = bags > 0 ? `${parts.join(' ')} (${totalLabel})` : parts.join(' ')

  return { totalKg: normalizedKg, bags, remainderKg, bagsLabel, remainderLabel, totalLabel, label }
}

/**
 * Stock is "running low" below five bags — the point the owner wants to see
 * flagged and pulled to the top of the Stock list. A product's own
 * `minStockAlertKg` still counts too, so a per-product threshold set higher than
 * five bags keeps working.
 */
export const LOW_STOCK_BAGS = 5

export function isLowStock(totalWeightKg: number, weightPerBag: number, minStockAlertKg: number): boolean {
  const bagSize = weightPerBag > 0 ? weightPerBag : KG_PER_BAG
  return totalWeightKg < LOW_STOCK_BAGS * bagSize || totalWeightKg <= minStockAlertKg
}

export function costPerKg(buyingPricePerBag: number, weightPerBag: number): number {
  if (weightPerBag <= 0) return 0
  return roundKg(buyingPricePerBag / weightPerBag)
}

export function toCurrency(amount: number): string {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0)
}

/**
 * What the customer gets back. Derived rather than stored: the till records what
 * was actually handed over (`cashPaid`), so anything above the total is change.
 * Being a derivation means it is also correct for sales recorded before change
 * was ever displayed.
 */
export function changeDue(sale: { totalAmount: number; cashPaid: number; mpesaPaid: number }): number {
  return Math.max(0, roundKg(sale.cashPaid + sale.mpesaPaid - sale.totalAmount))
}

export function formatKg(amount: number): string {
  return `${(Number.isFinite(amount) ? amount : 0).toFixed(2)} kg`
}

// "9kg", "1.5kg", "1,200kg". The padded two-decimal form above is right on a
// receipt, where columns line up; a table cell listing four products in one line
// needs every character it can save, so trailing zeros go.
export function formatKgCompact(amount: number): string {
  const value = Number.isFinite(amount) ? amount : 0
  return `${formatThousands(String(Math.round(value * 100) / 100))}kg`
}

// Multiplying by an odd constant mod 2^32 is a bijection (every sale id maps to a
// distinct code, no collisions), and XOR-ing with a second constant scrambles the
// bit pattern further so consecutive sale ids don't produce visually similar codes.
// Two receipts printed weeks apart therefore can't be diffed to infer how many sales
// happened in between — the way a plain zero-padded id would let anyone do.
//
// The result is masked down to 20 bits (5 hex digits) for a short, serial-like
// code. That keeps the same "still a bijection, still no collisions" guarantee,
// just over a smaller ~1.05M-value space instead of the full 32-bit one — plenty
// for a single shop's lifetime sale count (~500 sales/day for 5+ years straight).
const RECEIPT_MULTIPLIER = 2654435761 // Knuth's multiplicative hash constant — odd, so invertible mod 2^32
const RECEIPT_XOR = 0x9e3779b9
const RECEIPT_MASK = 0xfffff // 20 bits -> 5 hex digits, 0x00000-0xFFFFF

export function formatReceiptNumber(saleId: number): string {
  const scrambled = ((Math.imul(saleId, RECEIPT_MULTIPLIER) ^ RECEIPT_XOR) >>> 0) & RECEIPT_MASK
  return `#${scrambled.toString(16).toUpperCase().padStart(5, '0')}`
}

export function formatThousands(raw: string): string {
  if (!raw) return ''
  const negative = raw.startsWith('-')
  const unsigned = negative ? raw.slice(1) : raw
  const [intPart, decPart] = unsigned.split('.')
  const groupedInt = (intPart || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const grouped = decPart !== undefined ? `${groupedInt}.${decPart}` : groupedInt
  return negative ? `-${grouped}` : grouped
}

export function sanitizeNumericInput(input: string): string {
  let value = input.replace(/,/g, '').replace(/[^0-9.-]/g, '')
  const negative = value.startsWith('-')
  value = value.replace(/-/g, '')
  const firstDot = value.indexOf('.')
  if (firstDot !== -1) {
    value = value.slice(0, firstDot + 1) + value.slice(firstDot + 1).replace(/\./g, '')
  }
  // Drop leading zeros before another digit. A payment field sitting at "0" that
  // gets typed into produces "0100", which the thousands separator then dresses
  // up as "0,100" — a hundred-shilling payment wearing a hundred-thousand's
  // clothes. Only zeros followed by a digit go: "0.5" and a bare "0" are real
  // values and stay exactly as they are.
  value = value.replace(/^0+(?=\d)/, '')
  return negative ? `-${value}` : value
}

export const WHOLESALE_MIN_KG = 5

export interface ResolvedPrice {
  price: number
  mode: 'retail' | 'wholesale'
}

export function resolveUnitPrice(qtyKg: number, retailPricePerKg: number, wholesalePricePerKg: number): ResolvedPrice {
  if (wholesalePricePerKg > 0 && qtyKg >= WHOLESALE_MIN_KG) {
    return { price: wholesalePricePerKg, mode: 'wholesale' }
  }
  return { price: retailPricePerKg, mode: 'retail' }
}

export interface ResolvedQty {
  qty: number
  mode: 'retail' | 'wholesale'
}

export function resolveQtyFromAmount(amountKes: number, retailPricePerKg: number, wholesalePricePerKg: number): ResolvedQty {
  if (retailPricePerKg <= 0) return { qty: 0, mode: 'retail' }
  const qtyAtRetail = amountKes / retailPricePerKg
  if (wholesalePricePerKg > 0 && qtyAtRetail >= WHOLESALE_MIN_KG) {
    return { qty: amountKes / wholesalePricePerKg, mode: 'wholesale' }
  }
  return { qty: qtyAtRetail, mode: 'retail' }
}
