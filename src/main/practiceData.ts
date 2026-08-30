import type { PosDatabase } from './database'
import type { ProductRecord, SessionUser } from '../shared/ipc'
import { resolveUnitPrice } from '../shared/stock'

/**
 * Generates a few weeks of believable trading into the practice database.
 *
 * The shape is taken from the shop's own handwritten day book rather than
 * invented: most lines are small retail weights (½, 1, 2, 3 kg), a steady
 * minority are 5–20 kg, and a handful of bulk lines (45, 90, 100 kg) carry a
 * disproportionate share of the day's money. Carts are usually a single product.
 * Cash dominates, M-Pesa is common, and credit is occasional and always to a
 * named customer — exactly as the book records it.
 *
 * Everything is written through the same recordSale / recordExpense / openShift
 * calls a real sale uses, so stock decrements, debt entries and shift totals all
 * behave identically. Only the timestamps are rewritten afterwards.
 */

// Names as they appear in the day book, mapped to how the catalog spells them.
// A name that isn't in this shop's catalog is simply skipped, so the profile
// survives the owner renaming or removing products.
const POPULAR: Record<string, number> = {
  Maize: 10,
  'Maize Yellow': 9,
  Ndengu: 8,
  Njahe: 5,
  Mbaazi: 5,
  Wairimu: 5,
  Nyayo: 4,
  Muthokoi: 4,
  Ngano: 4,
  'Unga Wimbi': 3,
  'Unga Mawele': 3,
  Popcorn: 3,
  Soya: 3,
  Basmatt: 3,
  Pishori: 3,
  Rosecoco: 3,
  Mawele: 2,
  Wimbi: 2,
  Minji: 2,
  Terere: 2,
  'Njugu Kubwa': 2,
  Gunia: 2,
}

const CUSTOMERS = [
  'Jackline',
  'Gracy',
  'Francisca',
  'Mama Njeri',
  'Kamau',
  'Wanjiru',
  'Otieno',
  'Mama Watoto',
  'Mwangi',
  'Achieng',
  'Kiptoo',
  'Njoroge',
]

const EXPENSE_KINDS: Array<{ category: string; min: number; max: number; note: string }> = [
  { category: 'Transport', min: 100, max: 800, note: 'Matatu fare to market' },
  { category: 'Fuel', min: 300, max: 1500, note: 'Pickup fuel' },
  { category: 'Labour', min: 200, max: 1000, note: 'Offloading' },
  { category: 'Electricity', min: 300, max: 1200, note: 'Token' },
  { category: 'Water', min: 100, max: 400, note: 'Jerricans' },
  { category: 'Other', min: 100, max: 600, note: 'Sundries' },
]

// Deterministic PRNG, so "generate practice data" twice gives the same shop to
// practise against and a bug found once can be found again.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function toUtc(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

export interface PracticeDataOptions {
  days: number
  actingUser: SessionUser
  staff: SessionUser[]
}

export interface PracticeDataResult {
  days: number
  sales: number
  expenses: number
  shifts: number
}

