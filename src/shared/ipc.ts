// Shared type contracts between main (database) and renderer (UI) processes.
// Everything crossing the `window.electronAPI` bridge is declared here.

import type { AdminRight } from './rights'
import type { PeriodRange } from './period'
export type { AdminRight } from './rights'

export interface CategoryRecord {
  id: number
  name: string
}

export interface ImportPriceListResult {
  created: number
  skippedExisting: string[]
}

/**
 * A fixed total price for one specific weight of a product — "a quarter kilo
 * of Ndengu is KSh 40 flat", not "KSh 160/kg". Small quantities of a loose
 * good often don't scale linearly off the per-kg price (a shopkeeper's
 * quarter-kilo scoop isn't a quarter of a kilo's shelf price), so these
 * override `resolveUnitPrice` at their exact weight only — anything else still
 * falls back to the retail/wholesale tier, same as a product with none set.
 */
export interface ProductPriceBreak {
  quantityKg: number
  price: number
}

/**
 * A container the shop measures this product out in — a gorogoro, kasuku or
 * debe — and what one of it weighs *for this grain*. Per product because the
 * same tin holds a different weight of maize than of beans, and the weights
 * vary by market, so the shop sets them rather than the app guessing.
 */
export interface SaleUnit {
  name: string
  kg: number
}

export interface ProductRecord {
  id: number
  name: string
  categoryId: number | null
  categoryName: string | null
  weightPerBag: number
  totalWeightKg: number
  buyingPricePerBag: number
  retailPricePerKg: number
  wholesalePricePerKg: number
  minStockAlertKg: number
  isActive: boolean
  /** Can be sent to posho. Only these products appear in "Send to posho". */
  isMillable: boolean
  /** Can be a milled output. Only these products appear in "Milled into". */
  isMillOutput: boolean
  priceBreaks: ProductPriceBreak[]
  saleUnits: SaleUnit[]
}

export interface ProductInput {
  name: string
  categoryId: number | null
  weightPerBag: number
  totalWeightKg: number
  buyingPricePerBag: number
  retailPricePerKg: number
  wholesalePricePerKg: number
  minStockAlertKg: number
  isActive: boolean
  /** Omitted leaves the product's existing flag untouched. */
  isMillable?: boolean
  /** Omitted leaves the product's existing flag untouched. */
  isMillOutput?: boolean
  /** Omitted leaves the product's existing units untouched. */
  saleUnits?: SaleUnit[]
}

// Stock goes in at the product's current buying price. Nobody changes that price on a
// delivery: it is changed on the product, by someone with Manage products.
export interface StockReceiptInput {
  shiftId: number
  productId: number
  addedKg: number
  referenceNote?: string
}

// Stock is counted in as soon as it is received. A delivery entered by someone without
// the Approve stock right waits as PENDING until the owner approves it or rejects it,
// and rejecting takes the stock back out.
export type StockApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export interface StockReceiptRecord {
  id: number
  shiftId: number
  userName: string
  productId: number
  productName: string
  addedKg: number
  buyingPricePerBag: number
  referenceNote: string | null
  approvalStatus: StockApprovalStatus
  reviewedBy: string | null
  reviewedAt: string | null
  reviewNote: string | null
  createdAt: string
}

export interface RejectStockReceiptInput {
  id: number
  reason: string
}

/** What the owner has yet to look at. Empty on both lists means nothing needs attention. */
export interface StockAttention {
  pendingReceipts: StockReceiptRecord[]
  unreviewedTakeHome: DomesticConsumptionRecord[]
  /** Processing batches that went to posho and have not come back yet. */
  openConversions: StockConversionRecord[]
  /** Finished processing that the owner has not checked yet. */
  unreviewedConversions: StockConversionRecord[]
}

/** CLEANING is sort-and-display in one step. MILLING goes out first and comes back later. */
export type ConversionKind = 'CLEANING' | 'MILLING'
/** OPEN means kilos have left the source and are at posho. */
export type ConversionStatus = 'OPEN' | 'DONE' | 'CANCELLED' | 'VOID'

/** Kilos taken from one product and turned into another, with the loss between them. */
export interface StockConversionRecord {
  id: number
  shiftId: number
  kind: ConversionKind
  status: ConversionStatus
  sourceProductId: number
  sourceName: string
  sourceKg: number
  /** The source's cost per kg when the kilos left, carried into the output. */
  sourceCostPerKg: number
  outputProductId: number | null
  outputName: string | null
  outputKg: number | null
  recordedBy: string
  completedBy: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  createdAt: string
  completedAt: string | null
  /** Set when a batch is voided or replaced by an edit. */
  voidReason: string | null
  voidedAt: string | null
}

