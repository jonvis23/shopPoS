import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { PosDatabase, validateSqliteDatabaseFile } from './database'
import { generatePracticeData } from './practiceData'
import { buildReceiptHtml, printReceiptHtml } from './receiptPrint'
import { buildPriceListHtml } from './priceListPrint'
import { IPC_CHANNELS, SETTINGS_KEYS } from '../shared/ipc'
import type {
  BackupFileInfo,
  CloseShiftInput,
  CreateUserInput,
  CustomerDebtInput,
  DebtRepaymentInput,
  DomesticConsumptionInput,
  ExpenseInput,
  ImportDatabaseResult,
  LoginInput,
  PracticeModeStatus,
  OpenShiftInput,
  AnalyticsRange,
  ProductInput,
  ReceiptDraft,
  PrinterInfo,
  SaleInput,
  SessionUser,
  StockReceiptInput,
  UpdateUserInput,
  VoidSaleInput,
} from '../shared/ipc'

let mainWindow: BrowserWindow | null = null
let posDatabase: PosDatabase | null = null
let dbFilePath = ''
let realDbFilePath = ''
let practiceDbFilePath = ''
let practiceMode = false
let backupsDir = ''

// Tracks who is actually logged in, inside the trusted main process — never
// trust a role/user field the renderer sends, since devtools can call any
// window.electronAPI method directly. Set only via a PIN-verified login().
let currentUser: SessionUser | null = null

const ADMIN_ONLY_SETTING_PREFIXES = ['perm_', 'printer_']
const MAX_AUTO_BACKUPS = 20
const AUTO_BACKUP_INTERVAL_MS = 15 * 60 * 1000

function ensureBackupsDir(): string {
  if (!backupsDir) backupsDir = path.join(app.getPath('userData'), 'backups')
  fs.mkdirSync(backupsDir, { recursive: true })
  return backupsDir
}

