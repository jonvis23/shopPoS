import { useEffect, useMemo, useState } from 'react'
import type {
  AgedDebtor,
  AnalyticsExpenseCategoryRow,
  AnalyticsHourlyRow,
  AnalyticsProductRow,
  AnalyticsStaffRow,
  AnalyticsSummary,
  ProductRecord,
} from '../../../shared/ipc'
import type { ViewKey } from '../components/TopNav'
import { summarizeStock, toCurrency } from '../../../shared/stock'
import { formatHour } from '../../../shared/datetime'
import {
  PERIOD_PRESET_LABELS,
  customLocalRange,
  expectedLocalDateKeys,
  presetLocalRange,
  toPeriodRange,
} from '../../../shared/period'
import type { PeriodPresetKey } from '../../../shared/period'
import { AnalyticsPeriodPicker } from '../components/AnalyticsPeriodPicker'
import type { PeriodSelection } from '../components/AnalyticsPeriodPicker'
import { BreakdownRow, BreakdownShell, InfoDot, MetricTile, ShopWideChip } from '../components/analytics/MetricTile'
import type { Delta } from '../components/analytics/MetricTile'
import { ProductFilterPicker } from '../components/analytics/ProductFilterPicker'
import { EyeIcon, EyeOffIcon } from '../components/Icons'
import { FoldButton } from '../components/FoldButton'
import { ExpensesReport } from '../components/reports/ExpensesReport'
import { ShiftHistoryTab } from './settings/ShiftHistoryTab'

// Why a card refuses to follow the product filter. Cash, M-Pesa, debt, discounts
// and expenses are all recorded against a whole sale, never against the line of
// one product inside it — a cart of maize and beans paid half in cash leaves no
// record of which half the cash was for. Splitting them would be invention.
const SHOP_WIDE =
  'Recorded per sale, not per product, so this stays the whole shop’s figure even while a product is selected.'

// Plain-English, shop-language explanations behind each ⓘ. Each one says what the
// number counts AND what it leaves out — a metric you half-understand is worse
// than one you don't, because you act on it.
const INFO = {
  moneyKept:
    'Sales, less what the goods cost you, less expenses — what the shop actually made. Stock taken home is already taken off. Goods sold on credit count here even though the money is not in your hand yet — see Sold on credit.',
  revenue:
    'Everything sold in this period at the price it actually went for, including goods taken on credit. Voided sales are left out. Nothing is taken off — this is money earned, not profit.',
  profit:
    'Sales minus what those goods cost you, before expenses are taken off. Each kilo is costed at what the stock cost when it was sold — the average across deliveries, so 10 bags left at 4,000 and 10 new at 4,500 cost 4,250 each. Sales recorded before this was tracked use today’s buying price instead. A product with no buying price recorded counts as costing nothing.',
  expenses:
    'Money paid out in this period — transport, fuel, rent and the like, logged with the Expense button in the top bar. Taken off in Profit.',
  takeHome:
    'Stock taken home rather than sold, valued at what it cost you. No money moved, so it never touches revenue or your cash reconciliation — but the goods are gone, so Estimated profit above is already net of this. Log it with Take home on a product in Stock.',
  debt:
    'The part of this period’s sales that went out unpaid. It is already inside Sales, which is why the share matters: it tells you how much of what you sold is not yet in your hand. Balances typed in on the Customers page (from the old notebook, say) are not sales, so they are shown separately in the breakdown.',
  transactions: 'How many completed sales were rung up in this period. Voided sales are not counted.',
  basket: 'Sales divided by the number of sales — what a typical customer spent in this period.',
  paymentMix:
    'How this period’s sales were settled. Cash and M-Pesa are money in hand; Debt is goods gone out unpaid. Shown as shares so a busy day and a quiet one can be compared at a glance — hover any figure for the exact amount.',
  quantity:
    'Total weight that left the store in this period, added up across every product. Voided sales are excluded, so it agrees with what actually came off the shelf.',
} as const

interface AnalyticsPageProps {
  canViewReports: boolean
  onNavigate: (view: ViewKey) => void
}

type Money = (amount: number) => string

const MASKED = 'KES •••••'
const HIDE_KEY = 'duka-pos-reports-hidden'

const isMasked = (money: Money) => money(0) === MASKED

// Masked, not blurred: a blurred six-figure total still gives away its length and
// roughly its first digit to whoever is standing at the counter. Remembered per
// till, because an owner who hides figures once wants them hidden next time too.
function loadHidden(): boolean {
  try {
    return localStorage.getItem(HIDE_KEY) === 'true'
  } catch {
    return false
  }
}

function formatShortLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// The axis strip is 24 columns of ~9px text, so it drops the space ("2PM") while
// the tooltip, which has room, spells it out in full ("2 PM").
function formatHourLabel(hour: number): string {
  return formatHour(hour).replace(' ', '')
}

const WEEKDAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Says out loud, inside the ⓘ itself, that the number has been narrowed — so a
// figure read from a filtered dashboard can't be mistaken for the shop's.
function scopeInfo(text: string, filter: AnalyticsSummary['productFilter']): string {
  if (!filter) return text
  return `${filter.productName} only. ${text}`
}

function pct(part: number, whole: number): string {
  if (whole <= 0) return '0%'
  return `${((part / whole) * 100).toFixed(part / whole < 0.1 ? 1 : 0)}%`
}

function deltaFor(current: number, previous: number): Delta {
  if (previous === 0) return current > 0 ? 'new' : null
  const pct = ((current - previous) / previous) * 100
  return { pct, direction: pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat' }
}

type ReportView = 'sales' | 'expenses' | 'shifts'

// Three ways into the same screen: the numbers for a period, the expenses for that
// period, or the closed shifts with their Z-reports. All sit under one title so an admin
// never has to hunt for any of them.
function ReportViewTabs({ view, onChange }: { view: ReportView; onChange: (view: ReportView) => void }) {
  const tabs: Array<{ key: ReportView; label: string }> = [
    { key: 'sales', label: 'Sales & profit' },
    { key: 'expenses', label: 'Expenses' },
    { key: 'shifts', label: 'Shift reports' },
  ]
  return (
    <div className="flex w-fit items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
      <h2 className="px-2 text-sm font-bold tracking-tight text-slate-900 dark:text-white">Reports</h2>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          aria-pressed={view === tab.key}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 ${
            view === tab.key
              ? 'bg-white text-emerald-600 shadow-sm dark:bg-slate-900 dark:text-emerald-400'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export function AnalyticsPage({ canViewReports, onNavigate }: AnalyticsPageProps) {
  const [selection, setSelection] = useState<PeriodSelection>('today')
  const [customFrom, setCustomFrom] = useState<string | null>(null)
  const [customTo, setCustomTo] = useState<string | null>(null)
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState<ProductRecord[]>([])
  const [productId, setProductId] = useState<number | null>(null)
  const [hidden, setHidden] = useState(loadHidden)
  const [view, setView] = useState<ReportView>('sales')

  useEffect(() => {
    try {
      localStorage.setItem(HIDE_KEY, String(hidden))
    } catch {
      // Private window or blocked storage — the toggle still works for this visit.
    }
  }, [hidden])

  const money: Money = (amount) => (hidden ? MASKED : toCurrency(amount))

  const localRange = useMemo(() => {
    if (selection === 'custom' && customFrom && customTo) return customLocalRange(customFrom, customTo)
    return presetLocalRange(selection === 'custom' ? 'today' : (selection as PeriodPresetKey))
  }, [selection, customFrom, customTo])

  const periodRange = useMemo(() => toPeriodRange(localRange), [localRange])
  const range = useMemo(() => ({ ...periodRange, productId }), [periodRange, productId])
  const periodLabel = selection === 'custom' ? 'This period' : PERIOD_PRESET_LABELS[selection]
  const expectedDays = useMemo(() => expectedLocalDateKeys(localRange), [localRange])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    window.electronAPI
      .getAnalyticsSummary(range)
      .then((data) => {
        if (!cancelled) setSummary(data)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.fromISO, range.toISO, range.productId])

  useEffect(() => {
    window.electronAPI.listProducts().then(setProducts).catch(() => undefined)
  }, [])

  // The period picker and the hide toggle are shared by the Sales and Expenses views,
  // so both always read the same period and the same masking.
  const periodPicker = (
    <AnalyticsPeriodPicker
      selection={selection}
      customFrom={customFrom}
      customTo={customTo}
      onPresetSelect={(key) => setSelection(key)}
      onCustomApply={(from, to) => {
        setCustomFrom(from)
        setCustomTo(to)
        setSelection('custom')
      }}
    />
  )
  const hideToggle = (
    <button
      type="button"
      onClick={() => setHidden((h) => !h)}
      aria-pressed={hidden}
      title={hidden ? 'Show amounts' : 'Hide amounts from anyone looking at the screen'}
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-all duration-150 active:scale-95 ${
        hidden
          ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
      }`}
    >
      {hidden ? <EyeOffIcon width={14} height={14} /> : <EyeIcon width={14} height={14} />}
      {hidden ? 'Amounts hidden' : 'Hide amounts'}
    </button>
  )

  if (view === 'shifts') {
    return (
      <div className="flex h-full flex-col p-6">
        <ReportViewTabs view={view} onChange={setView} />
        <div className="mt-4 min-h-0 flex-1">
          <ShiftHistoryTab canViewReports={canViewReports} />
        </div>
      </div>
    )
  }

  if (view === 'expenses') {
    return (
      <div className="h-full overflow-y-auto p-6">
        <ReportViewTabs view={view} onChange={setView} />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">{hideToggle}</div>
          {periodPicker}
        </div>
        <div className="mt-4">
          <ExpensesReport range={periodRange} periodLabel={periodLabel} money={money} />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <ReportViewTabs view={view} onChange={setView} />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">{hideToggle}</div>
        <ProductFilterPicker products={products} selectedId={productId} onChange={setProductId} />
        {periodPicker}
      </div>

      {loading && <div className="mt-10 text-center text-sm text-slate-400">Loading analytics…</div>}

      {!loading && summary && (
        <>
          {summary.productFilter && (
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs dark:border-emerald-500/30 dark:bg-emerald-500/10">
              <span className="font-bold text-emerald-800 dark:text-emerald-300">
                Showing {summary.productFilter.productName} only
              </span>
              <span className="text-emerald-700/80 dark:text-emerald-400/80">
                — revenue, profit, quantity, transactions, the trends and the staff table are this product&apos;s
                alone. Cards marked <span className="font-semibold">whole shop</span> are still the shop&apos;s total,
                because they are recorded per sale rather than per product.
              </span>
              <button
                type="button"
                onClick={() => setProductId(null)}
                className="ml-auto shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-emerald-700 transition-all duration-150 hover:bg-emerald-100 active:scale-95 dark:bg-slate-900 dark:text-emerald-400"
              >
                Show all products
              </button>
            </div>
          )}

          {canViewReports && !summary.productFilter && (
            <SummarySentence summary={summary} periodLabel={periodLabel} money={money} />
          )}
          <NeedsAttention summary={summary} canViewReports={canViewReports} money={money} onNavigate={onNavigate} />

          {/* Tier 1 — hero KPIs. Expenses and Debt open a breakdown in place. */}
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
            {/* Shop-wide only: expenses can't be split by product, so profit on
                one product would be that product's profit less the whole shop's
                rent. */}
            {!summary.productFilter && (
              <MetricTile
                label="Profit"
                value={money(summary.moneyKept)}
                tone={summary.moneyKept < 0 ? 'warn' : undefined}
                locked={!canViewReports}
                info={INFO.moneyKept}
                delta={deltaFor(summary.moneyKept, summary.previousPeriod.moneyKept)}
              />
            )}
            <MetricTile
              label="Sales"
              value={money(summary.totalSales)}
              locked={!canViewReports}
              info={scopeInfo(INFO.revenue, summary.productFilter)}
              delta={deltaFor(summary.totalSales, summary.previousPeriod.totalSales)}
            />
            <MetricTile
              label="Profit before expenses"
              value={money(summary.estimatedGrossProfit)}
              tone={summary.estimatedGrossProfit < 0 ? 'warn' : undefined}
              locked={!canViewReports}
              info={scopeInfo(INFO.profit, summary.productFilter)}
              delta={deltaFor(summary.estimatedGrossProfit, summary.previousPeriod.estimatedProfit)}
            />
            <MetricTile
              label="Expenses"
              value={money(summary.totalExpenses)}
              locked={!canViewReports}
              info={INFO.expenses}
              note={summary.productFilter ? SHOP_WIDE : undefined}
              sub={
                summary.expensesByCategory.length > 0
                  ? `${summary.expensesByCategory.length} categor${summary.expensesByCategory.length === 1 ? 'y' : 'ies'}`
                  : undefined
              }
              breakdown={<ExpenseBreakdown rows={summary.expensesByCategory} total={summary.totalExpenses} money={money} />}
            />
            {/* No SHOP_WIDE note, unlike Expenses beside it: take-home is recorded
                against a product, so under a filter this figure narrows honestly. */}
            <MetricTile
              label="Taken home"
              value={money(summary.domesticConsumptionCost)}
              tone="warn"
              locked={!canViewReports}
              info={scopeInfo(INFO.takeHome, summary.productFilter)}
              sub={
                summary.domesticConsumptionKg > 0 ? `${summary.domesticConsumptionKg.toFixed(1)} kg` : undefined
              }
            />
            <MetricTile
              label="Sold on credit"
              value={money(summary.debtAccrued)}
              tone="warn"
              locked={!canViewReports}
              info={INFO.debt}
              note={summary.productFilter ? SHOP_WIDE : undefined}
              sub={
                // Suppressed under a product filter: shop-wide debt over one
                // product's revenue is two different scopes divided by each other,
                // and it can happily print "340% of revenue".
                summary.productFilter ? undefined : (
                  <span className={summary.debtAccrued > 0 ? 'text-red-500 dark:text-red-400' : undefined}>
                    {pct(summary.debtAccrued, summary.totalSales)} of sales
                  </span>
                )
              }
              breakdown={<DebtBreakdown summary={summary} money={money} />}
            />
            <MetricTile
              label={summary.productFilter ? 'Sales including it' : 'Number of sales'}
              value={String(summary.totalTransactions)}
              info={
                summary.productFilter
                  ? `How many completed sales included ${summary.productFilter.productName}. A cart holding it alongside three other things counts once. Voided sales are not counted.`
                  : INFO.transactions
              }
              delta={deltaFor(summary.totalTransactions, summary.previousPeriod.totalTransactions)}
            />
            <MetricTile
              label={summary.productFilter ? 'Avg per sale' : 'Average per customer'}
              value={money(summary.averageBasketValue)}
              locked={!canViewReports}
              info={
                summary.productFilter
                  ? `What a customer typically spent on ${summary.productFilter.productName} in a sale that included it — this product's revenue divided by those sales. Anything else in the same cart is left out.`
                  : INFO.basket
              }
            />
          </div>

          {canViewReports && (
            <>
              {/* Tier 2 — payment & volume. The old standalone Debt card lives inside
                  the Debt accrued tile now, so it isn't printed twice. */}
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="overflow-hidden rounded-xl border border-slate-200 p-4 shadow-sm dark:border-slate-800">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Payment mix</div>
                    <div className="flex shrink-0 items-center gap-1">
                      {summary.productFilter && <ShopWideChip reason={SHOP_WIDE} />}
                      <InfoDot label="Payment mix" text={INFO.paymentMix} />
                    </div>
                  </div>
                  <div className="mt-4">
                    <PaymentMixBar cash={summary.cashCollected} mpesa={summary.mpesaCollected} debt={summary.debtAccrued} money={money} />
                  </div>
                </div>

                <MetricTile
                  label="Bags sold"
                  value={
                    // A product filter narrows the total to one product, so its
                    // own bag size converts cleanly. Shop-wide, the total mixes
                    // whatever products sold — no single bag size applies, so it
                    // falls back to the standard bag like the Stock screen does.
                    summarizeStock(
                      summary.totalQuantitySoldKg,
                      summary.productFilter ? products.find((p) => p.id === summary.productFilter?.productId)?.weightPerBag : undefined
                    ).label
                  }
                  info={scopeInfo(INFO.quantity, summary.productFilter)}
                  sub={
                    // Discounts are struck on the whole cart, so under a filter
                    // they say nothing about this product and are dropped rather
                    // than shown beside a number that is about it.
                    summary.productFilter ? undefined : (
                      <>
                        Discounts given:{' '}
                        <span className="font-semibold text-slate-600 dark:text-slate-300">
                          {money(summary.totalDiscountGiven)}
                        </span>
                      </>
                    )
                  }
                  breakdown={
                    <QuantityBreakdown rows={summary.productsByQuantity} total={summary.totalQuantitySoldKg} />
                  }
                />
              </div>

              {/* Tier 3 — products. Both tables rank products against each other,
                  which a one-product view has nothing to say about, so they step
                  aside rather than showing a league table of one. */}
              {!summary.productFilter && (
                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <ProductTable title="Top 10 best-sellers" rows={summary.topProducts} money={money} />
                  <ProductTable
                    title="Least-selling"
                    rows={summary.leastSellingProducts}
                    money={money}
                    footer={`${summary.productsWithNoSalesCount} active product${summary.productsWithNoSalesCount === 1 ? '' : 's'} had no sales this period.`}
                  />
                </div>
              )}

              {/* Tier 4 — customers */}
              <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 shadow-sm dark:border-slate-800">
                <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:bg-slate-900">
                  Who owes you <span className="font-normal normal-case text-slate-400">(biggest first, with how long the oldest part has been unpaid)</span>
                  {summary.productFilter && <ShopWideChip reason={SHOP_WIDE} />}
                </div>
                <DebtorsTable rows={summary.agedDebtors} money={money} />
              </div>

              {/* Tier 5 — trends & traffic */}
              <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 p-4 shadow-sm dark:border-slate-800">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Sales trend</div>
                <div className="mt-3 max-h-64 overflow-y-auto pr-1">
                  <BarList
                    rows={expectedDays.map((date) => ({
                      label: formatShortLabel(date),
                      value: summary.dailyBreakdown.find((d) => d.date === date)?.totalSales ?? 0,
                    }))}
                    valueFormatter={money}
                    barClassName="bg-emerald-500"
                  />
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="overflow-hidden rounded-xl border border-slate-200 p-4 shadow-sm dark:border-slate-800">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Weekday performance</div>
                  <div className="mt-3">
                    <BarList
                      rows={WEEKDAY_ORDER.map((weekday) => ({
                        label: weekday,
                        value: summary.weekdayBreakdown.find((w) => w.weekday === weekday)?.totalSales ?? 0,
                      }))}
                      valueFormatter={money}
                      barClassName="bg-sky-500"
                    />
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-200 p-4 shadow-sm dark:border-slate-800">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Hourly traffic</div>
                  <div className="mt-4">
                    <HourlyBarChart rows={summary.hourlyBreakdown} money={money} />
                  </div>
                </div>
              </div>

              {/* Tier 6 — staff */}
              <div className="mt-5">
                <StaffTable rows={summary.salesByStaff} money={money} />
              </div>

              {/* Tier 7 — operational callouts. "Expenses by category" was the same
                  bar list the Expenses tile now opens, so it isn't repeated here. */}
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <Callout
                  label="Running out within a week"
                  value={`${summary.stockRunway.length} product${summary.stockRunway.length === 1 ? '' : 's'}`}
                  tone={summary.stockRunway.length > 0 ? 'warn' : undefined}
                  shopWide={Boolean(summary.productFilter)}
                />
                <Callout
                  label="Voided sales"
                  value={`${summary.voidedSaleCount} · ${money(summary.voidedSaleValue)}`}
                  shopWide={Boolean(summary.productFilter)}
                />
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function ageLabel(days: number): string {
  if (days < 1) return 'today'
  if (days === 1) return '1 day'
  return `${days} days`
}

function daysLeftLabel(days: number): string {
  if (days <= 0) return 'out of stock'
  if (days < 1) return 'less than a day left'
  const whole = Math.floor(days)
  return `about ${whole} day${whole === 1 ? '' : 's'} left`
}

// The whole page in one line, in the order an owner asks: what came in, what was
// made, what went out on credit. The tiles below are the detail behind it.
function SummarySentence({
  summary,
  periodLabel,
  money,
}: {
  summary: AnalyticsSummary
  periodLabel: string
  money: Money
}) {
  const parts = [
    <>
      sold <b className="font-bold">{money(summary.totalSales)}</b>
    </>,
    <>
      {summary.moneyKept < 0 ? 'loss' : 'profit'}{' '}
      <b className={`font-bold ${summary.moneyKept < 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
        {money(Math.abs(summary.moneyKept))}
      </b>
    </>,
  ]
  if (summary.debtAccrued > 0) {
    parts.push(
      <>
        <b className="font-bold">{money(summary.debtAccrued)}</b> went on credit
      </>
    )
  }
  return (
    <p className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
      <span className="font-semibold text-slate-900 dark:text-white">{periodLabel}:</span>{' '}
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && <span className="text-slate-300 dark:text-slate-600"> · </span>}
          {part}
        </span>
      ))}
    </p>
  )
}

// Only what needs doing, as of right now — not tied to the period picker. On a
// normal day it is empty, and saying so plainly is the point: the owner learns
// everything is fine without reading a single tile.
function NeedsAttention({
  summary,
  canViewReports,
  money,
  onNavigate,
}: {
  summary: AnalyticsSummary
  canViewReports: boolean
  money: Money
  onNavigate: (view: ViewKey) => void
}) {
  const [open, setOpen] = useState(true)
  // Each item names the screen where it can be dealt with, so tapping it goes there.
  const items: Array<{ key: string; view: ViewKey; tone: 'red' | 'amber'; title: string; detail: string }> = []

  if (canViewReports) {
    for (const row of summary.belowCost) {
      const which = [
        row.retailBelow ? `retail ${money(row.retailPricePerKg)}/kg` : null,
        row.wholesaleBelow ? `wholesale ${money(row.wholesalePricePerKg)}/kg` : null,
      ]
        .filter(Boolean)
        .join(' and ')
      items.push({
        key: `cost-${row.productId}`,
        view: 'inventory',
        tone: 'red',
        title: `${row.productName} is selling below cost`,
        detail: `${which[0].toUpperCase()}${which.slice(1)} — your last delivery cost ${money(row.costPerKg)}/kg. Raise the price in Stock.`,
      })
    }
  }

  for (const row of summary.stockRunway) {
    items.push({
      key: `stock-${row.productId}`,
      view: 'inventory',
      tone: row.daysLeft < 3 ? 'red' : 'amber',
      title: `${row.productName}: ${daysLeftLabel(row.daysLeft)}`,
      detail: `${summarizeStock(row.stockKg, row.weightPerBag).label} in store, selling about ${summarizeStock(row.dailyKg, row.weightPerBag).totalLabel} a day.`,
    })
  }

  // Runway already covers products that are selling; this catches the ones at or
  // under their alert level that have stopped moving, so they are not listed twice.
  const runwayIds = new Set(summary.stockRunway.map((row) => row.productId))
  const low = summary.lowStockProducts.filter((row) => !runwayIds.has(row.productId))
  if (low.length > 0) {
    const names = low
      .slice(0, 3)
      .map((row) => `${row.productName} (${row.stockKg === 0 ? 'out' : `${summarizeStock(row.stockKg, row.weightPerBag).label} left`})`)
      .join(', ')
    const outCount = low.filter((row) => row.stockKg === 0).length
    items.push({
      key: 'low-stock',
      view: 'inventory',
      tone: outCount > 0 ? 'red' : 'amber',
      title: low.length === 1 ? `${low[0].productName} is ${outCount ? 'out of stock' : 'running low'}` : `${low.length} products running low`,
      detail: `${names}${low.length > 3 ? ` and ${low.length - 3} more` : ''}. Add stock in Stock.`,
    })
  }

  if (canViewReports && summary.debtAging.overMonth > 0) {
    const old = summary.agedDebtors.filter((d) => d.overMonth > 0)
    const names = old
      .slice(0, 3)
      .map((d) => `${d.customerName} (${d.oldestUnpaidDays} days)`)
      .join(', ')
    items.push({
      key: 'old-debt',
      view: 'customers',
      tone: 'red',
      title: `${money(summary.debtAging.overMonth)} owed for over a month`,
      detail: `Call ${names}${old.length > 3 ? ` and ${old.length - 3} more` : ''}. Details in Who owes you below.`,
    })
  }

  if (canViewReports && summary.shiftShortfall.count > 0) {
    items.push({
      key: 'till-short',
      view: 'settings',
      tone: 'amber',
      title: `Till was short ${money(summary.shiftShortfall.total)} across ${summary.shiftShortfall.count} shift${summary.shiftShortfall.count === 1 ? '' : 's'}`,
      detail: 'Compare the counted cash and M-Pesa with what the sales say in Reports → Shift reports.',
    })
  }

  if (canViewReports && summary.voidedSaleCount > 0) {
    items.push({
      key: 'voids',
      view: 'transactions',
      tone: 'amber',
      title: `${summary.voidedSaleCount} sale${summary.voidedSaleCount === 1 ? '' : 's'} voided — ${money(summary.voidedSaleValue)}`,
      detail: 'See who voided them and why in Transactions.',
    })
  }

  if (items.length === 0) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">
        ✓ Nothing needs attention right now
      </div>
    )
  }

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-amber-200 shadow-sm dark:border-amber-500/30">
      <FoldButton
        open={open}
        onToggle={() => setOpen((value) => !value)}
        className="bg-amber-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"
      >
        Needs attention · {items.length}
      </FoldButton>
      {open && (
      <ul className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
        {items.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              onClick={() => onNavigate(item.view)}
              className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.tone === 'red' ? 'bg-red-500' : 'bg-amber-500'}`}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{item.title}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{item.detail}</div>
              </div>
              <span aria-hidden="true" className="mt-0.5 text-lg leading-none text-slate-400">
                ›
              </span>
            </button>
          </li>
        ))}
      </ul>
      )}
    </div>
  )
}

function BarList({
  rows,
  valueFormatter,
  barClassName,
}: {
  rows: Array<{ label: string; value: number }>
  valueFormatter: (value: number) => string
  barClassName: string
}) {
  const max = Math.max(1, ...rows.map((row) => row.value))
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((row, index) => (
        <div key={`${row.label}-${index}`} className="flex items-center gap-2 text-xs">
          <span className="w-14 shrink-0 text-slate-500 dark:text-slate-400">{row.label}</span>
          <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
            <div className={`h-full rounded transition-all ${barClassName}`} style={{ width: `${(row.value / max) * 100}%` }} />
          </div>
          <span className="w-24 shrink-0 text-right tabular-nums text-slate-600 dark:text-slate-300">
            {valueFormatter(row.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

// Shares rather than shilling figures: three six-digit amounts side by side is a
// wall of numbers that says nothing at a glance, while "62% cash" does. The exact
// amount stays one hover away rather than being thrown out.
function PaymentMixBar({ cash, mpesa, debt, money }: { cash: number; mpesa: number; debt: number; money: Money }) {
  const total = cash + mpesa + debt
  const segments = [
    { label: 'Cash', value: cash, bar: 'bg-emerald-500', dot: 'bg-emerald-500' },
    { label: 'M-Pesa', value: mpesa, bar: 'bg-sky-500', dot: 'bg-sky-500' },
    { label: 'Debt', value: debt, bar: 'bg-red-400', dot: 'bg-red-400' },
  ]
  return (
    <div>
      <div className="flex h-5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        {segments.map((segment) => {
          const share = total > 0 ? (segment.value / total) * 100 : 0
          return (
            <div
              key={segment.label}
              className={`flex h-full items-center justify-center ${segment.bar}`}
              style={{ width: `${share}%` }}
              title={`${segment.label} — ${money(segment.value)}`}
            >
              {/* Only label the slice when there's room, otherwise it turns to mush. */}
              {share >= 12 && <span className="text-[10px] font-bold text-white">{share.toFixed(0)}%</span>}
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        {segments.map((segment) => (
          <span
            key={segment.label}
            title={`${segment.label} — ${money(segment.value)}`}
            className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300"
          >
            <span className={`h-2 w-2 rounded-full ${segment.dot}`} />
            {segment.label} <span className="font-semibold tabular-nums">{pct(segment.value, total)}</span>
          </span>
        ))}
      </div>
      {!isMasked(money) && <div className="mt-2 text-[10px] text-slate-400">Hover a share for the exact amount.</div>}
    </div>
  )
}

function ExpenseBreakdown({ rows, total, money }: { rows: AnalyticsExpenseCategoryRow[]; total: number; money: Money }) {
  const max = Math.max(0, ...rows.map((row) => row.totalAmount))
  return (
    <BreakdownShell
      title="Expenses by category"
      total={money(total)}
      empty={rows.length === 0 ? 'No expenses recorded in this period.' : undefined}
    >
      {rows.map((row) => (
        <BreakdownRow
          key={row.category}
          name={row.category}
          value={row.totalAmount}
          max={max}
          amount={money(row.totalAmount)}
          share={pct(row.totalAmount, total)}
          barClass="bg-amber-500"
        />
      ))}
    </BreakdownShell>
  )
}

function DebtBreakdown({ summary, money }: { summary: AnalyticsSummary; money: Money }) {
  const lines: Array<{ label: string; value: string; className: string }> = [
    {
      label: 'Sold on credit',
      value: money(summary.debtAccrued),
      className: 'text-red-500',
    },
    ...(summary.debtAddedManually > 0
      ? [
          {
            label: 'Typed in on Customers page',
            value: money(summary.debtAddedManually),
            className: 'text-slate-600 dark:text-slate-300',
          },
        ]
      : []),
    {
      label: 'Repaid this period',
      value: money(summary.debtRepaidInPeriod),
      className: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      label: 'Net movement',
      value: `${summary.netDebtMovement >= 0 && !isMasked(money) ? '+' : ''}${money(summary.netDebtMovement)}`,
      className: summary.netDebtMovement >= 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400',
    },
    {
      label: 'Owed to you (all-time)',
      value: money(summary.totalDebtOutstanding),
      className: 'text-red-500',
    },
    { label: '· unpaid under a week', value: money(summary.debtAging.underWeek), className: 'text-slate-600 dark:text-slate-300' },
    { label: '· 1 week to 1 month', value: money(summary.debtAging.weekToMonth), className: 'text-amber-600 dark:text-amber-400' },
    { label: '· over a month', value: money(summary.debtAging.overMonth), className: 'text-red-500' },
  ]
  // Deliberately no debtor list here: the Biggest debtors table sits a couple of
  // rows below on the same screen, and printing Kamau's balance twice on one
  // dashboard is noise, not insight.
  return (
    <BreakdownShell title="Debt this period" total={`${pct(summary.debtAccrued, summary.totalSales)} of sales`}>
      <div className="space-y-1.5 py-0.5">
        {lines.map((line) => (
          <div key={line.label} className="flex items-baseline justify-between gap-2 text-xs">
            <span className="text-slate-500 dark:text-slate-400">{line.label}</span>
            <span className={`font-semibold tabular-nums ${line.className}`}>{line.value}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 border-t border-slate-100 pt-1.5 text-[10px] text-slate-400 dark:border-slate-800">
        Who owes what is in Who owes you, further down this screen.
      </div>
    </BreakdownShell>
  )
}

function QuantityBreakdown({ rows, total }: { rows: AnalyticsProductRow[]; total: number }) {
  const max = Math.max(0, ...rows.map((row) => row.quantityKg))
  // Mixed products, so the header total falls back to the standard bag size —
  // each row below still converts against its own product's actual bag size.
  const totalLabel = rows.length === 1 ? summarizeStock(total, rows[0].weightPerBag).label : summarizeStock(total).label
  return (
    <BreakdownShell
      title="Sold by product"
      total={totalLabel}
      empty={rows.length === 0 ? 'Nothing sold in this period.' : undefined}
    >
      {rows.map((row) => (
        <BreakdownRow
          key={row.productId}
          name={row.productName}
          value={row.quantityKg}
          max={max}
          amount={summarizeStock(row.quantityKg, row.weightPerBag).label}
          share={pct(row.quantityKg, total)}
          barClass="bg-emerald-500"
        />
      ))}
    </BreakdownShell>
  )
}

function ProductTable({
  title,
  rows,
  footer,
  money,
}: {
  title: string
  rows: AnalyticsProductRow[]
  footer?: string
  money: Money
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm dark:border-slate-800">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:bg-slate-900">
        {title}
      </div>
      <table className="w-full text-left text-sm">
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.productId}
              className="border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
            >
              <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100">{row.productName}</td>
              <td className="px-4 py-2.5 tabular-nums text-slate-500 dark:text-slate-400">{row.quantityKg.toFixed(2)} kg</td>
              <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {money(row.revenue)}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="px-4 py-6 text-center text-sm text-slate-400" colSpan={3}>
                No sales in this range yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {footer && (
        <div className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400 dark:border-slate-800">{footer}</div>
      )}
    </div>
  )
}

function DebtorsTable({ rows, money }: { rows: AgedDebtor[]; money: Money }) {
  return (
    <table className="w-full text-left text-sm">
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.customerName}
            className="border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
          >
            <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100">
              {row.customerName}
              {row.phone && <span className="ml-2 text-xs font-normal tabular-nums text-slate-400">{row.phone}</span>}
            </td>
            <td className="px-4 py-2.5 text-xs tabular-nums">
              <span className={row.oldestUnpaidDays > 30 ? 'font-semibold text-red-500' : 'text-slate-400'}>
                {ageLabel(row.oldestUnpaidDays)}
              </span>
            </td>
            <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-red-500">{money(row.outstanding)}</td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td className="px-4 py-6 text-center text-sm text-slate-400" colSpan={3}>
              No debt.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )
}

function StaffTable({ rows, money }: { rows: AnalyticsStaffRow[]; money: Money }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm dark:border-slate-800">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:bg-slate-900">
        Sales by staff
      </div>
      <table className="w-full text-left text-sm">
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.userId ?? row.userName}
              className="border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
            >
              <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100">{row.userName}</td>
              <td className="px-4 py-2.5 tabular-nums text-slate-500 dark:text-slate-400">{row.transactionCount} txns</td>
              <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {money(row.totalSales)}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="px-4 py-6 text-center text-sm text-slate-400" colSpan={3}>
                No sales in this range yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function HourlyBarChart({ rows, money }: { rows: AnalyticsHourlyRow[]; money: Money }) {
  const max = Math.max(1, ...rows.map((row) => row.totalSales))
  return (
    <div>
      <div className="flex h-28 items-end gap-[3px]">
        {rows.map((row) => (
          <div
            key={row.hour}
            className="flex-1 rounded-t bg-sky-500 transition-all hover:bg-sky-400"
            style={{ height: `${Math.max(2, (row.totalSales / max) * 100)}%` }}
            title={`${formatHour(row.hour)} — ${money(row.totalSales)} (${row.transactionCount} txns)`}
          />
        ))}
      </div>
      <div className="mt-1 flex gap-[3px] text-[9px] text-slate-400">
        {rows.map((row) => (
          <div key={row.hour} className="flex-1 text-center">
            {row.hour % 3 === 0 ? formatHourLabel(row.hour) : ''}
          </div>
        ))}
      </div>
    </div>
  )
}

function Callout({
  label,
  value,
  tone,
  shopWide,
}: {
  label: string
  value: string
  tone?: 'warn'
  shopWide?: boolean
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
        {shopWide && <ShopWideChip reason={SHOP_WIDE} />}
      </div>
      <div
        className={`mt-1 text-xl font-bold tabular-nums tracking-tight ${tone === 'warn' ? 'text-red-500' : 'text-slate-900 dark:text-white'}`}
      >
        {value}
      </div>
    </div>
  )
}
