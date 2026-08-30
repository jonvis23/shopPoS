# Duka POS — Cereal Edition

Offline-first Electron POS for a Kenyan cereal retail/wholesale shop. Single package,
no server, no cloud, no network calls anywhere. Everything lives in one local SQLite file.

## Commands

```bash
npm run dev        # electron-vite dev — uses a SEPARATE "Duka POS (dev)" userData dir
npm run typecheck  # tsc twice: tsconfig.node.json (main+preload) then tsconfig.json (renderer)
npm run build      # bundles to out/
npm run dist       # build + electron-builder --win (NSIS installer)
```

There is no test suite, linter, or CI. `npm run typecheck` is the only automated check —
run it after any change that crosses the process boundary.

## Architecture

Three build targets, one shared contract.

```
RENDERER (untrusted)     PRELOAD (bridge)        MAIN (trusted Node)
src/renderer/src         src/preload/index.ts    src/main/
React 19, Tailwind v4    PosApi method →         index.ts        IPC + auth + backups
No fs, no node, no DB    ipcRenderer.invoke      database.ts     PosDatabase (all SQL)
                         Zero logic              practiceData.ts
                                                 receiptPrint.ts
                                                 priceListPrint.ts

              src/shared/ — imported by BOTH sides
              ipc.ts   PosApi + IPC_CHANNELS + all record types  ← the contract
              stock.ts pricing / weight domain logic
              period.ts, datetime.ts, defaultPriceList.ts
```

**`src/shared/ipc.ts` is the single source of truth.** It declares the `PosApi` interface,
every record/input type, and the namespaced `IPC_CHANNELS` map (`sale:`, `shift:`, `catalog:`,
`auth:`, `analytics:`, `backup:`, …). The preload implements `PosApi`, main registers handlers
for the same channels, and `src/renderer/src/global.d.ts` declares `Window.electronAPI: PosApi`.

**Adding an IPC method means touching four places, in this order:**
1. `src/shared/ipc.ts` — the type + the channel constant
2. `src/main/index.ts` — `ipcMain.handle(IPC_CHANNELS.x, ...)`
3. `src/preload/index.ts` — the one-line `invoke` passthrough
4. the calling component

`npm run typecheck` catches you if you miss one.

## Load-bearing constraints

Break these and something non-obvious breaks downstream.

### Do not add a native module — especially not `better-sqlite3`

`src/main/database.ts` uses `import { DatabaseSync } from 'node:sqlite'` — Node 22's built-in
SQLite, which ships inside Electron 38. The runtime `dependencies` block is only `react`,
`react-dom`, and a font. This is deliberate: **zero native modules means no ABI rebuild against
Electron's Node version and no compiler toolchain needed to produce the installer.** Adding any
native dependency reintroduces that whole class of build problem.

### Never trust the renderer

Devtools can call any `window.electronAPI` method directly, so the renderer's claims about who
is logged in are meaningless. Session state is `let currentUser: SessionUser | null` in
`src/main/index.ts`, set only by a PIN-verified `login()`. Authorisation checks belong in the
main process handler or in `PosDatabase`, never in the UI — the UI only decides what to *show*.

PINs are 4 digits, hashed with `scryptSync` + a per-user 16-byte salt, compared with
`timingSafeEqual`. Admin-gated: `deleteProduct`, all user mutations, `setAutoStart`,
export/import, `enterPracticeMode`, and `setSetting` for any key prefixed `perm_` or `printer_`.

> **Known gap:** several write handlers do not check `currentUser` and trust the renderer-supplied
> `shiftId` — `recordExpense`, `receiveStock`, `recordDomesticConsumption`, `recordCustomerDebt`,
> `recordDebtRepayment`, `closeShift`, `createCategory`, and the product mutators. The pattern
> exists but is applied unevenly. Adding a check to any of these is a welcome fix; adding a new
> handler *without* one continues a bug.

### Practice mode is a separate database file, not a flag column

`enterPracticeMode` copies the real DB to `duka_pos_practice.db` and calls `PosDatabase.switchTo()`,
which swaps the connection *inside* the existing instance so already-registered IPC closures stay
valid. Generated trading is written through the real `recordSale`/`recordExpense`/`openShift`
paths, then back-dated.

Nothing filters or flags practice rows — they are in a different file altogether, which is the
only version of this that cannot leak into the shop's records. **Do not "simplify" this into an
`is_practice` column.** Auto-backups are skipped while practice mode is active, and the practice
file is deleted on exit and on every app start.

### Receipts are HTML through Chromium, not ESC/POS

`src/main/receiptPrint.ts` builds an 80mm-styled HTML page and prints it via a hidden
`BrowserWindow` + `webContents.print({ silent: true, deviceName })`. No `escpos`, no `node-usb`,
no vendor command sets to maintain (and see the native-module rule above).

It measures `document.body.scrollHeight` and passes an explicit micron `pageSize` because some
Windows receipt drivers ignore `@page { size: 80mm auto }` and default to A4 length — wasting
roughly a foot of paper per sale. Don't remove that measurement step.

`printHtmlOrSimulate()` returns `{ printed: true, simulated: true }` when no printer is
configured, so the app stays fully usable with no hardware attached. Keep that fallback.

### `productName` must stay at the top level of package.json

Electron reads the app name from top-level `productName`, **not** from `build.productName`.
Without it the installed app falls back to `name` and stores its database in
`%APPDATA%\duka-pos-cereal-edition` — the same folder `npm run dev` uses — so a fresh install
opens the *development* database. There is a `"//productName"` comment key in `package.json`
recording this.

