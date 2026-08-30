// Shared type contracts between main (database) and renderer (UI) processes.
// Everything crossing the `window.electronAPI` bridge is declared here.

export interface CategoryRecord {
  id: number
  name: string
}

export interface ImportPriceListResult {
  created: number
  skippedExisting: string[]
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
}

export interface StockReceiptInput {
  shiftId: number
  productId: number
  addedKg: number
  newBuyingPricePerBag?: number
  referenceNote?: string
}

export interface StockReceiptRecord {
  id: number
  shiftId: number
  userName: string
  productId: number
  productName: string
  addedKg: number
  buyingPricePerBag: number
  referenceNote: string | null
  createdAt: string
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
  notes?: string
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
}

export interface SaleItemRecord extends SaleItemInput {
  id: number
  productName: string
  subtotal: number
  weightPerBag: number
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
  debtAmount: number
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

export interface ExpenseInput {
  shiftId: number
  category: string
  amount: number
  description?: string
  paymentMethod: PaymentMethod
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
  createdAt: string
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
  role: UserRole
  isActive: boolean
  createdAt: string
}

export interface CreateUserInput {
  name: string
  role: UserRole
  pin: string
}

export interface UpdateUserInput {
  name: string
  role: UserRole
}

export interface SessionUser {
  id: number
  name: string
  role: UserRole
}

export interface LoginInput {
  userId: number
  pin: string
}

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
  debtAccrued: number
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
  receiveStock(input: StockReceiptInput): Promise<ProductRecord>
  listStockReceipts(limit: number): Promise<StockReceiptRecord[]>

  getActiveShift(): Promise<ShiftRecord | null>
  openShift(input: OpenShiftInput): Promise<ShiftRecord>
  closeShift(input: CloseShiftInput): Promise<ShiftCloseSummary>
  listRecentShifts(limit: number): Promise<ShiftRecord[]>

  recordSale(input: SaleInput): Promise<SaleRecord>
  listRecentSales(limit: number): Promise<SaleRecord[]>
  voidSale(input: VoidSaleInput): Promise<SaleRecord>

  recordExpense(input: ExpenseInput): Promise<ExpenseRecord>
  listExpensesByShift(shiftId: number): Promise<ExpenseRecord[]>
  listRecentExpenses(limit: number): Promise<ExpenseRecord[]>

  recordDomesticConsumption(input: DomesticConsumptionInput): Promise<DomesticConsumptionRecord>
  listDomesticConsumption(limit: number): Promise<DomesticConsumptionRecord[]>

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
  listAuditLog(limit: number): Promise<AuditLogRecord[]>

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
  receiveStock: 'inventory:receiveStock',
  listStockReceipts: 'inventory:listReceipts',
  getActiveShift: 'shift:getActive',
  openShift: 'shift:open',
  closeShift: 'shift:close',
  listRecentShifts: 'shift:listRecent',
  recordSale: 'sale:record',
  listRecentSales: 'sale:listRecent',
  voidSale: 'sale:void',
  recordExpense: 'expense:record',
  listExpensesByShift: 'expense:listByShift',
  listRecentExpenses: 'expense:listRecent',
  recordDomesticConsumption: 'consumption:record',
  listDomesticConsumption: 'consumption:list',
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
  listAuditLog: 'auth:listAuditLog',
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
