import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PosDatabase } from './database'
import { generatePracticeData } from './practiceData'
import type { SessionUser } from '../shared/ipc'
import { ADMIN_RIGHTS } from '../shared/rights'

let dir: string
let db: PosDatabase
let owner: SessionUser

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duka-practice-'))
  db = new PosDatabase(path.join(dir, 'practice.db'))
  const user = db.createUser({ name: 'Owner', rights: [...ADMIN_RIGHTS], pin: '1234' })
  owner = { id: user.id, name: user.name, role: user.role, rights: user.rights }
  for (const name of ['Maize', 'Ndengu', 'Soya', 'Popcorn']) {
    db.createProduct({
      name,
      categoryId: null,
      weightPerBag: 90,
      totalWeightKg: 0,
      buyingPricePerBag: 900,
      retailPricePerKg: 100,
      wholesalePricePerKg: 80,
      minStockAlertKg: 0,
      isActive: true,
      saleUnits: [],
    })
  }
})

afterEach(() => {
  db.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('practice shop feature scenarios', () => {
  it('seeds one example of each recent feature so every screen has something to show', () => {
    generatePracticeData(db, { days: 6, actingUser: owner, staff: [owner] })

    const attention = db.getStockAttention(owner)
    expect(attention.pendingReceipts).toHaveLength(2)
    expect(attention.unreviewedTakeHome).toHaveLength(1)

    const statuses = db.listStockReceipts(50).map((receipt) => receipt.approvalStatus)
    expect(statuses).toEqual(expect.arrayContaining(['PENDING', 'APPROVED', 'REJECTED']))

    expect(db.listDomesticConsumption(50).some((entry) => entry.status === 'VOID')).toBe(true)

    const openShift = db.getActiveShift()
    expect(openShift).not.toBeNull()
    const monthly = db.listExpensesByShift(openShift!.id).filter((expense) => expense.kind === 'MONTHLY')
    expect(monthly.map((expense) => expense.category)).toEqual(expect.arrayContaining(['Rent', 'Electricity']))

    const actions = db.listAuditLog(100).map((entry) => entry.action)
    expect(actions).toEqual(expect.arrayContaining(['FORCED_LOGOUT', 'SHIFT_OVERRIDE_SIGN_IN', 'EXIT_OVERRIDE']))

    const handedOver = db.listRecentShifts(50).some((shift) => db.listShiftHandovers(shift.id).length > 0)
    expect(handedOver).toBe(true)
  })

  it('leaves the open till with cashiers, so the owner is not the one who entered the pending deliveries', () => {
    generatePracticeData(db, { days: 6, actingUser: owner, staff: [owner] })
    const attention = db.getStockAttention(owner)
    for (const receipt of attention.pendingReceipts) {
      expect(receipt.userName).not.toBe('Owner')
    }
  })
})