## Data layer

One class, `PosDatabase` (`src/main/database.ts`), raw parameterised SQL, no ORM.

- **Schema** is the inline `SCHEMA_SQL` template string, applied with `CREATE TABLE IF NOT EXISTS`
  on every boot. 14 tables: `categories`, `products`, `shifts`, `sales`, `sale_items`, `expenses`,
  `stock_receipts`, `domestic_consumption`, `debt_repayments`, `customer_debt_entries`, `users`,
  `audit_log`, `settings` (key/value).
- **Migrations** are additive only: `migrateSchema()` → `ensureColumn(table, col, def)`, which reads
  `PRAGMA table_info` and issues `ALTER TABLE ... ADD COLUMN` if absent. No migrations directory.
  To add a column: extend `SCHEMA_SQL` *and* add an `ensureColumn` call, so existing installs get it.
- **Pragmas**: `journal_mode = WAL`, `synchronous = FULL`, `foreign_keys = ON`.
- **Transactions** are manual `BEGIN`/`COMMIT`/`ROLLBACK` in try/catch around multi-write paths.
- **Mappers** are hand-written snake_case → camelCase (`mapProduct`, `mapShift`, `mapSaleRow`, …).
  Every mutator re-selects and returns the mapped record.
- **Business rules** live as inline `throw new Error(...)` with sentences written for shop staff —
  the renderer surfaces them verbatim via `cleanErrorMessage()` in `App.tsx`, which strips
  Electron's `Error invoking remote method '...':` prefix. Write error messages accordingly.
- **No `customers` table.** Customers are denormalised name strings; `listCustomerBalances()`
  reconstructs balances by grouping four queries in JS.
- **Timezone**: SQLite's `CURRENT_TIMESTAMP` is UTC with no marker. `toIsoUtc()` in
  `src/shared/period.ts` tags it with `Z` on read; SQL that groups by local day uses
  `strftime(..., '+3 hours')`, hard-coded for Nairobi/EAT.

### Durability

No sync, no replication — backup and restore only. `runAutoBackup()` checkpoints WAL and copies
the file into `userData/backups/`, on every shift close and on a 15-minute timer while a shift is
open, keeping the newest 20. Restore validates the `SQLite format 3\0` header *and* that
`sales`/`users`/`products` exist, writes a pre-import snapshot, then `app.relaunch()`.

## Renderer

No router, no state library, no UI kit, no icon package, no chart library. All hand-written.

- **Navigation** is a `useState<ViewKey>` union in `App.tsx` (`'analytics' | 'current' |
  'transactions' | 'inventory' | 'customers' | 'settings'`), switched with conditional JSX.
  Settings has its own nested tab union.
- **State**: one `DashboardSnapshot` from a single `bootstrap()` call, patched by four granular
  refreshers (`refreshProducts`, `refreshShift`, `refreshSettings`, `refreshCategories`) rather
  than refetched wholesale. Per-page data is fetched locally on mount. No Context provider —
  `showToast` is prop-drilled.
- **The sell screen is hidden with CSS, never unmounted.** An un-checked-out cart lives only in
  component state, so unmounting it to go look at a receipt silently discarded the customer's
  items. It is also `key`ed on practice mode so a real cart can never be checked out against
  practice data. Don't convert this to conditional rendering.
- **Styling** is Tailwind v4 CSS-first — there is no `tailwind.config.js`; the `@theme` block and
  the `html.theme-warm` / `.theme-sage` palettes live in `src/renderer/src/styles.css`.
  `--osk-height` shrinks the app shell above the docked on-screen keyboard rather than covering it.

## Domain notes

This is a cereal shop, not a supermarket — the model reflects the trade.

- Goods are sold **by weight**; `KG_PER_BAG = 90`. Stock displays as "9 bags 30 kg (840 kg)".
- **Two-tier pricing auto-switches** to wholesale at `WHOLESALE_MIN_KG = 5` (`resolveUnitPrice`).
  The cart is bidirectional: enter kg or enter KES and `resolveQtyFromAmount` derives the other.
- **M-Pesa is a first-class payment column** (`cash_paid` / `mpesa_paid` / `debt_amount` on every
  sale), but there is **no Daraja/STK-push integration** — amounts are keyed in by hand and
  reconciled at shift close via `expected_mpesa` / `variance_mpesa`.
- **Domestic consumption** (stock the owner takes home) has its own table so it never inflates
  revenue and never touches cash reconciliation — no money moved. Its *cost* is deducted from
  `estimatedGrossProfit` in Analytics (but deliberately not from `estimatedCogs` — the goods were
  never sold), and entries are listed per-product in the Stock panel and as amber rows in
  Transactions. Amber throughout, never the red used for expenses: both are deductions, but only
  expenses take money out of the till.
- **The shift is the unit of accountability**: open with a cash + M-Pesa float, close with counted
  actuals → variance → Z-report → forced logout.
- **Receipt numbers are deliberately non-sequential** (`formatReceiptNumber` in `stock.ts`) — a
  Knuth multiplicative hash XOR'd and masked to 5 hex digits. It's a bijection, so no collisions,
  but two receipts printed weeks apart can't be diffed to infer the shop's sales volume.
- **No barcode scanner and no cash drawer support.** Products are picked from a grid and sold by weight.

## Conventions

The codebase explains *why*, not *what*. Comments are reserved for decisions a reader would
otherwise undo — the ones above all came from source comments. Match that: skip narration of what
the line does, and leave a note when you've chosen something non-obvious for a reason.