export interface ConversionInput {
  shiftId: number
  /** Left out, it is CLEANING when an output is given and MILLING when not. */
  kind?: ConversionKind
  sourceProductId: number
  sourceKg: number
  /** Given for CLEANING, where the output is weighed straight away. Left out to send to posho. */
  outputProductId?: number
  outputKg?: number
}

export interface CompleteMillingInput {
  id: number
  outputProductId: number
  outputKg: number
}

export interface CancelMillingInput {
  id: number
  reason: string
}

export interface CompleteCleaningInput {
  id: number
  /** Weighed after cleaning. Goes into the display product named after the source. */
  outputKg: number
}

export interface VoidConversionInput {
  id: number
  reason: string
}

export interface EditConversionInput {
  id: number
  sourceKg: number
  outputKg: number
  reason: string
}

export type ShiftStatus = 'ACTIVE' | 'CLOSED'

export interface ShiftRecord {
  id: number
  userId: number | null
  userName: string
  startTime: string
  endTime: string | null
  openingCash: number
  openingMpesa: number
  openingNotes: string | null
  closingCashActual: number | null
  closingMpesaActual: number | null
  expectedCash: number | null
  expectedMpesa: number | null
  varianceCash: number | null
  varianceMpesa: number | null
  notes: string | null
  totalSales: number | null
  totalExpenses: number | null
  totalDomesticConsumption: number | null
  totalDebt: number | null
  totalTransactions: number | null
  status: ShiftStatus
}

export interface OpenShiftInput {
  openingCash: number
  openingMpesa: number
  notes?: string
}

export interface CloseShiftInput {
  shiftId: number
  closingCashActual: number
  closingMpesaActual: number
  /** The closer has looked over this shift's expenses and take-home stock. The
   * main process refuses to close without it, so the Z-report is never printed
   * unreviewed. */
  expensesReviewed: boolean
  notes?: string
}

export interface HandoverShiftInput {
  shiftId: number
  toUserId: number
  closingCashActual: number
  closingMpesaActual: number
  expensesReviewed: boolean
  notes?: string
}

export interface ShiftHandoverRecord {
  id: number
  shiftId: number
  fromUserName: string
  toUserName: string
  countedCash: number
  countedMpesa: number
  varianceCash: number
  varianceMpesa: number
  notes: string | null
  createdAt: string
}

export interface ShiftCountCheckInput {
  shiftId: number
  closingCashActual: number
  closingMpesaActual: number
}

/** Match / no-match only — the expected figures stay in the main process so the
 * count remains blind; the cashier is told to recount, not what to write. */
export interface ShiftCountCheck {
  cashMatches: boolean
  mpesaMatches: boolean
}

export interface ShiftCloseSummary {
  shift: ShiftRecord
  totalsales: number
  totalExpenses: number
  totalDomesticConsumption: number
}

export interface SaleItemInput {
  productId: number
  quantityKg: number
  unitPricePerKg: number
}

export interface SaleInput {
  shiftId: number
  customerName: string
  customerPhone?: string
  items: SaleItemInput[]
  cashPaid: number
  mpesaPaid: number
  discount: number
  mpesaRef?: string
  /** Old debt the customer clears at the same counter visit, recorded in the same transaction as the sale. */
  debtRepayment?: { amount: number; paymentMethod: PaymentMethod }
}

export interface SaleItemRecord extends SaleItemInput {
  id: number
  productName: string
  subtotal: number
  weightPerBag: number
}

export interface ShiftProductSummary {
  productName: string
  weightPerBag: number
  totalKg: number
}

export type SaleStatus = 'COMPLETED' | 'VOID'

export interface SaleRecord {
  id: number
  shiftId: number
  cashierName: string
  customerName: string
  customerPhone: string | null
  totalAmount: number
  cashPaid: number
  mpesaPaid: number
  mpesaRef: string | null
  /** What the sale was rung up on credit for. */
  debtAmount: number
  /** What is still owed on that credit after repayments, oldest debt first. 0 once paid off. */
  debtOutstanding: number
  discount: number
  status: SaleStatus
  voidReason: string | null
  voidedAt: string | null
  createdAt: string
  items: SaleItemRecord[]
}

