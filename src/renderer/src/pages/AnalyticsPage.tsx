import { useEffect, useMemo, useState } from 'react'
import type {
  AnalyticsExpenseCategoryRow,
  AnalyticsHourlyRow,
  AnalyticsProductRow,
  AnalyticsStaffRow,
  AnalyticsSummary,
  CustomerBalance,
  ProductRecord,
} from '../../../shared/ipc'
import { toCurrency } from '../../../shared/stock'
import { formatHour } from '../../../shared/datetime'
import { customLocalRange, expectedLocalDateKeys, presetLocalRange, toPeriodRange } from '../../../shared/period'
import type { PeriodPresetKey } from '../../../shared/period'
import { AnalyticsPeriodPicker } from '../components/AnalyticsPeriodPicker'
import type { PeriodSelection } from '../components/AnalyticsPeriodPicker'
import { BreakdownRow, BreakdownShell, InfoDot, MetricTile, ShopWideChip } from '../components/analytics/MetricTile'
import type { Delta } from '../components/analytics/MetricTile'
import { ProductFilterPicker } from '../components/analytics/ProductFilterPicker'

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
  revenue:
    'Everything sold in this period at the price it actually went for, including goods taken on credit. Voided sales are left out. Expenses are not deducted — this is money earned, not money kept.',
  profit:
    'Revenue minus what the goods cost you. Each line uses the price it actually sold at — retail or wholesale, whichever applied — less the cost per kilo, worked out as buying price per bag ÷ bag size. The cost side uses each product’s buying price as it stands today, not what you paid at the time, so this figure shifts if you change a buying price later; and a product with no buying price recorded counts as costing nothing. Treat it as a guide, not your books.',
  expenses:
    'Money paid out of the till in this period — transport, fuel, rent and the like, logged with the Expense button in the top bar. It is shown beside revenue, never subtracted from it, so this figure keeps agreeing with your Z-reports.',
  takeHome:
    'Stock taken home rather than sold, valued at what it cost you. No money moved, so it never touches revenue or your cash reconciliation — but the goods are gone, so Estimated profit above is already net of this. Log it with Take home on a product in Stock.',
  debt:
    'The part of this period’s sales that walked out unpaid. It is already inside Revenue, which is why the share of revenue matters: it tells you how much of what you "earned" is not yet in your hand.',
  transactions: 'How many completed sales were rung up in this period. Voided sales are not counted.',
  basket: 'Revenue divided by transactions — what a typical customer spent in this period.',
  paymentMix:
    'How this period’s sales were settled. Cash and M-Pesa are money in hand; Debt is goods gone out unpaid. Shown as shares so a busy day and a quiet one can be compared at a glance — hover any figure for the exact amount.',
  quantity:
    'Total weight that left the store in this period, added up across every product. Voided sales are excluded, so it agrees with what actually came off the shelf.',
} as const

