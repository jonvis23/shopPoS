import { useEffect, useMemo, useState } from 'react'
import type { ExpenseRecord } from '../../../../shared/ipc'
import type { PeriodRange } from '../../../../shared/period'
import { formatDateTime } from '../../../../shared/datetime'

interface ExpensesReportProps {
  range: PeriodRange
  periodLabel: string
  money: (amount: number) => string
}

type KindFilter = 'ALL' | 'DAILY' | 'MONTHLY'

const KIND_FILTERS: Array<{ key: KindFilter; label: string }> = [
  { key: 'ALL', label: 'All' },
  { key: 'DAILY', label: 'Daily spending' },
  { key: 'MONTHLY', label: 'Monthly bills' },
]

const isMonthly = (expense: ExpenseRecord) => expense.kind === 'MONTHLY'
const sumOf = (list: ExpenseRecord[]) => list.reduce((total, expense) => total + expense.amount, 0)

// The totals and the list for whatever period the Reports picker has selected. Monthly
// bills count in the period they were logged in, not spread across the month.
export function ExpensesReport({ range, periodLabel, money }: ExpensesReportProps) {
  const [rows, setRows] = useState<ExpenseRecord[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [kind, setKind] = useState<KindFilter>('ALL')
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    setRows(null)
    setLoadError(null)
    window.electronAPI
      .listExpensesBetween(range)
      .then((data) => {
        if (!cancelled) setRows(data)
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Could not load expenses')
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.fromISO, range.toISO])

  const all = useMemo(() => rows ?? [], [rows])

  const totals = useMemo(
    () => ({
      count: all.length,
      total: sumOf(all),
      daily: sumOf(all.filter((expense) => !isMonthly(expense))),
      monthly: sumOf(all.filter(isMonthly)),
      cash: sumOf(all.filter((expense) => expense.paymentMethod === 'CASH')),
      mpesa: sumOf(all.filter((expense) => expense.paymentMethod === 'MPESA')),
    }),
    [all]
  )

  const categories = useMemo(() => {
    const byName = new Map<string, { category: string; total: number; daily: number; monthly: number }>()
    for (const expense of all) {
      const row = byName.get(expense.category) ?? { category: expense.category, total: 0, daily: 0, monthly: 0 }
      row.total += expense.amount
      if (isMonthly(expense)) row.monthly += expense.amount
      else row.daily += expense.amount
      byName.set(expense.category, row)
    }
    return [...byName.values()].sort((a, b) => b.total - a.total)
  }, [all])

  const largestCategory = categories[0]?.total ?? 0

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return all.filter((expense) => {
      if (kind === 'DAILY' && isMonthly(expense)) return false
      if (kind === 'MONTHLY' && !isMonthly(expense)) return false
      if (!needle) return true
      return `${expense.category} ${expense.description ?? ''} ${expense.recordedBy ?? ''}`.toLowerCase().includes(needle)
    })
  }, [all, kind, query])

  if (loadError) {
    return <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{loadError}</p>
  }
  if (rows === null) {
    return <div className="py-10 text-center text-sm text-slate-400">Loading expenses…</div>
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label={`Spent · ${periodLabel}`} value={money(totals.total)} hint={`${totals.count} expense${totals.count === 1 ? '' : 's'}`} emphasis />
        <Tile label="Daily spending" value={money(totals.daily)} hint="Logged from the till" />
        <Tile label="Monthly bills" value={money(totals.monthly)} hint="Rent, power, water and the like" />
        <Tile label="Paid in cash" value={money(totals.cash)} hint={`${money(totals.mpesa)} by M-Pesa`} />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">By category</h3>
        {categories.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">No expenses in this period.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {categories.map((row) => (
              <li key={row.category}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium text-slate-800 dark:text-slate-100">{row.category}</span>
                  <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{money(row.total)}</span>
                </div>
                <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="bg-emerald-400"
                    style={{ width: `${largestCategory ? (row.daily / largestCategory) * 100 : 0}%` }}
                  />
                  <div
                    className="bg-amber-400"
                    style={{ width: `${largestCategory ? (row.monthly / largestCategory) * 100 : 0}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 flex items-center gap-4 text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> Daily spending
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-400" /> Monthly bills
          </span>
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">Expenses in this period</h3>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-full bg-slate-100 p-1 dark:bg-slate-800">
              {KIND_FILTERS.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setKind(filter.key)}
                  aria-pressed={kind === filter.key}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-all duration-150 ${
                    kind === filter.key
                      ? 'bg-white text-emerald-600 shadow-sm dark:bg-slate-900 dark:text-emerald-400'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search note or category"
              className="w-44 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
        </div>

        {all.length === 0 ? (
          <p className="mt-6 text-center text-sm text-slate-400">
            No expenses in this period. Expenses logged with the Expense button appear here.
          </p>
        ) : visible.length === 0 ? (
          <p className="mt-6 text-center text-sm text-slate-400">No expenses match this filter.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {visible.map((expense) => (
              <li key={expense.id} className="grid grid-cols-[7.5rem_1fr_auto] items-start gap-3 py-2.5 text-sm">
                <span className="text-xs tabular-nums text-slate-400">{formatDateTime(expense.createdAt)}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 font-medium text-slate-800 dark:text-slate-100">
                    {expense.category}
                    {isMonthly(expense) && (
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                        Monthly
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-slate-400">
                    {expense.description ?? 'No note'} · {expense.paymentMethod === 'MPESA' ? 'M-Pesa' : 'Cash'}
                    {expense.recordedBy ? ` · Shift: ${expense.recordedBy}` : ''}
                  </div>
                </div>
                <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{money(expense.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Tile({ label, value, hint, emphasis }: { label: string; value: string; hint: string; emphasis?: boolean }) {
  return (
    <div
      className={`rounded-xl border p-3.5 ${
        emphasis
          ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10'
          : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
      }`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums text-slate-900 dark:text-white">{value}</p>
      <p className="mt-0.5 text-xs text-slate-400">{hint}</p>
    </div>
  )
}