export interface VoidSaleInput {
  saleId: number
  reason: string
}

/** The sale's replacement, entered in full. The original is voided and this is recorded in its place. */
export interface EditSaleInput {
  saleId: number
  sale: SaleInput
}

/** DAILY is spending on the day's business (transport, labour). MONTHLY is a bill that
 * comes once a month (rent, electricity). Only accounts with the bills right can log MONTHLY. */
export type ExpenseKind = 'DAILY' | 'MONTHLY'

export interface ExpenseInput {
  shiftId: number
  category: string
  amount: number
  description?: string
  paymentMethod: PaymentMethod
  kind?: ExpenseKind
}

export interface ExpenseRecord extends ExpenseInput {
  id: number
  /** Who was on the till — only populated by the cross-day Transactions query. */
  recordedBy?: string
  createdAt: string
}

export interface DomesticConsumptionInput {
  shiftId: number
  productId: number
  quantityKg: number
  costValue: number
  notes?: string
}

export interface DomesticConsumptionRecord extends DomesticConsumptionInput {
  id: number
  productName: string
  /** Who was on the till — only populated by the list query, not by the write. */
  recordedBy?: string
  status: 'COMPLETED' | 'VOID'
  voidReason: string | null
  voidedAt: string | null
  /** Take-home is shown to the owner under Needs attention until someone with the right marks it seen. */
  reviewedBy: string | null
  reviewedAt: string | null
  createdAt: string
}

export interface VoidDomesticConsumptionInput {
  id: number
  reason: string
}

export type PaymentMethod = 'CASH' | 'MPESA'

export interface DebtRepaymentInput {
  shiftId: number
  customerName: string
  amountPaid: number
  paymentMethod: PaymentMethod
}

export interface DebtRepaymentRecord extends DebtRepaymentInput {
  id: number
  createdAt: string
}

export interface CustomerDebtInput {
  shiftId: number
  customerName: string
  customerPhone?: string
  amount: number
  note?: string
}

export interface CustomerDebtRecord extends CustomerDebtInput {
  id: number
  createdAt: string
}

export interface CustomerBalance {
  customerName: string
  phone: string | null
  totalDebt: number
  totalRepaid: number
  outstanding: number
  lastActivityAt: string
  debtEventCount: number
}

export type CustomerHistoryEventType = 'SALE' | 'REPAYMENT' | 'DEBT_ENTRY'

export interface CustomerHistoryEvent {
  type: CustomerHistoryEventType
  id: number
  createdAt: string
  amount: number
  items?: SaleItemRecord[]
  cashPaid?: number
  mpesaPaid?: number
  debtAmount?: number
  paymentMethod?: PaymentMethod
  note?: string
}

export type UserRole = 'ADMIN' | 'CASHIER'

export interface UserRecord {
  id: number
  name: string
  /** Derived from rights: ADMIN when at least one right is ticked, otherwise CASHIER. */
  role: UserRole
  rights: AdminRight[]
  isActive: boolean
  createdAt: string
}

export interface CreateUserInput {
  name: string
  rights: AdminRight[]
  pin: string
}

export interface UpdateUserInput {
  name: string
  rights: AdminRight[]
}

export interface SessionUser {
  id: number
  name: string
  role: UserRole
  rights: AdminRight[]
}

/** An Admin's PIN plus a written reason. Used to sign someone into a shift they did
 * not open, or to force the till out of a session mid-shift. Every use is audited. */
export interface AdminOverride {
  adminUserId: number
  adminPin: string
  reason: string
}

export interface LoginInput {
  userId: number
  pin: string
  override?: AdminOverride
}

export type ForceLogoutInput = AdminOverride

export interface AuditLogRecord {
  id: number
  userId: number | null
  userName: string
  action: string
  details: string | null
  createdAt: string
}

export interface ExportDatabaseResult {
  exported: boolean
  path?: string
}

export type BackupKind = 'AUTO' | 'PRE_IMPORT'

export interface BackupFileInfo {
  fileName: string
  path: string
  sizeBytes: number
  createdAt: string
  kind: BackupKind
}

export interface PracticeDataResult {
  days: number
  sales: number
  expenses: number
  shifts: number
}

/** Whether the app is currently pointed at the throwaway practice database. */
export interface PracticeModeStatus {
  active: boolean
  generated?: PracticeDataResult
}

