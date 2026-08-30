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
  AuditLogRecord,
  CategoryRecord,
  CloseShiftInput,
  CreateUserInput,
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
  SaleItemRecord,
  SaleRecord,
  SessionUser,
  ShiftCloseSummary,
  ShiftRecord,
  StockReceiptInput,
  StockReceiptRecord,
  UpdateUserInput,
  UserRecord,
  UserRole,
} from '../shared/ipc'
import { shiftRangeBack, toIsoUtc } from '../shared/period'
import { DEFAULT_CATEGORIES, DEFAULT_PRICE_LIST } from '../shared/defaultPriceList'
import type { DefaultPriceListItem } from '../shared/defaultPriceList'

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
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
  subtotal REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shift_id INTEGER NOT NULL REFERENCES shifts(id),
  category TEXT NOT NULL,
  amount REAL NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS domestic_consumption (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shift_id INTEGER NOT NULL REFERENCES shifts(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity_kg REAL NOT NULL,
  cost_value REAL NOT NULL,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS debt_repayments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shift_id INTEGER NOT NULL REFERENCES shifts(id),
  customer_name TEXT NOT NULL,
  amount_paid REAL NOT NULL,
  payment_method TEXT CHECK(payment_method IN ('CASH', 'MPESA')) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT CHECK(role IN ('ADMIN', 'CASHIER')) NOT NULL DEFAULT 'CASHIER',
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
  // Only present on the Transactions-page query, which joins the shift.
  user_name?: string | null
  created_at: string
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
  total_transactions: number | null
  status: 'ACTIVE' | 'CLOSED'
}

function mapProduct(row: ProductRow): ProductRecord {
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
    totalTransactions: row.total_transactions,
    status: row.status,
  }
}

interface UserRow {
  id: number
  name: string
  role: UserRole
  pin_salt: string
  pin_hash: string
  is_active: number
  created_at: string
}

function mapUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
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

  private ensureColumn(table: string, column: string, definition: string): void {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
    if (!columns.some((col) => col.name === column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
    }
  }

  private migrateSchema(): void {
    this.ensureColumn('sales', 'customer_phone', 'TEXT')
    this.ensureColumn('customer_debt_entries', 'customer_phone', 'TEXT')
    this.ensureColumn('sales', 'status', "TEXT DEFAULT 'COMPLETED'")
    this.ensureColumn('sales', 'void_reason', 'TEXT')
    this.ensureColumn('sales', 'voided_at', 'DATETIME')
    this.ensureColumn('shifts', 'opening_notes', 'TEXT')
    this.ensureColumn('shifts', 'total_sales', 'REAL')
    this.ensureColumn('shifts', 'total_expenses', 'REAL')
    this.ensureColumn('shifts', 'total_domestic_consumption', 'REAL')
    this.ensureColumn('shifts', 'total_transactions', 'INTEGER')
    this.ensureColumn('shifts', 'user_id', 'INTEGER REFERENCES users(id)')
    // Expenses predate having a payment method. Existing rows default to CASH,
    // which is what a shop expense almost always was before the field existed.
    this.ensureColumn('expenses', 'payment_method', "TEXT DEFAULT 'CASH'")
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
           p.wholesale_price_per_kg, p.min_stock_alert_kg, p.is_active
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
  `

  listProducts(): ProductRecord[] {
    const rows = this.db
      .prepare(`${PosDatabase.PRODUCT_SELECT} ORDER BY p.name ASC`)
      .all() as unknown as ProductRow[]
    return rows.map(mapProduct)
  }

  private getProductOrThrow(id: number): ProductRecord {
    const row = this.db
      .prepare(`${PosDatabase.PRODUCT_SELECT} WHERE p.id = ?`)
      .get(id) as unknown as ProductRow | undefined
    if (!row) throw new Error(`Product ${id} not found`)
    return mapProduct(row)
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
           retail_price_per_kg, wholesale_price_per_kg, min_stock_alert_kg, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        input.isActive ? 1 : 0
      )
    return this.getProductOrThrow(Number(result.lastInsertRowid))
  }

  updateProduct(id: number, input: ProductInput): ProductRecord {
    if (input.wholesalePricePerKg > 0 && input.wholesalePricePerKg > input.retailPricePerKg) {
      throw new Error('Wholesale price cannot be higher than retail price')
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
    return this.getProductOrThrow(id)
  }

  setProductActive(id: number, isActive: boolean): ProductRecord {
    this.db.prepare('UPDATE products SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, id)
    return this.getProductOrThrow(id)
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

  receiveStock(input: StockReceiptInput): ProductRecord {
    if (input.addedKg <= 0) throw new Error('Added quantity must be greater than zero')
    const product = this.getProductOrThrow(input.productId)
    const nextBuyingPrice = input.newBuyingPricePerBag ?? product.buyingPricePerBag

    this.db.exec('BEGIN')
    try {
      this.db
        .prepare('UPDATE products SET total_weight_kg = total_weight_kg + ?, buying_price_per_bag = ? WHERE id = ?')
        .run(input.addedKg, nextBuyingPrice, input.productId)
      this.db
        .prepare(
          'INSERT INTO stock_receipts (shift_id, product_id, added_kg, buying_price_per_bag, reference_note) VALUES (?, ?, ?, ?, ?)'
        )
        .run(input.shiftId, input.productId, input.addedKg, nextBuyingPrice, input.referenceNote?.trim() || null)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }

    return this.getProductOrThrow(input.productId)
  }

  listStockReceipts(limit: number): StockReceiptRecord[] {
    const rows = this.db
      .prepare(
        `SELECT sr.id, sr.shift_id, s.user_name, sr.product_id, p.name as product_name,
                sr.added_kg, sr.buying_price_per_bag, sr.reference_note, sr.created_at
         FROM stock_receipts sr
         JOIN products p ON p.id = sr.product_id
         JOIN shifts s ON s.id = sr.shift_id
         ORDER BY sr.id DESC LIMIT ?`
      )
      .all(limit) as Array<{
      id: number
      shift_id: number
      user_name: string
      product_id: number
      product_name: string
      added_kg: number
      buying_price_per_bag: number
      reference_note: string | null
      created_at: string
    }>
    return rows.map((row) => ({
      id: row.id,
      shiftId: row.shift_id,
      userName: row.user_name,
      productId: row.product_id,
      productName: row.product_name,
      addedKg: row.added_kg,
      buyingPricePerBag: row.buying_price_per_bag,
      referenceNote: row.reference_note,
      createdAt: toIsoUtc(row.created_at),
    }))
  }

  // ---------- Shifts ----------

  getActiveShift(): ShiftRecord | null {
    const row = this.db
      .prepare("SELECT * FROM shifts WHERE status = 'ACTIVE' ORDER BY id DESC LIMIT 1")
      .get() as unknown as ShiftRow | undefined
    return row ? mapShift(row) : null
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

  closeShift(input: CloseShiftInput): ShiftCloseSummary {
    const shiftRow = this.db.prepare('SELECT * FROM shifts WHERE id = ?').get(input.shiftId) as unknown as
      | ShiftRow
      | undefined
    if (!shiftRow || shiftRow.status !== 'ACTIVE') throw new Error('Shift is not active')

    const salesTotals = this.db
      .prepare(
        "SELECT COALESCE(SUM(cash_paid),0) as cash, COALESCE(SUM(mpesa_paid),0) as mpesa, COALESCE(SUM(total_amount),0) as total, COUNT(*) as count FROM sales WHERE shift_id = ? AND status != 'VOID'"
      )
      .get(input.shiftId) as { cash: number; mpesa: number; total: number; count: number }

    const repaymentTotals = this.db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN payment_method = 'CASH' THEN amount_paid ELSE 0 END),0) as cash,
           COALESCE(SUM(CASE WHEN payment_method = 'MPESA' THEN amount_paid ELSE 0 END),0) as mpesa
         FROM debt_repayments WHERE shift_id = ?`
      )
      .get(input.shiftId) as { cash: number; mpesa: number }

    const expenseTotal = this.db
      .prepare('SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE shift_id = ?')
      .get(input.shiftId) as { total: number }

    const consumptionTotal = this.db
      .prepare('SELECT COALESCE(SUM(cost_value),0) as total FROM domestic_consumption WHERE shift_id = ?')
      .get(input.shiftId) as { total: number }

    const expectedCash = shiftRow.opening_cash + salesTotals.cash + repaymentTotals.cash - expenseTotal.total
    const expectedMpesa = shiftRow.opening_mpesa + salesTotals.mpesa + repaymentTotals.mpesa

    this.db
      .prepare(
        `UPDATE shifts SET
          end_time = CURRENT_TIMESTAMP, closing_cash_actual = ?, closing_mpesa_actual = ?,
          expected_cash = ?, expected_mpesa = ?, variance_cash = ?, variance_mpesa = ?,
          notes = ?, total_sales = ?, total_expenses = ?, total_domestic_consumption = ?,
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
      debtAmount: saleRow.debt_amount,
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

    return { ...this.mapSaleRow(saleRow), items: itemRows.map((row) => this.mapSaleItemRow(row)) }
  }

  recordSale(input: SaleInput, actingUser: SessionUser): SaleRecord {
    if (input.items.length === 0) throw new Error('Sale must have at least one item')

    if (input.discount > 0 && actingUser.role === 'CASHIER') {
      const allowed = this.getSettings().perm_allow_cashier_discount === 'true'
      if (!allowed) throw new Error('You are not permitted to apply a discount')
    }

    for (const item of input.items) {
      const product = this.getProductOrThrow(item.productId)
      if (product.totalWeightKg < item.quantityKg) {
        throw new Error(`Insufficient stock for ${product.name}: have ${product.totalWeightKg}kg, need ${item.quantityKg}kg`)
      }
    }

    const subtotal = input.items.reduce((sum, item) => sum + item.quantityKg * item.unitPricePerKg, 0)
    const totalAmount = Math.max(0, subtotal - input.discount)
    const paid = input.cashPaid + input.mpesaPaid
    const debtAmount = Math.max(0, totalAmount - paid)
    const customerName = input.customerName.trim() || 'Walk-in'

    if (debtAmount > 0 && customerName.toLowerCase() === 'walk-in') {
      throw new Error('A named customer is required to record a sale on credit')
    }

    this.db.exec('BEGIN')
    try {
      const saleResult = this.db
        .prepare(
          `INSERT INTO sales (shift_id, customer_name, customer_phone, total_amount, cash_paid, mpesa_paid, debt_amount, discount)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.shiftId,
          customerName,
          input.customerPhone?.trim() || null,
          totalAmount,
          input.cashPaid,
          input.mpesaPaid,
          debtAmount,
          input.discount
        )
      const saleId = Number(saleResult.lastInsertRowid)

      const insertItem = this.db.prepare(
        'INSERT INTO sale_items (sale_id, product_id, quantity_kg, unit_price_per_kg, subtotal) VALUES (?, ?, ?, ?, ?)'
      )
      const decrementStock = this.db.prepare('UPDATE products SET total_weight_kg = total_weight_kg - ? WHERE id = ?')

      for (const item of input.items) {
        const itemSubtotal = item.quantityKg * item.unitPricePerKg
        insertItem.run(saleId, item.productId, item.quantityKg, item.unitPricePerKg, itemSubtotal)
        decrementStock.run(item.quantityKg, item.productId)
      }

      this.db.exec('COMMIT')
      return this.getSaleOrThrow(saleId)
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
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

    return saleRows.map((row) => ({ ...this.mapSaleRow(row), items: itemsBySaleId.get(row.id) ?? [] }))
  }

  voidSale(saleId: number, reason: string, actingUser: SessionUser): SaleRecord {
    const trimmedReason = reason.trim()
    if (!trimmedReason) throw new Error('A reason is required to void a sale')

    if (actingUser.role === 'CASHIER') {
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
      this.db.exec('COMMIT')
      this.logAudit(actingUser, 'VOID_SALE', `sale #${saleId}: ${trimmedReason}`)
      return this.getSaleOrThrow(saleId)
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
      recordedBy: row.user_name ?? undefined,
      createdAt: toIsoUtc(row.created_at),
    }
  }

  recordExpense(input: ExpenseInput): ExpenseRecord {
    if (input.amount <= 0) throw new Error('Expense amount must be greater than zero')
    const result = this.db
      .prepare(
        'INSERT INTO expenses (shift_id, category, amount, description, payment_method) VALUES (?, ?, ?, ?, ?)'
      )
      .run(
        input.shiftId,
        input.category.trim(),
        input.amount,
        input.description?.trim() ?? null,
        input.paymentMethod === 'MPESA' ? 'MPESA' : 'CASH'
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

  // ---------- Domestic Consumption ----------

  recordDomesticConsumption(input: DomesticConsumptionInput): DomesticConsumptionRecord {
    const product = this.getProductOrThrow(input.productId)
    if (product.totalWeightKg < input.quantityKg) {
      throw new Error(`Insufficient stock for ${product.name}`)
    }

    this.db.exec('BEGIN')
    try {
      const result = this.db
        .prepare(
          'INSERT INTO domestic_consumption (shift_id, product_id, quantity_kg, cost_value, notes) VALUES (?, ?, ?, ?, ?)'
        )
        .run(input.shiftId, input.productId, input.quantityKg, input.costValue, input.notes?.trim() ?? null)
      this.db
        .prepare('UPDATE products SET total_weight_kg = total_weight_kg - ? WHERE id = ?')
        .run(input.quantityKg, input.productId)
      this.db.exec('COMMIT')

      const row = this.db
        .prepare('SELECT * FROM domestic_consumption WHERE id = ?')
        .get(Number(result.lastInsertRowid)) as {
        id: number
        shift_id: number
        product_id: number
        quantity_kg: number
        cost_value: number
        notes: string | null
        created_at: string
      }
      return {
        id: row.id,
        shiftId: row.shift_id,
        productId: row.product_id,
        productName: product.name,
        quantityKg: row.quantity_kg,
        costValue: row.cost_value,
        notes: row.notes ?? undefined,
        createdAt: toIsoUtc(row.created_at),
      }
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  listDomesticConsumption(limit: number): DomesticConsumptionRecord[] {
    const rows = this.db
      .prepare(
        `SELECT dc.id, dc.shift_id, s.user_name, dc.product_id, p.name as product_name,
                dc.quantity_kg, dc.cost_value, dc.notes, dc.created_at
         FROM domestic_consumption dc
         JOIN products p ON p.id = dc.product_id
         JOIN shifts s ON s.id = dc.shift_id
         ORDER BY dc.id DESC LIMIT ?`
      )
      .all(limit) as Array<{
      id: number
      shift_id: number
      user_name: string
      product_id: number
      product_name: string
      quantity_kg: number
      cost_value: number
      notes: string | null
      created_at: string
    }>
    return rows.map((row) => ({
      id: row.id,
      shiftId: row.shift_id,
      recordedBy: row.user_name,
      productId: row.product_id,
      productName: row.product_name,
      quantityKg: row.quantity_kg,
      costValue: row.cost_value,
      notes: row.notes ?? undefined,
      createdAt: toIsoUtc(row.created_at),
    }))
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
         FROM debt_repayments GROUP BY customer_name`
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
      .all() as Array<{ customer_name: string; customer_phone: string }>
    const phoneMap = new Map(phones.map((row) => [row.customer_name, row.customer_phone]))

    const debtMap = new Map<string, { totalDebt: number; eventCount: number; lastActivity: string }>()
    const accrue = (customerName: string, amount: number, eventCount: number, lastActivity: string) => {
      const existing = debtMap.get(customerName)
      if (!existing) {
        debtMap.set(customerName, { totalDebt: amount, eventCount, lastActivity })
        return
      }
      existing.totalDebt += amount
      existing.eventCount += eventCount
      if (lastActivity > existing.lastActivity) existing.lastActivity = lastActivity
    }
    for (const row of saleDebts) accrue(row.customer_name, row.total_debt, row.event_count, row.last_activity)
    for (const row of manualDebts) accrue(row.customer_name, row.total_debt, row.event_count, row.last_activity)

    const repaidMap = new Map(repayments.map((row) => [row.customer_name, row]))

    const customerNames = new Set([...debtMap.keys(), ...repaidMap.keys()])
    const balances: CustomerBalance[] = [...customerNames].map((customerName) => {
      const debt = debtMap.get(customerName)
      const repaid = repaidMap.get(customerName)
      const totalDebt = debt?.totalDebt ?? 0
      const totalRepaid = repaid?.total_repaid ?? 0
      const lastActivity =
        debt && repaid ? (repaid.last_activity > debt.lastActivity ? repaid.last_activity : debt.lastActivity)
        : (debt?.lastActivity ?? repaid?.last_activity ?? '')
      return {
        customerName,
        phone: phoneMap.get(customerName) ?? null,
        totalDebt,
        totalRepaid,
        outstanding: Math.max(0, totalDebt - totalRepaid),
        lastActivityAt: lastActivity,
        debtEventCount: debt?.eventCount ?? 0,
      }
    })

    return balances.sort((a, b) => b.outstanding - a.outstanding)
  }

  recordCustomerDebt(input: CustomerDebtInput): CustomerDebtRecord {
    if (input.amount <= 0) throw new Error('Debt amount must be greater than zero')
    const customerName = input.customerName.trim()
    if (!customerName || customerName.toLowerCase() === 'walk-in') {
      throw new Error('A named customer is required to record debt')
    }
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
    const result = this.db
      .prepare('INSERT INTO debt_repayments (shift_id, customer_name, amount_paid, payment_method) VALUES (?, ?, ?, ?)')
      .run(input.shiftId, input.customerName.trim(), input.amountPaid, input.paymentMethod)
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
      .prepare('SELECT id FROM sales WHERE customer_name = ? ORDER BY id DESC')
      .all(customerName) as Array<{ id: number }>
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
      .prepare('SELECT * FROM debt_repayments WHERE customer_name = ? ORDER BY id DESC')
      .all(customerName) as Array<{
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
      .prepare('SELECT * FROM customer_debt_entries WHERE customer_name = ? ORDER BY id DESC')
      .all(customerName) as Array<{ id: number; amount: number; note: string | null; created_at: string }>
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

    const salt = randomBytes(16).toString('hex')
    const hash = hashPin(input.pin, salt)
    const result = this.db
      .prepare('INSERT INTO users (name, role, pin_salt, pin_hash) VALUES (?, ?, ?, ?)')
      .run(name, input.role, salt, hash)
    return mapUser(this.getUserRowOrThrow(Number(result.lastInsertRowid)))
  }

  updateUser(id: number, input: UpdateUserInput): UserRecord {
    const name = input.name.trim()
    if (!name) throw new Error('Name is required')
    this.db.prepare('UPDATE users SET name = ?, role = ? WHERE id = ?').run(name, input.role, id)
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
    return { id: row.id, name: row.name, role: row.role }
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
        amount: 'COALESCE(SUM(si.subtotal),0)',
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
        `SELECT COALESCE(SUM(cash_paid),0) as cash, COALESCE(SUM(mpesa_paid),0) as mpesa,
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

  private getAnalyticsDebtAccrued(range: AnalyticsRange): number {
    const fromSales = this.db
      .prepare(
        "SELECT COALESCE(SUM(debt_amount),0) as total FROM sales WHERE created_at BETWEEN ? AND ? AND status != 'VOID' AND debt_amount > 0"
      )
      .get(range.fromISO, range.toISO) as { total: number }
    const fromManualEntries = this.db
      .prepare('SELECT COALESCE(SUM(amount),0) as total FROM customer_debt_entries WHERE created_at BETWEEN ? AND ?')
      .get(range.fromISO, range.toISO) as { total: number }
    return fromSales.total + fromManualEntries.total
  }

  /**
   * Stock the owner took home, at cost. This one *does* honour a product filter —
   * the counter-case to the shop-wide totals above. Take-home is recorded against
   * a product, so narrowing it to that product is reporting what was written down,
   * not splitting a shared figure by guesswork the way cash or discount would be.
   */
  private getAnalyticsDomesticConsumption(range: AnalyticsRange): { costValue: number; quantityKg: number } {
    const params: Array<string | number> = [range.fromISO, range.toISO]
    let where = 'WHERE created_at BETWEEN ? AND ?'
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
      .prepare('SELECT COALESCE(SUM(amount_paid),0) as total FROM debt_repayments WHERE created_at BETWEEN ? AND ?')
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
           p.id as product_id, p.name as product_name,
           SUM(si.quantity_kg) as qty, SUM(si.subtotal) as revenue,
           SUM(si.subtotal - si.quantity_kg *
             (CASE WHEN p.weight_per_bag > 0 THEN p.buying_price_per_bag / p.weight_per_bag ELSE 0 END)
           ) as est_profit
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
      qty: number
      revenue: number
      est_profit: number
    }>
    return rows.map((row) => ({
      productId: row.product_id,
      productName: row.product_name,
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
      debtAccrued,
      totalTransactions: salesTotals.count,
      averageBasketValue: salesTotals.count > 0 ? salesTotals.total / salesTotals.count : 0,
      previousPeriod: {
        totalSales: previousSalesTotals.total,
        totalTransactions: previousSalesTotals.count,
        estimatedProfit: previousEstimatedProfit,
      },

      cashCollected: salesTotals.cash,
      mpesaCollected: salesTotals.mpesa,
      debtRepaidInPeriod,
      netDebtMovement: debtAccrued - debtRepaidInPeriod,
      totalDebtOutstanding: outstandingTotal,
      totalQuantitySoldKg,
      totalDiscountGiven: salesTotals.discount,

      topProducts,
      leastSellingProducts,
      productsByQuantity,
      productsWithNoSalesCount: this.getAnalyticsProductsWithNoSalesCount(range),

      topDebtors,

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
      debtAmount: 0,
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
