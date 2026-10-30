import type { PosDatabase } from './database'
import type { ProductRecord, SessionUser } from '../shared/ipc'
import { ADMIN_RIGHTS, hasRight } from '../shared/rights'
import { lineSubtotal, resolveUnitPrice } from '../shared/stock'

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

  // The feature scenarios need two people with no rights to hand the till between and to
  // add stock as cashiers, and one person with every right to approve it. Anyone missing
  // is added to the practice copy only, so the real shop's staff are never touched.
  const isCashier = (user: SessionUser) => user.rights.length === 0
  const crew = [...staff]
  for (let n = crew.filter(isCashier).length; n < 2; n += 1) {
    const created = db.createUser({ name: `Practice cashier ${n + 1}`, rights: [], pin: `${n + 1}`.repeat(4) })
    crew.push({ id: created.id, name: created.name, role: created.role, rights: created.rights })
  }
  const cashiers = crew.filter(isCashier)
  const manager = crew.find((user) => ADMIN_RIGHTS.every((right) => hasRight(user, right))) ?? actingUser

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
  // The till left open on the last day, which the feature scenarios are written into.
  let openShiftId = 0
  let openCashier: SessionUser | null = null

  db.setDurability(false)
  try {
    for (let dayOffset = days - 1; dayOffset >= 0; dayOffset -= 1) {
      const day = new Date()
      day.setDate(day.getDate() - dayOffset)
      day.setHours(0, 0, 0, 0)
      const isLastDay = dayOffset === 0
      const sunday = day.getDay() === 0

      const cashier = isLastDay ? pick(cashiers) : pick(crew)
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

        // Priced line by line exactly as recordSale prices it — summing the raw
        // products instead can come out a shilling under, which reads as debt.
        const total = items.reduce((sum, item) => sum + lineSubtotal(item.quantityKg, item.unitPricePerKg), 0)
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
        openShiftId = shift.id
        openCashier = cashier
      } else {
        const closed = new Date(day)
        closed.setHours(19, intBetween(0, 45), 0, 0)
        // One day's till changes hands at lunchtime, so the hand-over and its count
        // appear in the shift history. The count matches the till, so it shows no variance.
        let closer = cashier
        if (dayOffset === HANDOVER_DAY_OFFSET) {
          const incoming = cashiers.find((user) => user.id !== cashier.id)
          if (incoming) {
            const expected = db.expectedCountsOf(shift.id)
            db.handoverShift(
              {
                shiftId: shift.id,
                toUserId: incoming.id,
                closingCashActual: expected.expectedCash,
                closingMpesaActual: expected.expectedMpesa,
                expensesReviewed: true,
                notes: 'Lunchtime hand-over (practice sample)',
              },
              cashier
            )
            closer = incoming
          }
        }
        const summary = db.closeShift(
          {
            shiftId: shift.id,
            closingCashActual: 0,
            closingMpesaActual: 0,
            expensesReviewed: true,
            notes: undefined,
          },
          closer
        )
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
    if (openCashier) {
      seedFeatureScenarios(db, {
        shiftId: openShiftId,
        cashier: openCashier,
        manager,
        products: db.listProducts().filter((product) => product.isActive),
      })
    }
  } finally {
    db.setDurability(true)
  }

  return { days, sales: salesMade, expenses: expensesMade, shifts: shiftsMade }
}

// Which past day the till changes hands mid-shift. Counted from the newest day back.
const HANDOVER_DAY_OFFSET = 4

interface FeatureScenarioOptions {
  shiftId: number
  cashier: SessionUser
  manager: SessionUser
  products: ProductRecord[]
}

// One example of each stock, take-home, monthly bill and audit case added recently, so
// every screen has something to show. The stock, take-home and bills go through the same
// calls the till uses. The audit lines are sample entries, not records of real events.
function seedFeatureScenarios(
  db: PosDatabase,
  { shiftId, cashier, manager, products }: FeatureScenarioOptions
): void {
  const product = (index: number) => products[index % products.length]
  const kgForBags = (item: ProductRecord, bags: number) => item.weightPerBag * bags
  const costOf = (item: ProductRecord, kg: number) => Math.round((item.buyingPricePerBag / item.weightPerBag) * kg)

  // Deliveries. The cashier's two wait for the owner. The owner's is approved as it
  // goes in. The cashier's last one is rejected, which takes it back out of stock.
  db.receiveStock(
    { shiftId, productId: product(0).id, addedKg: kgForBags(product(0), 4), referenceNote: 'Mwea supplier, DN #4521' },
    cashier
  )
  db.receiveStock({ shiftId, productId: product(1).id, addedKg: kgForBags(product(1), 2) }, cashier)
  db.receiveStock(
    { shiftId, productId: product(2).id, addedKg: kgForBags(product(2), 3), referenceNote: 'Added by the owner' },
    manager
  )
  db.receiveStock({ shiftId, productId: product(3).id, addedKg: kgForBags(product(3), 2), referenceNote: 'No note' }, cashier)
  const [wrongDelivery] = db.listStockReceipts(1)
  db.rejectStockReceipt({ id: wrongDelivery.id, reason: 'Wrong product on the lorry' }, manager)

  // Take-home. One waits to be seen, one the owner took and so is already seen, and one
  // was entered by mistake and voided.
  db.recordDomesticConsumption(
    { shiftId, productId: product(0).id, quantityKg: 5, costValue: costOf(product(0), 5), notes: 'For the house' },
    cashier
  )
  db.recordDomesticConsumption(
    { shiftId, productId: product(1).id, quantityKg: 3, costValue: costOf(product(1), 3), notes: "Owner's house" },
    manager
  )
  const mistake = db.recordDomesticConsumption(
    { shiftId, productId: product(2).id, quantityKg: 2, costValue: costOf(product(2), 2) },
    cashier
  )
  db.voidDomesticConsumption(mistake.id, 'Entered by mistake', manager)

  // Monthly bills, which only someone with the monthly bills right can record.
  db.recordExpense({
    shiftId,
    category: 'Rent',
    amount: 25000,
    description: 'Shop rent, this month',
    paymentMethod: 'MPESA',
    kind: 'MONTHLY',
  })
  db.recordExpense({
    shiftId,
    category: 'Electricity',
    amount: 4200,
    description: 'KPLC token',
    paymentMethod: 'MPESA',
    kind: 'MONTHLY',
  })

  // Audit trail entries for the overrides. Each is written the way the real action writes it.
  db.logAudit(manager, 'FORCED_LOGOUT', `${cashier.name} logged out mid-shift: till frozen, needed at the counter`)
  db.logAudit(manager, 'SHIFT_OVERRIDE_SIGN_IN', `Another person signed in to ${cashier.name}'s shift: owner at the market`)
  db.logAudit(manager, 'EXIT_OVERRIDE', `Closed the app with ${cashier.name}'s shift still open: power cut, UPS flat`)
}