export interface ImportDatabaseResult {
  imported: boolean
  path?: string
}

export interface DashboardSnapshot {
  categories: CategoryRecord[]
  products: ProductRecord[]
  activeShift: ShiftRecord | null
  settings: Record<string, string>
}

export interface AnalyticsRange {
  fromISO: string
  toISO: string
  /**
   * Narrows the dashboard to one product. Only the figures that exist per line
   * of a sale can honour it — see `AnalyticsSummary.productFilter`.
   */
  productId?: number | null
}

export interface AnalyticsProductRow {
  productId: number
  productName: string
  weightPerBag: number
  quantityKg: number
  revenue: number
  estimatedProfit: number
}

export interface AnalyticsDailyRow {
  date: string
  totalSales: number
  transactionCount: number
}

export interface AnalyticsWeekdayRow {
  weekday: string
  totalSales: number
  transactionCount: number
}

export interface AnalyticsHourlyRow {
  hour: number
  totalSales: number
  transactionCount: number
}

export interface AnalyticsStaffRow {
  userId: number | null
  userName: string
  totalSales: number
  transactionCount: number
}

export interface AnalyticsExpenseCategoryRow {
  category: string
  totalAmount: number
}

export interface AnalyticsPreviousPeriod {
  totalSales: number
  totalTransactions: number
  estimatedProfit: number
  moneyKept: number
}

/** A product whose selling price is below what the shop last paid for it. */
export interface BelowCostRow {
  productId: number
  productName: string
  /** Last delivery's buying price per bag ÷ bag size. */
  costPerKg: number
  retailPricePerKg: number
  wholesalePricePerKg: number
  retailBelow: boolean
  wholesaleBelow: boolean
}

/** A product at or under its own low-stock alert level, whether or not it has been selling. */
export interface LowStockRow {
  productId: number
  productName: string
  weightPerBag: number
  stockKg: number
  alertKg: number
}

/** How long a product's stock lasts at the pace it has sold over the last two weeks. */
export interface StockRunwayRow {
  productId: number
  productName: string
  weightPerBag: number
  stockKg: number
  dailyKg: number
  /** 0 when already out of stock. */
  daysLeft: number
}

export interface DebtAgeBuckets {
  underWeek: number
  weekToMonth: number
  overMonth: number
}

export interface AgedDebtor {
  customerName: string
  phone: string | null
  outstanding: number
  /** The part of what they owe that is more than 30 days old. */
  overMonth: number
  oldestUnpaidAt: string
  oldestUnpaidDays: number
}

export interface AnalyticsSummary {
  range: AnalyticsRange

  /**
   * Set when the dashboard is narrowed to one product. Revenue, profit, quantity,
   * transactions, the trends and the staff table are then that product's alone.
   *
   * Expenses, debt, the payment mix and discounts stay shop-wide and say so: they
   * are recorded against a *sale*, not against a line of one. A cart of maize and
   * beans settled half in cash with 200 left owing carries no record of which of
   * the two the cash paid for, so splitting it between them would be invention,
   * not analysis.
   */
  productFilter: { productId: number; productName: string } | null

  // Hero KPIs
  totalSales: number
  estimatedGrossProfit: number
  estimatedCogs: number
  totalExpenses: number
  /**
   * Cost of stock taken home in the period, already subtracted from
   * estimatedGrossProfit. Unlike expenses this one *does* narrow with a product
   * filter — take-home is recorded against a product, so attributing it is
   * reporting rather than invention.
   */
  domesticConsumptionCost: number
  domesticConsumptionKg: number
  /** Credit given on sales in the period — what share of selling went out unpaid. */
  debtAccrued: number
  /** Debt typed in on the Customers page in the period (opening balances and the like) — not a sale, so kept apart. */
  debtAddedManually: number
  /** Profit on goods less expenses: what the shop actually kept. Shop-wide only; meaningless under a product filter. */
  moneyKept: number
  totalTransactions: number
  averageBasketValue: number
  previousPeriod: AnalyticsPreviousPeriod

  // Payment & debt
  cashCollected: number
  mpesaCollected: number
  debtRepaidInPeriod: number
  netDebtMovement: number
  totalDebtOutstanding: number
  totalQuantitySoldKg: number
  totalDiscountGiven: number

