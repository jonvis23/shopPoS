import fs from 'node:fs'
import path from 'node:path'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import type {
  AnalyticsDailyRow,
  AnalyticsExpenseCategoryRow,
  AnalyticsHourlyRow,
  AnalyticsProductRow,
  AnalyticsRange,
  AnalyticsStaffRow,
  AnalyticsSummary,
  AnalyticsWeekdayRow,
  AgedDebtor,
  AuditLogRecord,
  BelowCostRow,
  DebtAgeBuckets,
  StockRunwayRow,
  LowStockRow,
  CategoryRecord,
  AdminOverride,
  AdminRight,
  CloseShiftInput,
  CreateUserInput,
  ForceLogoutInput,
  HandoverShiftInput,
  LoginInput,
  CustomerBalance,
  CustomerDebtInput,
  CustomerDebtRecord,
  CustomerHistoryEvent,
  DashboardSnapshot,
  DebtRepaymentInput,
  DebtRepaymentRecord,
  DomesticConsumptionInput,
  DomesticConsumptionRecord,
  ExpenseInput,
  ExpenseRecord,
  ImportPriceListResult,
  OpenShiftInput,
  ProductInput,
  ProductRecord,
  ReceiptDraft,
  SaleInput,
  ProductPriceBreak,
  SaleItemRecord,
  SaleUnit,
  ShiftCountCheck,
  ShiftCountCheckInput,
  SaleRecord,
  ShiftProductSummary,
  SessionUser,
  ShiftCloseSummary,
  ShiftHandoverRecord,
  ShiftRecord,
  RejectStockReceiptInput,
  StockApprovalStatus,
  StockAttention,
  StockConversionRecord,
  StockReceiptInput,
  StockReceiptRecord,
  ConversionInput,
  ConversionKind,
  ConversionStatus,
  CompleteMillingInput,
  CancelMillingInput,
  CompleteCleaningInput,
  VoidConversionInput,
  EditConversionInput,
  UpdateUserInput,
  UserRecord,
  UserRole,
} from '../shared/ipc'
import { shiftRangeBack, toIsoUtc } from '../shared/period'
import type { PeriodRange } from '../shared/period'
import { ADMIN_RIGHTS, hasRight, normalizeRights } from '../shared/rights'
import { customerKey, normalizeCustomerName } from '../shared/customers'
import { priceSaleLines } from '../shared/stock'
import { DEFAULT_CATEGORIES, DEFAULT_PRICE_LIST } from '../shared/defaultPriceList'
import type { DefaultPriceListItem } from '../shared/defaultPriceList'

// A cleaned product is named after the product it came from, with this on the end.
const DISPLAY_SUFFIX = ' Display'

// One row per processing batch. A batch with its output already weighed is DONE at once; one
// still out is OPEN until the output comes back. The status has no CHECK on purpose: VOID was
// added later, and an older table is rebuilt from this same definition (see rebuildStockConversionsIfOutdated).
const STOCK_CONVERSIONS_SQL = `
CREATE TABLE IF NOT EXISTS stock_conversions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shift_id INTEGER NOT NULL REFERENCES shifts(id),
  kind TEXT NOT NULL CHECK(kind IN ('CLEANING', 'MILLING')),
  status TEXT NOT NULL,
  source_product_id INTEGER NOT NULL REFERENCES products(id),
  source_kg REAL NOT NULL,
  source_cost_per_kg REAL NOT NULL,
  output_product_id INTEGER REFERENCES products(id),
  output_kg REAL,
  recorded_by TEXT NOT NULL,
  completed_by TEXT,
  reviewed_by TEXT,
  reviewed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  void_reason TEXT,
  voided_at DATETIME
);
`

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id),
  weight_per_bag REAL DEFAULT 90.0,
  total_weight_kg REAL DEFAULT 0.0,
  buying_price_per_bag REAL NOT NULL,
  retail_price_per_kg REAL NOT NULL,
  wholesale_price_per_kg REAL DEFAULT 0.0,
  min_stock_alert_kg REAL DEFAULT 100.0,
  is_active INTEGER DEFAULT 1,
  sale_units TEXT DEFAULT '[]',
  avg_cost_per_kg REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- A fixed total price for one specific weight of a product — see
-- ProductPriceBreak in shared/ipc.ts for why this exists (small loose
-- weights don't scale linearly off the per-kg price). Deleted and re-inserted
-- as a whole set on every edit (setProductPriceBreaks), never patched row by
-- row, so UNIQUE just guards against the product form itself submitting the
-- same weight twice in one save.
CREATE TABLE IF NOT EXISTS product_price_breaks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity_kg REAL NOT NULL,
  price REAL NOT NULL,
  UNIQUE(product_id, quantity_kg)
);

CREATE TABLE IF NOT EXISTS shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_name TEXT NOT NULL DEFAULT 'Admin',
  start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  end_time DATETIME,
  opening_cash REAL NOT NULL,
  opening_mpesa REAL NOT NULL,
  opening_notes TEXT,
  closing_cash_actual REAL,
  closing_mpesa_actual REAL,
  expected_cash REAL,
  expected_mpesa REAL,
  variance_cash REAL,
  variance_mpesa REAL,
  notes TEXT,
  total_sales REAL,
  total_expenses REAL,
  total_domestic_consumption REAL,
  total_debt REAL,
  total_transactions INTEGER,
  status TEXT CHECK(status IN ('ACTIVE', 'CLOSED')) DEFAULT 'ACTIVE'
);

CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shift_id INTEGER NOT NULL REFERENCES shifts(id),
  customer_name TEXT DEFAULT 'Walk-in',
  customer_phone TEXT,
  total_amount REAL NOT NULL,
  cash_paid REAL DEFAULT 0.0,
  mpesa_paid REAL DEFAULT 0.0,
  mpesa_ref TEXT,
  debt_amount REAL DEFAULT 0.0,
  discount REAL DEFAULT 0.0,
  status TEXT DEFAULT 'COMPLETED',
  void_reason TEXT,
  voided_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sale_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL REFERENCES sales(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity_kg REAL NOT NULL,
  unit_price_per_kg REAL NOT NULL,
  subtotal REAL NOT NULL,
  cost_per_kg REAL
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shift_id INTEGER NOT NULL REFERENCES shifts(id),
  category TEXT NOT NULL,
  amount REAL NOT NULL,
  description TEXT,
  expense_kind TEXT NOT NULL DEFAULT 'DAILY',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS domestic_consumption (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shift_id INTEGER NOT NULL REFERENCES shifts(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity_kg REAL NOT NULL,
  cost_value REAL NOT NULL,
  notes TEXT,
  status TEXT DEFAULT 'COMPLETED',
  void_reason TEXT,
  voided_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS debt_repayments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shift_id INTEGER NOT NULL REFERENCES shifts(id),
  customer_name TEXT NOT NULL,
  amount_paid REAL NOT NULL,
  payment_method TEXT CHECK(payment_method IN ('CASH', 'MPESA')) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  -- Set when the repayment was taken alongside a sale, so voiding that sale can reverse it.
  sale_id INTEGER,
  status TEXT DEFAULT 'COMPLETED'
);

CREATE TABLE IF NOT EXISTS customer_debt_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shift_id INTEGER NOT NULL REFERENCES shifts(id),
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  amount REAL NOT NULL,
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shift_id INTEGER NOT NULL REFERENCES shifts(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  added_kg REAL NOT NULL,
  buying_price_per_bag REAL NOT NULL,
  reference_note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

${STOCK_CONVERSIONS_SQL}

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT CHECK(role IN ('ADMIN', 'CASHIER')) NOT NULL DEFAULT 'CASHIER',
  rights TEXT NOT NULL DEFAULT '[]',
  pin_salt TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  user_name TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- One row per mid-day hand-over. The count is the outgoing person's, taken blind
-- against the till; the shift itself stays open and changes hands.
CREATE TABLE IF NOT EXISTS shift_handovers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shift_id INTEGER NOT NULL REFERENCES shifts(id),
  from_user_id INTEGER REFERENCES users(id),
  from_user_name TEXT NOT NULL,
  to_user_id INTEGER REFERENCES users(id),
  to_user_name TEXT NOT NULL,
  counted_cash REAL NOT NULL,
  counted_mpesa REAL NOT NULL,
  variance_cash REAL NOT NULL,
  variance_mpesa REAL NOT NULL,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON sale_items(product_id);
`

const DEFAULT_SETTINGS: Record<string, string> = {
  shop_name: 'Duka POS',
  shop_tagline: 'Every bag counts',
  receipt_footer: 'Thank you for your business!',
  currency: 'KES',
  theme_mode: 'SYSTEM',
  display_zoom_pct: '100',
  auto_print_receipt: 'false',
  receipt_show_dual_unit: 'false',
  receipt_show_cashier_name: 'true',
  receipt_show_debt_balance: 'true',
  perm_allow_cashier_discount: 'false',
  perm_allow_cashier_void: 'false',
}

interface ProductRow {
  id: number
  name: string
  category_id: number | null
  category_name: string | null
  weight_per_bag: number
  total_weight_kg: number
  buying_price_per_bag: number
  retail_price_per_kg: number
  wholesale_price_per_kg: number
  min_stock_alert_kg: number
  is_active: number
  is_millable: number
  is_mill_output: number
  sale_units: string | null
}

// A type alias rather than an interface on purpose: only aliases get the implicit
// index signature that lets a row cast off node:sqlite's Record<string, …> result.
type ExpenseRow = {
  id: number
  shift_id: number
  category: string
  amount: number
  description: string | null
  // Null on rows written before the payment_method column was added.
  payment_method: string | null
  expense_kind: string | null
  // Only present on the Transactions-page query, which joins the shift.
  user_name?: string | null
  created_at: string
}

interface StockReceiptRow {
  id: number
  shift_id: number
  user_name: string
  product_id: number
  product_name: string
  added_kg: number
  buying_price_per_bag: number
  reference_note: string | null
  approval_status: StockApprovalStatus
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  created_at: string
}

interface TakeHomeRow {
  id: number
  shift_id: number
  user_name: string
  product_id: number
  product_name: string
  quantity_kg: number
  cost_value: number
  notes: string | null
  status: 'COMPLETED' | 'VOID'
  void_reason: string | null
  voided_at: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
}

interface ConversionRow {
  id: number
  shift_id: number
  kind: ConversionKind
  status: ConversionStatus
  source_product_id: number
  source_name: string
  source_kg: number
  source_cost_per_kg: number
  output_product_id: number | null
  output_name: string | null
  output_kg: number | null
  recorded_by: string
  completed_by: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  completed_at: string | null
  void_reason: string | null
  voided_at: string | null
}

interface ShiftRow {
  id: number
  user_id: number | null
  user_name: string
  start_time: string
  end_time: string | null
  opening_cash: number
  opening_mpesa: number
  opening_notes: string | null
  closing_cash_actual: number | null
  closing_mpesa_actual: number | null
  expected_cash: number | null
  expected_mpesa: number | null
  variance_cash: number | null
  variance_mpesa: number | null
  notes: string | null
  total_sales: number | null
  total_expenses: number | null
  total_domestic_consumption: number | null
  total_debt: number | null
  total_transactions: number | null
  status: 'ACTIVE' | 'CLOSED'
}

// The format CURRENT_TIMESTAMP writes ("2026-10-02 06:30:00", UTC), so a cutoff
// compares correctly as a string against created_at.
function toSqliteUtc(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

function parseSaleUnits(raw: string | null): SaleUnit[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? cleanSaleUnits(parsed) : []
  } catch {
    return []
  }
}

function cleanSaleUnits(units: SaleUnit[]): SaleUnit[] {
  return units
    .map((u) => ({ name: String(u?.name ?? '').trim(), kg: Number(u?.kg) || 0 }))
    .filter((u) => u.name && u.kg > 0)
}

function mapProduct(row: ProductRow, priceBreaks: ProductPriceBreak[] = []): ProductRecord {
  return {
    id: row.id,
    name: row.name,
    categoryId: row.category_id,
    categoryName: row.category_name,
    weightPerBag: row.weight_per_bag,
    totalWeightKg: row.total_weight_kg,
    buyingPricePerBag: row.buying_price_per_bag,
    retailPricePerKg: row.retail_price_per_kg,
    wholesalePricePerKg: row.wholesale_price_per_kg,
    minStockAlertKg: row.min_stock_alert_kg,
    isActive: row.is_active === 1,
    isMillable: row.is_millable === 1,
    isMillOutput: row.is_mill_output === 1,
    priceBreaks,
    saleUnits: parseSaleUnits(row.sale_units),
  }
}

function mapShift(row: ShiftRow): ShiftRecord {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    startTime: toIsoUtc(row.start_time),
    endTime: toIsoUtc(row.end_time),
    openingCash: row.opening_cash,
    openingMpesa: row.opening_mpesa,
    openingNotes: row.opening_notes,
    closingCashActual: row.closing_cash_actual,
    closingMpesaActual: row.closing_mpesa_actual,
    expectedCash: row.expected_cash,
    expectedMpesa: row.expected_mpesa,
    varianceCash: row.variance_cash,
    varianceMpesa: row.variance_mpesa,
    notes: row.notes,
    totalSales: row.total_sales,
    totalExpenses: row.total_expenses,
    totalDomesticConsumption: row.total_domestic_consumption,
    totalDebt: row.total_debt,
    totalTransactions: row.total_transactions,
    status: row.status,
  }
}

interface UserRow {
  id: number
  name: string
  role: UserRole
  rights: string
  pin_salt: string
  pin_hash: string
  is_active: number
  created_at: string
}

function parseRights(raw: string): AdminRight[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    return normalizeRights(Array.isArray(parsed) ? parsed.map(String) : [])
  } catch {
    return []
  }
}

function mapUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    rights: parseRights(row.rights),
    isActive: row.is_active === 1,
    createdAt: toIsoUtc(row.created_at),
  }
}

function hashPin(pin: string, salt: string): string {
  return scryptSync(pin, salt, 64).toString('hex')
}

function verifyPin(pin: string, salt: string, storedHash: string): boolean {
  const candidateHash = hashPin(pin, salt)
  const stored = Buffer.from(storedHash, 'hex')
  const candidate = Buffer.from(candidateHash, 'hex')
  if (stored.length !== candidate.length) return false
  return timingSafeEqual(stored, candidate)
}

const SQLITE_HEADER = 'SQLite format 3\0'

// Sanity-checks a candidate .db file before it's ever allowed to overwrite the live
// database — a wrong file (wrong app, truncated copy, plain garbage) must be rejected
// here, not discovered after the shop's real data has already been replaced.
export function validateSqliteDatabaseFile(filePath: string): void {
  if (!fs.existsSync(filePath)) throw new Error('File not found')
  const stat = fs.statSync(filePath)
  if (!stat.isFile() || stat.size < 16) throw new Error('This file is not a valid database')

  const fd = fs.openSync(filePath, 'r')
  let header: Buffer
  try {
    header = Buffer.alloc(16)
    fs.readSync(fd, header, 0, 16, 0)
  } finally {
    fs.closeSync(fd)
  }
  if (header.toString('utf8') !== SQLITE_HEADER) {
    throw new Error('This file is not a SQLite database')
  }

  let probe: DatabaseSync | null = null
  try {
    probe = new DatabaseSync(filePath)
    const tables = probe
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('sales', 'users', 'products')")
      .all() as Array<{ name: string }>
    if (tables.length < 3) {
      throw new Error('This file does not look like a Duka POS database backup')
    }
  } finally {
    probe?.close()
  }
}

export class PosDatabase {
  private db: DatabaseSync

  constructor(dbPath: string) {
    this.db = this.open(dbPath)
  }

  private open(dbPath: string): DatabaseSync {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    const db = new DatabaseSync(dbPath)
    // WAL + synchronous=FULL: every commit is fsynced to disk before the IPC call
    // returns, and WAL mode tolerates a mid-write crash without corrupting the file —
    // "instantly durable" is a property of the database engine, not something the app
    // layer has to simulate with extra copies after each transaction.
    db.exec('PRAGMA journal_mode = WAL;')
    db.exec('PRAGMA synchronous = FULL;')
    db.exec('PRAGMA foreign_keys = ON;')
    db.exec(SCHEMA_SQL)
    this.db = db
    this.migrateSchema()
    this.seedDefaults()
    this.migrateLegacyAdminPin()
    return db
  }

  /**
   * Points this instance at a different database file. Deliberately swaps the
   * connection *inside* the existing object rather than constructing a new
   * PosDatabase: every IPC handler closed over this instance when it was
   * registered, so replacing the object would leave them all talking to the file
   * we just left. Practice mode depends on that not happening.
   */
  switchTo(dbPath: string): void {
    this.checkpointWal()
    this.db.close()
    this.open(dbPath)
  }

  // Merges the WAL file back into the main .db file so a plain fs.copyFileSync of
  // that file (export, auto-backup, pre-import snapshot) captures every committed
  // transaction, not just whatever had been checkpointed the last time SQLite felt
  // like it.
  checkpointWal(): void {
    this.db.exec('PRAGMA wal_checkpoint(FULL);')
  }

  // ---------- Practice mode support ----------
  // These exist only to build the throwaway practice database. They are never
  // reachable from the real shop database: entering practice mode closes it and
  // opens a copy, and every one of these calls lands on that copy.

  /**
   * Empties everything that records trading, leaving the shop's setup — products,
   * prices, categories, staff, settings — untouched. Used on the freshly copied
   * practice file so it starts as "your shop, no history".
   */
  clearTradingHistory(): void {
    this.db.exec('BEGIN')
    try {
      for (const table of [
        'sale_items',
        'sales',
        'expenses',
        'domestic_consumption',
        'debt_repayments',
        'customer_debt_entries',
        'stock_receipts',
        'shift_handovers',
        'shifts',
        'audit_log',
      ]) {
        this.db.exec(`DELETE FROM ${table}`)
      }
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  setProductStock(productId: number, totalWeightKg: number): void {
    this.db.prepare('UPDATE products SET total_weight_kg = ? WHERE id = ?').run(totalWeightKg, productId)
  }

  setProductBuyingPrice(productId: number, buyingPricePerBag: number): void {
    this.db.prepare('UPDATE products SET buying_price_per_bag = ? WHERE id = ?').run(buyingPricePerBag, productId)
  }

  // Rows are written by the normal insert paths so they are correct in every other
  // respect, then dragged back in time here — CURRENT_TIMESTAMP would otherwise
  // stamp six weeks of practice trading as having all happened this second.
  backdate(table: 'sales' | 'expenses' | 'stock_receipts' | 'customer_debt_entries', id: number, utc: string): void {
    this.db.prepare(`UPDATE ${table} SET created_at = ? WHERE id = ?`).run(utc, id)
  }

  backdateShift(shiftId: number, startUtc: string, endUtc: string | null): void {
    this.db.prepare('UPDATE shifts SET start_time = ?, end_time = ? WHERE id = ?').run(startUtc, endUtc, shiftId)
  }

  // closeShift works out what the till *should* hold; this writes what was
  // "counted" against it so practice shifts show realistic variances instead of
  // a column of perfect zeroes.
  setPracticeShiftCounts(shiftId: number, cashActual: number, mpesaActual: number): void {
    this.db
      .prepare(
        `UPDATE shifts
            SET closing_cash_actual = ?, closing_mpesa_actual = ?,
                variance_cash = ? - COALESCE(expected_cash, 0),
                variance_mpesa = ? - COALESCE(expected_mpesa, 0)
          WHERE id = ?`
      )
      .run(cashActual, mpesaActual, cashActual, mpesaActual, shiftId)
  }

  // Debt entries carry no sale_id — a credit sale writes one as a side effect —
  // so the generator backdates the row it just created, immediately after
  // creating it. Safe here because generation is strictly sequential.
  backdateLatestDebtEntry(utc: string): void {
    this.db
      .prepare('UPDATE customer_debt_entries SET created_at = ? WHERE id = (SELECT MAX(id) FROM customer_debt_entries)')
      .run(utc)
  }

  /**
   * Practice data is disposable, so it does not need each of ~1,200 inserts fsynced
   * to disk — that alone is the difference between a button that responds and one
   * that appears to hang. Only ever called on the practice file.
   */
  setDurability(on: boolean): void {
    this.db.exec(`PRAGMA synchronous = ${on ? 'FULL' : 'OFF'};`)
  }

  close(): void {
    this.db.close()
  }

  private hasColumn(table: string, column: string): boolean {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
    return columns.some((col) => col.name === column)
  }

  private ensureColumn(table: string, column: string, definition: string): void {
    if (!this.hasColumn(table, column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
    }
  }

  // A database made before VOID existed has a status CHECK that refuses it, and SQLite cannot
  // drop a CHECK in place. Such a table is copied into the current definition, in one transaction.
  private rebuildStockConversionsIfOutdated(): void {
    const table = this.db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'stock_conversions'")
      .get() as { sql: string } | undefined
    if (!table || !table.sql.includes("CHECK(status IN ('OPEN', 'DONE', 'CANCELLED'))")) return

    this.db.exec('BEGIN')
    try {
      this.db.exec('ALTER TABLE stock_conversions RENAME TO stock_conversions_before_void')
      this.db.exec(STOCK_CONVERSIONS_SQL)
      this.db.exec(
        `INSERT INTO stock_conversions (id, shift_id, kind, status, source_product_id, source_kg, source_cost_per_kg,
           output_product_id, output_kg, recorded_by, completed_by, reviewed_by, reviewed_at, created_at, completed_at)
         SELECT id, shift_id, kind, status, source_product_id, source_kg, source_cost_per_kg,
           output_product_id, output_kg, recorded_by, completed_by, reviewed_by, reviewed_at, created_at, completed_at
         FROM stock_conversions_before_void`
      )
      this.db.exec('DROP TABLE stock_conversions_before_void')
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  private migrateSchema(): void {
    this.rebuildStockConversionsIfOutdated()
    this.ensureColumn('sales', 'customer_phone', 'TEXT')
    this.ensureColumn('customer_debt_entries', 'customer_phone', 'TEXT')
    this.ensureColumn('sales', 'status', "TEXT DEFAULT 'COMPLETED'")
    this.ensureColumn('sales', 'void_reason', 'TEXT')
    this.ensureColumn('sales', 'voided_at', 'DATETIME')
    this.ensureColumn('debt_repayments', 'sale_id', 'INTEGER')
    this.ensureColumn('debt_repayments', 'status', "TEXT DEFAULT 'COMPLETED'")
    this.ensureColumn('shifts', 'opening_notes', 'TEXT')
    this.ensureColumn('shifts', 'total_sales', 'REAL')
    this.ensureColumn('shifts', 'total_expenses', 'REAL')
    this.ensureColumn('shifts', 'total_domestic_consumption', 'REAL')
    this.ensureColumn('shifts', 'total_debt', 'REAL')
    this.ensureColumn('shifts', 'total_transactions', 'INTEGER')
    this.ensureColumn('shifts', 'user_id', 'INTEGER REFERENCES users(id)')
    // Expenses predate having a payment method. Existing rows default to CASH,
    // which is what a shop expense almost always was before the field existed.
    this.ensureColumn('expenses', 'payment_method', "TEXT DEFAULT 'CASH'")
    this.ensureColumn('domestic_consumption', 'status', "TEXT DEFAULT 'COMPLETED'")
    this.ensureColumn('domestic_consumption', 'void_reason', 'TEXT')
    this.ensureColumn('domestic_consumption', 'voided_at', 'DATETIME')
    this.ensureColumn('products', 'sale_units', "TEXT DEFAULT '[]'")
    this.ensureColumn('sales', 'mpesa_ref', 'TEXT')
    this.ensureColumn('products', 'avg_cost_per_kg', 'REAL')
    this.ensureColumn('products', 'is_millable', 'INTEGER DEFAULT 0')
    this.ensureColumn('products', 'is_mill_output', 'INTEGER DEFAULT 0')
    this.ensureColumn('expenses', 'expense_kind', "TEXT NOT NULL DEFAULT 'DAILY'")
    // Admins from before per-right access had every right; keep that for them.
    this.ensureColumn('users', 'rights', "TEXT NOT NULL DEFAULT '[]'")
    this.db
      .prepare("UPDATE users SET rights = ? WHERE role = 'ADMIN' AND rights = '[]'")
      .run(JSON.stringify(ADMIN_RIGHTS))
    this.ensureColumn('sale_items', 'cost_per_kg', 'REAL')

    // Deliveries and take-home stock gained a review step. Everything recorded before it
    // existed was already in the books, so it starts out reviewed rather than flooding
    // the owner's Needs attention list on the first start.
    const reviewColumnsExisted = this.hasColumn('domestic_consumption', 'reviewed_at')
    this.ensureColumn('stock_receipts', 'approval_status', "TEXT NOT NULL DEFAULT 'APPROVED'")
    this.ensureColumn('stock_receipts', 'reviewed_by', 'TEXT')
    this.ensureColumn('stock_receipts', 'reviewed_at', 'DATETIME')
    this.ensureColumn('stock_receipts', 'review_note', 'TEXT')
    // Who keyed the entry in. The shift's owner is not always the person at the till, so
    // older rows (which have no value here) fall back to the shift's name.
    this.ensureColumn('stock_receipts', 'recorded_by', 'TEXT')
    this.ensureColumn('domestic_consumption', 'recorded_by', 'TEXT')
    this.ensureColumn('domestic_consumption', 'reviewed_by', 'TEXT')
    this.ensureColumn('domestic_consumption', 'reviewed_at', 'DATETIME')
    if (!reviewColumnsExisted) {
      this.db.exec('UPDATE domestic_consumption SET reviewed_at = created_at WHERE reviewed_at IS NULL')
    }

    // Approving stock is a new right. Anyone who can manage staff is the owner, so they
    // get it once; after that the owner's own choices stand, and it is never re-added.
    const stockRightGranted = this.db.prepare("SELECT 1 FROM settings WHERE key = 'stock_right_granted'").get()
    if (!stockRightGranted) {
      const accounts = this.db.prepare('SELECT id, rights FROM users').all() as Array<{ id: number; rights: string }>
      for (const account of accounts) {
        const rights = normalizeRights(JSON.parse(account.rights) as string[])
        if (rights.includes('manage_staff') && !rights.includes('manage_stock')) {
          const next = normalizeRights([...rights, 'manage_stock'])
          this.db.prepare('UPDATE users SET rights = ? WHERE id = ?').run(JSON.stringify(next), account.id)
        }
      }
      this.db.prepare("INSERT INTO settings (key, value) VALUES ('stock_right_granted', 'true')").run()
    }
  }

  // One-time migration: if this install has an old single shared Admin PIN
  // (from before named staff accounts existed) and no users yet, carry that
  // PIN over as the first Admin user so the owner's existing PIN keeps
  // working. No-op on fresh installs and on any already-migrated install.
  private migrateLegacyAdminPin(): void {
    const userCount = (this.db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count
    if (userCount > 0) return
    const settings = this.getSettings()
    const salt = settings.admin_pin_salt
    const hash = settings.admin_pin_hash
    if (!salt || !hash) return
    this.db
      .prepare('INSERT INTO users (name, role, pin_salt, pin_hash) VALUES (?, ?, ?, ?)')
      .run('Admin', 'ADMIN', salt, hash)
  }

  private seedDefaults(): void {
    const settingsCount = this.db.prepare('SELECT COUNT(*) as count FROM settings').get() as { count: number }
    if (settingsCount.count === 0) {
      const insert = this.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        insert.run(key, value)
      }
    }

    const categoryCount = this.db.prepare('SELECT COUNT(*) as count FROM categories').get() as { count: number }
    if (categoryCount.count === 0) {
      const insert = this.db.prepare('INSERT INTO categories (name) VALUES (?)')
      for (const name of DEFAULT_CATEGORIES) {
        insert.run(name)
      }
    }

    // A fresh install arrives with the shop's catalog, its categories and its
    // prices already in place — that arrangement barely changes year to year, so
    // retyping ~60 products is pure setup cost. Stock starts at zero on purpose:
    // the first real job on a new till is a stock-take, and inventing opening
    // bags here would make the app lie about what's in the store from day one.
    // Only ever runs when the catalog is genuinely empty, so it can't disturb a
    // shop that has already been trading.
    const productCount = this.db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number }
    if (productCount.count === 0) {
      this.importDefaultPriceList(DEFAULT_PRICE_LIST)
    }
  }

  // ---------- Bootstrap ----------

  bootstrap(): DashboardSnapshot {
    return {
      categories: this.listCategories(),
      products: this.listProducts(),
      activeShift: this.getActiveShift(),
      settings: this.getSettings(),
    }
  }

  // ---------- Categories ----------

  listCategories(): CategoryRecord[] {
    const rows = this.db.prepare('SELECT id, name FROM categories ORDER BY name ASC').all() as unknown as CategoryRecord[]
    return rows
  }

  createCategory(name: string): CategoryRecord {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('Category name is required')
    const result = this.db.prepare('INSERT INTO categories (name) VALUES (?)').run(trimmed)
    return { id: Number(result.lastInsertRowid), name: trimmed }
  }

  // ---------- Products ----------

  private static readonly PRODUCT_SELECT = `
    SELECT p.id, p.name, p.category_id, c.name as category_name, p.weight_per_bag,
           p.total_weight_kg, p.buying_price_per_bag, p.retail_price_per_kg,
           p.wholesale_price_per_kg, p.min_stock_alert_kg, p.is_active, p.is_millable, p.is_mill_output, p.sale_units
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
  `

  // One query for every product's price breaks rather than one per product —
  // listProducts() would otherwise be an N+1 on a catalog of any real size.
  private priceBreaksByProduct(): Map<number, ProductPriceBreak[]> {
    const rows = this.db
      .prepare('SELECT product_id, quantity_kg, price FROM product_price_breaks ORDER BY quantity_kg ASC')
      .all() as Array<{ product_id: number; quantity_kg: number; price: number }>
    const map = new Map<number, ProductPriceBreak[]>()
    for (const row of rows) {
      const list = map.get(row.product_id) ?? []
      list.push({ quantityKg: row.quantity_kg, price: row.price })
      map.set(row.product_id, list)
    }
    return map
  }

  private priceBreaksFor(productId: number): ProductPriceBreak[] {
    const rows = this.db
      .prepare('SELECT quantity_kg, price FROM product_price_breaks WHERE product_id = ? ORDER BY quantity_kg ASC')
      .all(productId) as Array<{ quantity_kg: number; price: number }>
    return rows.map((row) => ({ quantityKg: row.quantity_kg, price: row.price }))
  }

  listProducts(): ProductRecord[] {
    const rows = this.db
      .prepare(`${PosDatabase.PRODUCT_SELECT} ORDER BY p.name ASC`)
      .all() as unknown as ProductRow[]
    const breaks = this.priceBreaksByProduct()
    return rows.map((row) => mapProduct(row, breaks.get(row.id) ?? []))
  }

  // Public: the setProductPriceBreaks IPC handler reads the pre-edit record
  // with this to fall back to the existing breaks when the caller isn't Admin.
  getProductOrThrow(id: number): ProductRecord {
    const row = this.db
      .prepare(`${PosDatabase.PRODUCT_SELECT} WHERE p.id = ?`)
      .get(id) as unknown as ProductRow | undefined
    if (!row) throw new Error(`Product ${id} not found`)
    return mapProduct(row, this.priceBreaksFor(id))
  }

  createProduct(input: ProductInput): ProductRecord {
    if (!input.name.trim()) throw new Error('Product name is required')
    if (input.wholesalePricePerKg > 0 && input.wholesalePricePerKg > input.retailPricePerKg) {
      throw new Error('Wholesale price cannot be higher than retail price')
    }
    const result = this.db
      .prepare(
        `INSERT INTO products
          (name, category_id, weight_per_bag, total_weight_kg, buying_price_per_bag,
           retail_price_per_kg, wholesale_price_per_kg, min_stock_alert_kg, is_active, is_millable, is_mill_output, sale_units)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.name.trim(),
        input.categoryId,
        input.weightPerBag,
        input.totalWeightKg,
        input.buyingPricePerBag,
        input.retailPricePerKg,
        input.wholesalePricePerKg,
        input.minStockAlertKg,
        input.isActive ? 1 : 0,
        input.isMillable ? 1 : 0,
        input.isMillOutput ? 1 : 0,
        JSON.stringify(cleanSaleUnits(input.saleUnits ?? []))
      )
    return this.getProductOrThrow(Number(result.lastInsertRowid))
  }

  updateProduct(id: number, input: ProductInput): ProductRecord {
    if (input.wholesalePricePerKg > 0 && input.wholesalePricePerKg > input.retailPricePerKg) {
      throw new Error('Wholesale price cannot be higher than retail price')
    }
    const before = this.getProductOrThrow(id)
    // Typing a buying price into the product form is the owner stating what the
    // stock cost, so it replaces the running average rather than blending into it.
    if (before.buyingPricePerBag !== input.buyingPricePerBag || before.weightPerBag !== input.weightPerBag) {
      this.db.prepare('UPDATE products SET avg_cost_per_kg = NULL WHERE id = ?').run(id)
    }
    this.db
      .prepare(
        `UPDATE products SET
          name = ?, category_id = ?, weight_per_bag = ?, total_weight_kg = ?,
          buying_price_per_bag = ?, retail_price_per_kg = ?, wholesale_price_per_kg = ?,
          min_stock_alert_kg = ?, is_active = ?
         WHERE id = ?`
      )
      .run(
        input.name.trim(),
        input.categoryId,
        input.weightPerBag,
        input.totalWeightKg,
        input.buyingPricePerBag,
        input.retailPricePerKg,
        input.wholesalePricePerKg,
        input.minStockAlertKg,
        input.isActive ? 1 : 0,
        id
      )
    if (input.isMillable !== undefined) {
      this.db.prepare('UPDATE products SET is_millable = ? WHERE id = ?').run(input.isMillable ? 1 : 0, id)
    }
    if (input.isMillOutput !== undefined) {
      this.db.prepare('UPDATE products SET is_mill_output = ? WHERE id = ?').run(input.isMillOutput ? 1 : 0, id)
    }
    if (input.saleUnits) {
      this.db
        .prepare('UPDATE products SET sale_units = ? WHERE id = ?')
        .run(JSON.stringify(cleanSaleUnits(input.saleUnits)), id)
    }
    return this.getProductOrThrow(id)
  }

  setProductActive(id: number, isActive: boolean): ProductRecord {
    this.db.prepare('UPDATE products SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, id)
    return this.getProductOrThrow(id)
  }

  setProductPriceBreaks(productId: number, breaks: ProductPriceBreak[]): ProductRecord {
    this.getProductOrThrow(productId) // 404s cleanly rather than silently no-op-ing on a bad id
    const clean = breaks
      .filter((b) => b.quantityKg > 0 && b.price > 0)
      // Later entries for the same weight win, so re-saving a form that (say)
      // edited a duplicate row down to the same value as another doesn't hit the
      // table's UNIQUE(product_id, quantity_kg) constraint.
      .reduce<Map<number, number>>((map, b) => map.set(b.quantityKg, b.price), new Map())

    this.db.exec('BEGIN')
    try {
      this.db.prepare('DELETE FROM product_price_breaks WHERE product_id = ?').run(productId)
      const insert = this.db.prepare('INSERT INTO product_price_breaks (product_id, quantity_kg, price) VALUES (?, ?, ?)')
      for (const [quantityKg, price] of clean) insert.run(productId, quantityKg, price)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    return this.getProductOrThrow(productId)
  }

  /**
   * Permanently removes a product. Only ever succeeds for one that has no
   * history — nothing sold, restocked, or taken home. Anything else stays, so a
   * receipt printed last month still names what was actually bought; the caller
   * is told to deactivate instead, which is what hides it from the Sell screen.
   */
  deleteProduct(id: number): { name: string } {
    const product = this.getProductOrThrow(id)

    const references: Array<{ table: string; one: string; many: string }> = [
      { table: 'sale_items', one: 'sale', many: 'sales' },
      { table: 'stock_receipts', one: 'restock', many: 'restocks' },
      { table: 'domestic_consumption', one: 'take-home record', many: 'take-home records' },
    ]
    const blocking = references
      .map(({ table, one, many }) => ({
        one,
        many,
        count: (this.db.prepare(`SELECT COUNT(*) as count FROM ${table} WHERE product_id = ?`).get(id) as {
          count: number
        }).count,
      }))
      .filter((ref) => ref.count > 0)

    if (blocking.length > 0) {
      const detail = blocking.map((ref) => `${ref.count} ${ref.count === 1 ? ref.one : ref.many}`).join(', ')
      throw new Error(
        `"${product.name}" can't be deleted — it appears in ${detail}. Deactivate it instead to hide it from the Sell screen while keeping those records intact.`
      )
    }

    this.db.prepare('DELETE FROM products WHERE id = ?').run(id)
    return { name: product.name }
  }

  // Bulk-seeds the shop's catalog: name, category, prices, bag size and alert
  // level. Stock and buying price stay at zero — those are what the first Add
  // Stock captures. Idempotent: matches existing products by name
  // (case-insensitive) and skips them, so it can never create duplicates.
  importDefaultPriceList(items: DefaultPriceListItem[]): ImportPriceListResult {
    // Resolved per name and cached, so the owner's own grouping survives the seed
    // instead of every product landing in one bucket. A category named in the
    // list but not yet in the table is created on first use.
    const categoryIds = new Map<string, number>()
    for (const category of this.listCategories()) categoryIds.set(category.name.trim().toLowerCase(), category.id)
    const categoryIdFor = (name: string | null): number | null => {
      if (!name) return null
      const key = name.trim().toLowerCase()
      const existing = categoryIds.get(key)
      if (existing !== undefined) return existing
      const created = this.createCategory(name)
      categoryIds.set(key, created.id)
      return created.id
    }

    const existingNames = new Set(
      (this.db.prepare('SELECT name FROM products').all() as Array<{ name: string }>).map((row) =>
        row.name.trim().toLowerCase()
      )
    )

    let created = 0
    const skippedExisting: string[] = []

    for (const item of items) {
      if (existingNames.has(item.name.trim().toLowerCase())) {
        skippedExisting.push(item.name)
        continue
      }
      this.createProduct({
        name: item.name,
        categoryId: categoryIdFor(item.category),
        weightPerBag: item.weightPerBag,
        totalWeightKg: 0,
        buyingPricePerBag: 0,
        retailPricePerKg: item.retailPricePerKg,
        wholesalePricePerKg: item.wholesalePricePerKg,
        minStockAlertKg: item.minStockAlertKg,
        isActive: item.isActive !== false,
      })
      created += 1
    }

    return { created, skippedExisting }
  }

  // Counted in straight away, so the shop can sell it whether or not the owner is in.
  // Someone without the Approve stock right leaves the delivery PENDING for the owner.
  receiveStock(input: StockReceiptInput, actingUser: SessionUser): ProductRecord {
    if (input.addedKg <= 0) throw new Error('Added quantity must be greater than zero')
    const product = this.getProductOrThrow(input.productId)
    // A delivery is costed at the product's own buying price. No line sets its own.
    const buyingPrice = product.buyingPricePerBag
    const approved = hasRight(actingUser, 'manage_stock')

    // Weighted average: 10 bags left at 4,000 plus 10 new at 4,500 cost 4,250 a
    // bag between them, and that is what each kilo sold next really cost.
    const onHandKg = Math.max(0, product.totalWeightKg)
    const currentCostKg = this.costPerKgOf(input.productId)
    const deliveryCostKg = product.weightPerBag > 0 ? buyingPrice / product.weightPerBag : 0
    const nextAvgCostKg = (onHandKg * currentCostKg + input.addedKg * deliveryCostKg) / (onHandKg + input.addedKg)

    this.db.exec('BEGIN')
    try {
      this.db
        .prepare('UPDATE products SET total_weight_kg = total_weight_kg + ?, avg_cost_per_kg = ? WHERE id = ?')
        .run(input.addedKg, nextAvgCostKg, input.productId)
      this.db
        .prepare(
          `INSERT INTO stock_receipts (shift_id, product_id, added_kg, buying_price_per_bag, reference_note,
             recorded_by, approval_status, reviewed_by, reviewed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${approved ? 'CURRENT_TIMESTAMP' : 'NULL'})`
        )
        .run(
          input.shiftId,
          input.productId,
          input.addedKg,
          buyingPrice,
          input.referenceNote?.trim() || null,
          actingUser.name,
          approved ? 'APPROVED' : 'PENDING',
          approved ? actingUser.name : null
        )
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }

    return this.getProductOrThrow(input.productId)
  }

  private static readonly STOCK_RECEIPT_SQL = `SELECT sr.id, sr.shift_id, COALESCE(sr.recorded_by, s.user_name) AS user_name, sr.product_id, p.name as product_name,
           sr.added_kg, sr.buying_price_per_bag, sr.reference_note, sr.approval_status,
           sr.reviewed_by, sr.reviewed_at, sr.review_note, sr.created_at
    FROM stock_receipts sr
    JOIN products p ON p.id = sr.product_id
    JOIN shifts s ON s.id = sr.shift_id`

  private mapStockReceipt(row: StockReceiptRow): StockReceiptRecord {
    return {
      id: row.id,
      shiftId: row.shift_id,
      userName: row.user_name,
      productId: row.product_id,
      productName: row.product_name,
      addedKg: row.added_kg,
      buyingPricePerBag: row.buying_price_per_bag,
      referenceNote: row.reference_note,
      approvalStatus: row.approval_status,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at ? toIsoUtc(row.reviewed_at) : null,
      reviewNote: row.review_note,
      createdAt: toIsoUtc(row.created_at),
    }
  }

  listStockReceipts(limit: number): StockReceiptRecord[] {
    const rows = this.db
      .prepare(`${PosDatabase.STOCK_RECEIPT_SQL} ORDER BY sr.id DESC LIMIT ?`)
      .all(limit) as unknown as StockReceiptRow[]
    return rows.map((row) => this.mapStockReceipt(row))
  }

  private getStockReceiptOrThrow(id: number): StockReceiptRecord {
    const row = this.db.prepare(`${PosDatabase.STOCK_RECEIPT_SQL} WHERE sr.id = ?`).get(id) as unknown as
      | StockReceiptRow
      | undefined
    if (!row) throw new Error(`Stock delivery ${id} not found`)
    return this.mapStockReceipt(row)
  }

  // Approving keeps the stock as it is. The delivery was already counted in when it came.
  approveStockReceipt(id: number, actingUser: SessionUser): StockReceiptRecord {
    if (!hasRight(actingUser, 'manage_stock')) throw new Error('Approving stock needs the Approve stock right')
    const receipt = this.getStockReceiptOrThrow(id)
    if (receipt.approvalStatus !== 'PENDING') throw new Error('This delivery has already been reviewed')

    this.db
      .prepare(
        "UPDATE stock_receipts SET approval_status = 'APPROVED', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?"
      )
      .run(actingUser.name, id)
    this.logAudit(actingUser, 'STOCK_APPROVED', `${receipt.productName} +${receipt.addedKg} kg, added by ${receipt.userName}`)
    return this.getStockReceiptOrThrow(id)
  }

  // Rejecting takes the delivery back out of stock and out of the cost average. It can
  // only be done while nothing from it has been sold, because otherwise the stock is
  // no longer there to take back.
  rejectStockReceipt(input: RejectStockReceiptInput, actingUser: SessionUser): StockReceiptRecord {
    if (!hasRight(actingUser, 'manage_stock')) throw new Error('Rejecting stock needs the Approve stock right')
    const reason = input.reason.trim()
    if (!reason) throw new Error('Write why the delivery is being rejected')
    const receipt = this.getStockReceiptOrThrow(input.id)
    if (receipt.approvalStatus !== 'PENDING') throw new Error('This delivery has already been reviewed')

    const product = this.getProductOrThrow(receipt.productId)
    if (product.totalWeightKg < receipt.addedKg) {
      throw new Error('Sales have already used part of this delivery, so it cannot be taken back automatically')
    }

    const remainingKg = product.totalWeightKg - receipt.addedKg
    const currentCostKg = this.costPerKgOf(product.id)
    const deliveryCostKg = product.weightPerBag > 0 ? receipt.buyingPricePerBag / product.weightPerBag : 0
    // The average is put back as it was before this delivery. With nothing left on the
    // shelf there is nothing to average, so the cost is kept as it was.
    const restoredAvgCostKg =
      remainingKg > 0 ? (product.totalWeightKg * currentCostKg - receipt.addedKg * deliveryCostKg) / remainingKg : currentCostKg

    this.db.exec('BEGIN')
    try {
      this.db
        .prepare('UPDATE products SET total_weight_kg = total_weight_kg - ?, avg_cost_per_kg = ? WHERE id = ?')
        .run(receipt.addedKg, restoredAvgCostKg, product.id)
      this.db
        .prepare(
          "UPDATE stock_receipts SET approval_status = 'REJECTED', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, review_note = ? WHERE id = ?"
        )
        .run(actingUser.name, reason, input.id)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    this.logAudit(
      actingUser,
      'STOCK_REJECTED',
      `${receipt.productName} -${receipt.addedKg} kg, added by ${receipt.userName}: ${reason}`
    )
    return this.getStockReceiptOrThrow(input.id)
  }

  getStockAttention(actingUser: SessionUser): StockAttention {
    if (!hasRight(actingUser, 'manage_stock')) throw new Error('Seeing stock to check needs the Approve stock right')
    const pendingRows = this.db
      .prepare(`${PosDatabase.STOCK_RECEIPT_SQL} WHERE sr.approval_status = 'PENDING' ORDER BY sr.id DESC`)
      .all() as unknown as StockReceiptRow[]
    return {
      pendingReceipts: pendingRows.map((row) => this.mapStockReceipt(row)),
      unreviewedTakeHome: this.listUnreviewedTakeHome(),
      openConversions: this.listConversionsWhere("c.status = 'OPEN'"),
      unreviewedConversions: this.listConversionsWhere("c.status = 'DONE' AND c.reviewed_at IS NULL"),
    }
  }

  // ---------- Stock processing ----------

  private static readonly CONVERSION_SQL = `SELECT c.*, sp.name as source_name, op.name as output_name
    FROM stock_conversions c
    JOIN products sp ON sp.id = c.source_product_id
    LEFT JOIN products op ON op.id = c.output_product_id`

  private mapConversion(row: ConversionRow): StockConversionRecord {
    return {
      id: row.id,
      shiftId: row.shift_id,
      kind: row.kind,
      status: row.status,
      sourceProductId: row.source_product_id,
      sourceName: row.source_name,
      sourceKg: row.source_kg,
      sourceCostPerKg: row.source_cost_per_kg,
      outputProductId: row.output_product_id,
      outputName: row.output_name,
      outputKg: row.output_kg,
      recordedBy: row.recorded_by,
      completedBy: row.completed_by,
      reviewedBy: row.reviewed_by,
      reviewedAt: toIsoUtc(row.reviewed_at),
      createdAt: toIsoUtc(row.created_at),
      completedAt: toIsoUtc(row.completed_at),
      voidReason: row.void_reason,
      voidedAt: toIsoUtc(row.voided_at),
    }
  }

  private listConversionsWhere(where: string): StockConversionRecord[] {
    const rows = this.db
      .prepare(`${PosDatabase.CONVERSION_SQL} WHERE ${where} ORDER BY c.id DESC`)
      .all() as unknown as ConversionRow[]
    return rows.map((row) => this.mapConversion(row))
  }

  private getConversionOrThrow(id: number): StockConversionRecord {
    const row = this.db.prepare(`${PosDatabase.CONVERSION_SQL} WHERE c.id = ?`).get(id) as unknown as
      | ConversionRow
      | undefined
    if (!row) throw new Error(`Processing record ${id} not found`)
    return this.mapConversion(row)
  }

  listStockConversions(limit: number): StockConversionRecord[] {
    const rows = this.db
      .prepare(`${PosDatabase.CONVERSION_SQL} ORDER BY c.id DESC LIMIT ?`)
      .all(limit) as unknown as ConversionRow[]
    return rows.map((row) => this.mapConversion(row))
  }

  // Processed kilos come in at the same weighted average a delivery uses: the kilos already
  // on the shelf keep their cost, and the new kilos bring the batch's cost with them.
  private addProcessedStock(productId: number, kg: number, batchCost: number): void {
    const product = this.getProductOrThrow(productId)
    const onHandKg = Math.max(0, product.totalWeightKg)
    const currentCostKg = this.costPerKgOf(productId)
    const nextAvgCostKg = (onHandKg * currentCostKg + batchCost) / (onHandKg + kg)
    this.db
      .prepare('UPDATE products SET total_weight_kg = total_weight_kg + ?, avg_cost_per_kg = ? WHERE id = ?')
      .run(kg, nextAvgCostKg, productId)
  }

  // Anyone on the till can record this, like a sale. The kilos leave the source the moment
  // they are taken. A batch with its output already weighed is complete at once; one without
  // is OPEN until finishBatch brings the output back. The owner checks it afterwards.
  recordStockConversion(input: ConversionInput, actingUser: SessionUser): StockConversionRecord {
    const activeShift = this.getActiveShift()
    if (!activeShift || input.shiftId !== activeShift.id) throw new Error('Open a shift before processing stock')

    this.db.exec('BEGIN')
    try {
      const id = this.insertConversion(input, activeShift.id, actingUser)
      this.db.exec('COMMIT')
      return this.getConversionOrThrow(id)
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  // The kilos leave the source, and a weighed output lands in its product at the batch's cost.
  // No transaction of its own, so an edit can void a batch and record its replacement together.
  private insertConversion(input: ConversionInput, shiftId: number, actingUser: SessionUser): number {
    if (!(input.sourceKg > 0)) throw new Error('Kilos taken must be greater than zero')
    const kind: ConversionKind = input.kind ?? (input.outputProductId !== undefined ? 'CLEANING' : 'MILLING')
    const done = input.outputProductId !== undefined

    if (done) {
      if (input.outputProductId === input.sourceProductId) {
        throw new Error('The output must be a different product from the one it came from')
      }
      if (!(input.outputKg !== undefined && input.outputKg > 0)) {
        throw new Error('Weigh the kilos that came out and enter them above zero')
      }
      if (input.outputKg > input.sourceKg + 1e-9) {
        throw new Error('More kilos came out than went in. Check the weights.')
      }
    }

    const source = this.getProductOrThrow(input.sourceProductId)
    if (source.totalWeightKg < input.sourceKg - 1e-9) {
      throw new Error(`Only ${source.totalWeightKg.toFixed(2)} kg of ${source.name} in stock`)
    }

    if (kind === 'CLEANING') {
      if (source.name.endsWith(DISPLAY_SUFFIX)) throw new Error(`${source.name} is already a display product`)
      if (done) {
        const output = this.getProductOrThrow(input.outputProductId as number)
        if (output.name !== `${source.name}${DISPLAY_SUFFIX}`) {
          throw new Error(`Cleaned ${source.name} goes into "${source.name}${DISPLAY_SUFFIX}"`)
        }
      }
    } else {
      if (!source.isMillable) {
        throw new Error(`${source.name} is not sent to posho. Tick Posho in its product settings.`)
      }
      if (done) {
        const output = this.getProductOrThrow(input.outputProductId as number)
        if (!output.isMillOutput) {
          throw new Error(`${output.name} is not a processed product. Tick Processed into in its product settings.`)
        }
      }
    }

    // The batch carries the cost of what went in. Cleaning adds no cost of its own.
    const batchCost = input.sourceKg * this.costPerKgOf(source.id)

    this.db
      .prepare('UPDATE products SET total_weight_kg = total_weight_kg - ? WHERE id = ?')
      .run(input.sourceKg, source.id)
    if (done) this.addProcessedStock(input.outputProductId as number, input.outputKg as number, batchCost)

    const result = this.db
      .prepare(
        `INSERT INTO stock_conversions (shift_id, kind, status, source_product_id, source_kg, source_cost_per_kg,
           output_product_id, output_kg, recorded_by, completed_by, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${done ? 'CURRENT_TIMESTAMP' : 'NULL'})`
      )
      .run(
        shiftId,
        kind,
        done ? 'DONE' : 'OPEN',
        source.id,
        input.sourceKg,
        this.costPerKgOf(source.id),
        done ? (input.outputProductId as number) : null,
        done ? (input.outputKg as number) : null,
        actingUser.name,
        done ? actingUser.name : null
      )
    const id = Number(result.lastInsertRowid)
    const action = kind === 'CLEANING' ? (done ? 'CLEAN_STOCK' : 'START_CLEANING') : done ? 'POSHO_STOCK' : 'SEND_TO_POSHO'
    this.logAudit(actingUser, action, `${source.name} ${input.sourceKg} kg${done ? ` → ${input.outputKg} kg` : ''}`)
    return id
  }

  private checkReturnedKg(batch: StockConversionRecord, kg: number): void {
    if (!(kg > 0)) throw new Error('Weigh the kilos that came back and enter them above zero')
    if (kg > batch.sourceKg + 1e-9) throw new Error('More kilos came back than were sent. Check the weights.')
  }

  // A batch that is out comes back: the weighed output goes in at the batch's cost, and the batch is complete.
  private finishBatch(batch: StockConversionRecord, output: ProductRecord, outputKg: number, actingUser: SessionUser): void {
    this.addProcessedStock(output.id, outputKg, batch.sourceKg * batch.sourceCostPerKg)
    this.db
      .prepare(
        `UPDATE stock_conversions SET status = 'DONE', output_product_id = ?, output_kg = ?, completed_by = ?,
           completed_at = CURRENT_TIMESTAMP WHERE id = ?`
      )
      .run(output.id, outputKg, actingUser.name, batch.id)
  }

  // The milled output comes back from posho.
  completeMilling(input: CompleteMillingInput, actingUser: SessionUser): StockConversionRecord {
    const batch = this.getConversionOrThrow(input.id)
    if (batch.kind !== 'MILLING' || batch.status !== 'OPEN') throw new Error('This batch is not out at posho')
    this.checkReturnedKg(batch, input.outputKg)
    if (input.outputProductId === batch.sourceProductId) {
      throw new Error('The processed product must be different from the one it came from')
    }
    const output = this.getProductOrThrow(input.outputProductId)
    if (!output.isMillOutput) {
      throw new Error(`${output.name} is not a processed product. Tick Processed into in its product settings.`)
    }

    this.db.exec('BEGIN')
    try {
      this.finishBatch(batch, output, input.outputKg, actingUser)
      this.logAudit(actingUser, 'MILLED_STOCK', `${batch.sourceName} ${batch.sourceKg} kg → ${output.name} ${input.outputKg} kg`)
      this.db.exec('COMMIT')
      return this.getConversionOrThrow(batch.id)
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  // The cleaned kilos are weighed after the cleaning is done. They go into the display product
  // named after the source, which must already exist.
  completeCleaning(input: CompleteCleaningInput, actingUser: SessionUser): StockConversionRecord {
    const batch = this.getConversionOrThrow(input.id)
    if (batch.kind !== 'CLEANING' || batch.status !== 'OPEN') throw new Error('This batch is not being cleaned')
    this.checkReturnedKg(batch, input.outputKg)
    const displayName = `${batch.sourceName}${DISPLAY_SUFFIX}`
    const output = this.listProducts().find((p) => p.name === displayName)
    if (!output) throw new Error(`Create "${displayName}" in Stock with its prices first`)

    this.db.exec('BEGIN')
    try {
      this.finishBatch(batch, output, input.outputKg, actingUser)
      this.logAudit(actingUser, 'CLEAN_FINISHED', `${batch.sourceName} ${batch.sourceKg} kg → ${output.name} ${input.outputKg} kg`)
      this.db.exec('COMMIT')
      return this.getConversionOrThrow(batch.id)
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  // For a batch that never came back. The kilos go back to the source; the reason is kept.
  cancelMilling(input: CancelMillingInput, actingUser: SessionUser): StockConversionRecord {
    const reason = input.reason.trim()
    if (!reason) throw new Error('A reason is required to cancel a batch that has not come back')
    const batch = this.getConversionOrThrow(input.id)
    if (batch.status !== 'OPEN') throw new Error('Only a batch that has not come back can be cancelled')

    this.db.exec('BEGIN')
    try {
      this.db
        .prepare('UPDATE products SET total_weight_kg = total_weight_kg + ? WHERE id = ?')
        .run(batch.sourceKg, batch.sourceProductId)
      this.db.prepare("UPDATE stock_conversions SET status = 'CANCELLED' WHERE id = ?").run(batch.id)
      this.logAudit(actingUser, 'CANCEL_BATCH', `${batch.sourceName} ${batch.sourceKg} kg: ${reason}`)
      this.db.exec('COMMIT')
      return this.getConversionOrThrow(batch.id)
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  // A finished batch's kilos come back out of the output, at the cost they carried in, and the
  // source gets its kilos back. Refused when sales have already used the output's kilos.
  private reverseBatch(batch: StockConversionRecord): void {
    if (batch.outputProductId !== null && batch.outputKg !== null) {
      const output = this.getProductOrThrow(batch.outputProductId)
      if (output.totalWeightKg < batch.outputKg - 1e-9) {
        throw new Error(`Sales have already used part of this batch (${output.name}), so it cannot be taken back`)
      }
      const before = output.totalWeightKg
      const remaining = before - batch.outputKg
      const currentCostKg = this.costPerKgOf(output.id)
      const batchCost = batch.sourceKg * batch.sourceCostPerKg
      // The average is put back as it was before this batch. With nothing left there is nothing to average.
      // Floored at zero: a hand-corrected cost since the batch went in could otherwise go negative.
      const restoredAvgCostKg =
        remaining > 0 ? Math.max(0, (before * currentCostKg - batchCost) / remaining) : currentCostKg
      this.db
        .prepare('UPDATE products SET total_weight_kg = total_weight_kg - ?, avg_cost_per_kg = ? WHERE id = ?')
        .run(batch.outputKg, restoredAvgCostKg, output.id)
    }
    this.db
      .prepare('UPDATE products SET total_weight_kg = total_weight_kg + ? WHERE id = ?')
      .run(batch.sourceKg, batch.sourceProductId)
  }

  // Judged by when the batch was finished, not started: cleaning taken out yesterday and
  // weighed today is today's work, and must stay correctable today.
  private assertBatchInCurrentShift(batch: StockConversionRecord, verb: string): ShiftRecord {
    const activeShift = this.getActiveShift()
    const finishedThisShift =
      activeShift !== null &&
      (batch.shiftId === activeShift.id ||
        (batch.completedAt !== null && Date.parse(batch.completedAt) >= Date.parse(activeShift.startTime)))
    if (!activeShift || !finishedThisShift) {
      throw new Error(`Only processing finished in the current open shift can be ${verb}`)
    }
    return activeShift
  }

  // Takes a finished batch back out of the stock. The record stays, marked VOID, with the reason.
  voidConversion(input: VoidConversionInput, actingUser: SessionUser): StockConversionRecord {
    const reason = input.reason.trim()
    if (!reason) throw new Error('A reason is required to void a batch')
    const batch = this.getConversionOrThrow(input.id)
    if (batch.status !== 'DONE') throw new Error('Only finished processing can be voided')
    this.assertBatchInCurrentShift(batch, 'voided')

    this.db.exec('BEGIN')
    try {
      this.reverseBatch(batch)
      this.db
        .prepare("UPDATE stock_conversions SET status = 'VOID', void_reason = ?, voided_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(reason, batch.id)
      this.logAudit(actingUser, 'VOID_CONVERSION', `${batch.sourceName} ${batch.sourceKg} kg: ${reason}`)
      this.db.exec('COMMIT')
      return this.getConversionOrThrow(batch.id)
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  // Edit is a void plus a fresh batch with the corrected weights, in one transaction, so the
  // original keeps its place in the record and the replacement is checked like any new batch.
  editConversion(input: EditConversionInput, actingUser: SessionUser): StockConversionRecord {
    const reason = input.reason.trim()
    if (!reason) throw new Error('A reason is required to edit a batch')
    const batch = this.getConversionOrThrow(input.id)
    if (batch.status !== 'DONE' || batch.outputProductId === null) {
      throw new Error('Only finished processing can be edited')
    }
    const activeShift = this.assertBatchInCurrentShift(batch, 'edited')

    this.db.exec('BEGIN')
    try {
      this.reverseBatch(batch)
      const replacementId = this.insertConversion(
        {
          shiftId: activeShift.id,
          kind: batch.kind,
          sourceProductId: batch.sourceProductId,
          sourceKg: input.sourceKg,
          outputProductId: batch.outputProductId,
          outputKg: input.outputKg,
        },
        activeShift.id,
        actingUser
      )
      this.db
        .prepare("UPDATE stock_conversions SET status = 'VOID', void_reason = ?, voided_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(`Edited: ${reason}. Replaced by batch #${replacementId}`, batch.id)
      this.logAudit(actingUser, 'EDIT_CONVERSION', `batch #${batch.id} replaced by #${replacementId}: ${reason}`)
      this.db.exec('COMMIT')
      return this.getConversionOrThrow(replacementId)
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  // The owner's check, the same as approving a delivery. It changes no stock.
  markConversionReviewed(id: number, actingUser: SessionUser): StockConversionRecord {
    if (!hasRight(actingUser, 'manage_stock')) throw new Error('Checking processed stock needs the Approve stock right')
    const batch = this.getConversionOrThrow(id)
    if (batch.status !== 'DONE') throw new Error('Only finished processing can be checked')
    this.db
      .prepare('UPDATE stock_conversions SET reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(actingUser.name, id)
    return this.getConversionOrThrow(id)
  }

  // ---------- Shifts ----------

  getActiveShift(): ShiftRecord | null {
    const row = this.db
      .prepare("SELECT * FROM shifts WHERE status = 'ACTIVE' ORDER BY id DESC LIMIT 1")
      .get() as unknown as ShiftRow | undefined
    return row ? mapShift(row) : null
  }

  listShiftsBetween(range: PeriodRange): ShiftRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM shifts WHERE start_time BETWEEN ? AND ? ORDER BY id DESC')
      .all(range.fromISO, range.toISO) as unknown as ShiftRow[]
    return rows.map(mapShift)
  }

  listRecentShifts(limit: number): ShiftRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM shifts ORDER BY id DESC LIMIT ?')
      .all(limit) as unknown as ShiftRow[]
    return rows.map(mapShift)
  }

  openShift(input: OpenShiftInput, actingUser: SessionUser): ShiftRecord {
    const existing = this.getActiveShift()
    if (existing) throw new Error('A shift is already active')
    const result = this.db
      .prepare('INSERT INTO shifts (user_id, user_name, opening_cash, opening_mpesa, opening_notes) VALUES (?, ?, ?, ?, ?)')
      .run(actingUser.id, actingUser.name, input.openingCash, input.openingMpesa, input.notes?.trim() || null)
    const row = this.db
      .prepare('SELECT * FROM shifts WHERE id = ?')
      .get(Number(result.lastInsertRowid)) as unknown as ShiftRow
    return mapShift(row)
  }

  // cash_paid is what the customer handed over, so a 1,000 note for an 850 bill
  // is stored as 1,000 (the receipt prints the change from it). The 150 went
  // back out of the drawer, though, so anything reconciling the till has to take
  // the change off again — otherwise every sale with change reads as a shortage.
  // What a kilo of this product cost the shop: the running average across
  // deliveries, or — for stock that predates averaging — buying price ÷ bag size.
  private static readonly CURRENT_COST_SQL =
    'CASE WHEN p.weight_per_bag > 0 THEN COALESCE(p.avg_cost_per_kg, p.buying_price_per_bag / p.weight_per_bag) ELSE 0 END'

  private costPerKgOf(productId: number): number {
    const row = this.db
      .prepare(`SELECT ${PosDatabase.CURRENT_COST_SQL} as cost FROM products p WHERE p.id = ?`)
      .get(productId) as { cost: number } | undefined
    return row?.cost ?? 0
  }

  private static readonly NET_CASH_SQL = 'cash_paid - MAX(0, cash_paid + mpesa_paid - total_amount)'

  // A line's share of its sale's discount. The discount is recorded once on the sale,
  // not on each line, so a line's revenue is its subtotal scaled by the sale's total
  // over the sale's subtotal. Without this, every discount was counted as profit.
  private static readonly LINE_NET_SQL =
    '(si.subtotal * COALESCE(s.total_amount / NULLIF((SELECT SUM(x.subtotal) FROM sale_items x WHERE x.sale_id = s.id), 0), 0))'

  private shiftTotals(shiftId: number) {
    const shiftRow = this.db.prepare('SELECT * FROM shifts WHERE id = ?').get(shiftId) as unknown as
      | ShiftRow
      | undefined
    if (!shiftRow || shiftRow.status !== 'ACTIVE') throw new Error('Shift is not active')

    const salesTotals = this.db
      .prepare(
        `SELECT COALESCE(SUM(${PosDatabase.NET_CASH_SQL}),0) as cash, COALESCE(SUM(mpesa_paid),0) as mpesa, COALESCE(SUM(total_amount),0) as total, COALESCE(SUM(debt_amount),0) as debt, COUNT(*) as count FROM sales WHERE shift_id = ? AND status != 'VOID'`
      )
      .get(shiftId) as { cash: number; mpesa: number; total: number; debt: number; count: number }

    const repaymentTotals = this.db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN payment_method = 'CASH' THEN amount_paid ELSE 0 END),0) as cash,
           COALESCE(SUM(CASE WHEN payment_method = 'MPESA' THEN amount_paid ELSE 0 END),0) as mpesa
         FROM debt_repayments WHERE shift_id = ? AND status != 'VOID'`
      )
      .get(shiftId) as { cash: number; mpesa: number }

    // An expense paid from the M-Pesa till leaves the cash drawer untouched, so each
    // comes off its own side. NULL is a row from before payment_method existed —
    // those were cash.
    const expenseTotal = this.db
      .prepare(
        `SELECT COALESCE(SUM(amount),0) as total,
                COALESCE(SUM(CASE WHEN payment_method = 'MPESA' THEN amount ELSE 0 END),0) as mpesa
         FROM expenses WHERE shift_id = ?`
      )
      .get(shiftId) as { total: number; mpesa: number }

    const consumptionTotal = this.db
      .prepare("SELECT COALESCE(SUM(cost_value),0) as total FROM domestic_consumption WHERE shift_id = ? AND status != 'VOID'")
      .get(shiftId) as { total: number }

    const expectedCash =
      shiftRow.opening_cash + salesTotals.cash + repaymentTotals.cash - (expenseTotal.total - expenseTotal.mpesa)
    const expectedMpesa = shiftRow.opening_mpesa + salesTotals.mpesa + repaymentTotals.mpesa - expenseTotal.mpesa
    return { salesTotals, expenseTotal, consumptionTotal, expectedCash, expectedMpesa }
  }

  // Half a shilling either way still matches: coins below one bob don't circulate.
  checkShiftCount(input: ShiftCountCheckInput): ShiftCountCheck {
    const { expectedCash, expectedMpesa } = this.shiftTotals(input.shiftId)
    return {
      cashMatches: Math.abs(input.closingCashActual - expectedCash) < 0.5,
      mpesaMatches: Math.abs(input.closingMpesaActual - expectedMpesa) < 0.5,
    }
  }

  // Only the person who opened the shift can end it or hand it over, so every count
  // traces to whoever had the money. Shifts from before user tracking have no owner
  // and stay open to anyone.
  private assertShiftOwner(shiftId: number, actingUser: SessionUser): ShiftRow {
    const row = this.db.prepare('SELECT * FROM shifts WHERE id = ?').get(shiftId) as unknown as ShiftRow | undefined
    if (!row || row.status !== 'ACTIVE') throw new Error('Shift is not active')
    if (row.user_id !== null && row.user_id !== actingUser.id) {
      throw new Error(`Only ${row.user_name} can end or hand over this shift`)
    }
    return row
  }

  private assertExpensesReviewed(reviewed: boolean): void {
    if (!reviewed) throw new Error('Check the expenses and take-home stock list before closing the shift')
  }

  closeShift(input: CloseShiftInput, actingUser: SessionUser): ShiftCloseSummary {
    this.assertShiftOwner(input.shiftId, actingUser)
    this.assertExpensesReviewed(input.expensesReviewed)
    const { salesTotals, expenseTotal, consumptionTotal, expectedCash, expectedMpesa } = this.shiftTotals(input.shiftId)

    this.db
      .prepare(
        `UPDATE shifts SET
          end_time = CURRENT_TIMESTAMP, closing_cash_actual = ?, closing_mpesa_actual = ?,
          expected_cash = ?, expected_mpesa = ?, variance_cash = ?, variance_mpesa = ?,
          notes = ?, total_sales = ?, total_expenses = ?, total_domestic_consumption = ?, total_debt = ?,
          total_transactions = ?, status = 'CLOSED'
         WHERE id = ?`
      )
      .run(
        input.closingCashActual,
        input.closingMpesaActual,
        expectedCash,
        expectedMpesa,
        input.closingCashActual - expectedCash,
        input.closingMpesaActual - expectedMpesa,
        input.notes ?? null,
        salesTotals.total,
        expenseTotal.total,
        consumptionTotal.total,
        salesTotals.debt,
        salesTotals.count,
        input.shiftId
      )

    const updatedRow = this.db.prepare('SELECT * FROM shifts WHERE id = ?').get(input.shiftId) as unknown as ShiftRow

    return {
      shift: mapShift(updatedRow),
      totalsales: salesTotals.total,
      totalExpenses: expenseTotal.total,
      totalDomesticConsumption: consumptionTotal.total,
    }
  }

  // A mid-day hand-over: the outgoing person counts the till exactly as a close
  // would, the figures are kept on the record, and the shift stays open under the
  // incoming person's name. No Z-report, no reset of the float.
  // The till figures an open shift should show, so a hand-over count can be checked against them.
  expectedCountsOf(shiftId: number): { expectedCash: number; expectedMpesa: number } {
    const { expectedCash, expectedMpesa } = this.shiftTotals(shiftId)
    return { expectedCash, expectedMpesa }
  }

  handoverShift(input: HandoverShiftInput, actingUser: SessionUser): ShiftRecord {
    this.assertShiftOwner(input.shiftId, actingUser)
    this.assertExpensesReviewed(input.expensesReviewed)
    if (input.toUserId === actingUser.id) throw new Error('Pick the person taking over the till — it cannot be you')
    const incoming = this.getUserRowOrThrow(input.toUserId)
    if (incoming.is_active !== 1) throw new Error('That account is deactivated')

    const { expectedCash, expectedMpesa } = this.shiftTotals(input.shiftId)
    const varianceCash = input.closingCashActual - expectedCash
    const varianceMpesa = input.closingMpesaActual - expectedMpesa

    this.db.exec('BEGIN')
    try {
      this.db
        .prepare(
          `INSERT INTO shift_handovers (shift_id, from_user_id, from_user_name, to_user_id, to_user_name,
             counted_cash, counted_mpesa, variance_cash, variance_mpesa, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.shiftId,
          actingUser.id,
          actingUser.name,
          incoming.id,
          incoming.name,
          input.closingCashActual,
          input.closingMpesaActual,
          varianceCash,
          varianceMpesa,
          input.notes?.trim() || null
        )
      this.db
        .prepare('UPDATE shifts SET user_id = ?, user_name = ? WHERE id = ?')
        .run(incoming.id, incoming.name, input.shiftId)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }

    this.logAudit(actingUser, 'SHIFT_HANDOVER', `shift #${input.shiftId} to ${incoming.name} (cash ${varianceCash}, M-Pesa ${varianceMpesa})`)
    const row = this.db.prepare('SELECT * FROM shifts WHERE id = ?').get(input.shiftId) as unknown as ShiftRow
    return mapShift(row)
  }

  listShiftHandovers(shiftId: number): ShiftHandoverRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM shift_handovers WHERE shift_id = ? ORDER BY id ASC')
      .all(shiftId) as Array<{
      id: number
      shift_id: number
      from_user_name: string
      to_user_name: string
      counted_cash: number
      counted_mpesa: number
      variance_cash: number
      variance_mpesa: number
      notes: string | null
      created_at: string
    }>
    return rows.map((row) => ({
      id: row.id,
      shiftId: row.shift_id,
      fromUserName: row.from_user_name,
      toUserName: row.to_user_name,
      countedCash: row.counted_cash,
      countedMpesa: row.counted_mpesa,
      varianceCash: row.variance_cash,
      varianceMpesa: row.variance_mpesa,
      notes: row.notes,
      createdAt: toIsoUtc(row.created_at),
    }))
  }

  // ---------- Sales ----------

  private mapSaleRow(saleRow: {
    id: number
    shift_id: number
    cashier_name: string
    customer_name: string
    customer_phone: string | null
    total_amount: number
    cash_paid: number
    mpesa_paid: number
    mpesa_ref: string | null
    debt_amount: number
    discount: number
    status: 'COMPLETED' | 'VOID'
    void_reason: string | null
    voided_at: string | null
    created_at: string
  }): Omit<SaleRecord, 'items'> {
    return {
      id: saleRow.id,
      shiftId: saleRow.shift_id,
      cashierName: saleRow.cashier_name,
      customerName: saleRow.customer_name,
      customerPhone: saleRow.customer_phone,
      totalAmount: saleRow.total_amount,
      cashPaid: saleRow.cash_paid,
      mpesaPaid: saleRow.mpesa_paid,
      mpesaRef: saleRow.mpesa_ref ?? null,
      debtAmount: saleRow.debt_amount,
      debtOutstanding: saleRow.debt_amount,
      discount: saleRow.discount,
      status: saleRow.status ?? 'COMPLETED',
      voidReason: saleRow.void_reason,
      voidedAt: toIsoUtc(saleRow.voided_at),
      createdAt: toIsoUtc(saleRow.created_at),
    }
  }

  private mapSaleItemRow(row: {
    id: number
    product_id: number
    quantity_kg: number
    unit_price_per_kg: number
    subtotal: number
    product_name: string
    weight_per_bag: number
  }): SaleItemRecord {
    return {
      id: row.id,
      productId: row.product_id,
      productName: row.product_name,
      quantityKg: row.quantity_kg,
      unitPricePerKg: row.unit_price_per_kg,
      subtotal: row.subtotal,
      weightPerBag: row.weight_per_bag,
    }
  }

  private getSaleOrThrow(saleId: number): SaleRecord {
    const saleRow = this.db
      .prepare('SELECT s.*, sh.user_name as cashier_name FROM sales s JOIN shifts sh ON sh.id = s.shift_id WHERE s.id = ?')
      .get(saleId) as Parameters<PosDatabase['mapSaleRow']>[0] | undefined
    if (!saleRow) throw new Error(`Sale ${saleId} not found`)

    const itemRows = this.db
      .prepare(
        `SELECT si.id, si.product_id, si.quantity_kg, si.unit_price_per_kg, si.subtotal, p.name as product_name, p.weight_per_bag
         FROM sale_items si JOIN products p ON p.id = si.product_id WHERE si.sale_id = ?`
      )
      .all(saleId) as Array<Parameters<PosDatabase['mapSaleItemRow']>[0]>

    const balance = this.debtBalancesBySale(saleRow.customer_name).get(saleId)
    return {
      ...this.mapSaleRow(saleRow),
      debtOutstanding: balance ?? saleRow.debt_amount,
      items: itemRows.map((row) => this.mapSaleItemRow(row)),
    }
  }

  recordSale(input: SaleInput, actingUser: SessionUser): SaleRecord {
    this.db.exec('BEGIN')
    try {
      const saleId = this.insertSale(input, actingUser)
      this.db.exec('COMMIT')
      return this.getSaleOrThrow(saleId)
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  // The sale itself, without transaction control of its own: recordSale and editSale
  // each wrap it, so an edit can void the original and write the replacement together.
  private insertSale(input: SaleInput, actingUser: SessionUser): number {
    if (input.items.length === 0) throw new Error('Sale must have at least one item')

    if (input.discount > 0 && !hasRight(actingUser, 'approve_discounts_voids')) {
      const allowed = this.getSettings().perm_allow_cashier_discount === 'true'
      if (!allowed) throw new Error('You are not permitted to apply a discount')
    }

    if (input.items.some((item) => !(item.quantityKg > 0))) throw new Error('Every item needs a weight above zero')
    if ([input.discount, input.cashPaid, input.mpesaPaid].some((amount) => !Number.isFinite(amount) || amount < 0)) {
      throw new Error('Discount and payments cannot be negative')
    }

    // Prices come from the product list, never from the till. The till's figures are
    // only checked against it, so a price that changed while the cart was open is caught.
    const products = new Map<number, ProductRecord>()
    for (const item of input.items) {
      const product = this.getProductOrThrow(item.productId)
      products.set(product.id, product)
      if (product.totalWeightKg < item.quantityKg) {
        throw new Error(`Insufficient stock for ${product.name}: have ${product.totalWeightKg}kg, need ${item.quantityKg}kg`)
      }
    }
    const pricedItems = priceSaleLines(input.items, products)
    const subtotal = pricedItems.reduce((sum, item) => sum + item.subtotal, 0)
    if (input.discount > subtotal) throw new Error('The discount is more than the sale total')
    const totalAmount = subtotal - input.discount
    const paid = input.cashPaid + input.mpesaPaid
    const debtAmount = Math.max(0, totalAmount - paid)
    const key = customerKey(input.customerName)
    const isWalkIn = key === '' || key === 'walk-in'
    const customerName = isWalkIn ? 'Walk-in' : this.canonicalCustomerName(input.customerName)

    if (debtAmount > 0 && isWalkIn) {
      throw new Error('A named customer is required to record a sale on credit')
    }
    const repayment = input.debtRepayment && input.debtRepayment.amount > 0 ? input.debtRepayment : null
    if (repayment) {
      if (isWalkIn) throw new Error('Choose the customer by name to take a payment against their debt')
      this.assertRepaymentWithinBalance(customerName, repayment.amount)
    }

    const saleResult = this.db
      .prepare(
        `INSERT INTO sales (shift_id, customer_name, customer_phone, total_amount, cash_paid, mpesa_paid, mpesa_ref, debt_amount, discount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.shiftId,
        customerName,
        input.customerPhone?.trim() || null,
        totalAmount,
        input.cashPaid,
        input.mpesaPaid,
        input.mpesaPaid > 0 ? input.mpesaRef?.trim().toUpperCase() || null : null,
        debtAmount,
        input.discount
      )
    const saleId = Number(saleResult.lastInsertRowid)

    const insertItem = this.db.prepare(
      'INSERT INTO sale_items (sale_id, product_id, quantity_kg, unit_price_per_kg, subtotal, cost_per_kg) VALUES (?, ?, ?, ?, ?, ?)'
    )
    const decrementStock = this.db.prepare('UPDATE products SET total_weight_kg = total_weight_kg - ? WHERE id = ?')

    for (const item of pricedItems) {
      insertItem.run(saleId, item.productId, item.quantityKg, item.unitPricePerKg, item.subtotal, this.costPerKgOf(item.productId))
      decrementStock.run(item.quantityKg, item.productId)
    }

    if (repayment) {
      this.db
        .prepare(
          'INSERT INTO debt_repayments (shift_id, customer_name, amount_paid, payment_method, sale_id) VALUES (?, ?, ?, ?, ?)'
        )
        .run(input.shiftId, customerName, repayment.amount, repayment.paymentMethod, saleId)
    }

    return saleId
  }

  // Two queries total regardless of `limit` — fetching each sale's items with a
  // separate round trip (the naive `rows.map(id => getSaleOrThrow(id))` approach)
  // turns a single page load into 1 + 2*limit queries, which is what made this
  // screen slow to load once a shop had a few hundred transactions on record.
  listRecentSales(limit: number): SaleRecord[] {
    const saleRows = this.db
      .prepare(
        'SELECT s.*, sh.user_name as cashier_name FROM sales s JOIN shifts sh ON sh.id = s.shift_id ORDER BY s.id DESC LIMIT ?'
      )
      .all(limit) as Array<Parameters<PosDatabase['mapSaleRow']>[0]>
    if (saleRows.length === 0) return []

    const itemRows = this.db
      .prepare(
        `SELECT si.id, si.sale_id, si.product_id, si.quantity_kg, si.unit_price_per_kg, si.subtotal,
                p.name as product_name, p.weight_per_bag
         FROM sale_items si JOIN products p ON p.id = si.product_id
         WHERE si.sale_id IN (SELECT id FROM sales ORDER BY id DESC LIMIT ?)`
      )
      .all(limit) as Array<Parameters<PosDatabase['mapSaleItemRow']>[0] & { sale_id: number }>

    const itemsBySaleId = new Map<number, SaleItemRecord[]>()
    for (const row of itemRows) {
      const item = this.mapSaleItemRow(row)
      const existing = itemsBySaleId.get(row.sale_id)
      if (existing) existing.push(item)
      else itemsBySaleId.set(row.sale_id, [item])
    }

    const balances = this.debtBalancesBySale()
    return saleRows.map((row) => ({
      ...this.mapSaleRow(row),
      debtOutstanding: balances.get(row.id) ?? row.debt_amount,
      items: itemsBySaleId.get(row.id) ?? [],
    }))
  }

  // Per-product totals for the Z-report's "what actually left the shelf" line —
  // grouped in SQL rather than summed in JS over listRecentSales, since a busy
  // shift's sales can exceed whatever "recent" limit that screen fetches.
  listProductsSoldByShift(shiftId: number): ShiftProductSummary[] {
    const rows = this.db
      .prepare(
        `SELECT p.name as product_name, p.weight_per_bag, SUM(si.quantity_kg) as total_kg
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         JOIN products p ON p.id = si.product_id
         WHERE s.shift_id = ? AND s.status != 'VOID'
         GROUP BY si.product_id
         ORDER BY total_kg DESC`
      )
      .all(shiftId) as Array<{ product_name: string; weight_per_bag: number; total_kg: number }>

    return rows.map((row) => ({
      productName: row.product_name,
      weightPerBag: row.weight_per_bag,
      totalKg: row.total_kg,
    }))
  }

  voidSale(saleId: number, reason: string, actingUser: SessionUser): SaleRecord {
    const trimmedReason = reason.trim()
    if (!trimmedReason) throw new Error('A reason is required to void a sale')

    if (!hasRight(actingUser, 'approve_discounts_voids')) {
      const allowed = this.getSettings().perm_allow_cashier_void === 'true'
      if (!allowed) throw new Error('You are not permitted to void sales')
    }

    const sale = this.getSaleOrThrow(saleId)
    if (sale.status === 'VOID') throw new Error('Sale is already voided')

    const activeShift = this.getActiveShift()
    if (!activeShift || sale.shiftId !== activeShift.id) {
      throw new Error('Only sales from the current open shift can be voided')
    }

    this.db.exec('BEGIN')
    try {
      const restoreStock = this.db.prepare('UPDATE products SET total_weight_kg = total_weight_kg + ? WHERE id = ?')
      for (const item of sale.items) {
        restoreStock.run(item.quantityKg, item.productId)
      }
      this.db
        .prepare(
          `UPDATE sales SET status = 'VOID', void_reason = ?, voided_at = CURRENT_TIMESTAMP WHERE id = ?`
        )
        .run(trimmedReason, saleId)
      // The repayment taken with this sale was part of the same counter visit, so it
      // goes back with the sale: the customer's debt returns and the cash leaves the till count.
      this.db.prepare("UPDATE debt_repayments SET status = 'VOID' WHERE sale_id = ? AND status != 'VOID'").run(saleId)
      this.db.exec('COMMIT')
      this.logAudit(actingUser, 'VOID_SALE', `sale #${saleId}: ${trimmedReason}`)
      return this.getSaleOrThrow(saleId)
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  // An edit is a void plus a fresh sale, not an in-place rewrite: the original keeps its
  // receipt number and its place in the audit trail, and the replacement is priced and
  // checked by exactly the same rules as any new sale — including the discount permission,
  // which is why a cashier editing a sale can't slip a discount in through the edit.
  editSale(saleId: number, input: SaleInput, actingUser: SessionUser): SaleRecord {
    const sale = this.getSaleOrThrow(saleId)
    if (sale.status === 'VOID') throw new Error('A voided sale cannot be edited')

    const activeShift = this.getActiveShift()
    if (!activeShift || sale.shiftId !== activeShift.id) {
      throw new Error('Only sales from the current open shift can be edited')
    }

    this.db.exec('BEGIN')
    try {
      const restoreStock = this.db.prepare('UPDATE products SET total_weight_kg = total_weight_kg + ? WHERE id = ?')
      for (const item of sale.items) {
        restoreStock.run(item.quantityKg, item.productId)
      }
      this.db.prepare("UPDATE sales SET status = 'VOID', voided_at = CURRENT_TIMESTAMP WHERE id = ?").run(saleId)
      this.db.prepare("UPDATE debt_repayments SET status = 'VOID' WHERE sale_id = ? AND status != 'VOID'").run(saleId)

      const replacementId = this.insertSale({ ...input, shiftId: activeShift.id }, actingUser)
      this.db
        .prepare('UPDATE sales SET void_reason = ? WHERE id = ?')
        .run(`Edited: replaced by sale #${replacementId}`, saleId)
      this.logAudit(actingUser, 'EDIT_SALE', `sale #${saleId} replaced by #${replacementId}`)
      this.db.exec('COMMIT')
      return this.getSaleOrThrow(replacementId)
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  // ---------- Expenses ----------

  private mapExpenseRow(row: ExpenseRow): ExpenseRecord {
    return {
      id: row.id,
      shiftId: row.shift_id,
      category: row.category,
      amount: row.amount,
      description: row.description ?? undefined,
      // Rows written before the column existed read back NULL, not the column
      // default, so the fallback belongs here as well as in the DDL.
      paymentMethod: row.payment_method === 'MPESA' ? 'MPESA' : 'CASH',
      kind: row.expense_kind === 'MONTHLY' ? 'MONTHLY' : 'DAILY',
      recordedBy: row.user_name ?? undefined,
      createdAt: toIsoUtc(row.created_at),
    }
  }

  recordExpense(input: ExpenseInput): ExpenseRecord {
    if (input.amount <= 0) throw new Error('Expense amount must be greater than zero')
    const result = this.db
      .prepare(
        'INSERT INTO expenses (shift_id, category, amount, description, payment_method, expense_kind) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(
        input.shiftId,
        input.category.trim(),
        input.amount,
        input.description?.trim() ?? null,
        input.paymentMethod === 'MPESA' ? 'MPESA' : 'CASH',
        input.kind === 'MONTHLY' ? 'MONTHLY' : 'DAILY'
      )
    const row = this.db.prepare('SELECT * FROM expenses WHERE id = ?').get(Number(result.lastInsertRowid)) as ExpenseRow
    return this.mapExpenseRow(row)
  }

  listExpensesByShift(shiftId: number): ExpenseRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM expenses WHERE shift_id = ? ORDER BY id DESC')
      .all(shiftId) as ExpenseRow[]
    return rows.map((row) => this.mapExpenseRow(row))
  }

  // Powers the expense rows on the Transactions page, which spans days rather
  // than a single shift — hence the join for whoever was on the till at the time.
  listRecentExpenses(limit: number): ExpenseRecord[] {
    const rows = this.db
      .prepare(
        `SELECT e.*, sh.user_name as user_name
         FROM expenses e JOIN shifts sh ON sh.id = e.shift_id
         ORDER BY e.id DESC LIMIT ?`
      )
      .all(limit) as ExpenseRow[]
    return rows.map((row) => this.mapExpenseRow(row))
  }

  // Every expense logged in the period, for the Expenses report. The name attached is the
  // shift it was logged against, which is not always the person who keyed it in.
  listExpensesBetween(range: PeriodRange): ExpenseRecord[] {
    const rows = this.db
      .prepare(
        `SELECT e.*, sh.user_name as user_name
         FROM expenses e JOIN shifts sh ON sh.id = e.shift_id
         WHERE e.created_at BETWEEN ? AND ?
         ORDER BY e.created_at DESC, e.id DESC`
      )
      .all(range.fromISO, range.toISO) as ExpenseRow[]
    return rows.map((row) => this.mapExpenseRow(row))
  }

  // ---------- Domestic Consumption ----------

  // Taken home without anyone's review is shown to the owner under Needs attention. An
  // owner recording it themselves has already seen it, so it is marked reviewed at once.
  recordDomesticConsumption(input: DomesticConsumptionInput, actingUser: SessionUser): DomesticConsumptionRecord {
    const product = this.getProductOrThrow(input.productId)
    if (product.totalWeightKg < input.quantityKg) {
      throw new Error(`Insufficient stock for ${product.name}`)
    }
    const reviewedNow = hasRight(actingUser, 'manage_stock')

    this.db.exec('BEGIN')
    try {
      const result = this.db
        .prepare(
          `INSERT INTO domestic_consumption (shift_id, product_id, quantity_kg, cost_value, notes,
             recorded_by, reviewed_by, reviewed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ${reviewedNow ? 'CURRENT_TIMESTAMP' : 'NULL'})`
        )
        .run(
          input.shiftId,
          input.productId,
          input.quantityKg,
          input.costValue,
          input.notes?.trim() ?? null,
          actingUser.name,
          reviewedNow ? actingUser.name : null
        )
      this.db
        .prepare('UPDATE products SET total_weight_kg = total_weight_kg - ? WHERE id = ?')
        .run(input.quantityKg, input.productId)
      this.db.exec('COMMIT')

      const row = this.db
        .prepare(`${PosDatabase.TAKE_HOME_SQL} WHERE dc.id = ?`)
        .get(Number(result.lastInsertRowid)) as unknown as TakeHomeRow
      return this.mapTakeHome(row)
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  private static readonly TAKE_HOME_SQL = `SELECT dc.id, dc.shift_id, COALESCE(dc.recorded_by, s.user_name) AS user_name, dc.product_id, p.name as product_name,
           dc.quantity_kg, dc.cost_value, dc.notes, dc.status, dc.void_reason, dc.voided_at,
           dc.reviewed_by, dc.reviewed_at, dc.created_at
    FROM domestic_consumption dc
    JOIN products p ON p.id = dc.product_id
    JOIN shifts s ON s.id = dc.shift_id`

  private mapTakeHome(row: TakeHomeRow): DomesticConsumptionRecord {
    return {
      id: row.id,
      shiftId: row.shift_id,
      recordedBy: row.user_name,
      productId: row.product_id,
      productName: row.product_name,
      quantityKg: row.quantity_kg,
      costValue: row.cost_value,
      notes: row.notes ?? undefined,
      status: row.status,
      voidReason: row.void_reason,
      voidedAt: row.voided_at ? toIsoUtc(row.voided_at) : null,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at ? toIsoUtc(row.reviewed_at) : null,
      createdAt: toIsoUtc(row.created_at),
    }
  }

  private getDomesticConsumptionOrThrow(id: number): DomesticConsumptionRecord {
    const row = this.db.prepare(`${PosDatabase.TAKE_HOME_SQL} WHERE dc.id = ?`).get(id) as unknown as
      | TakeHomeRow
      | undefined
    if (!row) throw new Error(`Take-home record ${id} not found`)
    return this.mapTakeHome(row)
  }

  // Mirrors voidSale: same cashier-void permission gate, same "only the current
  // open shift" guard, same stock restoration — a take-home record is a stock
  // movement too, just one with no money attached to unwind.
  voidDomesticConsumption(id: number, reason: string, actingUser: SessionUser): DomesticConsumptionRecord {
    const trimmedReason = reason.trim()
    if (!trimmedReason) throw new Error('A reason is required to void a take-home record')

    if (!hasRight(actingUser, 'approve_discounts_voids')) {
      const allowed = this.getSettings().perm_allow_cashier_void === 'true'
      if (!allowed) throw new Error('You are not permitted to void take-home records')
    }

    const entry = this.getDomesticConsumptionOrThrow(id)
    if (entry.status === 'VOID') throw new Error('Take-home record is already voided')

    const activeShift = this.getActiveShift()
    if (!activeShift || entry.shiftId !== activeShift.id) {
      throw new Error('Only take-home records from the current open shift can be voided')
    }

    this.db.exec('BEGIN')
    try {
      this.db
        .prepare('UPDATE products SET total_weight_kg = total_weight_kg + ? WHERE id = ?')
        .run(entry.quantityKg, entry.productId)
      this.db
        .prepare(`UPDATE domestic_consumption SET status = 'VOID', void_reason = ?, voided_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(trimmedReason, id)
      this.db.exec('COMMIT')
      this.logAudit(actingUser, 'VOID_TAKEHOME', `take-home #${id}: ${trimmedReason}`)
      return this.getDomesticConsumptionOrThrow(id)
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  listDomesticConsumption(limit: number): DomesticConsumptionRecord[] {
    const rows = this.db
      .prepare(`${PosDatabase.TAKE_HOME_SQL} ORDER BY dc.id DESC LIMIT ?`)
      .all(limit) as unknown as TakeHomeRow[]
    return rows.map((row) => this.mapTakeHome(row))
  }

  private listUnreviewedTakeHome(): DomesticConsumptionRecord[] {
    const rows = this.db
      .prepare(`${PosDatabase.TAKE_HOME_SQL} WHERE dc.reviewed_at IS NULL AND dc.status = 'COMPLETED' ORDER BY dc.id DESC`)
      .all() as unknown as TakeHomeRow[]
    return rows.map((row) => this.mapTakeHome(row))
  }

  // Seeing a take-home entry is what clears it from Needs attention. It is not an approval:
  // the stock was already taken out when the entry was made.
  markTakeHomeReviewed(id: number, actingUser: SessionUser): DomesticConsumptionRecord {
    if (!hasRight(actingUser, 'manage_stock')) throw new Error('Seeing take-home stock needs the Approve stock right')
    const entry = this.getDomesticConsumptionOrThrow(id)
    if (entry.reviewedAt) return entry
    this.db
      .prepare('UPDATE domestic_consumption SET reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(actingUser.name, id)
    return this.getDomesticConsumptionOrThrow(id)
  }

  // ---------- Customer Debt ----------

  listCustomerBalances(): CustomerBalance[] {
    const saleDebts = this.db
      .prepare(
        `SELECT
           customer_name,
           COALESCE(SUM(debt_amount), 0) as total_debt,
           COUNT(*) as event_count,
           MAX(created_at) as last_activity
         FROM sales
         WHERE customer_name != 'Walk-in' AND status != 'VOID' AND debt_amount > 0
         GROUP BY customer_name`
      )
      .all() as Array<{ customer_name: string; total_debt: number; event_count: number; last_activity: string }>

    const manualDebts = this.db
      .prepare(
        `SELECT customer_name, COALESCE(SUM(amount), 0) as total_debt, COUNT(*) as event_count, MAX(created_at) as last_activity
         FROM customer_debt_entries GROUP BY customer_name`
      )
      .all() as Array<{ customer_name: string; total_debt: number; event_count: number; last_activity: string }>

    const repayments = this.db
      .prepare(
        `SELECT customer_name, COALESCE(SUM(amount_paid), 0) as total_repaid, MAX(created_at) as last_activity
         FROM debt_repayments WHERE status != 'VOID' GROUP BY customer_name`
      )
      .all() as Array<{ customer_name: string; total_repaid: number; last_activity: string }>

    const phones = this.db
      .prepare(
        `SELECT customer_name, customer_phone, MAX(created_at) as last_at FROM (
           SELECT customer_name, customer_phone, created_at FROM sales
             WHERE customer_phone IS NOT NULL AND customer_phone != ''
           UNION ALL
           SELECT customer_name, customer_phone, created_at FROM customer_debt_entries
             WHERE customer_phone IS NOT NULL AND customer_phone != ''
         ) GROUP BY customer_name`
      )
      .all() as Array<{ customer_name: string; customer_phone: string; last_at: string }>

    // Rows are grouped by exact spelling in SQL and folded together here by
    // customerKey, so a debt typed as "mama njeri" and one typed as "Mama Njeri"
    // before names were matched case-insensitively still land on one balance.
    type Entry = {
      displayName: string
      phone: string | null
      phoneAt: string
      totalDebt: number
      totalRepaid: number
      eventCount: number
      lastActivity: string
    }
    const entries = new Map<string, Entry>()
    const entryFor = (customerName: string): Entry => {
      const key = customerKey(customerName)
      let entry = entries.get(key)
      if (!entry) {
        entry = { displayName: customerName, phone: null, phoneAt: '', totalDebt: 0, totalRepaid: 0, eventCount: 0, lastActivity: '' }
        entries.set(key, entry)
      }
      return entry
    }
    const touch = (entry: Entry, at: string) => {
      if (at > entry.lastActivity) entry.lastActivity = at
    }
    for (const row of [...saleDebts, ...manualDebts]) {
      const entry = entryFor(row.customer_name)
      entry.totalDebt += row.total_debt
      entry.eventCount += row.event_count
      touch(entry, row.last_activity)
    }
    for (const row of repayments) {
      const entry = entryFor(row.customer_name)
      entry.totalRepaid += row.total_repaid
      touch(entry, row.last_activity)
    }
    for (const row of phones) {
      const entry = entries.get(customerKey(row.customer_name))
      if (entry && row.last_at > entry.phoneAt) {
        entry.phone = row.customer_phone
        entry.phoneAt = row.last_at
      }
    }

    const balances: CustomerBalance[] = [...entries.values()].map((entry) => ({
      customerName: entry.displayName,
      phone: entry.phone,
      totalDebt: entry.totalDebt,
      totalRepaid: entry.totalRepaid,
      outstanding: Math.max(0, Math.round((entry.totalDebt - entry.totalRepaid) * 100) / 100),
      lastActivityAt: toIsoUtc(entry.lastActivity),
      debtEventCount: entry.eventCount,
    }))

    return balances.sort((a, b) => b.outstanding - a.outstanding)
  }

  /**
   * The spelling to store for a customer: the one the shop already uses if this
   * name matches someone on record (ignoring case and extra spaces), otherwise
   * the name as typed, tidied. Keeps one person from becoming two debtors.
   */
  private canonicalCustomerName(name: string): string {
    const normalized = normalizeCustomerName(name)
    const key = customerKey(name)
    const existing = this.db
      .prepare(
        `SELECT customer_name, MIN(created_at) as first_at FROM (
           SELECT customer_name, created_at FROM sales WHERE customer_name != 'Walk-in'
           UNION ALL SELECT customer_name, created_at FROM customer_debt_entries
           UNION ALL SELECT customer_name, created_at FROM debt_repayments WHERE status != 'VOID'
         ) WHERE LOWER(TRIM(customer_name)) = ?
         GROUP BY customer_name ORDER BY first_at ASC LIMIT 1`
      )
      .get(key) as { customer_name: string } | undefined
    return existing?.customer_name ?? normalized
  }

  // What each credit sale still owes. Repayments aren't tied to the sale they were handed
  // over with, so a customer's repayments are applied oldest debt first. That is the order
  // their balance is read in, and it makes the per-sale figures add up to the customer balance.
  private debtBalancesBySale(customerName?: string): Map<number, number> {
    const filter = customerName === undefined ? '' : ' AND customer_name = ?'
    const params = customerName === undefined ? [] : [customerName]

    const sales = this.db
      .prepare(
        `SELECT id, customer_name, debt_amount, created_at FROM sales
         WHERE status != 'VOID' AND debt_amount > 0 AND customer_name != 'Walk-in'${filter}`
      )
      .all(...params) as Array<{ id: number; customer_name: string; debt_amount: number; created_at: string }>
    const manual = this.db
      .prepare(
        `SELECT customer_name, amount, created_at FROM customer_debt_entries${customerName === undefined ? '' : ' WHERE customer_name = ?'}`
      )
      .all(...params) as Array<{ customer_name: string; amount: number; created_at: string }>
    const repaid = this.db
      .prepare(
        `SELECT customer_name, COALESCE(SUM(amount_paid), 0) as total FROM debt_repayments
         WHERE status != 'VOID'${filter} GROUP BY customer_name`
      )
      .all(...params) as Array<{ customer_name: string; total: number }>

    const pool = new Map(repaid.map((row) => [row.customer_name, row.total]))
    const events = [
      ...sales.map((row) => ({ saleId: row.id, customer: row.customer_name, amount: row.debt_amount, at: row.created_at, order: row.id })),
      ...manual.map((row) => ({ saleId: null, customer: row.customer_name, amount: row.amount, at: row.created_at, order: 0 })),
    ].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.order - b.order))

    const balances = new Map<number, number>()
    for (const event of events) {
      const available = pool.get(event.customer) ?? 0
      const applied = Math.min(event.amount, available)
      pool.set(event.customer, available - applied)
      if (event.saleId !== null) balances.set(event.saleId, event.amount - applied)
    }
    return balances
  }

  private outstandingFor(customerName: string): number {
    const key = customerKey(customerName)
    return this.listCustomerBalances().find((b) => customerKey(b.customerName) === key)?.outstanding ?? 0
  }

  private assertRepaymentWithinBalance(customerName: string, amount: number): void {
    const outstanding = this.outstandingFor(customerName)
    if (outstanding <= 0) throw new Error(`${customerName} has no debt on record to pay off`)
    if (amount > outstanding + 0.005) {
      throw new Error(
        `${customerName} only owes KES ${outstanding.toLocaleString('en-KE')} — the payment can't be more than that. Check the amount.`
      )
    }
  }

  recordCustomerDebt(input: CustomerDebtInput): CustomerDebtRecord {
    if (input.amount <= 0) throw new Error('Debt amount must be greater than zero')
    const key = customerKey(input.customerName)
    if (!key || key === 'walk-in') {
      throw new Error('A named customer is required to record debt')
    }
    const customerName = this.canonicalCustomerName(input.customerName)
    const result = this.db
      .prepare(
        'INSERT INTO customer_debt_entries (shift_id, customer_name, customer_phone, amount, note) VALUES (?, ?, ?, ?, ?)'
      )
      .run(input.shiftId, customerName, input.customerPhone?.trim() || null, input.amount, input.note?.trim() || null)
    const row = this.db
      .prepare('SELECT * FROM customer_debt_entries WHERE id = ?')
      .get(Number(result.lastInsertRowid)) as {
      id: number
      shift_id: number
      customer_name: string
      customer_phone: string | null
      amount: number
      note: string | null
      created_at: string
    }
    return {
      id: row.id,
      shiftId: row.shift_id,
      customerName: row.customer_name,
      customerPhone: row.customer_phone ?? undefined,
      amount: row.amount,
      note: row.note ?? undefined,
      createdAt: toIsoUtc(row.created_at),
    }
  }

  recordDebtRepayment(input: DebtRepaymentInput): DebtRepaymentRecord {
    if (input.amountPaid <= 0) throw new Error('Repayment amount must be greater than zero')
    const customerName = this.canonicalCustomerName(input.customerName)
    this.assertRepaymentWithinBalance(customerName, input.amountPaid)
    const result = this.db
      .prepare('INSERT INTO debt_repayments (shift_id, customer_name, amount_paid, payment_method) VALUES (?, ?, ?, ?)')
      .run(input.shiftId, customerName, input.amountPaid, input.paymentMethod)
    const row = this.db
      .prepare('SELECT * FROM debt_repayments WHERE id = ?')
      .get(Number(result.lastInsertRowid)) as {
      id: number
      shift_id: number
      customer_name: string
      amount_paid: number
      payment_method: 'CASH' | 'MPESA'
      created_at: string
    }
    return {
      id: row.id,
      shiftId: row.shift_id,
      customerName: row.customer_name,
      amountPaid: row.amount_paid,
      paymentMethod: row.payment_method,
      createdAt: toIsoUtc(row.created_at),
    }
  }

  getCustomerHistory(customerName: string): CustomerHistoryEvent[] {
    const saleRows = this.db
      .prepare('SELECT id FROM sales WHERE LOWER(TRIM(customer_name)) = ? ORDER BY id DESC')
      .all(customerKey(customerName)) as Array<{ id: number }>
    const saleEvents: CustomerHistoryEvent[] = saleRows.map((row) => {
      const sale = this.getSaleOrThrow(row.id)
      return {
        type: 'SALE',
        id: sale.id,
        createdAt: sale.createdAt,
        amount: sale.totalAmount,
        items: sale.items,
        cashPaid: sale.cashPaid,
        mpesaPaid: sale.mpesaPaid,
        debtAmount: sale.debtAmount,
      }
    })

    const repaymentRows = this.db
      .prepare("SELECT * FROM debt_repayments WHERE LOWER(TRIM(customer_name)) = ? AND status != 'VOID' ORDER BY id DESC")
      .all(customerKey(customerName)) as Array<{
      id: number
      amount_paid: number
      payment_method: 'CASH' | 'MPESA'
      created_at: string
    }>
    const repaymentEvents: CustomerHistoryEvent[] = repaymentRows.map((row) => ({
      type: 'REPAYMENT',
      id: row.id,
      createdAt: toIsoUtc(row.created_at),
      amount: row.amount_paid,
      paymentMethod: row.payment_method,
    }))

    const debtEntryRows = this.db
      .prepare('SELECT * FROM customer_debt_entries WHERE LOWER(TRIM(customer_name)) = ? ORDER BY id DESC')
      .all(customerKey(customerName)) as Array<{ id: number; amount: number; note: string | null; created_at: string }>
    const debtEntryEvents: CustomerHistoryEvent[] = debtEntryRows.map((row) => ({
      type: 'DEBT_ENTRY',
      id: row.id,
      createdAt: toIsoUtc(row.created_at),
      amount: row.amount,
      note: row.note ?? undefined,
    }))

    return [...saleEvents, ...repaymentEvents, ...debtEntryEvents].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    )
  }

  // ---------- Settings ----------

  getSettings(): Record<string, string> {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>
    const settings: Record<string, string> = {}
    for (const row of rows) settings[row.key] = row.value
    return settings
  }

  setSetting(key: string, value: string): Record<string, string> {
    this.db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, value)
    return this.getSettings()
  }

  // ---------- Users & Auth ----------

  private getUserRowOrThrow(id: number): UserRow {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow | undefined
    if (!row) throw new Error(`User ${id} not found`)
    return row
  }

  countUsers(): number {
    return (this.db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count
  }

  listUsers(): UserRecord[] {
    const rows = this.db.prepare('SELECT * FROM users ORDER BY name ASC').all() as unknown as UserRow[]
    return rows.map(mapUser)
  }

  createUser(input: CreateUserInput): UserRecord {
    const name = input.name.trim()
    if (!name) throw new Error('Name is required')
    if (!/^\d{4}$/.test(input.pin)) throw new Error('PIN must be 4 digits')
    const existing = this.db
      .prepare('SELECT id FROM users WHERE lower(name) = lower(?) AND is_active = 1')
      .get(name) as { id: number } | undefined
    if (existing) throw new Error(`A staff member named "${name}" already exists`)

    const rights = normalizeRights(input.rights)
    const salt = randomBytes(16).toString('hex')
    const hash = hashPin(input.pin, salt)
    const result = this.db
      .prepare('INSERT INTO users (name, role, rights, pin_salt, pin_hash) VALUES (?, ?, ?, ?, ?)')
      .run(name, rights.length > 0 ? 'ADMIN' : 'CASHIER', JSON.stringify(rights), salt, hash)
    return mapUser(this.getUserRowOrThrow(Number(result.lastInsertRowid)))
  }

  updateUser(id: number, input: UpdateUserInput): UserRecord {
    const name = input.name.trim()
    if (!name) throw new Error('Name is required')
    const rights = normalizeRights(input.rights)
    // Someone has to be able to manage staff, or nobody can ever add or fix an account.
    if (!rights.includes('manage_staff')) {
      const others = (
        this.db
          .prepare('SELECT rights FROM users WHERE id != ? AND is_active = 1')
          .all(id) as Array<{ rights: string }>
      ).map((row) => parseRights(row.rights))
      if (!others.some((list) => list.includes('manage_staff'))) {
        throw new Error('At least one active account must keep the Manage staff right')
      }
    }
    this.db
      .prepare('UPDATE users SET name = ?, role = ?, rights = ? WHERE id = ?')
      .run(name, rights.length > 0 ? 'ADMIN' : 'CASHIER', JSON.stringify(rights), id)
    return mapUser(this.getUserRowOrThrow(id))
  }

  setUserPin(id: number, pin: string): void {
    if (!/^\d{4}$/.test(pin)) throw new Error('PIN must be 4 digits')
    const salt = randomBytes(16).toString('hex')
    const hash = hashPin(pin, salt)
    this.db.prepare('UPDATE users SET pin_salt = ?, pin_hash = ? WHERE id = ?').run(salt, hash, id)
  }

  setUserActive(id: number, isActive: boolean): UserRecord {
    this.db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, id)
    return mapUser(this.getUserRowOrThrow(id))
  }

  verifyUserLogin(userId: number, pin: string): SessionUser {
    const row = this.getUserRowOrThrow(userId)
    if (row.is_active !== 1) throw new Error('This account is deactivated')
    if (!verifyPin(pin, row.pin_salt, row.pin_hash)) throw new Error('Incorrect PIN')
    const user = mapUser(row)
    return { id: user.id, name: user.name, role: user.role, rights: user.rights }
  }

  // One till, one signed-in person. A second sign-in on top of a live session would
  // put the next person's sales under the first person's sign-in.
  signIn(input: LoginInput, signedIn: SessionUser | null): SessionUser {
    if (signedIn && signedIn.id !== input.userId) {
      throw new Error(`${signedIn.name} is signed in. They must log out before someone else can sign in`)
    }
    const user = this.verifyUserLogin(input.userId, input.pin)
    const shift = this.getActiveShift()
    if (shift && shift.userId !== null && shift.userId !== user.id) {
      if (!input.override) {
        throw new Error(`${shift.userName} has this shift open. Only they can sign in to it`)
      }
      const admin = this.verifyAdminOverride(input.override)
      this.logAudit(
        admin,
        'SHIFT_OVERRIDE_SIGN_IN',
        `${user.name} signed in to ${shift.userName}'s shift: ${input.override.reason.trim()}`
      )
    }
    this.logAudit(user, 'LOGIN')
    return user
  }

  // A shift that is open can't be left unattended: it has to be ended or handed over
  // first, or an Admin forces the logout (see forceLogout).
  signOut(signedIn: SessionUser | null): void {
    if (this.getActiveShift()) throw new Error('End the shift or hand it over before logging out')
    this.logAudit(signedIn, 'LOGOUT')
  }

  forceLogout(input: ForceLogoutInput, signedIn: SessionUser | null): void {
    if (!signedIn) throw new Error('Nobody is signed in')
    const admin = this.verifyAdminOverride(input)
    const shift = this.getActiveShift()
    this.logAudit(
      admin,
      'FORCED_LOGOUT',
      `${signedIn.name} logged out${shift ? ` mid-shift (${shift.userName})` : ''}: ${input.reason.trim()}`
    )
  }

  // Closing the app with a shift still open is only allowed as an Admin's emergency exit.
  // The shift stays open under its owner, so the next sign-in picks it up where it was.
  authoriseExitOverride(override: AdminOverride, shift: ShiftRecord): void {
    const admin = this.verifyAdminOverride(override)
    this.logAudit(
      admin,
      'EXIT_OVERRIDE',
      `Closed the app with ${shift.userName}'s shift still open: ${override.reason.trim()}`
    )
  }

  private verifyAdminOverride(override: AdminOverride): SessionUser {
    if (!override.reason.trim()) throw new Error('Write a reason for the override')
    const admin = this.verifyUserLogin(override.adminUserId, override.adminPin)
    if (!hasRight(admin, 'manage_staff')) {
      throw new Error('Only an Admin who can manage staff can authorise this')
    }
    return admin
  }

  logAudit(actingUser: SessionUser | null, action: string, details?: string): void {
    this.db
      .prepare('INSERT INTO audit_log (user_id, user_name, action, details) VALUES (?, ?, ?, ?)')
      .run(actingUser?.id ?? null, actingUser?.name ?? 'System', action, details ?? null)
  }

  listAuditLog(limit: number): AuditLogRecord[] {
    const rows = this.db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(limit) as Array<{
      id: number
      user_id: number | null
      user_name: string
      action: string
      details: string | null
      created_at: string
    }>
    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      userName: row.user_name,
      action: row.action,
      details: row.details,
      createdAt: toIsoUtc(row.created_at),
    }))
  }

  // ---------- Analytics ----------

  /**
   * The FROM/WHERE every sales-shaped query shares, in one of two shapes.
   *
   * Unfiltered it counts whole sales, which is what a till's takings are. Filtered
   * to a product it counts the *lines* of that product instead — its own subtotal
   * rather than the cart's, and the sales it appeared in rather than all of them.
   * Six queries (totals, day, weekday, hour, staff) need exactly the same switch,
   * so it lives here once rather than being written out five more times and drifting.
   */
  private salesScope(range: AnalyticsRange): {
    from: string
    where: string
    params: Array<string | number>
    amount: string
    count: string
  } {
    if (range.productId) {
      return {
        from: 'FROM sale_items si JOIN sales s ON s.id = si.sale_id',
        where: "WHERE s.created_at BETWEEN ? AND ? AND s.status != 'VOID' AND si.product_id = ?",
        params: [range.fromISO, range.toISO, range.productId],
        amount: `COALESCE(SUM(${PosDatabase.LINE_NET_SQL}),0)`,
        count: 'COUNT(DISTINCT s.id)',
      }
    }
    return {
      from: 'FROM sales s',
      where: "WHERE s.created_at BETWEEN ? AND ? AND s.status != 'VOID'",
      params: [range.fromISO, range.toISO],
      amount: 'COALESCE(SUM(s.total_amount),0)',
      count: 'COUNT(*)',
    }
  }

  private getAnalyticsSalesTotals(range: AnalyticsRange): {
    total: number
    count: number
    cash: number
    mpesa: number
    discount: number
  } {
    // cash / mpesa / discount deliberately ignore any product filter: they are
    // recorded on the sale, so under a filter they stay the shop's own totals and
    // the dashboard labels them as such.
    const shopWide = this.db
      .prepare(
        `SELECT COALESCE(SUM(${PosDatabase.NET_CASH_SQL}),0) as cash, COALESCE(SUM(mpesa_paid),0) as mpesa,
                COALESCE(SUM(discount),0) as discount
         FROM sales WHERE created_at BETWEEN ? AND ? AND status != 'VOID'`
      )
      .get(range.fromISO, range.toISO) as { cash: number; mpesa: number; discount: number }

    const scope = this.salesScope(range)
    const scoped = this.db
      .prepare(`SELECT ${scope.amount} as total, ${scope.count} as count ${scope.from} ${scope.where}`)
      .get(...scope.params) as { total: number; count: number }

    return { ...shopWide, total: scoped.total, count: scoped.count }
  }

  // Two figures, not one. Balances typed in from the old notebook used to land in
  // "debt accrued" on the day they were entered, so migrating the ledger made
  // credit look like four times that day's sales.
  private getAnalyticsDebtAccrued(range: AnalyticsRange): { fromSales: number; manual: number } {
    const fromSales = this.db
      .prepare(
        "SELECT COALESCE(SUM(debt_amount),0) as total FROM sales WHERE created_at BETWEEN ? AND ? AND status != 'VOID' AND debt_amount > 0"
      )
      .get(range.fromISO, range.toISO) as { total: number }
    const fromManualEntries = this.db
      .prepare('SELECT COALESCE(SUM(amount),0) as total FROM customer_debt_entries WHERE created_at BETWEEN ? AND ?')
      .get(range.fromISO, range.toISO) as { total: number }
    return { fromSales: fromSales.total, manual: fromManualEntries.total }
  }

  // Against the *last* delivery's price, not the average: re-pricing is about
  // what the next bag will cost to replace.
  private getBelowCost(): BelowCostRow[] {
    const rows = this.db
      .prepare(
        `SELECT id, name, buying_price_per_bag / weight_per_bag as cost_kg, retail_price_per_kg, wholesale_price_per_kg
         FROM products
         WHERE is_active = 1 AND weight_per_bag > 0 AND buying_price_per_bag > 0
         ORDER BY name ASC`
      )
      .all() as Array<{ id: number; name: string; cost_kg: number; retail_price_per_kg: number; wholesale_price_per_kg: number }>
    return rows
      .map((row) => ({
        productId: row.id,
        productName: row.name,
        costPerKg: Math.round(row.cost_kg * 100) / 100,
        retailPricePerKg: row.retail_price_per_kg,
        wholesalePricePerKg: row.wholesale_price_per_kg,
        retailBelow: row.retail_price_per_kg < row.cost_kg - 0.005,
        wholesaleBelow: row.wholesale_price_per_kg > 0 && row.wholesale_price_per_kg < row.cost_kg - 0.005,
      }))
      .filter((row) => row.retailBelow || row.wholesaleBelow)
  }

  /**
   * Days of stock left at the pace each product sold over the last 14 days — or
   * over however long the shop has been trading, if that is shorter, so a new
   * install isn't told it sells half what it does. A fixed "under five bags" rule
   * treats maize that goes in a day the same as njahi that lasts a month.
   */
  private getStockRunway(now: number = Date.now()): StockRunwayRow[] {
    const DAY = 86_400_000
    const cutoff = toSqliteUtc(new Date(now - 14 * DAY))
    // From the shop's first sale ever, not the first one inside the window: a shop
    // trading for months whose earliest sale this fortnight came a few hours in
    // would otherwise divide by 13.6 days and overstate its pace.
    const first = this.db
      .prepare("SELECT MIN(created_at) as first FROM sales WHERE status != 'VOID'")
      .get() as { first: string | null }
    if (!first.first) return []
    const windowDays = Math.min(14, Math.max(1, (now - Date.parse(toIsoUtc(first.first))) / DAY))

    const rows = this.db
      .prepare(
        `SELECT p.id, p.name, p.weight_per_bag, p.total_weight_kg,
                (SELECT COALESCE(SUM(si.quantity_kg),0) FROM sale_items si JOIN sales s ON s.id = si.sale_id
                  WHERE si.product_id = p.id AND s.status != 'VOID' AND s.created_at >= ?) as sold_kg
         FROM products p WHERE p.is_active = 1`
      )
      .all(cutoff) as Array<{ id: number; name: string; weight_per_bag: number; total_weight_kg: number; sold_kg: number }>

    return rows
      .filter((row) => row.sold_kg > 0)
      .map((row) => {
        const dailyKg = row.sold_kg / windowDays
        const stockKg = Math.max(0, row.total_weight_kg)
        return {
          productId: row.id,
          productName: row.name,
          weightPerBag: row.weight_per_bag,
          stockKg,
          dailyKg: Math.round(dailyKg * 100) / 100,
          daysLeft: Math.round((stockKg / dailyKg) * 10) / 10,
        }
      })
      .filter((row) => row.daysLeft < 7)
      .sort((a, b) => a.daysLeft - b.daysLeft)
  }

  /**
   * Outstanding debt split by how long it has been unpaid. Repayments clear the
   * oldest debt first — the way a shopkeeper's notebook is settled — so what is
   * left over is always the most recent credit.
   */
  private getDebtAging(now: number = Date.now()): { buckets: DebtAgeBuckets; debtors: AgedDebtor[] } {
    const DAY = 86_400_000
    const debts = this.db
      .prepare(
        `SELECT customer_name, debt_amount as amount, created_at FROM sales
           WHERE status != 'VOID' AND debt_amount > 0 AND customer_name != 'Walk-in'
         UNION ALL
         SELECT customer_name, amount, created_at FROM customer_debt_entries
         ORDER BY created_at ASC`
      )
      .all() as Array<{ customer_name: string; amount: number; created_at: string }>
    const repaidByKey = new Map<string, number>()
    const repayments = this.db
      .prepare("SELECT customer_name, SUM(amount_paid) as total FROM debt_repayments WHERE status != 'VOID' GROUP BY customer_name")
      .all() as Array<{ customer_name: string; total: number }>
    for (const row of repayments) {
      const key = customerKey(row.customer_name)
      repaidByKey.set(key, (repaidByKey.get(key) ?? 0) + row.total)
    }

    const buckets: DebtAgeBuckets = { underWeek: 0, weekToMonth: 0, overMonth: 0 }
    const perCustomer = new Map<string, { outstanding: number; overMonth: number; oldestAt: string | null }>()
    for (const debt of debts) {
      const key = customerKey(debt.customer_name)
      const credit = repaidByKey.get(key) ?? 0
      const cleared = Math.min(credit, debt.amount)
      repaidByKey.set(key, credit - cleared)
      const left = debt.amount - cleared
      if (left < 0.005) continue

      const ageDays = (now - Date.parse(toIsoUtc(debt.created_at))) / DAY
      if (ageDays < 7) buckets.underWeek += left
      else if (ageDays <= 30) buckets.weekToMonth += left
      else buckets.overMonth += left

      const entry = perCustomer.get(key) ?? { outstanding: 0, overMonth: 0, oldestAt: null }
      entry.outstanding += left
      if (ageDays > 30) entry.overMonth += left
      if (!entry.oldestAt) entry.oldestAt = debt.created_at
      perCustomer.set(key, entry)
    }

    const names = new Map(this.listCustomerBalances().map((b) => [customerKey(b.customerName), b]))
    const debtors: AgedDebtor[] = [...perCustomer.entries()]
      .filter(([, entry]) => entry.oldestAt)
      .map(([key, entry]) => {
        const oldestAt = toIsoUtc(entry.oldestAt as string)
        return {
          customerName: names.get(key)?.customerName ?? key,
          phone: names.get(key)?.phone ?? null,
          outstanding: Math.round(entry.outstanding * 100) / 100,
          overMonth: Math.round(entry.overMonth * 100) / 100,
          oldestUnpaidAt: oldestAt,
          oldestUnpaidDays: Math.floor((now - Date.parse(oldestAt)) / DAY),
        }
      })
      .sort((a, b) => b.outstanding - a.outstanding)

    return { buckets, debtors }
  }

  /**
   * Stock the owner took home, at cost. This one *does* honour a product filter —
   * the counter-case to the shop-wide totals above. Take-home is recorded against
   * a product, so narrowing it to that product is reporting what was written down,
   * not splitting a shared figure by guesswork the way cash or discount would be.
   */
  private getAnalyticsDomesticConsumption(range: AnalyticsRange): { costValue: number; quantityKg: number } {
    const params: Array<string | number> = [range.fromISO, range.toISO]
    let where = "WHERE created_at BETWEEN ? AND ? AND status != 'VOID'"
    if (range.productId) {
      where += ' AND product_id = ?'
      params.push(range.productId)
    }
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(cost_value),0) as cost, COALESCE(SUM(quantity_kg),0) as kg
         FROM domestic_consumption ${where}`
      )
      .get(...params) as { cost: number; kg: number }
    return { costValue: row.cost, quantityKg: row.kg }
  }

  private getAnalyticsDebtRepaid(range: AnalyticsRange): number {
    const row = this.db
      .prepare("SELECT COALESCE(SUM(amount_paid),0) as total FROM debt_repayments WHERE created_at BETWEEN ? AND ? AND status != 'VOID'")
      .get(range.fromISO, range.toISO) as { total: number }
    return row.total
  }

  // Kenya is a fixed UTC+3 offset (no DST) — shift stored UTC timestamps by 3h so
  // day/weekday/hour grouping reflects the shop's local calendar, not UTC's.
  private getAnalyticsDailyBreakdown(range: AnalyticsRange): AnalyticsDailyRow[] {
    const scope = this.salesScope(range)
    const rows = this.db
      .prepare(
        `SELECT strftime('%Y-%m-%d', s.created_at, '+3 hours') as day,
                ${scope.amount} as total, ${scope.count} as txn_count
         ${scope.from} ${scope.where}
         GROUP BY day ORDER BY day ASC`
      )
      .all(...scope.params) as Array<{ day: string; total: number; txn_count: number }>
    return rows.map((row) => ({ date: row.day, totalSales: row.total, transactionCount: row.txn_count }))
  }

  private getAnalyticsWeekdayBreakdown(range: AnalyticsRange): AnalyticsWeekdayRow[] {
    const scope = this.salesScope(range)
    const rows = this.db
      .prepare(
        `SELECT
           CASE strftime('%w', s.created_at, '+3 hours')
             WHEN '0' THEN 'Sun' WHEN '1' THEN 'Mon' WHEN '2' THEN 'Tue' WHEN '3' THEN 'Wed'
             WHEN '4' THEN 'Thu' WHEN '5' THEN 'Fri' WHEN '6' THEN 'Sat' END as weekday,
           ${scope.amount} as total, ${scope.count} as txn_count
         ${scope.from} ${scope.where}
         GROUP BY weekday`
      )
      .all(...scope.params) as Array<{ weekday: string; total: number; txn_count: number }>
    return rows.map((row) => ({ weekday: row.weekday, totalSales: row.total, transactionCount: row.txn_count }))
  }

  private getAnalyticsHourlyBreakdown(range: AnalyticsRange): AnalyticsHourlyRow[] {
    const scope = this.salesScope(range)
    const rows = this.db
      .prepare(
        `SELECT CAST(strftime('%H', s.created_at, '+3 hours') AS INTEGER) as hour,
                ${scope.amount} as total, ${scope.count} as txn_count
         ${scope.from} ${scope.where}
         GROUP BY hour`
      )
      .all(...scope.params) as Array<{ hour: number; total: number; txn_count: number }>
    const byHour = new Map(rows.map((row) => [row.hour, row]))
    return Array.from({ length: 24 }, (_, hour) => {
      const row = byHour.get(hour)
      return { hour, totalSales: row?.total ?? 0, transactionCount: row?.txn_count ?? 0 }
    })
  }

  private getAnalyticsProductRows(range: AnalyticsRange): AnalyticsProductRow[] {
    const rows = this.db
      .prepare(
        `SELECT
           p.id as product_id, p.name as product_name, p.weight_per_bag,
           SUM(si.quantity_kg) as qty, SUM(${PosDatabase.LINE_NET_SQL}) as revenue,
           SUM(${PosDatabase.LINE_NET_SQL} - si.quantity_kg * COALESCE(si.cost_per_kg, ${PosDatabase.CURRENT_COST_SQL})) as est_profit
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         JOIN products p ON p.id = si.product_id
         WHERE s.created_at BETWEEN ? AND ? AND s.status != 'VOID'
           ${range.productId ? 'AND si.product_id = ?' : ''}
         GROUP BY si.product_id
         ORDER BY revenue DESC`
      )
      .all(...(range.productId ? [range.fromISO, range.toISO, range.productId] : [range.fromISO, range.toISO])) as Array<{
      product_id: number
      product_name: string
      weight_per_bag: number
      qty: number
      revenue: number
      est_profit: number
    }>
    return rows.map((row) => ({
      productId: row.product_id,
      productName: row.product_name,
      weightPerBag: row.weight_per_bag,
      quantityKg: row.qty,
      revenue: row.revenue,
      estimatedProfit: row.est_profit,
    }))
  }

  private getAnalyticsProductsWithNoSalesCount(range: AnalyticsRange): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM products p
         WHERE p.is_active = 1 AND NOT EXISTS (
           SELECT 1 FROM sale_items si
           JOIN sales s ON s.id = si.sale_id
           WHERE si.product_id = p.id AND s.created_at BETWEEN ? AND ? AND s.status != 'VOID'
         )`
      )
      .get(range.fromISO, range.toISO) as { count: number }
    return row.count
  }

  private getAnalyticsStaffBreakdown(range: AnalyticsRange): AnalyticsStaffRow[] {
    const scope = this.salesScope(range)
    const rows = this.db
      .prepare(
        `SELECT sh.user_id as user_id, sh.user_name as user_name,
                ${scope.amount} as total, ${scope.count} as txn_count
         ${scope.from}
         JOIN shifts sh ON sh.id = s.shift_id
         ${scope.where}
         GROUP BY sh.user_id, sh.user_name
         ORDER BY total DESC`
      )
      .all(...scope.params) as Array<{ user_id: number | null; user_name: string; total: number; txn_count: number }>
    return rows.map((row) => ({
      userId: row.user_id,
      userName: row.user_name,
      totalSales: row.total,
      transactionCount: row.txn_count,
    }))
  }

  private getAnalyticsExpensesByCategory(range: AnalyticsRange): AnalyticsExpenseCategoryRow[] {
    const rows = this.db
      .prepare(
        `SELECT category, COALESCE(SUM(amount),0) as total FROM expenses
         WHERE created_at BETWEEN ? AND ? GROUP BY category ORDER BY total DESC`
      )
      .all(range.fromISO, range.toISO) as Array<{ category: string; total: number }>
    return rows.map((row) => ({ category: row.category, totalAmount: row.total }))
  }

  // Not limited to products that have been selling: a product that is empty and
  // hasn't sold this fortnight is exactly the one the owner needs to hear about.
  private getLowStockProducts(): LowStockRow[] {
    const rows = this.db
      .prepare(
        `SELECT id, name, weight_per_bag, total_weight_kg, min_stock_alert_kg FROM products
         WHERE is_active = 1 AND total_weight_kg <= min_stock_alert_kg
         ORDER BY total_weight_kg ASC`
      )
      .all() as Array<{ id: number; name: string; weight_per_bag: number; total_weight_kg: number; min_stock_alert_kg: number }>
    return rows.map((row) => ({
      productId: row.id,
      productName: row.name,
      weightPerBag: row.weight_per_bag,
      stockKg: Math.max(0, row.total_weight_kg),
      alertKg: row.min_stock_alert_kg,
    }))
  }

  // Only the shortfall side counts. A till that was over one night does not offset
  // a till that was short another night.
  private getAnalyticsShiftShortfall(range: AnalyticsRange): { count: number; total: number } {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as count, COALESCE(SUM(MIN(COALESCE(variance_cash, 0), 0) + MIN(COALESCE(variance_mpesa, 0), 0)), 0) as total
         FROM shifts
         WHERE status = 'CLOSED' AND end_time BETWEEN ? AND ?
           AND (COALESCE(variance_cash, 0) < 0 OR COALESCE(variance_mpesa, 0) < 0)`
      )
      .get(range.fromISO, range.toISO) as { count: number; total: number }
    return { count: row.count, total: -row.total }
  }

  private getAnalyticsLowStockCount(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM products WHERE is_active = 1 AND total_weight_kg <= min_stock_alert_kg')
      .get() as { count: number }
    return row.count
  }

  private getAnalyticsVoidStats(range: AnalyticsRange): { count: number; value: number } {
    const row = this.db
      .prepare(
        "SELECT COUNT(*) as count, COALESCE(SUM(total_amount),0) as total FROM sales WHERE status = 'VOID' AND voided_at BETWEEN ? AND ?"
      )
      .get(range.fromISO, range.toISO) as { count: number; total: number }
    return { count: row.count, value: row.total }
  }

  getAnalyticsSummary(range: AnalyticsRange): AnalyticsSummary {
    const salesTotals = this.getAnalyticsSalesTotals(range)
    const expenseTotal = this.db
      .prepare('SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE created_at BETWEEN ? AND ?')
      .get(range.fromISO, range.toISO) as { total: number }
    const debtAccrued = this.getAnalyticsDebtAccrued(range)
    const debtAging = this.getDebtAging()
    const debtRepaidInPeriod = this.getAnalyticsDebtRepaid(range)
    const outstandingTotal = this.listCustomerBalances().reduce((sum, balance) => sum + balance.outstanding, 0)
    const topDebtors = this.listCustomerBalances().slice(0, 10)

    const productRows = this.getAnalyticsProductRows(range)
    const topProducts = productRows.slice(0, 10)
    const leastSellingProducts = [...productRows].sort((a, b) => a.quantityKg - b.quantityKg).slice(0, 10)
    // Not truncated: the Quantity sold breakdown accounts for the whole weight,
    // and a shop's catalog is dozens of rows, not thousands.
    const productsByQuantity = [...productRows].sort((a, b) => b.quantityKg - a.quantityKg)
    // Take-home leaves the shelf without ever being sold, so its cost belongs
    // against profit but *not* in COGS — COGS is the cost of goods sold, and these
    // weren't. Kept as its own line so the deduction stays visible rather than
    // being quietly folded into the cost of trading.
    const domesticConsumption = this.getAnalyticsDomesticConsumption(range)
    const salesProfit = productRows.reduce((sum, row) => sum + row.estimatedProfit, 0)
    const estimatedGrossProfit = salesProfit - domesticConsumption.costValue
    const estimatedCogs = productRows.reduce((sum, row) => sum + (row.revenue - row.estimatedProfit), 0)
    const totalQuantitySoldKg = productRows.reduce((sum, row) => sum + row.quantityKg, 0)

    // The product filter has to survive the step back, or "vs prior period" would
    // compare one product's week against the whole shop's.
    const previousRange = { ...shiftRangeBack(range), productId: range.productId ?? null }
    const previousSalesTotals = this.getAnalyticsSalesTotals(previousRange)
    const previousProductRows = this.getAnalyticsProductRows(previousRange)
    // Net of take-home on both sides of the comparison. Subtracting it from this
    // period alone would show a fall in profit that is only the change in how the
    // figure is worked out.
    const previousEstimatedProfit =
      previousProductRows.reduce((sum, row) => sum + row.estimatedProfit, 0) -
      this.getAnalyticsDomesticConsumption(previousRange).costValue
    const previousExpenses = this.db
      .prepare('SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE created_at BETWEEN ? AND ?')
      .get(previousRange.fromISO, previousRange.toISO) as { total: number }

    const voidStats = this.getAnalyticsVoidStats(range)

    // Named from the catalog, not from productRows: a product that sold nothing in
    // the period has no row there, and the dashboard still has to be able to say
    // whose empty numbers it is showing.
    const filteredProduct = range.productId
      ? (this.db.prepare('SELECT id, name FROM products WHERE id = ?').get(range.productId) as
          | { id: number; name: string }
          | undefined)
      : undefined

    return {
      range,
      productFilter: filteredProduct
        ? { productId: filteredProduct.id, productName: filteredProduct.name }
        : null,
      totalSales: salesTotals.total,
      estimatedGrossProfit,
      estimatedCogs,
      totalExpenses: expenseTotal.total,
      domesticConsumptionCost: domesticConsumption.costValue,
      domesticConsumptionKg: domesticConsumption.quantityKg,
      debtAccrued: debtAccrued.fromSales,
      debtAddedManually: debtAccrued.manual,
      moneyKept: estimatedGrossProfit - expenseTotal.total,
      totalTransactions: salesTotals.count,
      averageBasketValue: salesTotals.count > 0 ? salesTotals.total / salesTotals.count : 0,
      previousPeriod: {
        totalSales: previousSalesTotals.total,
        totalTransactions: previousSalesTotals.count,
        estimatedProfit: previousEstimatedProfit,
        moneyKept: previousEstimatedProfit - previousExpenses.total,
      },

      cashCollected: salesTotals.cash,
      mpesaCollected: salesTotals.mpesa,
      debtRepaidInPeriod,
      netDebtMovement: debtAccrued.fromSales + debtAccrued.manual - debtRepaidInPeriod,
      totalDebtOutstanding: outstandingTotal,
      totalQuantitySoldKg,
      totalDiscountGiven: salesTotals.discount,

      topProducts,
      leastSellingProducts,
      productsByQuantity,
      productsWithNoSalesCount: this.getAnalyticsProductsWithNoSalesCount(range),

      topDebtors,
      belowCost: this.getBelowCost(),
      stockRunway: this.getStockRunway(),
      lowStockProducts: this.getLowStockProducts(),
      debtAging: debtAging.buckets,
      agedDebtors: debtAging.debtors.slice(0, 10),

      shiftShortfall: this.getAnalyticsShiftShortfall(range),

      dailyBreakdown: this.getAnalyticsDailyBreakdown(range),
      weekdayBreakdown: this.getAnalyticsWeekdayBreakdown(range),
      hourlyBreakdown: this.getAnalyticsHourlyBreakdown(range),

      salesByStaff: this.getAnalyticsStaffBreakdown(range),

      expensesByCategory: this.getAnalyticsExpensesByCategory(range),
      lowStockProductCount: this.getAnalyticsLowStockCount(),
      voidedSaleCount: voidStats.count,
      voidedSaleValue: voidStats.value,
    }
  }

  // ---------- Receipts ----------

  private composeReceiptDraft(sale: SaleRecord): ReceiptDraft {
    const settings = this.getSettings()
    return {
      sale,
      shopName: settings.shop_name ?? 'Duka POS',
      shopTagline: settings.shop_tagline ?? '',
      footerNote: settings.receipt_footer ?? 'Thank you for your business!',
      headerNote: settings.receipt_header_note ?? '',
      cashierName: sale.cashierName,
      showDualUnit: settings.receipt_show_dual_unit === 'true',
      showCashierName: settings.receipt_show_cashier_name !== 'false',
      showDebtBalance: settings.receipt_show_debt_balance !== 'false',
    }
  }

  buildReceiptDraft(saleId: number): ReceiptDraft {
    return this.composeReceiptDraft(this.getSaleOrThrow(saleId))
  }

  buildTestReceiptDraft(): ReceiptDraft {
    const sampleSale: SaleRecord = {
      id: 0,
      shiftId: 0,
      cashierName: 'Test Cashier',
      customerName: 'Test Customer',
      customerPhone: null,
      totalAmount: 500,
      cashPaid: 500,
      mpesaPaid: 0,
      mpesaRef: null,
      debtAmount: 0,
      debtOutstanding: 0,
      discount: 0,
      status: 'COMPLETED',
      voidReason: null,
      voidedAt: null,
      createdAt: new Date().toISOString(),
      items: [
        {
          id: 0,
          productId: 0,
          productName: 'Sample Product',
          quantityKg: 5,
          unitPricePerKg: 100,
          subtotal: 500,
          weightPerBag: 90,
        },
      ],
    }
    return this.composeReceiptDraft(sampleSale)
  }
}
