import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { DashboardSnapshot, DomesticConsumptionRecord, ExpenseRecord, SaleRecord } from '../../../shared/ipc'
import type { ToastState } from '../components/Toast'
import { TransactionDetailModal } from '../components/pos/TransactionDetailModal'
import { MiniCalendar } from '../components/MiniCalendar'
import { CalendarIcon, ChevronDownIcon, SearchIcon, XIcon } from '../components/Icons'
import { DayProductsChip } from '../components/DayProductsChip'
import { formatKgCompact, formatReceiptNumber, toCurrency } from '../../../shared/stock'
import { formatDateTime, formatTime } from '../../../shared/datetime'

interface TransactionsPageProps {
  snapshot: DashboardSnapshot
  isAdmin: boolean
  onProductsChanged: () => Promise<void> | void
  showToast: (kind: ToastState['kind'], message: string) => void
}

type PaymentFilter = 'ALL' | 'CASH' | 'MPESA' | 'SPLIT' | 'DEBT' | 'VOIDED' | 'TAKEHOME'

const FILTERS: Array<{ key: PaymentFilter; label: string; hint: string }> = [
  { key: 'ALL', label: 'All', hint: 'Every sale, expense and take-home, however it was paid.' },
  { key: 'CASH', label: 'Cash', hint: 'Paid entirely in cash — sales and expenses.' },
  { key: 'MPESA', label: 'M-Pesa', hint: 'Paid entirely by M-Pesa — sales and expenses.' },
  { key: 'SPLIT', label: 'Split', hint: 'Sales settled with more than one method, e.g. part cash and part M-Pesa.' },
  { key: 'DEBT', label: 'Debt', hint: 'Sales left partly or wholly unpaid — the balance sits under Customers.' },
  { key: 'VOIDED', label: 'Voided', hint: 'Sales that were cancelled after being recorded. The stock went back.' },
  {
    key: 'TAKEHOME',
    label: 'Taken home',
    hint: 'Stock taken home rather than sold. No money moved — the value shown is what the goods cost.',
  },
]

function paymentKind(sale: SaleRecord): 'CASH' | 'MPESA' | 'SPLIT' | 'DEBT' {
  const methodsUsed = [sale.cashPaid > 0, sale.mpesaPaid > 0, sale.debtAmount > 0].filter(Boolean).length
  if (methodsUsed > 1) return 'SPLIT'
  if (sale.debtAmount > 0) return 'DEBT'
  if (sale.mpesaPaid > 0) return 'MPESA'
  return 'CASH'
}