interface AnalyticsPageProps {
  isAdmin: boolean
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

export function AnalyticsPage({ isAdmin }: AnalyticsPageProps) {
  const [selection, setSelection] = useState<PeriodSelection>('today')
  const [customFrom, setCustomFrom] = useState<string | null>(null)
  const [customTo, setCustomTo] = useState<string | null>(null)
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState<ProductRecord[]>([])
  const [productId, setProductId] = useState<number | null>(null)

  const localRange = useMemo(() => {
    if (selection === 'custom' && customFrom && customTo) return customLocalRange(customFrom, customTo)
    return presetLocalRange(selection === 'custom' ? 'today' : (selection as PeriodPresetKey))
  }, [selection, customFrom, customTo])

  const range = useMemo(() => ({ ...toPeriodRange(localRange), productId }), [localRange, productId])
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

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">Overview</h2>
        <ProductFilterPicker products={products} selectedId={productId} onChange={setProductId} />
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

          {/* Tier 1 — hero KPIs. Expenses and Debt open a breakdown in place. */}
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
            <MetricTile
              label="Revenue"
              value={toCurrency(summary.totalSales)}
              locked={!isAdmin}
              info={scopeInfo(INFO.revenue, summary.productFilter)}
              delta={deltaFor(summary.totalSales, summary.previousPeriod.totalSales)}
            />
            <MetricTile
              label="Estimated profit"
              value={toCurrency(summary.estimatedGrossProfit)}
              locked={!isAdmin}
              info={scopeInfo(INFO.profit, summary.productFilter)}
              delta={deltaFor(summary.estimatedGrossProfit, summary.previousPeriod.estimatedProfit)}
            />
            <MetricTile
              label="Expenses"
              value={toCurrency(summary.totalExpenses)}
              locked={!isAdmin}
              info={INFO.expenses}
              note={summary.productFilter ? SHOP_WIDE : undefined}
              sub={
                summary.expensesByCategory.length > 0
                  ? `${summary.expensesByCategory.length} categor${summary.expensesByCategory.length === 1 ? 'y' : 'ies'}`
                  : undefined
              }
              breakdown={<ExpenseBreakdown rows={summary.expensesByCategory} total={summary.totalExpenses} />}
            />
            {/* No SHOP_WIDE note, unlike Expenses beside it: take-home is recorded
                against a product, so under a filter this figure narrows honestly. */}
            <MetricTile
              label="Taken home"
              value={toCurrency(summary.domesticConsumptionCost)}
              tone="warn"
              locked={!isAdmin}
              info={scopeInfo(INFO.takeHome, summary.productFilter)}
              sub={
                summary.domesticConsumptionKg > 0 ? `${summary.domesticConsumptionKg.toFixed(1)} kg` : undefined
              }
            />
            <MetricTile
              label="Debt accrued"
              value={toCurrency(summary.debtAccrued)}
              tone="warn"
              locked={!isAdmin}
              info={INFO.debt}
              note={summary.productFilter ? SHOP_WIDE : undefined}
              sub={
                // Suppressed under a product filter: shop-wide debt over one
                // product's revenue is two different scopes divided by each other,
                // and it can happily print "340% of revenue".
                summary.productFilter ? undefined : (
                  <span className={summary.debtAccrued > 0 ? 'text-red-500 dark:text-red-400' : undefined}>
                    {pct(summary.debtAccrued, summary.totalSales)} of revenue
                  </span>
                )
              }
              breakdown={<DebtBreakdown summary={summary} />}
            />
            <MetricTile
              label={summary.productFilter ? 'Sales including it' : 'Transactions'}
              value={String(summary.totalTransactions)}
              info={
                summary.productFilter
                  ? `How many completed sales included ${summary.productFilter.productName}. A cart holding it alongside three other things counts once. Voided sales are not counted.`
                  : INFO.transactions
              }
              delta={deltaFor(summary.totalTransactions, summary.previousPeriod.totalTransactions)}
            />
            <MetricTile
              label={summary.productFilter ? 'Avg per sale' : 'Avg basket value'}
              value={toCurrency(summary.averageBasketValue)}
              locked={!isAdmin}
              info={
                summary.productFilter
                  ? `What a customer typically spent on ${summary.productFilter.productName} in a sale that included it — this product's revenue divided by those sales. Anything else in the same cart is left out.`
                  : INFO.basket
              }
            />
          </div>

          {isAdmin && (
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
                    <PaymentMixBar cash={summary.cashCollected} mpesa={summary.mpesaCollected} debt={summary.debtAccrued} />
                  </div>
                </div>

                <MetricTile
                  label="Quantity sold"
                  value={`${summary.totalQuantitySoldKg.toFixed(1)} kg`}
                  info={scopeInfo(INFO.quantity, summary.productFilter)}
                  sub={
                    // Discounts are struck on the whole cart, so under a filter
                    // they say nothing about this product and are dropped rather
                    // than shown beside a number that is about it.
                    summary.productFilter ? undefined : (
                      <>
                        Discounts given:{' '}
                        <span className="font-semibold text-slate-600 dark:text-slate-300">
                          {toCurrency(summary.totalDiscountGiven)}
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
                  <ProductTable title="Top 10 best-sellers" rows={summary.topProducts} />
                  <ProductTable
                    title="Least-selling"
                    rows={summary.leastSellingProducts}
                    footer={`${summary.productsWithNoSalesCount} active product${summary.productsWithNoSalesCount === 1 ? '' : 's'} had no sales this period.`}
                  />
                </div>
              )}

              {/* Tier 4 — customers */}
              <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 shadow-sm dark:border-slate-800">
                <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:bg-slate-900">
                  Biggest debtors <span className="font-normal normal-case text-slate-400">(all-time balance)</span>
                  {summary.productFilter && <ShopWideChip reason={SHOP_WIDE} />}
                </div>
                <DebtorsTable rows={summary.topDebtors} />
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
                    valueFormatter={toCurrency}
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
                      valueFormatter={toCurrency}
                      barClassName="bg-sky-500"
                    />
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-200 p-4 shadow-sm dark:border-slate-800">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Hourly traffic</div>
                  <div className="mt-4">
                    <HourlyBarChart rows={summary.hourlyBreakdown} />
                  </div>
                </div>
              </div>

              {/* Tier 6 — staff */}
              <div className="mt-5">
                <StaffTable rows={summary.salesByStaff} />
              </div>

              {/* Tier 7 — operational callouts. "Expenses by category" was the same
                  bar list the Expenses tile now opens, so it isn't repeated here. */}
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <Callout
                  label="Low stock products"
                  value={String(summary.lowStockProductCount)}
                  tone={summary.lowStockProductCount > 0 ? 'warn' : undefined}
                  shopWide={Boolean(summary.productFilter)}
                />
                <Callout
                  label="Voided sales"
                  value={`${summary.voidedSaleCount} · ${toCurrency(summary.voidedSaleValue)}`}
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
function PaymentMixBar({ cash, mpesa, debt }: { cash: number; mpesa: number; debt: number }) {
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
              title={`${segment.label} — ${toCurrency(segment.value)}`}
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
            title={`${segment.label} — ${toCurrency(segment.value)}`}
            className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300"
          >
            <span className={`h-2 w-2 rounded-full ${segment.dot}`} />
            {segment.label} <span className="font-semibold tabular-nums">{pct(segment.value, total)}</span>
          </span>
        ))}
      </div>
      <div className="mt-2 text-[10px] text-slate-400">Hover a share for the exact amount.</div>
    </div>
  )
}

