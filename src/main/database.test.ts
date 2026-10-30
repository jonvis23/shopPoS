import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PosDatabase } from './database'
import { toSqliteTimestamp } from '../shared/period'
import type { ProductRecord, SessionUser, ShiftRecord } from '../shared/ipc'
import { ADMIN_RIGHTS } from '../shared/rights'

// Every test runs against a fresh database file, so no test can see another's sales.
// The product costs KSh 10/kg and sells at KSh 100/kg retail, KSh 80/kg from 5 kg.

let dir: string
let db: PosDatabase
let owner: SessionUser
let maize: ProductRecord
let shift: ShiftRecord

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duka-test-'))
  db = new PosDatabase(path.join(dir, 'test.db'))
  const user = db.createUser({ name: 'Owner', rights: [...ADMIN_RIGHTS], pin: '1234' })
  owner = { id: user.id, name: user.name, role: user.role, rights: user.rights }
  maize = db.createProduct({
    name: 'Maize',
    categoryId: null,
    weightPerBag: 90,
    totalWeightKg: 100,
    buyingPricePerBag: 900,
    retailPricePerKg: 100,
    wholesalePricePerKg: 80,
    minStockAlertKg: 0,
    isActive: true,
    saleUnits: [],
  })
  shift = db.openShift({ openingCash: 1000, openingMpesa: 0 }, owner)
})