  // Products
  topProducts: AnalyticsProductRow[]
  leastSellingProducts: AnalyticsProductRow[]
  /** Every product that sold in the period, heaviest first — drives the Quantity sold breakdown. */
  productsByQuantity: AnalyticsProductRow[]
  productsWithNoSalesCount: number

  // Customers
  topDebtors: CustomerBalance[]

  // "As of now", not the selected period — what needs doing today.
  belowCost: BelowCostRow[]
  stockRunway: StockRunwayRow[]
  lowStockProducts: LowStockRow[]
  debtAging: DebtAgeBuckets
  agedDebtors: AgedDebtor[]

  // Till shortfalls in closed shifts that ended in the period, as a positive amount
  // of money that should have been there and wasn't.
  shiftShortfall: { count: number; total: number }

  // Trends & traffic
  dailyBreakdown: AnalyticsDailyRow[]
  weekdayBreakdown: AnalyticsWeekdayRow[]
  hourlyBreakdown: AnalyticsHourlyRow[]

  // Staff
  salesByStaff: AnalyticsStaffRow[]

  // Operational callouts
  expensesByCategory: AnalyticsExpenseCategoryRow[]
  lowStockProductCount: number
  voidedSaleCount: number
  voidedSaleValue: number
}

export interface ReceiptDraft {
  sale: SaleRecord
  shopName: string
  shopTagline: string
  footerNote: string
  headerNote: string
  cashierName: string
  showDualUnit: boolean
  showCashierName: boolean
  showDebtBalance: boolean
}

export interface PrinterInfo {
  name: string
  displayName: string
  description: string
}

export interface PrintReceiptResult {
  printed: boolean
  simulated: boolean
}

export const SETTINGS_KEYS = {
  shopName: 'shop_name',
  shopTagline: 'shop_tagline',
  shopBranch: 'shop_branch',
  shopPhone: 'shop_phone',
  shopEmail: 'shop_email',
  currency: 'currency',
  themeMode: 'theme_mode',
  displayZoomPct: 'display_zoom_pct',
  autoPrintReceipt: 'auto_print_receipt',
  printerDeviceName: 'printer_device_name',
  onScreenKeyboard: 'onscreen_keyboard_enabled',
  receiptHeaderNote: 'receipt_header_note',
  receiptFooter: 'receipt_footer',
  receiptShowDualUnit: 'receipt_show_dual_unit',
  receiptShowCashierName: 'receipt_show_cashier_name',
  receiptShowDebtBalance: 'receipt_show_debt_balance',
  permAllowCashierDiscount: 'perm_allow_cashier_discount',
  permAllowCashierVoid: 'perm_allow_cashier_void',
} as const

export interface PosApi {
  bootstrap(): Promise<DashboardSnapshot>

  listCategories(): Promise<CategoryRecord[]>
  createCategory(name: string): Promise<CategoryRecord>

  listProducts(): Promise<ProductRecord[]>
  createProduct(input: ProductInput): Promise<ProductRecord>
  updateProduct(id: number, input: ProductInput): Promise<ProductRecord>
  setProductActive(id: number, isActive: boolean): Promise<ProductRecord>
  deleteProduct(id: number): Promise<{ name: string }>
  setProductPriceBreaks(productId: number, breaks: ProductPriceBreak[]): Promise<ProductRecord>
  receiveStock(input: StockReceiptInput): Promise<ProductRecord>
  listStockReceipts(limit: number): Promise<StockReceiptRecord[]>
  getStockAttention(): Promise<StockAttention>
  /** Newest first. Anyone can record a conversion; the owner reviews them in Needs attention. */
  listStockConversions(limit: number): Promise<StockConversionRecord[]>
  recordStockConversion(input: ConversionInput): Promise<StockConversionRecord>
  /** Records poshoed output of a batch that is at posho. */
  completeMilling(input: CompleteMillingInput): Promise<StockConversionRecord>
  /** Sends a batch that never came back back to its source. Needs a reason. */
  cancelMilling(input: CancelMillingInput): Promise<StockConversionRecord>
  /** Records the weighed kilos of a batch taken for cleaning. */
  completeCleaning(input: CompleteCleaningInput): Promise<StockConversionRecord>
  /** Takes a finished batch back out of stock. The record stays, marked void, with the reason. */
  voidConversion(input: VoidConversionInput): Promise<StockConversionRecord>
  /** Replaces a finished batch with corrected weights. The original stays on record, marked void. */
  editConversion(input: EditConversionInput): Promise<StockConversionRecord>
  markConversionReviewed(id: number): Promise<StockConversionRecord>
  approveStockReceipt(id: number): Promise<StockReceiptRecord>
  rejectStockReceipt(input: RejectStockReceiptInput): Promise<StockReceiptRecord>