function timestampForFilename(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function pruneAutoBackups(dir: string): void {
  const files = fs
    .readdirSync(dir)
    .filter((fileName) => fileName.startsWith('duka_pos_auto_') && fileName.endsWith('.db'))
    .sort()
  const excess = files.length - MAX_AUTO_BACKUPS
  for (let i = 0; i < excess; i += 1) {
    fs.unlinkSync(path.join(dir, files[i]))
  }
}

// Snapshots the live database into the rotating backups folder. Called after every
// shift close (a natural checkpoint) and on a timer while a shift is open, so a
// recent, restorable copy always exists without copying the file on every single sale.
function runAutoBackup(): void {
  if (!posDatabase || !dbFilePath) return
  // Practice trading is disposable by design; backing it up would fill the
  // rotation with files that look like shop records and aren't.
  if (practiceMode) return
  try {
    posDatabase.checkpointWal()
    const dir = ensureBackupsDir()
    const dest = path.join(dir, `duka_pos_auto_${timestampForFilename()}.db`)
    fs.copyFileSync(dbFilePath, dest)
    pruneAutoBackups(dir)
  } catch (error) {
    console.error('Auto-backup failed:', error)
  }
}

function listBackupFiles(): BackupFileInfo[] {
  const dir = ensureBackupsDir()
  return fs
    .readdirSync(dir)
    .filter((fileName) => fileName.endsWith('.db'))
    .map((fileName) => {
      const fullPath = path.join(dir, fileName)
      const stat = fs.statSync(fullPath)
      return {
        fileName,
        path: fullPath,
        sizeBytes: stat.size,
        createdAt: stat.mtime.toISOString(),
        kind: (fileName.startsWith('duka_pos_preimport_') ? 'PRE_IMPORT' : 'AUTO') as BackupFileInfo['kind'],
      }
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

// Practice mode runs against its own database file, a copy of the real one with
// the trading history replaced by generated data. Nothing filters or flags
// practice rows — they are in a different file altogether, which is the only
// version of this that cannot leak into the shop's records.
function discardPracticeDatabase(): void {
  if (!practiceDbFilePath) return
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(practiceDbFilePath + suffix)
    } catch {
      // not present — fine
    }
  }
}

function enterPracticeMode(days: number): PracticeModeStatus {
  if (currentUser?.role !== 'ADMIN') throw new Error('Only an Admin can start practice mode')
  if (!posDatabase) throw new Error('Database not ready')
  if (practiceMode) return { active: true }

  posDatabase.checkpointWal()
  discardPracticeDatabase()
  // A copy, so practice starts as the shop the owner actually knows — same
  // products, same prices, same staff and PINs — rather than a stranger's till.
  fs.copyFileSync(realDbFilePath, practiceDbFilePath)

  posDatabase.switchTo(practiceDbFilePath)
  dbFilePath = practiceDbFilePath
  practiceMode = true

  // If generating the practice shop fails for any reason, go straight back to the
  // real database before reporting it. Half-entering practice mode is the worst
  // possible outcome: the app would be pointed at a broken practice file while
  // the screen still said this was the real till.
  try {
    const staff = posDatabase
      .listUsers()
      .filter((user) => user.isActive)
      .map((user) => ({ id: user.id, name: user.name, role: user.role }))
    const generated = generatePracticeData(posDatabase, {
      days,
      actingUser: currentUser,
      staff: staff.length > 0 ? staff : [currentUser],
    })
    return { active: true, generated }
  } catch (error) {
    posDatabase.switchTo(realDbFilePath)
    dbFilePath = realDbFilePath
    practiceMode = false
    discardPracticeDatabase()
    throw error
  }
}

function exitPracticeMode(): PracticeModeStatus {
  if (!posDatabase) throw new Error('Database not ready')
  if (!practiceMode) return { active: false }
  posDatabase.switchTo(realDbFilePath)
  dbFilePath = realDbFilePath
  practiceMode = false
  discardPracticeDatabase()
  return { active: false }
}

// Replaces the live database with `filePath` and restarts the app into it. Only
// returns normally if something fails validation *before* the point of no return —
// on success the process exits before this function's return value is ever read.
function performImport(filePath: string): ImportDatabaseResult {
  if (currentUser?.role !== 'ADMIN') throw new Error('Only an Admin can import a database')
  if (practiceMode) throw new Error('Leave practice mode before restoring a backup')
  if (!posDatabase || !dbFilePath) return { imported: false }

  validateSqliteDatabaseFile(filePath)

  posDatabase.logAudit(currentUser, 'DATABASE_IMPORTED', filePath)
  posDatabase.checkpointWal()

  // Safety net: snapshot the current (about-to-be-overwritten) database first, so an
  // accidental or mistaken import is itself recoverable via the same restore flow.
  const dir = ensureBackupsDir()
  const preImportPath = path.join(dir, `duka_pos_preimport_${timestampForFilename()}.db`)
  fs.copyFileSync(dbFilePath, preImportPath)

  posDatabase.close()
  posDatabase = null

  for (const suffix of ['-wal', '-shm']) {
    try {
      fs.unlinkSync(dbFilePath + suffix)
    } catch {
      // no sidecar file present — fine
    }
  }

  fs.copyFileSync(filePath, dbFilePath)

  app.relaunch()
  app.exit(0)
  return { imported: true, path: filePath }
}

async function listInstalledPrinters(): Promise<PrinterInfo[]> {
  if (!mainWindow) return []
  const printers = await mainWindow.webContents.getPrintersAsync()
  return printers.map((printer) => ({
    name: printer.name,
    displayName: printer.displayName,
    description: printer.description,
  }))
}

// Prints for real only once the shop has picked an installed printer in Settings
// (printer_device_name) and that printer is still present — otherwise falls back
// to the old "simulated" behavior so the app keeps working with no hardware
// attached (dev machines, or before the Xprinter driver is installed).
async function printHtmlOrSimulate(
  database: PosDatabase,
  html: string
): Promise<{ printed: boolean; simulated: boolean }> {
  const deviceName = database.getSettings()[SETTINGS_KEYS.printerDeviceName]
  if (!deviceName) return { printed: true, simulated: true }

  const printers = await listInstalledPrinters()
  if (!printers.some((printer) => printer.name === deviceName)) {
    return { printed: true, simulated: true }
  }

  await printReceiptHtml(html, deviceName)
  return { printed: true, simulated: false }
}

function printReceiptDraft(database: PosDatabase, draft: ReceiptDraft): Promise<{ printed: boolean; simulated: boolean }> {
  return printHtmlOrSimulate(database, buildReceiptHtml(draft))
}

function printPriceList(database: PosDatabase): Promise<{ printed: boolean; simulated: boolean }> {
  const products = database.listProducts().filter((product) => product.isActive)
  const shopName = database.getSettings()[SETTINGS_KEYS.shopName] || 'Duka POS'
  return printHtmlOrSimulate(database, buildPriceListHtml(products, shopName))
}

// In dev/unpacked builds the icon sits at <project root>/resources/icon.ico,
// reachable relative to this bundled file. Once packaged, the app runs from
// inside app.asar and native window-icon APIs can't read through the asar
// archive, so electron-builder copies the icon out to extraResources instead —
// resolve it from process.resourcesPath there.
function resolveAppIconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icon.ico')
    : path.join(__dirname, '../../resources/icon.ico')
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: '#0b1020',
    title: 'Duka POS',
    icon: resolveAppIconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    window.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return window
}

function registerIpcHandlers(database: PosDatabase): void {
  ipcMain.handle(IPC_CHANNELS.bootstrap, () => database.bootstrap())

  ipcMain.handle(IPC_CHANNELS.listCategories, () => database.listCategories())
  ipcMain.handle(IPC_CHANNELS.createCategory, (_event, name: string) => database.createCategory(name))

  ipcMain.handle(IPC_CHANNELS.listProducts, () => database.listProducts())
  ipcMain.handle(IPC_CHANNELS.createProduct, (_event, input: ProductInput) => database.createProduct(input))
  ipcMain.handle(IPC_CHANNELS.updateProduct, (_event, id: number, input: ProductInput) =>
    database.updateProduct(id, input)
  )
  ipcMain.handle(IPC_CHANNELS.setProductActive, (_event, id: number, isActive: boolean) =>
    database.setProductActive(id, isActive)
  )
  // Permanent and unlike Deactivate not undoable, so it's Admin-only and logged.
  // The database refuses outright if the product has any history.
  ipcMain.handle(IPC_CHANNELS.deleteProduct, (_event, id: number) => {
    if (currentUser?.role !== 'ADMIN') throw new Error('Only an Admin can delete a product')
    const deleted = database.deleteProduct(id)
    database.logAudit(currentUser, 'PRODUCT_DELETED', deleted.name)
    return deleted
  })
  ipcMain.handle(IPC_CHANNELS.receiveStock, (_event, input: StockReceiptInput) => database.receiveStock(input))
  ipcMain.handle(IPC_CHANNELS.listStockReceipts, (_event, limit: number) => database.listStockReceipts(limit))

  ipcMain.handle(IPC_CHANNELS.getActiveShift, () => database.getActiveShift())
  ipcMain.handle(IPC_CHANNELS.openShift, (_event, input: OpenShiftInput) => {
    if (!currentUser) throw new Error('Not authenticated')
    return database.openShift(input, currentUser)
  })
  ipcMain.handle(IPC_CHANNELS.closeShift, (_event, input: CloseShiftInput) => {
    const result = database.closeShift(input)
    if (currentUser) {
      database.logAudit(currentUser, 'LOGOUT', 'shift closed')
      currentUser = null
    }
    runAutoBackup()
    return result
  })
  ipcMain.handle(IPC_CHANNELS.listRecentShifts, (_event, limit: number) => database.listRecentShifts(limit))

  ipcMain.handle(IPC_CHANNELS.recordSale, (_event, input: SaleInput) => {
    if (!currentUser) throw new Error('Not authenticated')
    return database.recordSale(input, currentUser)
  })
  ipcMain.handle(IPC_CHANNELS.listRecentSales, (_event, limit: number) => database.listRecentSales(limit))
  ipcMain.handle(IPC_CHANNELS.voidSale, (_event, input: VoidSaleInput) => {
    if (!currentUser) throw new Error('Not authenticated')
    return database.voidSale(input.saleId, input.reason, currentUser)
  })

  ipcMain.handle(IPC_CHANNELS.recordExpense, (_event, input: ExpenseInput) => database.recordExpense(input))
  ipcMain.handle(IPC_CHANNELS.listExpensesByShift, (_event, shiftId: number) => database.listExpensesByShift(shiftId))
  ipcMain.handle(IPC_CHANNELS.listRecentExpenses, (_event, limit: number) => database.listRecentExpenses(limit))

  ipcMain.handle(IPC_CHANNELS.recordDomesticConsumption, (_event, input: DomesticConsumptionInput) =>
    database.recordDomesticConsumption(input)
  )
  ipcMain.handle(IPC_CHANNELS.listDomesticConsumption, (_event, limit: number) =>
    database.listDomesticConsumption(limit)
  )

  ipcMain.handle(IPC_CHANNELS.listCustomerBalances, () => database.listCustomerBalances())
  ipcMain.handle(IPC_CHANNELS.recordDebtRepayment, (_event, input: DebtRepaymentInput) =>
    database.recordDebtRepayment(input)
  )
  ipcMain.handle(IPC_CHANNELS.recordCustomerDebt, (_event, input: CustomerDebtInput) =>
    database.recordCustomerDebt(input)
  )
  ipcMain.handle(IPC_CHANNELS.getCustomerHistory, (_event, customerName: string) =>
    database.getCustomerHistory(customerName)
  )

  ipcMain.handle(IPC_CHANNELS.getSettings, () => database.getSettings())
  ipcMain.handle(IPC_CHANNELS.setSetting, (_event, key: string, value: string) => {
    if (ADMIN_ONLY_SETTING_PREFIXES.some((prefix) => key.startsWith(prefix)) && currentUser?.role !== 'ADMIN') {
      throw new Error('Only an Admin can change this setting')
    }
    const result = database.setSetting(key, value)
    if (key.startsWith('perm_')) database.logAudit(currentUser, 'PERMISSION_CHANGED', `${key} = ${value}`)
    return result
  })

  ipcMain.handle(IPC_CHANNELS.listUsers, () => database.listUsers())
  ipcMain.handle(IPC_CHANNELS.createUser, (_event, input: CreateUserInput) => {
    const isBootstrap = database.countUsers() === 0
    if (!isBootstrap && currentUser?.role !== 'ADMIN') {
      throw new Error('Only an Admin can add staff accounts')
    }
    const user = database.createUser(input)
    database.logAudit(currentUser, 'USER_CREATED', `${user.name} (${user.role})`)
    return user
  })
  ipcMain.handle(IPC_CHANNELS.updateUser, (_event, id: number, input: UpdateUserInput) => {
    if (currentUser?.role !== 'ADMIN') throw new Error('Only an Admin can edit staff accounts')
    const user = database.updateUser(id, input)
    database.logAudit(currentUser, 'USER_UPDATED', `${user.name} (${user.role})`)
    return user
  })
  ipcMain.handle(IPC_CHANNELS.setUserPin, (_event, id: number, pin: string) => {
    if (currentUser?.role !== 'ADMIN') throw new Error('Only an Admin can reset a staff PIN')
    database.setUserPin(id, pin)
    database.logAudit(currentUser, 'USER_PIN_RESET', `user #${id}`)
  })
  ipcMain.handle(IPC_CHANNELS.setUserActive, (_event, id: number, isActive: boolean) => {
    if (currentUser?.role !== 'ADMIN') throw new Error('Only an Admin can activate/deactivate staff')
    const user = database.setUserActive(id, isActive)
    database.logAudit(currentUser, isActive ? 'USER_REACTIVATED' : 'USER_DEACTIVATED', user.name)
    return user
  })
  ipcMain.handle(IPC_CHANNELS.login, (_event, input: LoginInput) => {
    const user = database.verifyUserLogin(input.userId, input.pin)
    currentUser = user
    database.logAudit(user, 'LOGIN')
    return user
  })
  ipcMain.handle(IPC_CHANNELS.listAuditLog, (_event, limit: number) => database.listAuditLog(limit))

  ipcMain.handle(IPC_CHANNELS.getAnalyticsSummary, (_event, range: AnalyticsRange) =>
    database.getAnalyticsSummary(range)
  )

  ipcMain.handle(IPC_CHANNELS.buildReceiptDraft, (_event, saleId: number) => database.buildReceiptDraft(saleId))
  ipcMain.handle(IPC_CHANNELS.buildTestReceiptDraft, () => database.buildTestReceiptDraft())
  ipcMain.handle(IPC_CHANNELS.printReceipt, (_event, draft: ReceiptDraft) => printReceiptDraft(database, draft))
  ipcMain.handle(IPC_CHANNELS.printPriceList, () => printPriceList(database))
  ipcMain.handle(IPC_CHANNELS.listPrinters, () => listInstalledPrinters())

  // setLoginItemSettings writes the same HKCU\...\Run value the installer's
  // "start with Windows" checkbox does, so flipping this in Settings and ticking
  // the box at install time are two doors onto one switch — they can't disagree.
  // Reading it back (rather than trusting what we last wrote) is what returns.
  ipcMain.handle(IPC_CHANNELS.getPracticeMode, () => ({ active: practiceMode }))
  ipcMain.handle(IPC_CHANNELS.enterPracticeMode, (_event, days: number) => enterPracticeMode(days))
  ipcMain.handle(IPC_CHANNELS.exitPracticeMode, () => exitPracticeMode())

  ipcMain.handle(IPC_CHANNELS.getAutoStart, () => app.getLoginItemSettings().openAtLogin)
  ipcMain.handle(IPC_CHANNELS.setAutoStart, (_event, enabled: boolean) => {
    if (currentUser?.role !== 'ADMIN') throw new Error('Only an Admin can change start-up behaviour')
    // In dev the "executable" is electron.exe, so registering there would launch a
    // bare Electron shell at login rather than the till. Packaged builds only.
    if (!app.isPackaged) throw new Error('Start with Windows only applies to the installed app')
    app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath, args: [] })
    return app.getLoginItemSettings().openAtLogin
  })

  ipcMain.handle(IPC_CHANNELS.exportDatabase, async () => {
    if (currentUser?.role !== 'ADMIN') throw new Error('Only an Admin can export the database')
    if (!mainWindow) return { exported: false }
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Duka POS database',
      defaultPath: `duka_pos_backup_${timestampForFilename()}.db`,
      filters: [{ name: 'SQLite database', extensions: ['db'] }],
    })
    if (canceled || !filePath) return { exported: false }
    database.checkpointWal()
    fs.copyFileSync(dbFilePath, filePath)
    database.logAudit(currentUser, 'BACKUP_EXPORTED', filePath)
    return { exported: true, path: filePath }
  })

  ipcMain.handle(IPC_CHANNELS.listBackups, () => listBackupFiles())

  ipcMain.handle(IPC_CHANNELS.pickImportFile, async () => {
    if (currentUser?.role !== 'ADMIN') throw new Error('Only an Admin can import a database')
    if (!mainWindow) return null
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Duka POS database',
      filters: [{ name: 'SQLite database', extensions: ['db'] }],
      properties: ['openFile'],
    })
    if (canceled || filePaths.length === 0) return null
    validateSqliteDatabaseFile(filePaths[0])
    return filePaths[0]
  })

  ipcMain.handle(IPC_CHANNELS.restoreBackup, (_event, filePath: string) => performImport(filePath))
}