afterEach(() => {
  db.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

// A window that covers every sale made in a test.
function today() {
  return {
    fromISO: toSqliteTimestamp(new Date(Date.now() - 86_400_000)),
    toISO: toSqliteTimestamp(new Date(Date.now() + 86_400_000)),
  }
}

function sell(overrides: Partial<Parameters<PosDatabase['recordSale']>[0]> = {}) {
  return db.recordSale(
    {
      shiftId: shift.id,
      customerName: 'Walk-in',
      items: [{ productId: maize.id, quantityKg: 2, unitPricePerKg: 100 }],
      cashPaid: 200,
      mpesaPaid: 0,
      discount: 0,
      ...overrides,
    },
    owner
  )
}

describe('recording a sale', () => {
  it('splits the total into cash, M-Pesa and debt', () => {
    const sale = sell({ customerName: 'Mama Njeri', cashPaid: 150 })
    expect(sale.totalAmount).toBe(200)
    expect(sale.cashPaid).toBe(150)
    expect(sale.debtAmount).toBe(50)
  })

  it('refuses a 5 kg line sent at the retail rate', () => {
    expect(() =>
      sell({ items: [{ productId: maize.id, quantityKg: 5, unitPricePerKg: 100 }], cashPaid: 500 })
    ).toThrow(/has changed since it was added/)
  })

  it('stores the wholesale price when the till sends it', () => {
    const sale = sell({ items: [{ productId: maize.id, quantityKg: 5, unitPricePerKg: 80 }], cashPaid: 400 })
    expect(sale.totalAmount).toBe(400)
    expect(sale.items[0].unitPricePerKg).toBe(80)
  })

  it('refuses a price that does not match the product list, and sells no stock', () => {
    expect(() => sell({ items: [{ productId: maize.id, quantityKg: 2, unitPricePerKg: 50 }] })).toThrow(
      /has changed since it was added/
    )
    expect(db.getProductOrThrow(maize.id).totalWeightKg).toBe(100)
  })

  it('refuses a zero or negative weight', () => {
    expect(() => sell({ items: [{ productId: maize.id, quantityKg: 0, unitPricePerKg: 100 }] })).toThrow(
      /above zero/
    )
    expect(() => sell({ items: [{ productId: maize.id, quantityKg: -2, unitPricePerKg: 100 }] })).toThrow(
      /above zero/
    )
  })

  it('refuses a negative discount, which would raise the total', () => {
    expect(() => sell({ discount: -100 })).toThrow(/cannot be negative/)
  })

  it('refuses a negative payment, which would inflate debt', () => {
    expect(() => sell({ cashPaid: -50, customerName: 'Mama Njeri' })).toThrow(/cannot be negative/)
  })

  it('refuses a discount larger than the sale', () => {
    expect(() => sell({ discount: 500 })).toThrow(/more than the sale total/)
  })
})

describe('profit and reports', () => {
  it('takes the discount out of profit', () => {
    // 10 kg is wholesale: 10 x 80 = 800, less a 100 discount = 700 taken.
    // Cost is 10/kg = 100, so profit is 600. Before the fix it was reported as 700.
    sell({
      items: [{ productId: maize.id, quantityKg: 10, unitPricePerKg: 80 }],
      discount: 100,
      cashPaid: 700,
    })
    const summary = db.getAnalyticsSummary(today())
    expect(summary.totalSales).toBe(700)
    expect(summary.totalDiscountGiven).toBe(100)
    expect(summary.topProducts[0].revenue).toBe(700)
    expect(summary.estimatedGrossProfit).toBe(600)
  })

  it('leaves profit unchanged when there is no discount', () => {
    sell({ items: [{ productId: maize.id, quantityKg: 10, unitPricePerKg: 80 }], cashPaid: 800 })
    expect(db.getAnalyticsSummary(today()).estimatedGrossProfit).toBe(700)
  })

  it('leaves voided sales out of every figure', () => {
    const sale = sell({ items: [{ productId: maize.id, quantityKg: 10, unitPricePerKg: 80 }], cashPaid: 800 })
    db.voidSale(sale.id, 'Entered by mistake', owner)
    const summary = db.getAnalyticsSummary(today())
    expect(summary.totalSales).toBe(0)
    expect(summary.estimatedGrossProfit).toBe(0)
  })
})

describe('till count', () => {
  it('expects opening cash, plus cash sales, less cash expenses', () => {
    sell({ items: [{ productId: maize.id, quantityKg: 5, unitPricePerKg: 80 }], cashPaid: 400 })
    db.recordExpense({ shiftId: shift.id, category: 'Transport', amount: 100, paymentMethod: 'CASH' })
    // 1000 + 400 - 100 = 1300
    expect(db.checkShiftCount({ shiftId: shift.id, closingCashActual: 1300, closingMpesaActual: 0 }).cashMatches).toBe(
      true
    )
    expect(db.checkShiftCount({ shiftId: shift.id, closingCashActual: 1250, closingMpesaActual: 0 }).cashMatches).toBe(
      false
    )
  })

  it('expects M-Pesa sales, and M-Pesa expenses come off the M-Pesa side only', () => {
    sell({ items: [{ productId: maize.id, quantityKg: 3, unitPricePerKg: 100 }], cashPaid: 0, mpesaPaid: 300, mpesaRef: 'QWE123' })
    db.recordExpense({ shiftId: shift.id, category: 'Fuel', amount: 50, paymentMethod: 'MPESA' })
    const check = db.checkShiftCount({ shiftId: shift.id, closingCashActual: 1000, closingMpesaActual: 250 })
    expect(check.mpesaMatches).toBe(true)
    expect(check.cashMatches).toBe(true)
  })

  it('records a shortfall as a negative variance', () => {
    sell({ items: [{ productId: maize.id, quantityKg: 5, unitPricePerKg: 80 }], cashPaid: 400 })
    // Expected 1,400; counted 1,350.
    const { shift: closed } = db.closeShift(
      { shiftId: shift.id, closingCashActual: 1350, closingMpesaActual: 0, expensesReviewed: true },
      owner
    )
    expect(closed.varianceCash).toBe(-50)
  })

  it('counts a repayment taken in cash as cash in the till', () => {
    db.recordCustomerDebt({ shiftId: shift.id, customerName: 'Mama Njeri', amount: 200 })
    db.recordDebtRepayment({ shiftId: shift.id, customerName: 'Mama Njeri', amountPaid: 60, paymentMethod: 'CASH' })
    expect(db.checkShiftCount({ shiftId: shift.id, closingCashActual: 1060, closingMpesaActual: 0 }).cashMatches).toBe(
      true
    )
  })
})

describe('shift accountability', () => {
  let cashier: SessionUser

  beforeEach(() => {
    const user = db.createUser({ name: 'Wanjiru', rights: [], pin: '5678' })
    cashier = { id: user.id, name: user.name, role: user.role, rights: user.rights }
  })

  it('refuses to close a shift without the expenses being reviewed', () => {
    expect(() =>
      db.closeShift({ shiftId: shift.id, closingCashActual: 1000, closingMpesaActual: 0, expensesReviewed: false }, owner)
    ).toThrow(/Check the expenses/)
  })

  it('lets only the person who opened the shift close it', () => {
    expect(() =>
      db.closeShift({ shiftId: shift.id, closingCashActual: 1000, closingMpesaActual: 0, expensesReviewed: true }, cashier)
    ).toThrow(/Only Owner can end or hand over/)
  })

  it('refuses a second person signing in while someone is already signed in', () => {
    expect(() => db.signIn({ userId: cashier.id, pin: '5678' }, owner)).toThrow(/is signed in/)
  })

  it('refuses sign-in to an open shift by anyone but its owner, unless an Admin overrides with a reason', () => {
    expect(() => db.signIn({ userId: cashier.id, pin: '5678' }, null)).toThrow(/Only they can sign in/)
    expect(() =>
      db.signIn({ userId: cashier.id, pin: '5678', override: { adminUserId: owner.id, adminPin: '1234', reason: '  ' } }, null)
    ).toThrow(/Write a reason/)
    const signedIn = db.signIn(
      { userId: cashier.id, pin: '5678', override: { adminUserId: owner.id, adminPin: '1234', reason: 'Owner at the market' } },
      null
    )
    expect(signedIn.id).toBe(cashier.id)
  })

  it('refuses an override PIN that belongs to a cashier', () => {
    expect(() =>
      db.signIn(
        { userId: cashier.id, pin: '5678', override: { adminUserId: cashier.id, adminPin: '5678', reason: 'Trying' } },
        null
      )
    ).toThrow(/Only an Admin who can manage staff/)
  })

  it('refuses logout while a shift is open', () => {
    expect(() => db.signOut(owner)).toThrow(/End the shift or hand it over/)
  })

  it('hands the open shift to the incoming person and keeps the count on record', () => {
    sell({ items: [{ productId: maize.id, quantityKg: 5, unitPricePerKg: 80 }], cashPaid: 400 })
    // Expected cash 1,400.
    const handed = db.handoverShift(
      {
        shiftId: shift.id,
        toUserId: cashier.id,
        closingCashActual: 1400,
        closingMpesaActual: 0,
        expensesReviewed: true,
        notes: 'Quiet morning',
      },
      owner
    )
    expect(handed.status).toBe('ACTIVE')
    expect(handed.userId).toBe(cashier.id)

    const trail = db.listShiftHandovers(shift.id)
    expect(trail).toHaveLength(1)
    expect(trail[0]).toMatchObject({ fromUserName: 'Owner', toUserName: 'Wanjiru', varianceCash: 0, notes: 'Quiet morning' })

    // The outgoing person no longer owns the shift, so they cannot close it.
    expect(() =>
      db.closeShift({ shiftId: shift.id, closingCashActual: 1400, closingMpesaActual: 0, expensesReviewed: true }, owner)
    ).toThrow(/Only Wanjiru/)
  })

  it('requires an Admin PIN and a reason to force a logout', () => {
    expect(() =>
      db.forceLogout({ adminUserId: cashier.id, adminPin: '5678', reason: 'Till frozen' }, owner)
    ).toThrow(/Only an Admin who can manage staff/)
    expect(() =>
      db.forceLogout({ adminUserId: owner.id, adminPin: '1234', reason: '' }, owner)
    ).toThrow(/Write a reason/)
    db.forceLogout({ adminUserId: owner.id, adminPin: '1234', reason: 'Till frozen' }, owner)
    expect(db.listAuditLog(1)[0]).toMatchObject({ action: 'FORCED_LOGOUT', userName: 'Owner' })
  })

  it('only lets an Admin with staff rights close the app over an open shift, with a reason', () => {
    expect(() =>
      db.authoriseExitOverride({ adminUserId: cashier.id, adminPin: '5678', reason: 'Leaving' }, shift)
    ).toThrow(/Only an Admin who can manage staff/)
    expect(() =>
      db.authoriseExitOverride({ adminUserId: owner.id, adminPin: '1234', reason: ' ' }, shift)
    ).toThrow(/Write a reason/)
    db.authoriseExitOverride({ adminUserId: owner.id, adminPin: '1234', reason: 'Power cut, UPS flat' }, shift)
    expect(db.listAuditLog(1)[0]).toMatchObject({ action: 'EXIT_OVERRIDE', userName: 'Owner' })
  })
})

describe('expenses for a period', () => {
  it('lists the expenses logged in the period, with their kind and the shift they belong to', () => {
    db.recordExpense({ shiftId: shift.id, category: 'Transport', amount: 300, paymentMethod: 'CASH' })
    db.recordExpense({ shiftId: shift.id, category: 'Rent', amount: 25000, paymentMethod: 'MPESA', kind: 'MONTHLY' })

    const inPeriod = db.listExpensesBetween(today())
    expect(inPeriod).toHaveLength(2)
    expect(inPeriod.find((expense) => expense.category === 'Rent')).toMatchObject({
      kind: 'MONTHLY',
      paymentMethod: 'MPESA',
      recordedBy: 'Owner',
    })

    const past = { fromISO: '2000-01-01 00:00:00', toISO: '2000-01-02 00:00:00' }
    expect(db.listExpensesBetween(past)).toHaveLength(0)
  })
})

describe('stock deliveries and take-home review', () => {
  let cashier: SessionUser

  beforeEach(() => {
    const user = db.createUser({ name: 'Wanjiru', rights: [], pin: '5678' })
    cashier = { id: user.id, name: user.name, role: user.role, rights: user.rights }
  })

  it('counts a cashier delivery in straight away, at the product price, and leaves it pending', () => {
    const after = db.receiveStock({ shiftId: shift.id, productId: maize.id, addedKg: 90 }, cashier)
    expect(after.totalWeightKg).toBe(190)
    expect(after.buyingPricePerBag).toBe(900)
    expect(db.listStockReceipts(1)[0]).toMatchObject({
      approvalStatus: 'PENDING',
      addedKg: 90,
      buyingPricePerBag: 900,
      userName: 'Wanjiru',
    })
  })

  it('does not count an owner delivery as pending, because the owner has seen it', () => {
    db.receiveStock({ shiftId: shift.id, productId: maize.id, addedKg: 90 }, owner)
    expect(db.listStockReceipts(1)[0]).toMatchObject({ approvalStatus: 'APPROVED', reviewedBy: 'Owner' })
    expect(db.getStockAttention(owner).pendingReceipts).toHaveLength(0)
  })

  it('lets only an owner approve a delivery, and only once', () => {
    db.receiveStock({ shiftId: shift.id, productId: maize.id, addedKg: 90 }, cashier)
    const [pending] = db.getStockAttention(owner).pendingReceipts
    expect(() => db.approveStockReceipt(pending.id, cashier)).toThrow(/Approve stock right/)
    expect(db.approveStockReceipt(pending.id, owner)).toMatchObject({ approvalStatus: 'APPROVED', reviewedBy: 'Owner' })
    expect(db.getStockAttention(owner).pendingReceipts).toHaveLength(0)
    expect(() => db.approveStockReceipt(pending.id, owner)).toThrow(/already been reviewed/)
  })

  it('takes a rejected delivery back out of stock and keeps the reason', () => {
    db.receiveStock({ shiftId: shift.id, productId: maize.id, addedKg: 90 }, cashier)
    const [pending] = db.getStockAttention(owner).pendingReceipts
    expect(() => db.rejectStockReceipt({ id: pending.id, reason: '  ' }, owner)).toThrow(/Write why/)

    const rejected = db.rejectStockReceipt({ id: pending.id, reason: 'Wrong product on the lorry' }, owner)
    expect(rejected).toMatchObject({ approvalStatus: 'REJECTED', reviewNote: 'Wrong product on the lorry' })
    expect(db.listProducts().find((p) => p.id === maize.id)?.totalWeightKg).toBe(100)
  })

  it('refuses to reject a delivery once sales have already used part of it', () => {
    db.receiveStock({ shiftId: shift.id, productId: maize.id, addedKg: 90 }, cashier)
    db.recordSale({
      shiftId: shift.id,
      customerName: 'Walk-in',
      items: [{ productId: maize.id, quantityKg: 150, unitPricePerKg: 80 }],
      discount: 0,
      cashPaid: 12000,
      mpesaPaid: 0,
    }, owner)
    // 190 kg was on the shelf, 150 kg has gone, so 40 kg is left and the delivery was 90 kg.
    const [pending] = db.getStockAttention(owner).pendingReceipts
    expect(() => db.rejectStockReceipt({ id: pending.id, reason: 'Short count' }, owner)).toThrow(/already used part/)
  })

  it('shows a cashier take-home entry to the owner until it is seen', () => {
    const entry = db.recordDomesticConsumption(
      { shiftId: shift.id, productId: maize.id, quantityKg: 5, costValue: 50, notes: 'For the house' },
      cashier
    )
    expect(entry.reviewedAt).toBeNull()
    expect(db.getStockAttention(owner).unreviewedTakeHome).toHaveLength(1)

    expect(() => db.markTakeHomeReviewed(entry.id, cashier)).toThrow(/Approve stock right/)
    db.markTakeHomeReviewed(entry.id, owner)
    expect(db.getStockAttention(owner).unreviewedTakeHome).toHaveLength(0)
  })

  it("treats the owner's own take-home as already seen", () => {
    const entry = db.recordDomesticConsumption({ shiftId: shift.id, productId: maize.id, quantityKg: 5, costValue: 50 }, owner)
    expect(entry.reviewedBy).toBe('Owner')
    expect(db.getStockAttention(owner).unreviewedTakeHome).toHaveLength(0)
  })

  it('keeps stock attention from cashiers', () => {
    expect(() => db.getStockAttention(cashier)).toThrow(/Approve stock right/)
  })
})

describe('rights and expense kinds', () => {
  it('makes an account an admin only when it has at least one right', () => {
    const plain = db.createUser({ name: 'Achieng', rights: [], pin: '1111' })
    const bills = db.createUser({ name: 'Otieno', rights: ['manage_bills'], pin: '2222' })
    expect(plain.role).toBe('CASHIER')
    expect(bills.role).toBe('ADMIN')
    expect(bills.rights).toEqual(['manage_bills'])
  })

  it('refuses to take the last Manage staff right away from every account', () => {
    expect(() => db.updateUser(owner.id, { name: 'Owner', rights: ['view_reports'] })).toThrow(
      /must keep the Manage staff right/
    )
  })

  it('allows the change once another active account can manage staff', () => {
    const second = db.createUser({ name: 'Njoki', rights: ['manage_staff'], pin: '3333' })
    const updated = db.updateUser(owner.id, { name: 'Owner', rights: ['view_reports'] })
    expect(updated.rights).toEqual(['view_reports'])
    expect(db.updateUser(second.id, { name: 'Njoki', rights: ['manage_staff'] }).rights).toEqual(['manage_staff'])
  })

  it('stores each expense with its kind, daily unless marked monthly', () => {
    const daily = db.recordExpense({ shiftId: shift.id, category: 'Transport', amount: 100, paymentMethod: 'CASH' })
    const monthly = db.recordExpense({
      shiftId: shift.id,
      category: 'Rent',
      amount: 5000,
      paymentMethod: 'MPESA',
      kind: 'MONTHLY',
    })
    expect(daily.kind).toBe('DAILY')
    expect(monthly.kind).toBe('MONTHLY')
    expect(db.listExpensesByShift(shift.id).map((e) => e.kind).sort()).toEqual(['DAILY', 'MONTHLY'])
  })
})

describe('credit and repayments', () => {
  it('treats different spellings of a name as one customer', () => {
    sell({ customerName: 'Mama Njeri', items: [{ productId: maize.id, quantityKg: 1, unitPricePerKg: 100 }], cashPaid: 0 })
    sell({ customerName: 'mama  njeri', items: [{ productId: maize.id, quantityKg: 1, unitPricePerKg: 100 }], cashPaid: 50 })
    const balances = db.listCustomerBalances()
    expect(balances).toHaveLength(1)
    expect(balances[0].outstanding).toBe(150)
  })

  it('reduces the balance by a repayment, and refuses one larger than the balance', () => {
    sell({ customerName: 'Mama Njeri', items: [{ productId: maize.id, quantityKg: 1.5, unitPricePerKg: 100 }], cashPaid: 0 })
    db.recordDebtRepayment({ shiftId: shift.id, customerName: 'Mama Njeri', amountPaid: 60, paymentMethod: 'CASH' })
    expect(db.listCustomerBalances()[0].outstanding).toBe(90)
    expect(() =>
      db.recordDebtRepayment({ shiftId: shift.id, customerName: 'Mama Njeri', amountPaid: 100, paymentMethod: 'CASH' })
    ).toThrow(/can't be more than that/)
  })

  it('voiding a sale also reverses a repayment taken with it', () => {
    sell({ customerName: 'Mama Njeri', items: [{ productId: maize.id, quantityKg: 1, unitPricePerKg: 100 }], cashPaid: 0 })
    const sale = sell({
      customerName: 'Mama Njeri',
      items: [{ productId: maize.id, quantityKg: 1, unitPricePerKg: 100 }],
      cashPaid: 100,
      debtRepayment: { amount: 60, paymentMethod: 'CASH' },
    })
    expect(db.listCustomerBalances()[0].outstanding).toBe(40)

    db.voidSale(sale.id, 'Customer changed mind', owner)

    // The debt is back to 100, and the 100 cash and 60 repayment are out of the till count.
    expect(db.listCustomerBalances()[0].outstanding).toBe(100)
    expect(db.checkShiftCount({ shiftId: shift.id, closingCashActual: 1000, closingMpesaActual: 0 }).cashMatches).toBe(
      true
    )
  })

  it('refuses a credit sale to Walk-in', () => {
    expect(() => sell({ cashPaid: 0 })).toThrow(/named customer/)
  })
})

describe('editing a sale', () => {
  it('puts the original stock back before pricing the replacement', () => {
    const sale = sell({ items: [{ productId: maize.id, quantityKg: 2, unitPricePerKg: 100 }], cashPaid: 200 })

    // 98 kg is left after the sale. Only the 2 kg it returns make 100 kg possible.
    const replacement = db.editSale(
      sale.id,
      {
        shiftId: shift.id,
        customerName: 'Walk-in',
        items: [{ productId: maize.id, quantityKg: 100, unitPricePerKg: 80 }],
        cashPaid: 8000,
        mpesaPaid: 0,
        discount: 0,
      },
      owner
    )

    expect(replacement.totalAmount).toBe(8000)
    expect(replacement.status).toBe('COMPLETED')
    expect(db.listRecentSales(10).map((s) => s.status)).toEqual(['COMPLETED', 'VOID'])
    expect(db.getAnalyticsSummary(today()).totalSales).toBe(8000)
  })

  it('takes the repayment taken with the original back off the debt', () => {
    sell({ customerName: 'Mama Njeri', items: [{ productId: maize.id, quantityKg: 1, unitPricePerKg: 100 }], cashPaid: 0 })
    const sale = sell({
      customerName: 'Mama Njeri',
      items: [{ productId: maize.id, quantityKg: 1, unitPricePerKg: 100 }],
      cashPaid: 100,
      debtRepayment: { amount: 60, paymentMethod: 'CASH' },
    })
    expect(db.listCustomerBalances()[0].outstanding).toBe(40)

    db.editSale(
      sale.id,
      {
        shiftId: shift.id,
        customerName: 'Mama Njeri',
        items: [{ productId: maize.id, quantityKg: 1, unitPricePerKg: 100 }],
        cashPaid: 100,
        mpesaPaid: 0,
        discount: 0,
      },
      owner
    )

    // The 60 went back with the original sale, and the replacement carries no repayment of its own.
    expect(db.listCustomerBalances()[0].outstanding).toBe(100)
  })

  it('lets a cashier edit a sale, but not add a discount through the edit', () => {
    const sale = sell()
    const cashier = db.createUser({ name: 'Cashier', rights: [], pin: '5678' })
    const cashierUser = { id: cashier.id, name: cashier.name, role: cashier.role, rights: cashier.rights }
    const edit = (discount: number) =>
      db.editSale(
        sale.id,
        {
          shiftId: shift.id,
          customerName: 'Walk-in',
          items: [{ productId: maize.id, quantityKg: 2, unitPricePerKg: 100 }],
          cashPaid: 200 - discount,
          mpesaPaid: 0,
          discount,
        },
        cashierUser
      )

    expect(() => edit(50)).toThrow(/not permitted to apply a discount/)
    expect(edit(0).status).toBe('COMPLETED')
    expect(db.listRecentSales(10).map((s) => s.status)).toEqual(['COMPLETED', 'VOID'])
  })
})

describe('debt status per sale', () => {
  it('applies repayments oldest debt first and reports what is left on each sale', () => {
    const older = sell({ customerName: 'Mama Njeri', items: [{ productId: maize.id, quantityKg: 1, unitPricePerKg: 100 }], cashPaid: 0 })
    const newer = sell({ customerName: 'Mama Njeri', items: [{ productId: maize.id, quantityKg: 2, unitPricePerKg: 100 }], cashPaid: 0 })
    db.recordDebtRepayment({ shiftId: shift.id, customerName: 'Mama Njeri', amountPaid: 150, paymentMethod: 'CASH' })

    const byId = new Map(db.listRecentSales(10).map((s) => [s.id, s]))
    // 100 clears the older sale; 50 of the 200 on the newer one is paid.
    expect(byId.get(older.id)?.debtOutstanding).toBe(0)
    expect(byId.get(newer.id)?.debtOutstanding).toBe(150)
    expect(db.listCustomerBalances()[0].outstanding).toBe(150)
  })

  it('shows a sale as fully paid once repayments cover it', () => {
    const credit = sell({ customerName: 'Mama Njeri', items: [{ productId: maize.id, quantityKg: 1, unitPricePerKg: 100 }], cashPaid: 0 })
    db.recordDebtRepayment({ shiftId: shift.id, customerName: 'Mama Njeri', amountPaid: 100, paymentMethod: 'MPESA' })
    expect(db.listRecentSales(10).find((s) => s.id === credit.id)?.debtOutstanding).toBe(0)
  })
})

describe('stock processing', () => {
  // The cost accessor is private; the average it returns is what a sale later reads back.
  const costOf = (productId: number) =>
    (db as unknown as { costPerKgOf(id: number): number }).costPerKgOf(productId)

  function product(
    name: string,
    flags: { isMillable?: boolean; isMillOutput?: boolean; buyingPricePerBag?: number; stockKg?: number } = {}
  ) {
    return db.createProduct({
      name,
      categoryId: null,
      weightPerBag: 90,
      totalWeightKg: flags.stockKg ?? 0,
      buyingPricePerBag: flags.buyingPricePerBag ?? 0,
      retailPricePerKg: 105,
      wholesalePricePerKg: 0,
      minStockAlertKg: 0,
      isActive: true,
      saleUnits: [],
      isMillable: flags.isMillable ?? false,
      isMillOutput: flags.isMillOutput ?? false,
    })
  }

  // Cleaned maize goes into "Maize Display", created in the catalogue like any product.
  function displayProduct() {
    return product(`${maize.name} Display`)
  }

  it('moves kilos through cleaning and carries the batch cost into the display product', () => {
    const display = displayProduct()
    db.recordStockConversion(
      { shiftId: shift.id, sourceProductId: maize.id, sourceKg: 30, outputProductId: display.id, outputKg: 27 },
      owner
    )

    expect(db.getProductOrThrow(maize.id).totalWeightKg).toBe(70)
    expect(db.getProductOrThrow(display.id).totalWeightKg).toBe(27)
    // 30 kg at KSh 10 cost 300, spread over the 27 kg that came out.
    expect(costOf(display.id)).toBeCloseTo(300 / 27, 6)
    expect(costOf(maize.id)).toBeCloseTo(10, 6)
  })

  it('refuses to take out more kilos than the shop holds', () => {
    const display = displayProduct()
    expect(() =>
      db.recordStockConversion(
        { shiftId: shift.id, sourceProductId: maize.id, sourceKg: 101, outputProductId: display.id, outputKg: 90 },
        owner
      )
    ).toThrow(/Only 100\.00 kg of Maize in stock/)
  })

  it('refuses a cleaned output heavier than what went in', () => {
    const display = displayProduct()
    expect(() =>
      db.recordStockConversion(
        { shiftId: shift.id, sourceProductId: maize.id, sourceKg: 30, outputProductId: display.id, outputKg: 31 },
        owner
      )
    ).toThrow(/More kilos came out than went in/)
  })

  it('keeps a milling batch open until poshoed output comes back', () => {
    const wimbi = product('Wimbi', { isMillable: true, buyingPricePerBag: 900, stockKg: 100 })
    const uji = product('Uji', { isMillOutput: true })
    const batch = db.recordStockConversion({ shiftId: shift.id, sourceProductId: wimbi.id, sourceKg: 10 }, owner)

    expect(batch.status).toBe('OPEN')
    expect(db.getProductOrThrow(wimbi.id).totalWeightKg).toBe(90)
    expect(db.getStockAttention(owner).openConversions.map((c) => c.id)).toEqual([batch.id])

    const done = db.completeMilling({ id: batch.id, outputProductId: uji.id, outputKg: 9 }, owner)
    expect(done.status).toBe('DONE')
    expect(db.getProductOrThrow(uji.id).totalWeightKg).toBe(9)
    // 10 kg of wimbi at KSh 10 cost 100, spread over the 9 kg of uji.
    expect(costOf(uji.id)).toBeCloseTo(100 / 9, 6)
    expect(db.getStockAttention(owner).openConversions).toHaveLength(0)
  })

  it('only sends products ticked as posho, and only returns into products ticked as milled into', () => {
    const maizeNotMillable = product('Maize Grain', { stockKg: 100 })
    const notAMillOutput = product('Sugar', {})
    expect(() =>
      db.recordStockConversion({ shiftId: shift.id, sourceProductId: maizeNotMillable.id, sourceKg: 5 }, owner)
    ).toThrow(/not sent to posho/)

    const wimbi = product('Wimbi', { isMillable: true, stockKg: 100 })
    const batch = db.recordStockConversion({ shiftId: shift.id, sourceProductId: wimbi.id, sourceKg: 5 }, owner)
    expect(() => db.completeMilling({ id: batch.id, outputProductId: notAMillOutput.id, outputKg: 4 }, owner)).toThrow(
      /not a processed product/
    )
  })

  it('only cleans into the product named after the source, and never cleans a display product again', () => {
    const wrongName = product('Maize Cleaned', {})
    expect(() =>
      db.recordStockConversion(
        { shiftId: shift.id, sourceProductId: maize.id, sourceKg: 30, outputProductId: wrongName.id, outputKg: 27 },
        owner
      )
    ).toThrow(/goes into "Maize Display"/)

    const display = product(`${maize.name} Display`, { stockKg: 50 })
    const again = product('Maize Display Display')
    expect(() =>
      db.recordStockConversion(
        { shiftId: shift.id, sourceProductId: display.id, sourceKg: 5, outputProductId: again.id, outputKg: 4 },
        owner
      )
    ).toThrow(/already a display product/)
  })

  it('lets a cashier record processing, and holds it for the owner to check', () => {
    const display = displayProduct()
    const cashier = db.createUser({ name: 'Ruth', rights: [], pin: '5678' })
    const cashierUser = { id: cashier.id, name: cashier.name, role: cashier.role, rights: cashier.rights }

    const record = db.recordStockConversion(
      { shiftId: shift.id, sourceProductId: maize.id, sourceKg: 30, outputProductId: display.id, outputKg: 27 },
      cashierUser
    )
    expect(record.recordedBy).toBe('Ruth')
    expect(db.getStockAttention(owner).unreviewedConversions.map((c) => c.id)).toEqual([record.id])

    expect(() => db.getStockAttention(cashierUser)).toThrow(/Approve stock right/)
    expect(() => db.markConversionReviewed(record.id, cashierUser)).toThrow(/Approve stock right/)

    db.markConversionReviewed(record.id, owner)
    expect(db.getStockAttention(owner).unreviewedConversions).toHaveLength(0)
  })

  it('returns the kilos to the source when a batch is cancelled, with a reason', () => {
    const wimbi = product('Wimbi', { isMillable: true, stockKg: 100 })
    const batch = db.recordStockConversion({ shiftId: shift.id, sourceProductId: wimbi.id, sourceKg: 10 }, owner)
    expect(() => db.cancelMilling({ id: batch.id, reason: '  ' }, owner)).toThrow(/reason is required/)

    const cancelled = db.cancelMilling({ id: batch.id, reason: 'Bag lost at posho' }, owner)
    expect(cancelled.status).toBe('CANCELLED')
    expect(db.getProductOrThrow(wimbi.id).totalWeightKg).toBe(100)
  })
})

describe('cleaning in two steps, and voiding or editing a finished batch', () => {
  const costOf = (productId: number) =>
    (db as unknown as { costPerKgOf(id: number): number }).costPerKgOf(productId)

  function product(name: string, flags: { stockKg?: number; buyingPricePerBag?: number } = {}) {
    return db.createProduct({
      name,
      categoryId: null,
      weightPerBag: 90,
      totalWeightKg: flags.stockKg ?? 0,
      buyingPricePerBag: flags.buyingPricePerBag ?? 0,
      retailPricePerKg: 105,
      wholesalePricePerKg: 0,
      minStockAlertKg: 0,
      isActive: true,
      saleUnits: [],
    })
  }

  it('takes kilos for cleaning, then finishes the batch once they are weighed back', () => {
    const maize2 = product('Maize', { stockKg: 100, buyingPricePerBag: 900 })
    const display = product('Maize Display')
    const batch = db.recordStockConversion({ shiftId: shift.id, kind: 'CLEANING', sourceProductId: maize2.id, sourceKg: 30 }, owner)

    expect(batch.status).toBe('OPEN')
    expect(batch.kind).toBe('CLEANING')
    expect(db.getProductOrThrow(maize2.id).totalWeightKg).toBe(70)
    expect(db.getStockAttention(owner).openConversions.map((c) => c.id)).toEqual([batch.id])

    const done = db.completeCleaning({ id: batch.id, outputKg: 27 }, owner)
    expect(done.status).toBe('DONE')
    expect(db.getProductOrThrow(display.id).totalWeightKg).toBe(27)
    expect(costOf(display.id)).toBeCloseTo(300 / 27, 6)
  })

  it('lets a batch taken in one shift and finished in the next be voided in the shift it was finished', () => {
    const sorghum = product('Sorghum', { stockKg: 100, buyingPricePerBag: 900 })
    const display = product('Sorghum Display')
    const batch = db.recordStockConversion({ shiftId: shift.id, kind: 'CLEANING', sourceProductId: sorghum.id, sourceKg: 20 }, owner)
    db.closeShift({ shiftId: shift.id, closingCashActual: 1000, closingMpesaActual: 0, expensesReviewed: true }, owner)
    db.openShift({ openingCash: 1000, openingMpesa: 0 }, owner)

    db.completeCleaning({ id: batch.id, outputKg: 18 }, owner)
    db.voidConversion({ id: batch.id, reason: 'Wrong weight' }, owner)
    expect(db.getProductOrThrow(sorghum.id).totalWeightKg).toBe(100)
    expect(db.getProductOrThrow(display.id).totalWeightKg).toBe(0)
  })

  it('will not finish a cleaning batch until the display product exists', () => {
    const maize3 = product('Beans', { stockKg: 50, buyingPricePerBag: 900 })
    const batch = db.recordStockConversion({ shiftId: shift.id, kind: 'CLEANING', sourceProductId: maize3.id, sourceKg: 10 }, owner)
    expect(() => db.completeCleaning({ id: batch.id, outputKg: 9 }, owner)).toThrow(/Create "Beans Display"/)
  })

  it('voids a finished batch, putting its kilos back into the source and taking them out of the display', () => {
    const maize4 = product('Rice', { stockKg: 100, buyingPricePerBag: 900 })
    const display = product('Rice Display')
    const batch = db.recordStockConversion(
      { shiftId: shift.id, sourceProductId: maize4.id, sourceKg: 30, outputProductId: display.id, outputKg: 27 },
      owner
    )

    expect(() => db.voidConversion({ id: batch.id, reason: ' ' }, owner)).toThrow(/reason is required/)
    const voided = db.voidConversion({ id: batch.id, reason: 'Weighed wrong' }, owner)
    expect(voided.status).toBe('VOID')
    expect(db.getProductOrThrow(maize4.id).totalWeightKg).toBe(100)
    expect(db.getProductOrThrow(display.id).totalWeightKg).toBe(0)
    expect(db.getStockAttention(owner).unreviewedConversions).toHaveLength(0)
  })

  it('refuses to void a batch once sales have used its output', () => {
    const maize5 = product('Lentils', { stockKg: 100, buyingPricePerBag: 900 })
    const display = product('Lentils Display')
    const batch = db.recordStockConversion(
      { shiftId: shift.id, sourceProductId: maize5.id, sourceKg: 30, outputProductId: display.id, outputKg: 27 },
      owner
    )
    db.recordSale({
      shiftId: shift.id,
      customerName: 'Walk-in',
      items: [{ productId: display.id, quantityKg: 10, unitPricePerKg: 105 }],
      cashPaid: 1050,
      mpesaPaid: 0,
      discount: 0,
    }, owner)

    expect(() => db.voidConversion({ id: batch.id, reason: 'Wrong' }, owner)).toThrow(/Sales have already used/)
  })

  it('edits a finished batch: the original stays on record as void and the replacement carries the corrected weight', () => {
    const maize6 = product('Millet', { stockKg: 100, buyingPricePerBag: 900 })
    const display = product('Millet Display')
    const batch = db.recordStockConversion(
      { shiftId: shift.id, sourceProductId: maize6.id, sourceKg: 30, outputProductId: display.id, outputKg: 27 },
      owner
    )

    const replacement = db.editConversion({ id: batch.id, sourceKg: 30, outputKg: 25, reason: 'Re-weighed' }, owner)
    expect(replacement.status).toBe('DONE')
    expect(replacement.outputKg).toBe(25)
    expect(db.getProductOrThrow(display.id).totalWeightKg).toBe(25)
    expect(db.getProductOrThrow(maize6.id).totalWeightKg).toBe(70)
    const original = db.listStockConversions(10).find((c) => c.id === batch.id)
    expect(original?.status).toBe('VOID')
  })
})

describe('upgrading a stock processing table from before VOID', () => {
  it('keeps every batch and lets a finished one be voided afterwards', () => {
    const raw = (db as unknown as { db: { exec(sql: string): void } }).db
    const maize7 = db.createProduct({
      name: 'Sorghum',
      categoryId: null,
      weightPerBag: 90,
      totalWeightKg: 100,
      buyingPricePerBag: 900,
      retailPricePerKg: 105,
      wholesalePricePerKg: 0,
      minStockAlertKg: 0,
      isActive: true,
      saleUnits: [],
    })
    const display = db.createProduct({
      name: 'Sorghum Display',
      categoryId: null,
      weightPerBag: 90,
      totalWeightKg: 0,
      buyingPricePerBag: 0,
      retailPricePerKg: 120,
      wholesalePricePerKg: 0,
      minStockAlertKg: 0,
      isActive: true,
      saleUnits: [],
    })
    const done = db.recordStockConversion(
      { shiftId: shift.id, sourceProductId: maize7.id, sourceKg: 20, outputProductId: display.id, outputKg: 18 },
      owner
    )
    db.recordStockConversion({ shiftId: shift.id, kind: 'CLEANING', sourceProductId: maize7.id, sourceKg: 5 }, owner)

    // Recreate the table as the earlier build had it: the status CHECK refuses VOID.
    raw.exec('ALTER TABLE stock_conversions RENAME TO stock_conversions_tmp')
    raw.exec(`CREATE TABLE stock_conversions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, shift_id INTEGER NOT NULL REFERENCES shifts(id),
      kind TEXT NOT NULL CHECK(kind IN ('CLEANING', 'MILLING')),
      status TEXT NOT NULL CHECK(status IN ('OPEN', 'DONE', 'CANCELLED')),
      source_product_id INTEGER NOT NULL REFERENCES products(id), source_kg REAL NOT NULL,
      source_cost_per_kg REAL NOT NULL, output_product_id INTEGER REFERENCES products(id), output_kg REAL,
      recorded_by TEXT NOT NULL, completed_by TEXT, reviewed_by TEXT, reviewed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, completed_at DATETIME)`)
    raw.exec(`INSERT INTO stock_conversions SELECT id, shift_id, kind, status, source_product_id, source_kg,
      source_cost_per_kg, output_product_id, output_kg, recorded_by, completed_by, reviewed_by, reviewed_at,
      created_at, completed_at FROM stock_conversions_tmp`)
    raw.exec('DROP TABLE stock_conversions_tmp')

    ;(db as unknown as { rebuildStockConversionsIfOutdated(): void }).rebuildStockConversionsIfOutdated()

    expect(db.listStockConversions(10)).toHaveLength(2)
    expect(db.voidConversion({ id: done.id, reason: 'Entered twice' }, owner).status).toBe('VOID')
  })
})
