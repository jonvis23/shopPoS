import { contextBridge, ipcRenderer, webFrame } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc'
import type { PeriodRange } from '../shared/period'
import type {
  AdminOverride,
  AnalyticsRange,
  CloseShiftInput,
  CreateUserInput,
  CustomerDebtInput,
  ForceLogoutInput,
  HandoverShiftInput,
  DebtRepaymentInput,
  DomesticConsumptionInput,
  ExpenseInput,
  LoginInput,
  OpenShiftInput,
  PosApi,
  ProductInput,
  RejectStockReceiptInput,
  ConversionInput,
  CompleteMillingInput,
  CancelMillingInput,
  CompleteCleaningInput,
  VoidConversionInput,
  EditConversionInput,
  ProductPriceBreak,
  ReceiptDraft,
  SaleInput,
  ShiftCountCheckInput,
  StockReceiptInput,
  UpdateUserInput,
  VoidDomesticConsumptionInput,
  VoidSaleInput,
  EditSaleInput,
} from '../shared/ipc'

const posApi: PosApi = {
  bootstrap: () => ipcRenderer.invoke(IPC_CHANNELS.bootstrap),

  listCategories: () => ipcRenderer.invoke(IPC_CHANNELS.listCategories),
  createCategory: (name: string) => ipcRenderer.invoke(IPC_CHANNELS.createCategory, name),

  listProducts: () => ipcRenderer.invoke(IPC_CHANNELS.listProducts),
  createProduct: (input: ProductInput) => ipcRenderer.invoke(IPC_CHANNELS.createProduct, input),
  updateProduct: (id: number, input: ProductInput) => ipcRenderer.invoke(IPC_CHANNELS.updateProduct, id, input),
  setProductActive: (id: number, isActive: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.setProductActive, id, isActive),
  deleteProduct: (id: number) => ipcRenderer.invoke(IPC_CHANNELS.deleteProduct, id),
  setProductPriceBreaks: (productId: number, breaks: ProductPriceBreak[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.setProductPriceBreaks, productId, breaks),
  receiveStock: (input: StockReceiptInput) => ipcRenderer.invoke(IPC_CHANNELS.receiveStock, input),
  listStockReceipts: (limit: number) => ipcRenderer.invoke(IPC_CHANNELS.listStockReceipts, limit),
  getStockAttention: () => ipcRenderer.invoke(IPC_CHANNELS.getStockAttention),
  listStockConversions: (limit: number) => ipcRenderer.invoke(IPC_CHANNELS.listStockConversions, limit),
  recordStockConversion: (input: ConversionInput) => ipcRenderer.invoke(IPC_CHANNELS.recordStockConversion, input),
  completeMilling: (input: CompleteMillingInput) => ipcRenderer.invoke(IPC_CHANNELS.completeMilling, input),
  cancelMilling: (input: CancelMillingInput) => ipcRenderer.invoke(IPC_CHANNELS.cancelMilling, input),
  markConversionReviewed: (id: number) => ipcRenderer.invoke(IPC_CHANNELS.markConversionReviewed, id),
  completeCleaning: (input: CompleteCleaningInput) => ipcRenderer.invoke(IPC_CHANNELS.completeCleaning, input),
  voidConversion: (input: VoidConversionInput) => ipcRenderer.invoke(IPC_CHANNELS.voidConversion, input),
  editConversion: (input: EditConversionInput) => ipcRenderer.invoke(IPC_CHANNELS.editConversion, input),
  approveStockReceipt: (id: number) => ipcRenderer.invoke(IPC_CHANNELS.approveStockReceipt, id),
  rejectStockReceipt: (input: RejectStockReceiptInput) => ipcRenderer.invoke(IPC_CHANNELS.rejectStockReceipt, input),

  getActiveShift: () => ipcRenderer.invoke(IPC_CHANNELS.getActiveShift),
  openShift: (input: OpenShiftInput) => ipcRenderer.invoke(IPC_CHANNELS.openShift, input),
  checkShiftCount: (input: ShiftCountCheckInput) => ipcRenderer.invoke(IPC_CHANNELS.checkShiftCount, input),
  closeShift: (input: CloseShiftInput) => ipcRenderer.invoke(IPC_CHANNELS.closeShift, input),
  handoverShift: (input: HandoverShiftInput) => ipcRenderer.invoke(IPC_CHANNELS.handoverShift, input),
  listShiftHandovers: (shiftId: number) => ipcRenderer.invoke(IPC_CHANNELS.listShiftHandovers, shiftId),
  listRecentShifts: (limit: number) => ipcRenderer.invoke(IPC_CHANNELS.listRecentShifts, limit),
  listShiftsBetween: (range: PeriodRange) => ipcRenderer.invoke(IPC_CHANNELS.listShiftsBetween, range),

  recordSale: (input: SaleInput) => ipcRenderer.invoke(IPC_CHANNELS.recordSale, input),
  listRecentSales: (limit: number) => ipcRenderer.invoke(IPC_CHANNELS.listRecentSales, limit),
  listProductsSoldByShift: (shiftId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.listProductsSoldByShift, shiftId),
  voidSale: (input: VoidSaleInput) => ipcRenderer.invoke(IPC_CHANNELS.voidSale, input),
  editSale: (input: EditSaleInput) => ipcRenderer.invoke(IPC_CHANNELS.editSale, input),

  recordExpense: (input: ExpenseInput) => ipcRenderer.invoke(IPC_CHANNELS.recordExpense, input),
  listExpensesByShift: (shiftId: number) => ipcRenderer.invoke(IPC_CHANNELS.listExpensesByShift, shiftId),
  listRecentExpenses: (limit: number) => ipcRenderer.invoke(IPC_CHANNELS.listRecentExpenses, limit),
  listExpensesBetween: (range: PeriodRange) => ipcRenderer.invoke(IPC_CHANNELS.listExpensesBetween, range),

  recordDomesticConsumption: (input: DomesticConsumptionInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.recordDomesticConsumption, input),
  listDomesticConsumption: (limit: number) => ipcRenderer.invoke(IPC_CHANNELS.listDomesticConsumption, limit),
  voidDomesticConsumption: (input: VoidDomesticConsumptionInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.voidDomesticConsumption, input),
  markTakeHomeReviewed: (id: number) => ipcRenderer.invoke(IPC_CHANNELS.markTakeHomeReviewed, id),

  listCustomerBalances: () => ipcRenderer.invoke(IPC_CHANNELS.listCustomerBalances),
  recordDebtRepayment: (input: DebtRepaymentInput) => ipcRenderer.invoke(IPC_CHANNELS.recordDebtRepayment, input),
  recordCustomerDebt: (input: CustomerDebtInput) => ipcRenderer.invoke(IPC_CHANNELS.recordCustomerDebt, input),
  getCustomerHistory: (customerName: string) => ipcRenderer.invoke(IPC_CHANNELS.getCustomerHistory, customerName),

  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.getSettings),
  setSetting: (key: string, value: string) => ipcRenderer.invoke(IPC_CHANNELS.setSetting, key, value),

  listUsers: () => ipcRenderer.invoke(IPC_CHANNELS.listUsers),
  createUser: (input: CreateUserInput) => ipcRenderer.invoke(IPC_CHANNELS.createUser, input),
  updateUser: (id: number, input: UpdateUserInput) => ipcRenderer.invoke(IPC_CHANNELS.updateUser, id, input),
  setUserPin: (id: number, pin: string) => ipcRenderer.invoke(IPC_CHANNELS.setUserPin, id, pin),
  setUserActive: (id: number, isActive: boolean) => ipcRenderer.invoke(IPC_CHANNELS.setUserActive, id, isActive),
  login: (input: LoginInput) => ipcRenderer.invoke(IPC_CHANNELS.login, input),
  logout: () => ipcRenderer.invoke(IPC_CHANNELS.logout),
  forceLogout: (input: ForceLogoutInput) => ipcRenderer.invoke(IPC_CHANNELS.forceLogout, input),
  listAuditLog: (limit: number) => ipcRenderer.invoke(IPC_CHANNELS.listAuditLog, limit),
  exitApp: (override?: AdminOverride) => ipcRenderer.invoke(IPC_CHANNELS.exitApp, override),
  onExitBlocked: (listener: () => void) => {
    const handler = () => listener()
    ipcRenderer.on(IPC_CHANNELS.exitBlocked, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.exitBlocked, handler)
    }
  },

  getAnalyticsSummary: (range: AnalyticsRange) => ipcRenderer.invoke(IPC_CHANNELS.getAnalyticsSummary, range),

  buildReceiptDraft: (saleId: number) => ipcRenderer.invoke(IPC_CHANNELS.buildReceiptDraft, saleId),
  buildTestReceiptDraft: () => ipcRenderer.invoke(IPC_CHANNELS.buildTestReceiptDraft),
  printReceipt: (draft: ReceiptDraft) => ipcRenderer.invoke(IPC_CHANNELS.printReceipt, draft),
  printPriceList: () => ipcRenderer.invoke(IPC_CHANNELS.printPriceList),
  listPrinters: () => ipcRenderer.invoke(IPC_CHANNELS.listPrinters),
  getPracticeMode: () => ipcRenderer.invoke(IPC_CHANNELS.getPracticeMode),
  enterPracticeMode: (days: number) => ipcRenderer.invoke(IPC_CHANNELS.enterPracticeMode, days),
  exitPracticeMode: () => ipcRenderer.invoke(IPC_CHANNELS.exitPracticeMode),
  getAutoStart: () => ipcRenderer.invoke(IPC_CHANNELS.getAutoStart),
  setAutoStart: (enabled: boolean) => ipcRenderer.invoke(IPC_CHANNELS.setAutoStart, enabled),

  exportDatabase: () => ipcRenderer.invoke(IPC_CHANNELS.exportDatabase),
  listBackups: () => ipcRenderer.invoke(IPC_CHANNELS.listBackups),
  pickImportFile: () => ipcRenderer.invoke(IPC_CHANNELS.pickImportFile),
  restoreBackup: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.restoreBackup, filePath),

  setZoomFactor: (factor: number) => webFrame.setZoomFactor(factor),
  getZoomFactor: () => webFrame.getZoomFactor(),
}

contextBridge.exposeInMainWorld('electronAPI', posApi)