  getActiveShift(): Promise<ShiftRecord | null>
  openShift(input: OpenShiftInput): Promise<ShiftRecord>
  checkShiftCount(input: ShiftCountCheckInput): Promise<ShiftCountCheck>
  closeShift(input: CloseShiftInput): Promise<ShiftCloseSummary>
  handoverShift(input: HandoverShiftInput): Promise<ShiftRecord>
  listShiftHandovers(shiftId: number): Promise<ShiftHandoverRecord[]>
  listRecentShifts(limit: number): Promise<ShiftRecord[]>
  /** Shifts that started inside the range, newest first. Needs the See reports right. */
  listShiftsBetween(range: PeriodRange): Promise<ShiftRecord[]>

  recordSale(input: SaleInput): Promise<SaleRecord>
  listRecentSales(limit: number): Promise<SaleRecord[]>
  voidSale(input: VoidSaleInput): Promise<SaleRecord>
  /** Returns the replacement sale; the original stays on record as voided. */
  editSale(input: EditSaleInput): Promise<SaleRecord>
  listProductsSoldByShift(shiftId: number): Promise<ShiftProductSummary[]>

  recordExpense(input: ExpenseInput): Promise<ExpenseRecord>
  listExpensesByShift(shiftId: number): Promise<ExpenseRecord[]>
  listRecentExpenses(limit: number): Promise<ExpenseRecord[]>
  /** Every expense logged in the period. Needs the See reports right. */
  listExpensesBetween(range: PeriodRange): Promise<ExpenseRecord[]>

  recordDomesticConsumption(input: DomesticConsumptionInput): Promise<DomesticConsumptionRecord>
  listDomesticConsumption(limit: number): Promise<DomesticConsumptionRecord[]>
  voidDomesticConsumption(input: VoidDomesticConsumptionInput): Promise<DomesticConsumptionRecord>
  markTakeHomeReviewed(id: number): Promise<DomesticConsumptionRecord>

  listCustomerBalances(): Promise<CustomerBalance[]>
  recordDebtRepayment(input: DebtRepaymentInput): Promise<DebtRepaymentRecord>
  recordCustomerDebt(input: CustomerDebtInput): Promise<CustomerDebtRecord>
  getCustomerHistory(customerName: string): Promise<CustomerHistoryEvent[]>

  getSettings(): Promise<Record<string, string>>
  setSetting(key: string, value: string): Promise<Record<string, string>>

  listUsers(): Promise<UserRecord[]>
  createUser(input: CreateUserInput): Promise<UserRecord>
  updateUser(id: number, input: UpdateUserInput): Promise<UserRecord>
  setUserPin(id: number, pin: string): Promise<void>
  setUserActive(id: number, isActive: boolean): Promise<UserRecord>
  login(input: LoginInput): Promise<SessionUser>
  logout(): Promise<void>
  forceLogout(input: ForceLogoutInput): Promise<void>
  listAuditLog(limit: number): Promise<AuditLogRecord[]>

  // Closes the app. Refused while a shift is open unless an Admin override is given.
  exitApp(override?: AdminOverride): Promise<void>
  // Main calls this instead of closing the window while a shift is open.
  onExitBlocked(listener: () => void): () => void

  getAnalyticsSummary(range: AnalyticsRange): Promise<AnalyticsSummary>

  buildReceiptDraft(saleId: number): Promise<ReceiptDraft>
  buildTestReceiptDraft(): Promise<ReceiptDraft>
  printReceipt(draft: ReceiptDraft): Promise<PrintReceiptResult>
  printPriceList(): Promise<PrintReceiptResult>
  listPrinters(): Promise<PrinterInfo[]>

  // Whether Windows launches the till at sign-in. This is OS state, not shop
  // data, so it is read back from the OS rather than stored in the settings table
  // — that way it stays truthful even if the installer, or the user, changed it
  // outside the app.
  getPracticeMode(): Promise<PracticeModeStatus>
  enterPracticeMode(days: number): Promise<PracticeModeStatus>
  exitPracticeMode(): Promise<PracticeModeStatus>