export function generatePracticeData(
  db: PosDatabase,
  { days, actingUser, staff }: PracticeDataOptions
): PracticeDataResult {
  const random = mulberry32(20260809)
  const pick = <T,>(list: T[]): T => list[Math.floor(random() * list.length)]
  const between = (min: number, max: number) => min + random() * (max - min)
  const intBetween = (min: number, max: number) => Math.floor(between(min, max + 1))
  const round2 = (value: number) => Math.round(value * 100) / 100

  db.clearTradingHistory()

  const products = db.listProducts().filter((product) => product.isActive)
  if (products.length === 0) return { days, sales: 0, expenses: 0, shifts: 0 }

  // A practice shop needs stock to sell. Enough that six weeks of trading never
  // runs a product dry mid-generation, but still a number an owner recognises.
  // The running total is tracked here too so a cart is never built against stock
  // that has already been sold — recordSale would refuse it.
  const stock = new Map<number, number>()
  for (const product of products) {
    const opening = product.weightPerBag * intBetween(25, 60)
    db.setProductStock(product.id, opening)
    stock.set(product.id, opening)

    // Most real catalogs have no buying price recorded yet, which would make the
    // practice shop report a ~97% margin and teach the wrong lesson. Practice
    // products that lack one get a believable cost — 68–82% of retail — so
    // Estimated profit behaves the way it will once costs are entered for real.
    if (product.buyingPricePerBag <= 0 && product.retailPricePerKg > 0) {
      const costPerKg = product.retailPricePerKg * between(0.68, 0.82)
      db.setProductBuyingPrice(product.id, Math.round(costPerKg * product.weightPerBag))
    }
  }

  const weightFor = (product: ProductRecord) => POPULAR[product.name] ?? 1
  const weighted: ProductRecord[] = []
  for (const product of products) {
    for (let i = 0; i < weightFor(product); i += 1) weighted.push(product)
  }

  // Small retail weights dominate, exactly as the book does; bulk lines are rare
  // but are what makes some days stand out on the sales trend.
  const drawQuantity = (): number => {
    const roll = random()
    if (roll < 0.55) return pick([0.25, 0.5, 0.5, 1, 1, 1, 1.5, 2, 2, 3])
    if (roll < 0.85) return pick([4, 5, 5, 6, 8, 10, 10])
    if (roll < 0.97) return pick([15, 20, 25, 30])
    return pick([45, 50, 90, 100])
  }

  // Trading peaks mid-morning and again in the late afternoon.
  const drawHour = (): number => {
    const roll = random()
    if (roll < 0.35) return intBetween(9, 11)
    if (roll < 0.65) return intBetween(15, 18)
    if (roll < 0.85) return intBetween(12, 14)
    return intBetween(7, 8)
  }

  let salesMade = 0
  let expensesMade = 0
  let shiftsMade = 0

  db.setDurability(false)
  try {
    for (let dayOffset = days - 1; dayOffset >= 0; dayOffset -= 1) {
      const day = new Date()
      day.setDate(day.getDate() - dayOffset)
      day.setHours(0, 0, 0, 0)
      const isLastDay = dayOffset === 0
      const sunday = day.getDay() === 0

      const cashier = staff.length > 0 ? pick(staff) : actingUser
      const shift = db.openShift(
        { openingCash: intBetween(2, 10) * 500, openingMpesa: 0, notes: undefined },
        cashier
      )
      shiftsMade += 1

      const saleCount = sunday ? intBetween(8, 18) : intBetween(20, 48)
      const times: Date[] = []
      for (let i = 0; i < saleCount; i += 1) {
        const at = new Date(day)
        at.setHours(drawHour(), intBetween(0, 59), intBetween(0, 59), 0)
        times.push(at)
      }
      times.sort((a, b) => a.getTime() - b.getTime())

      for (const at of times) {
        // Most carts are one product; a few are two or three.
        const lineCount = random() < 0.72 ? 1 : random() < 0.85 ? 2 : 3
        const items: Array<{ productId: number; quantityKg: number; unitPricePerKg: number }> = []
        const used = new Set<number>()
        for (let i = 0; i < lineCount; i += 1) {
          const product = pick(weighted)
          if (used.has(product.id)) continue
          const quantityKg = drawQuantity()
          const available = stock.get(product.id) ?? 0
          if (available < quantityKg) continue
          used.add(product.id)
          stock.set(product.id, round2(available - quantityKg))
          const { price } = resolveUnitPrice(quantityKg, product.retailPricePerKg, product.wholesalePricePerKg)
          items.push({ productId: product.id, quantityKg, unitPricePerKg: price })
        }
        if (items.length === 0) continue

        const total = items.reduce((sum, item) => sum + item.quantityKg * item.unitPricePerKg, 0)
        const roll = random()
        let customerName = 'Walk-in'
        let cashPaid = 0
        let mpesaPaid = 0
        if (roll < 0.06) {
          // Credit — the book always names these.
          customerName = pick(CUSTOMERS)
          cashPaid = Math.round(total * pick([0, 0, 0.3, 0.5]))
        } else if (roll < 0.28) {
          mpesaPaid = Math.ceil(total)
        } else if (roll < 0.36) {
          cashPaid = Math.round(total * 0.6)
          mpesaPaid = Math.ceil(total) - cashPaid
        } else {
          // Ceil, never round: rounding a 68.25 sale down to 68 leaves 25 cents
          // of debt, and the till rightly refuses to put debt on a walk-in.
          cashPaid = Math.ceil(total)
          if (random() < 0.15) customerName = pick(CUSTOMERS)
        }

        const sale = db.recordSale(
          { shiftId: shift.id, customerName, items, cashPaid, mpesaPaid, discount: 0 },
          cashier
        )
        const utc = toUtc(at)
        db.backdate('sales', sale.id, utc)
        if (sale.debtAmount > 0) db.backdateLatestDebtEntry(utc)
        salesMade += 1
      }

      const expenseCount = random() < 0.45 ? 0 : intBetween(1, 3)
      for (let i = 0; i < expenseCount; i += 1) {
        const kind = pick(EXPENSE_KINDS)
        const at = new Date(day)
        at.setHours(intBetween(8, 18), intBetween(0, 59), 0, 0)
        const expense = db.recordExpense({
          shiftId: shift.id,
          category: kind.category,
          amount: Math.round(between(kind.min, kind.max) / 10) * 10,
          description: kind.note,
          paymentMethod: random() < 0.7 ? 'CASH' : 'MPESA',
        })
        db.backdate('expenses', expense.id, toUtc(at))
        expensesMade += 1
      }

      const opened = new Date(day)
      opened.setHours(7, intBetween(0, 30), 0, 0)
      if (isLastDay) {
        // The most recent day is left open so the till is ready to sell into the
        // moment practice mode starts.
        db.backdateShift(shift.id, toUtc(opened), null)
      } else {
        const closed = new Date(day)
        closed.setHours(19, intBetween(0, 45), 0, 0)
        const summary = db.closeShift({
          shiftId: shift.id,
          closingCashActual: 0,
          closingMpesaActual: 0,
          notes: undefined,
        })
        // Counted takings match the till exactly most days, with the odd small
        // discrepancy — a shift history where every variance is zero teaches
        // nothing about reading one.
        const drift = random() < 0.2 ? Math.round(between(-200, 200) / 10) * 10 : 0
        db.setPracticeShiftCounts(
          shift.id,
          (summary.shift.expectedCash ?? 0) + drift,
          summary.shift.expectedMpesa ?? 0
        )
        db.backdateShift(shift.id, toUtc(opened), toUtc(closed))
      }
    }
  } finally {
    db.setDurability(true)
  }

  return { days, sales: salesMade, expenses: expensesMade, shifts: shiftsMade }
}