// Test-only escape hatch: point userData at an isolated scratch directory so a
// live-driven verification session never touches the real shop database. No-op
// (and thus safe to leave in production builds) when the env var is unset.
if (process.env.DUKA_POS_TEST_DATA_DIR) {
  app.setPath('userData', process.env.DUKA_POS_TEST_DATA_DIR)
} else if (!app.isPackaged) {
  // Running from source gets its own folder, so testing can never write into the
  // shop's real database. These used to be the same directory — `npm run dev` and
  // the installed till both opened it — which is why reinstalling appeared to
  // carry old data across: nothing was carried, the app simply never left.
  app.setPath('userData', path.join(app.getPath('appData'), `${app.getName()} (dev)`))
}

app.whenReady().then(() => {
  realDbFilePath = path.join(app.getPath('userData'), 'duka_pos.db')
  practiceDbFilePath = path.join(app.getPath('userData'), 'duka_pos_practice.db')
  // Always start on the real database. Practice mode lasts for as long as the app
  // is open and no longer — so a till left switched on overnight can never be
  // found the next morning quietly taking practice sales.
  discardPracticeDatabase()
  dbFilePath = realDbFilePath
  posDatabase = new PosDatabase(dbFilePath)
  registerIpcHandlers(posDatabase)
  mainWindow = createWindow()

  setInterval(() => {
    if (posDatabase?.getActiveShift()) runAutoBackup()
  }, AUTO_BACKUP_INTERVAL_MS)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  mainWindow = null
})
