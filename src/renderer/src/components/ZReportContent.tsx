import { useEffect, useState } from 'react'
import type { ExpenseRecord, ShiftProductSummary, ShiftRecord } from '../../../shared/ipc'
import { summarizeStock, toCurrency } from '../../../shared/stock'
import { formatDateTime } from '../../../shared/datetime'
import { XIcon } from './Icons'

interface ZReportContentProps {
  shift: ShiftRecord
  onClose: () => void
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'warn' | 'good' }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span
        className={`font-medium tabular-nums ${
          tone === 'warn' ? 'text-red-500' : tone === 'good' ? 'text-emerald-600' : 'text-slate-800 dark:text-slate-100'
        }`}
      >
        {value}
      </span>
    </div>
  )
}

function formatDuration(startIso: string, endIso: string | null): string {
  if (!endIso) return '—'
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime()
  const hours = Math.floor(ms / (1000 * 60 * 60))
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
  return `${hours}h ${minutes}m`
}

// Just the report card's insides — header, tables, breakdowns — with no opinion
// on how it's presented. ZReportModal wraps this in a centered overlay for the
// "just closed a shift" interruption; ShiftHistoryTab instead docks it in a
// side panel so browsing past shifts doesn't blur/cover the list behind it.
export function ZReportContent({ shift, onClose }: ZReportContentProps) {
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([])
  const [productsSold, setProductsSold] = useState<ShiftProductSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    window.electronAPI
      .listExpensesByShift(shift.id)
      .then(setExpenses)
      .catch(() => undefined)
      .finally(() => setLoading(false))
    window.electronAPI
      .listProductsSoldByShift(shift.id)
      .then(setProductsSold)
      .catch(() => undefined)
  }, [shift.id])

  const cashVariance = shift.varianceCash ?? 0
  const mpesaVariance = shift.varianceMpesa ?? 0

  return (
    <>
      <div className="flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-2.5">
          <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">Z-Report — Shift #{shift.id}</h3>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
            Closed
          </span>
        </div>
        <button type="button" onClick={onClose} className="text-slate-400 transition-colors hover:text-slate-600">
          <XIcon width={18} height={18} />
        </button>
      </div>

      <div className="mt-4 flex-1 overflow-y-auto pr-1">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-xl border border-slate-100 bg-slate-50/50 p-3 text-sm dark:border-slate-800 dark:bg-slate-800/30">
          <Row label="Cashier" value={shift.userName} />
          <Row label="Duration" value={formatDuration(shift.startTime, shift.endTime)} />
          <Row label="Started" value={formatDateTime(shift.startTime)} />
          <Row label="Ended" value={shift.endTime ? formatDateTime(shift.endTime) : '—'} />
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:bg-slate-900">
              <tr>
                <th className="px-3 py-2" />
                <th className="px-3 py-2">Cash</th>
                <th className="px-3 py-2">M-Pesa</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              <tr className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2 font-medium text-slate-600 dark:text-slate-300">Opening</td>
                <td className="px-3 py-2">{toCurrency(shift.openingCash)}</td>
                <td className="px-3 py-2">{toCurrency(shift.openingMpesa)}</td>
              </tr>
              <tr className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2 font-medium text-slate-600 dark:text-slate-300">Expected</td>
                <td className="px-3 py-2">{toCurrency(shift.expectedCash ?? 0)}</td>
                <td className="px-3 py-2">{toCurrency(shift.expectedMpesa ?? 0)}</td>
              </tr>
              <tr className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2 font-medium text-slate-600 dark:text-slate-300">Actual</td>
                <td className="px-3 py-2">{toCurrency(shift.closingCashActual ?? 0)}</td>
                <td className="px-3 py-2">{toCurrency(shift.closingMpesaActual ?? 0)}</td>
              </tr>
              <tr className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2 font-semibold text-slate-800 dark:text-slate-100">Variance</td>
                <td className={`px-3 py-2 font-semibold ${cashVariance < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                  {toCurrency(cashVariance)}
                </td>
                <td className={`px-3 py-2 font-semibold ${mpesaVariance < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                  {toCurrency(mpesaVariance)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-4 rounded-xl border border-slate-100 p-3 text-sm dark:border-slate-800">
          <Row label="Total sales" value={toCurrency(shift.totalSales ?? 0)} />
          <Row label="Total transactions" value={String(shift.totalTransactions ?? 0)} />
          <Row label="Total expenses" value={toCurrency(shift.totalExpenses ?? 0)} />
          <Row label="Domestic consumption" value={toCurrency(shift.totalDomesticConsumption ?? 0)} />
          {/* Debt is part of Total sales (goods gone out unpaid still count as sold),
              so this is a share of the figure above, not an addition to it — same
              relationship Analytics draws between Revenue and Debt accrued. */}
          <Row label="Total debt" value={toCurrency(shift.totalDebt ?? 0)} tone={(shift.totalDebt ?? 0) > 0 ? 'warn' : undefined} />
        </div>

        {productsSold.length > 0 && (
          <div className="mt-4 rounded-xl border border-slate-100 p-3 text-sm dark:border-slate-800">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Products sold
            </div>
            {productsSold.map((row) => (
              <Row key={row.productName} label={row.productName} value={summarizeStock(row.totalKg, row.weightPerBag).label} />
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Expense breakdown
          </span>
        </div>
        <div className="mt-2">
          {loading && <div className="py-4 text-center text-sm text-slate-400">Loading…</div>}
          {!loading && expenses.length === 0 && (
            <div className="py-4 text-center text-sm text-slate-400">No expenses logged this shift.</div>
          )}
          <div className="flex flex-col gap-2">
            {expenses.map((expense) => (
              <div
                key={expense.id}
                className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm dark:border-slate-800"
              >
                <div>
                  <div className="font-medium text-slate-800 dark:text-slate-100">{expense.category}</div>
                  {expense.description && <div className="text-xs text-slate-400">{expense.description}</div>}
                </div>
                <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">{toCurrency(expense.amount)}</span>
              </div>
            ))}
          </div>
        </div>

        {(shift.openingNotes || shift.notes) && (
          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800">
            {shift.openingNotes && (
              <div>
                <span className="font-semibold text-slate-600 dark:text-slate-300">Opening notes: </span>
                <span className="text-slate-500 dark:text-slate-400">{shift.openingNotes}</span>
              </div>
            )}
            {shift.notes && (
              <div className="mt-1">
                <span className="font-semibold text-slate-600 dark:text-slate-300">Closing notes: </span>
                <span className="text-slate-500 dark:text-slate-400">{shift.notes}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onClose}
        className="mt-4 w-full shrink-0 rounded-xl bg-slate-100 py-2.5 text-sm font-semibold text-slate-600 transition-all duration-150 hover:bg-slate-200 active:scale-[0.98] dark:bg-slate-800 dark:text-slate-300"
      >
        Close
      </button>
    </>
  )
}
