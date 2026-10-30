import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { DomesticConsumptionRecord, ExpenseRecord } from '../../../shared/ipc'
import { toCurrency } from '../../../shared/stock'

interface ShiftReviewListProps {
  shiftId: number
  reviewed: boolean
  onReviewedChange: (reviewed: boolean) => void
  /** Changes whenever an expense is added, so the list reloads. */
  refreshKey: number
}

// Money that left the till as an expense, and stock taken home, are neither sales
// nor cash counted at the till. They are listed here so whoever closes or hands over
// the shift has looked at them before the count is accepted.
export function ShiftReviewList({ shiftId, reviewed, onReviewedChange, refreshKey }: ShiftReviewListProps) {
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([])
  const [takeHome, setTakeHome] = useState<DomesticConsumptionRecord[]>([])

  useEffect(() => {
    Promise.all([window.electronAPI.listExpensesByShift(shiftId), window.electronAPI.listDomesticConsumption(1000)])
      .then(([expenseRows, consumptionRows]) => {
        setExpenses(expenseRows)
        setTakeHome(consumptionRows.filter((row) => row.shiftId === shiftId && row.status === 'COMPLETED'))
      })
      .catch(() => undefined)
  }, [shiftId, refreshKey])

  const daily = expenses.filter((expense) => expense.kind !== 'MONTHLY')
  const monthly = expenses.filter((expense) => expense.kind === 'MONTHLY')
  const sumOf = (rows: ExpenseRecord[]) => rows.reduce((sum, expense) => sum + expense.amount, 0)
  const takeHomeTotal = takeHome.reduce((sum, row) => sum + row.costValue, 0)

  return (
    <div className="flex flex-col gap-4">
      <ReviewBlock title="Daily spending" empty="No daily spending." hasRows={daily.length > 0}>
        {daily.map((expense) => (
          <ReviewRow key={expense.id} label={expense.category} value={toCurrency(expense.amount)} />
        ))}
        {daily.length > 0 && <ReviewRow label="Total" value={toCurrency(sumOf(daily))} bold />}
      </ReviewBlock>

      {monthly.length > 0 && (
        <ReviewBlock title="Monthly bills" empty="" hasRows>
          {monthly.map((expense) => (
            <ReviewRow key={expense.id} label={expense.category} value={toCurrency(expense.amount)} />
          ))}
          <ReviewRow label="Total" value={toCurrency(sumOf(monthly))} bold />
        </ReviewBlock>
      )}

      <ReviewBlock title="Take-home stock" empty="No stock taken home." hasRows={takeHome.length > 0}>
        {takeHome.map((row) => (
          <ReviewRow
            key={row.id}
            label={`${row.productName} · ${row.quantityKg} kg`}
            value={toCurrency(row.costValue)}
          />
        ))}
        {takeHome.length > 0 && <ReviewRow label="Total at cost" value={toCurrency(takeHomeTotal)} bold />}
      </ReviewBlock>

      <label className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          checked={reviewed}
          onChange={(event) => onReviewedChange(event.target.checked)}
          className="mt-0.5"
        />
        <span>I've checked these expenses and take-home stock against what actually left the till.</span>
      </label>
    </div>
  )
}

function ReviewBlock({
  title,
  empty,
  hasRows,
  children,
}: {
  title: string
  empty: string
  hasRows: boolean
  children: ReactNode
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</div>
      <div className="mt-1.5 flex flex-col gap-1.5">
        {hasRows ? children : <div className="py-1 text-center text-xs text-slate-400">{empty}</div>}
      </div>
    </div>
  )
}

function ReviewRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between px-3 text-sm ${
        bold
          ? 'border-t border-slate-100 pt-1.5 text-xs font-semibold dark:border-slate-800'
          : 'rounded-lg border border-slate-100 py-1.5 dark:border-slate-800'
      }`}
    >
      <span className={bold ? 'text-slate-500 dark:text-slate-400' : 'text-slate-700 dark:text-slate-200'}>{label}</span>
      <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">{value}</span>
    </div>
  )
}