function ExpenseBreakdown({ rows, total }: { rows: AnalyticsExpenseCategoryRow[]; total: number }) {
  const max = Math.max(0, ...rows.map((row) => row.totalAmount))
  return (
    <BreakdownShell
      title="Expenses by category"
      total={toCurrency(total)}
      empty={rows.length === 0 ? 'No expenses recorded in this period.' : undefined}
    >
      {rows.map((row) => (
        <BreakdownRow
          key={row.category}
          name={row.category}
          value={row.totalAmount}
          max={max}
          amount={toCurrency(row.totalAmount)}
          share={pct(row.totalAmount, total)}
          barClass="bg-amber-500"
        />
      ))}
    </BreakdownShell>
  )
}

function DebtBreakdown({ summary }: { summary: AnalyticsSummary }) {
  const lines: Array<{ label: string; value: string; className: string }> = [
    {
      label: 'Accrued this period',
      value: toCurrency(summary.debtAccrued),
      className: 'text-red-500',
    },
    {
      label: 'Repaid this period',
      value: toCurrency(summary.debtRepaidInPeriod),
      className: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      label: 'Net movement',
      value: `${summary.netDebtMovement >= 0 ? '+' : ''}${toCurrency(summary.netDebtMovement)}`,
      className: summary.netDebtMovement >= 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400',
    },
    {
      label: 'Owed to you (all-time)',
      value: toCurrency(summary.totalDebtOutstanding),
      className: 'text-red-500',
    },
  ]
  // Deliberately no debtor list here: the Biggest debtors table sits a couple of
  // rows below on the same screen, and printing Kamau's balance twice on one
  // dashboard is noise, not insight.
  return (
    <BreakdownShell title="Debt this period" total={`${pct(summary.debtAccrued, summary.totalSales)} of revenue`}>
      <div className="space-y-1.5 py-0.5">
        {lines.map((line) => (
          <div key={line.label} className="flex items-baseline justify-between gap-2 text-xs">
            <span className="text-slate-500 dark:text-slate-400">{line.label}</span>
            <span className={`font-semibold tabular-nums ${line.className}`}>{line.value}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 border-t border-slate-100 pt-1.5 text-[10px] text-slate-400 dark:border-slate-800">
        Who owes what is in Biggest debtors, further down this screen.
      </div>
    </BreakdownShell>
  )
}

function QuantityBreakdown({ rows, total }: { rows: AnalyticsProductRow[]; total: number }) {
  const max = Math.max(0, ...rows.map((row) => row.quantityKg))
  return (
    <BreakdownShell
      title="Sold by product"
      total={`${total.toFixed(1)} kg`}
      empty={rows.length === 0 ? 'Nothing sold in this period.' : undefined}
    >
      {rows.map((row) => (
        <BreakdownRow
          key={row.productId}
          name={row.productName}
          value={row.quantityKg}
          max={max}
          amount={`${row.quantityKg.toFixed(1)} kg`}
          share={pct(row.quantityKg, total)}
          barClass="bg-emerald-500"
        />
      ))}
    </BreakdownShell>
  )
}

function ProductTable({ title, rows, footer }: { title: string; rows: AnalyticsProductRow[]; footer?: string }) {
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
                {toCurrency(row.revenue)}
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

function DebtorsTable({ rows }: { rows: CustomerBalance[] }) {
  return (
    <table className="w-full text-left text-sm">
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.customerName}
            className="border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
          >
            <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100">{row.customerName}</td>
            <td className="px-4 py-2.5 text-xs tabular-nums text-slate-400">
              {row.debtEventCount} debt event{row.debtEventCount === 1 ? '' : 's'}
            </td>
            <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-red-500">{toCurrency(row.outstanding)}</td>
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

function StaffTable({ rows }: { rows: AnalyticsStaffRow[] }) {
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
                {toCurrency(row.totalSales)}
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

function HourlyBarChart({ rows }: { rows: AnalyticsHourlyRow[] }) {
  const max = Math.max(1, ...rows.map((row) => row.totalSales))
  return (
    <div>
      <div className="flex h-28 items-end gap-[3px]">
        {rows.map((row) => (
          <div
            key={row.hour}
            className="flex-1 rounded-t bg-sky-500 transition-all hover:bg-sky-400"
            style={{ height: `${Math.max(2, (row.totalSales / max) * 100)}%` }}
            title={`${formatHour(row.hour)} — ${toCurrency(row.totalSales)} (${row.transactionCount} txns)`}
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