  getAutoStart(): Promise<boolean>
  setAutoStart(enabled: boolean): Promise<boolean>

  exportDatabase(): Promise<ExportDatabaseResult>
  listBackups(): Promise<BackupFileInfo[]>
  pickImportFile(): Promise<string | null>
  restoreBackup(filePath: string): Promise<ImportDatabaseResult>

  // Implemented directly in the preload script via Electron's webFrame module —
  // no main-process round trip, so there is no matching IPC_CHANNELS entry.
  setZoomFactor(factor: number): void
  getZoomFactor(): number
}

export const IPC_CHANNELS = {
  bootstrap: 'app:bootstrap',
  listCategories: 'catalog:listCategories',
  createCategory: 'catalog:createCategory',
  listProducts: 'catalog:listProducts',
  createProduct: 'catalog:createProduct',
  updateProduct: 'catalog:updateProduct',
  setProductActive: 'catalog:setProductActive',
  deleteProduct: 'catalog:deleteProduct',
  setProductPriceBreaks: 'catalog:setProductPriceBreaks',
  receiveStock: 'inventory:receiveStock',
  listStockReceipts: 'inventory:listReceipts',
  getStockAttention: 'inventory:attention',
  listStockConversions: 'inventory:listConversions',
  recordStockConversion: 'inventory:recordConversion',
  completeMilling: 'inventory:completeMilling',
  cancelMilling: 'inventory:cancelMilling',
  completeCleaning: 'inventory:completeCleaning',
  voidConversion: 'inventory:voidConversion',
  editConversion: 'inventory:editConversion',
  markConversionReviewed: 'inventory:markConversionReviewed',
  approveStockReceipt: 'inventory:approveReceipt',
  rejectStockReceipt: 'inventory:rejectReceipt',
  getActiveShift: 'shift:getActive',
  openShift: 'shift:open',
  checkShiftCount: 'shift:checkCount',
  closeShift: 'shift:close',
  handoverShift: 'shift:handover',
  listShiftHandovers: 'shift:listHandovers',
  listRecentShifts: 'shift:listRecent',
  listShiftsBetween: 'shift:listBetween',
  recordSale: 'sale:record',
  listRecentSales: 'sale:listRecent',
  voidSale: 'sale:void',
  editSale: 'sale:edit',
  listProductsSoldByShift: 'sale:listProductsSoldByShift',
  recordExpense: 'expense:record',
  listExpensesByShift: 'expense:listByShift',
  listRecentExpenses: 'expense:listRecent',
  listExpensesBetween: 'expense:listBetween',
  recordDomesticConsumption: 'consumption:record',
  listDomesticConsumption: 'consumption:list',
  voidDomesticConsumption: 'consumption:void',
  markTakeHomeReviewed: 'consumption:markReviewed',
  listCustomerBalances: 'debt:listCustomerBalances',
  recordDebtRepayment: 'debt:recordRepayment',
  recordCustomerDebt: 'debt:recordDebt',
  getCustomerHistory: 'debt:customerHistory',
  getSettings: 'settings:getAll',
  setSetting: 'settings:set',
  listUsers: 'auth:listUsers',
  createUser: 'auth:createUser',
  updateUser: 'auth:updateUser',
  setUserPin: 'auth:setUserPin',
  setUserActive: 'auth:setUserActive',
  login: 'auth:login',
  logout: 'auth:logout',
  forceLogout: 'auth:forceLogout',
  listAuditLog: 'auth:listAuditLog',
  exitApp: 'app:exit',
  exitBlocked: 'app:exitBlocked',
  getAnalyticsSummary: 'analytics:getSummary',
  buildReceiptDraft: 'receipt:buildDraft',
  buildTestReceiptDraft: 'receipt:buildTestDraft',
  printReceipt: 'receipt:print',
  printPriceList: 'catalog:printPriceList',
  listPrinters: 'receipt:listPrinters',
  getPracticeMode: 'app:getPracticeMode',
  enterPracticeMode: 'app:enterPracticeMode',
  exitPracticeMode: 'app:exitPracticeMode',
  getAutoStart: 'app:getAutoStart',
  setAutoStart: 'app:setAutoStart',
  exportDatabase: 'backup:exportDatabase',
  listBackups: 'backup:list',
  pickImportFile: 'backup:pickImportFile',
  restoreBackup: 'backup:restore',
} as const