function paymentLabel(kind: ReturnType<typeof paymentKind>): string {
  return kind === 'CASH' ? 'Cash' : kind === 'MPESA' ? 'M-Pesa' : kind === 'SPLIT' ? 'Split' : 'Debt'
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function formatDateFilterLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function dayLabel(date: Date): string {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const formatted = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  if (dayKey(date) === dayKey(today)) return `Today — ${formatted}`
  if (dayKey(date) === dayKey(yesterday)) return `Yesterday — ${formatted}`
  return formatted
}

function expenseMatchesFilter(expense: ExpenseRecord, filter: PaymentFilter): boolean {
  // Split/Debt/Voided describe things only a sale can be, so those views are
  // sales-only; Cash and M-Pesa narrow expenses the same way they narrow sales.
  if (filter === 'ALL') return true
  if (filter === 'CASH' || filter === 'MPESA') return expense.paymentMethod === filter
  return false
}

// Take-home has no payment method at all — no money changed hands, only stock —
// so every money-shaped filter excludes it and it has a view of its own.
function takeHomeMatchesFilter(filter: PaymentFilter): boolean {
  return filter === 'ALL' || filter === 'TAKEHOME'
}

interface DayGroup {
  key: string
  label: string
  sales: SaleRecord[]
  expenses: ExpenseRecord[]
  takeHome: DomesticConsumptionRecord[]
}

export function TransactionsPage({ snapshot, isAdmin, onProductsChanged, showToast }: TransactionsPageProps) {
  const [sales, setSales] = useState<SaleRecord[]>([])
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([])
  const [takeHome, setTakeHome] = useState<DomesticConsumptionRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filter, setFilter] = useState<PaymentFilter>('ALL')
  const [groupByDate, setGroupByDate] = useState(true)
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set())
  const [dateFilter, setDateFilter] = useState<string | null>(null)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const calendarBtnRef = useRef<HTMLButtonElement>(null)

  const [viewingSale, setViewingSale] = useState<SaleRecord | null>(null)

  const [voidTarget, setVoidTarget] = useState<SaleRecord | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [voiding, setVoiding] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [saleRows, expenseRows, takeHomeRows] = await Promise.all([
        window.electronAPI.listRecentSales(1000),
        window.electronAPI.listRecentExpenses(1000),
        window.electronAPI.listDomesticConsumption(1000),
      ])
      setSales(saleRows)
      setExpenses(expenseRows)
      setTakeHome(takeHomeRows)
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not load transactions')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const query = searchQuery.trim().toLowerCase()
  const visibleSales = useMemo(() => {
    return sales.filter((sale) => {
      if (filter === 'VOIDED') {
        if (sale.status !== 'VOID') return false
      } else if (filter === 'DEBT') {
        if (sale.status === 'VOID' || !(sale.debtAmount > 0)) return false
      } else if (filter !== 'ALL') {
        if (sale.status === 'VOID' || paymentKind(sale) !== filter) return false
      }
      if (dateFilter && dayKey(new Date(sale.createdAt)) !== dateFilter) return false
      if (!query) return true
      return (
        sale.customerName.toLowerCase().includes(query) ||
        (sale.customerPhone ?? '').includes(query) ||
        formatReceiptNumber(sale.id).toLowerCase().includes(query)
      )
    })
  }, [sales, filter, query, dateFilter])

  const visibleExpenses = useMemo(() => {
    return expenses.filter((expense) => {
      if (!expenseMatchesFilter(expense, filter)) return false
      if (dateFilter && dayKey(new Date(expense.createdAt)) !== dateFilter) return false
      if (!query) return true
      return (
        expense.category.toLowerCase().includes(query) ||
        (expense.description ?? '').toLowerCase().includes(query)
      )
    })
  }, [expenses, filter, query, dateFilter])

  const visibleTakeHome = useMemo(() => {
    return takeHome.filter((entry) => {
      if (!takeHomeMatchesFilter(filter)) return false
      if (dateFilter && dayKey(new Date(entry.createdAt)) !== dateFilter) return false
      if (!query) return true
      return entry.productName.toLowerCase().includes(query) || (entry.notes ?? '').toLowerCase().includes(query)
    })
  }, [takeHome, filter, query, dateFilter])

  const highlightKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const sale of sales) keys.add(dayKey(new Date(sale.createdAt)))
    for (const expense of expenses) keys.add(dayKey(new Date(expense.createdAt)))
    for (const entry of takeHome) keys.add(dayKey(new Date(entry.createdAt)))
    return keys
  }, [sales, expenses, takeHome])

  const groups = useMemo(() => {
    const map = new Map<string, DayGroup>()
    const groupFor = (iso: string): DayGroup => {
      const date = new Date(iso)
      const key = dayKey(date)
      let group = map.get(key)
      if (!group) {
        group = { key, label: dayLabel(date), sales: [], expenses: [], takeHome: [] }
        map.set(key, group)
      }
      return group
    }
    for (const sale of visibleSales) groupFor(sale.createdAt).sales.push(sale)
    // Expenses are appended to their day's group and rendered after the sales, so
    // the day reads as "here's what came in, then here's what went out".
    for (const expense of visibleExpenses) groupFor(expense.createdAt).expenses.push(expense)
    // Take-home comes last: stock that left the shelf without ever being sold.
    for (const entry of visibleTakeHome) groupFor(entry.createdAt).takeHome.push(entry)
    return [...map.values()]
  }, [visibleSales, visibleExpenses, visibleTakeHome])

  // The flat list has no day boundaries to hang expenses off, so there the two
  // kinds interleave strictly by time, newest first.
  const flatEntries = useMemo(() => {
    const entries: Array<
      | { kind: 'sale'; sale: SaleRecord }
      | { kind: 'expense'; expense: ExpenseRecord }
      | { kind: 'takeHome'; entry: DomesticConsumptionRecord }
    > = [
      ...visibleSales.map((sale) => ({ kind: 'sale' as const, sale })),
      ...visibleExpenses.map((expense) => ({ kind: 'expense' as const, expense })),
      ...visibleTakeHome.map((entry) => ({ kind: 'takeHome' as const, entry })),
    ]
    const timeOf = (e: (typeof entries)[number]): string =>
      e.kind === 'sale' ? e.sale.createdAt : e.kind === 'expense' ? e.expense.createdAt : e.entry.createdAt
    return entries.sort((a, b) => timeOf(b).localeCompare(timeOf(a)))
  }, [visibleSales, visibleExpenses, visibleTakeHome])

  const toggleDay = (key: string) => {
    setCollapsedDays((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const submitVoid = async () => {
    if (!voidTarget) return
    const reason = voidReason.trim()
    if (!reason) return
    setVoiding(true)
    try {
      await window.electronAPI.voidSale({ saleId: voidTarget.id, reason })
      showToast('success', 'Sale voided')
      setVoidTarget(null)
      setVoidReason('')
      await load()
      await onProductsChanged()
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not void sale')
    } finally {
      setVoiding(false)
    }
  }

  const canVoid = isAdmin || snapshot.settings.perm_allow_cashier_void === 'true'
  const isVoidable = (sale: SaleRecord) =>
    canVoid && sale.status === 'COMPLETED' && snapshot.activeShift?.id === sale.shiftId

  const timeHeaderCell = (
    <th className="px-4 py-2.5">
      <div className="flex items-center gap-1.5">
        Time
        <button
          ref={calendarBtnRef}
          type="button"
          onClick={() => setCalendarOpen((open) => !open)}
          title={dateFilter ? `Filtered to ${formatDateFilterLabel(dateFilter)}` : 'Jump to date'}
          className={`flex h-5 w-5 items-center justify-center rounded normal-case transition-colors ${
            dateFilter
              ? 'text-emerald-500'
              : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
          }`}
        >
          <CalendarIcon width={13} height={13} />
        </button>
      </div>
    </th>
  )

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">Transactions</h2>
        <div className="text-sm text-slate-500 dark:text-slate-400">
          {visibleSales.length} of {sales.length} sale{sales.length === 1 ? '' : 's'}
          {visibleExpenses.length > 0 && (
            <> · {visibleExpenses.length} expense{visibleExpenses.length === 1 ? '' : 's'}</>
          )}
          {visibleTakeHome.length > 0 && <> · {visibleTakeHome.length} taken home</>}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <SearchIcon
            width={16}
            height={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, phone, or receipt #…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              title={f.hint}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-150 active:scale-[0.98] ${
                filter === f.key
                  ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {dateFilter && (
          <button
            type="button"
            onClick={() => setDateFilter(null)}
            className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-all duration-150 hover:bg-emerald-100 active:scale-[0.98] dark:bg-emerald-500/10 dark:text-emerald-400"
          >
            <CalendarIcon width={12} height={12} />
            {formatDateFilterLabel(dateFilter)}
            <XIcon width={12} height={12} />
          </button>
        )}

        <div className="ml-auto flex items-center gap-1 rounded-full bg-slate-100 p-1 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setGroupByDate(true)}
            title="One block per day with that day's revenue and expenses in the heading. Click a day to fold it away."
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-150 active:scale-[0.98] ${
              groupByDate
                ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-white'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            Grouped by Date
          </button>
          <button
            type="button"
            onClick={() => setGroupByDate(false)}
            title="One continuous list, newest first, with sales and expenses in the order they happened."
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-150 active:scale-[0.98] ${
              !groupByDate
                ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-white'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            Flat List
          </button>
        </div>
      </div>

      {calendarOpen && (
        <MiniCalendar
          anchorRef={calendarBtnRef}
          selectedKey={dateFilter}
          highlightKeys={highlightKeys}
          onSelect={(key) => {
            setDateFilter(key)
            setCalendarOpen(false)
          }}
          onClear={() => {
            setDateFilter(null)
            setCalendarOpen(false)
          }}
          onClose={() => setCalendarOpen(false)}
        />
      )}

      {groupByDate ? (
        <div className="mt-3 rounded-xl border border-slate-200 shadow-sm dark:border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:bg-slate-900">
              <tr>
                <th className="px-4 py-2.5">Receipt</th>
                {timeHeaderCell}
                <th className="px-4 py-2.5">Customer</th>
                <th className="px-4 py-2.5">Items</th>
                <th className="px-4 py-2.5">Total</th>
                <th className="px-4 py-2.5">Payment</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => {
                const collapsed = collapsedDays.has(group.key)
                const revenueTotal = group.sales
                  .filter((s) => s.status !== 'VOID')
                  .reduce((sum, s) => sum + s.totalAmount, 0)
                // Kept alongside revenue rather than netted off it, so this header
                // still agrees with the Overview and the shift's Z-report.
                const expenseTotal = group.expenses.reduce((sum, e) => sum + e.amount, 0)
                const takeHomeTotal = group.takeHome.reduce((sum, t) => sum + t.costValue, 0)
                return (
                  <Fragment key={group.key}>
                    <tr className="sticky top-0 z-10 border-t border-slate-200 bg-slate-100/95 backdrop-blur dark:border-slate-800 dark:bg-slate-800/95">
                      {/* Fold toggle and summary sit side by side rather than the
                          chips living inside the toggle — the products pane is
                          itself a button, and a button can't nest in a button. */}
                      <td colSpan={8} className="px-4 py-2">
                        <div className="flex w-full items-center justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => toggleDay(group.key)}
                            title={collapsed ? 'Show this day' : 'Fold this day away'}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-semibold text-slate-700 dark:text-slate-200"
                          >
                            <ChevronDownIcon
                              width={14}
                              height={14}
                              className={`shrink-0 transition-transform duration-150 ${collapsed ? '-rotate-90' : ''}`}
                            />
                            <span className="truncate">{group.label}</span>
                          </button>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <span className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-500 shadow-sm dark:bg-slate-900 dark:text-slate-400">
                              {group.sales.length} Transaction{group.sales.length === 1 ? '' : 's'}
                              {isAdmin && <> · Revenue: {toCurrency(revenueTotal)}</>}
                              {isAdmin && expenseTotal > 0 && (
                                <span className="text-red-500 dark:text-red-400">
                                  {' '}
                                  · Expenses: {toCurrency(expenseTotal)}
                                </span>
                              )}
                              {/* Amber, not red: no cash left the till here, only stock. */}
                              {isAdmin && takeHomeTotal > 0 && (
                                <span className="text-amber-600 dark:text-amber-400">
                                  {' '}
                                  · Taken home: {toCurrency(takeHomeTotal)}
                                </span>
                              )}
                            </span>
                            <DayProductsChip sales={group.sales} isAdmin={isAdmin} />
                          </div>
                        </div>
                      </td>
                    </tr>
                    {!collapsed &&
                      group.sales.map((sale) => (
                        <TransactionRow
                          key={sale.id}
                          sale={sale}
                          timeOnly
                          voidable={isVoidable(sale)}
                          canVoid={canVoid}
                          onView={() => setViewingSale(sale)}
                          onVoidClick={() => setVoidTarget(sale)}
                        />
                      ))}
                    {!collapsed &&
                      group.expenses.map((expense) => (
                        <ExpenseRow key={`e${expense.id}`} expense={expense} timeOnly />
                      ))}
                    {!collapsed &&
                      group.takeHome.map((entry) => (
                        <TakeHomeRow key={`t${entry.id}`} entry={entry} timeOnly />
                      ))}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
          {!loading && groups.length === 0 && (
            <div className="p-6 text-center text-sm text-slate-400">
              {query || filter !== 'ALL' || dateFilter ? 'No transactions match your filters.' : 'No sales recorded yet.'}
            </div>
          )}
          {loading && <div className="p-6 text-center text-sm text-slate-400">Loading…</div>}
        </div>
      ) : (
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 shadow-sm dark:border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:bg-slate-900">
              <tr>
                <th className="px-4 py-2.5">Receipt</th>
                {timeHeaderCell}
                <th className="px-4 py-2.5">Customer</th>
                <th className="px-4 py-2.5">Items</th>
                <th className="px-4 py-2.5">Total</th>
                <th className="px-4 py-2.5">Payment</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {flatEntries.map((entry) =>
                entry.kind === 'sale' ? (
                  <TransactionRow
                    key={`s${entry.sale.id}`}
                    sale={entry.sale}
                    timeOnly={false}
                    voidable={isVoidable(entry.sale)}
                    canVoid={canVoid}
                    onView={() => setViewingSale(entry.sale)}
                    onVoidClick={() => setVoidTarget(entry.sale)}
                  />
                ) : entry.kind === 'expense' ? (
                  <ExpenseRow key={`e${entry.expense.id}`} expense={entry.expense} timeOnly={false} />
                ) : (
                  <TakeHomeRow key={`t${entry.entry.id}`} entry={entry.entry} timeOnly={false} />
                )
              )}
            </tbody>
          </table>
          {!loading && flatEntries.length === 0 && (
            <div className="p-6 text-center text-sm text-slate-400">
              {query || filter !== 'ALL' || dateFilter ? 'No transactions match your filters.' : 'No sales recorded yet.'}
            </div>
          )}
          {loading && <div className="p-6 text-center text-sm text-slate-400">Loading…</div>}
        </div>
      )}

      {viewingSale && (
        <TransactionDetailModal sale={viewingSale} onClose={() => setViewingSale(null)} showToast={showToast} />
      )}

      {voidTarget && (
        <div className="osk-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200/60 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Void sale {formatReceiptNumber(voidTarget.id)}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setVoidTarget(null)
                  setVoidReason('')
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <XIcon width={18} height={18} />
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              This restores {voidTarget.items.length} item{voidTarget.items.length === 1 ? '' : 's'} to stock
              {voidTarget.debtAmount > 0
                ? ` and clears ${toCurrency(voidTarget.debtAmount)} of debt for ${voidTarget.customerName}`
                : ''}
              . This cannot be undone.
            </p>

            <label className="mt-3 block text-xs font-semibold text-slate-500 dark:text-slate-400">
              Reason (required)
            </label>
            <textarea
              required
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="e.g. Wrong product rung up"
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-shadow focus:border-red-500 focus:ring-2 focus:ring-red-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />

            <button
              type="button"
              disabled={voiding || !voidReason.trim()}
              onClick={submitVoid}
              className="mt-4 w-full rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-red-500/30 transition-all duration-150 hover:bg-red-600 active:scale-[0.98] disabled:opacity-50"
            >
              {voiding ? 'Voiding…' : 'Void sale'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

interface TransactionRowProps {
  sale: SaleRecord
  timeOnly: boolean
  voidable: boolean
  canVoid: boolean
  onView: () => void
  onVoidClick: () => void
}

// Money leaving the till, shown in the same columns as a sale so a day reads as
// one ledger. Tinted and signed so it can never be mistaken for income at a glance.
function ExpenseRow({ expense, timeOnly }: { expense: ExpenseRecord; timeOnly: boolean }) {
  return (
    <tr className="border-t border-slate-100 bg-red-50/40 transition-colors hover:bg-red-50 dark:border-slate-800 dark:bg-red-500/5 dark:hover:bg-red-500/10">
      <td className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-red-400">Expense</td>
      <td className="px-4 py-2.5 text-xs tabular-nums text-slate-500 dark:text-slate-400">
        {timeOnly ? formatTime(expense.createdAt) : formatDateTime(expense.createdAt)}
      </td>
      <td className="px-4 py-2.5">
        <div className="font-medium text-slate-800 dark:text-slate-100">{expense.category}</div>
        {expense.description && <div className="text-xs text-slate-400">{expense.description}</div>}
      </td>
      <td className="px-4 py-2.5 text-xs text-slate-400">{expense.recordedBy ?? '—'}</td>
      <td className="px-4 py-2.5 font-semibold tabular-nums text-red-600 dark:text-red-400">
        -{toCurrency(expense.amount)}
      </td>
      <td className="px-4 py-2.5">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {expense.paymentMethod === 'MPESA' ? 'M-Pesa' : 'Cash'}
        </span>
      </td>
      <td className="px-4 py-2.5">
        <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600 dark:bg-red-950/40 dark:text-red-400">
          Paid out
        </span>
      </td>
      <td className="px-4 py-2.5" />
    </tr>
  )
}

// Stock leaving the shelf without being sold. Amber rather than the expenses' red:
// both are deductions, but no money moved here, so it must not read as a payment.
// The Payment column carries the weight instead — the only figure that makes sense
// for a row where nothing was paid.
function TakeHomeRow({ entry, timeOnly }: { entry: DomesticConsumptionRecord; timeOnly: boolean }) {
  return (
    <tr className="border-t border-slate-100 bg-amber-50/40 transition-colors hover:bg-amber-50 dark:border-slate-800 dark:bg-amber-500/5 dark:hover:bg-amber-500/10">
      <td className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-amber-500">Taken home</td>
      <td className="px-4 py-2.5 text-xs tabular-nums text-slate-500 dark:text-slate-400">
        {timeOnly ? formatTime(entry.createdAt) : formatDateTime(entry.createdAt)}
      </td>
      <td className="px-4 py-2.5">
        <div className="font-medium text-slate-800 dark:text-slate-100">{entry.productName}</div>
        {entry.notes && <div className="text-xs text-slate-400">{entry.notes}</div>}
      </td>
      <td className="px-4 py-2.5 text-xs text-slate-400">{entry.recordedBy ?? '—'}</td>
      <td className="px-4 py-2.5 font-semibold tabular-nums text-amber-600 dark:text-amber-400">
        -{toCurrency(entry.costValue)}
      </td>
      <td className="px-4 py-2.5">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {formatKgCompact(entry.quantityKg)}
        </span>
      </td>
      <td className="px-4 py-2.5">
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
          Stock out
        </span>
      </td>
      <td className="px-4 py-2.5" />
    </tr>
  )
}

function TransactionRow({ sale, timeOnly, voidable, canVoid, onView, onVoidClick }: TransactionRowProps) {
  return (
    <tr
      className={`group border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40 ${
        sale.status === 'VOID' ? 'opacity-60' : ''
      }`}
    >
      <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
        {formatReceiptNumber(sale.id)}
      </td>
      <td className="px-4 py-2.5 text-xs tabular-nums text-slate-500 dark:text-slate-400">
        {timeOnly ? formatTime(sale.createdAt) : formatDateTime(sale.createdAt)}
      </td>
      <td className="px-4 py-2.5">
        <div className="font-medium text-slate-800 dark:text-slate-100">{sale.customerName}</div>
        {sale.customerPhone && <div className="text-xs tabular-nums text-slate-400">{sale.customerPhone}</div>}
      </td>
      {/* The whole cart on one 11px line, clipped rather than wrapped — naming what
          was actually bought beats "3 items", but not at the cost of a taller row
          on every line of the table. Hovering the row lets it wrap and grow, so a
          long cart is read in place instead of in a tooltip. */}
      <td className="px-4 py-2.5">
        <div className="max-w-[20rem] overflow-hidden text-ellipsis whitespace-nowrap text-[11px] leading-relaxed text-slate-600 group-hover:whitespace-normal dark:text-slate-300">
          {sale.items.map((item, index) => (
            <Fragment key={item.id}>
              {index > 0 && <span className="text-slate-300 dark:text-slate-600"> • </span>}
              <span className="whitespace-nowrap">
                {item.productName}
                <span className="text-slate-400 dark:text-slate-500">({formatKgCompact(item.quantityKg)})</span>
              </span>
            </Fragment>
          ))}
        </div>
      </td>
      <td className="px-4 py-2.5 font-semibold tabular-nums text-slate-800 dark:text-slate-100">
        {toCurrency(sale.totalAmount)}
      </td>
      <td className="px-4 py-2.5">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {paymentLabel(paymentKind(sale))}
        </span>
      </td>
      <td className="px-4 py-2.5">
        {sale.status === 'VOID' ? (
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600 dark:bg-red-950/40 dark:text-red-400">
            Voided
          </span>
        ) : sale.debtAmount > 0 ? (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
            Debt
          </span>
        ) : (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
            Completed
          </span>
        )}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center justify-end gap-3 text-xs">
          <button
            type="button"
            onClick={onView}
            title="See everything on this sale — items, weights, what was paid, any change given — and reprint the receipt."
            className="font-semibold text-slate-500 hover:underline dark:text-slate-400"
          >
            View
          </button>
          <button
            type="button"
            disabled={!voidable}
            onClick={() => voidable && onVoidClick()}
            title={
              sale.status === 'VOID'
                ? 'Already voided'
                : voidable
                  ? undefined
                  : !canVoid
                    ? 'Not permitted'
                    : 'Only sales from the current open shift can be voided'
            }
            className={`font-semibold ${
              voidable ? 'text-red-500 hover:underline' : 'cursor-not-allowed text-slate-300 dark:text-slate-700'
            }`}
          >
            Void
          </button>
        </div>
      </td>
    </tr>
  )
}
