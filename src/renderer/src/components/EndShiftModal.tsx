import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { ExpenseRecord, ShiftRecord } from '../../../shared/ipc'
import { toCurrency } from '../../../shared/stock'
import { formatDateTime } from '../../../shared/datetime'
import type { ToastState } from './Toast'
import { ExpenseModal } from './ExpenseModal'
import { FormattedNumberInput } from './FormattedNumberInput'
import { PlusIcon, XIcon } from './Icons'

interface EndShiftModalProps {
  shift: ShiftRecord
  onClose: () => void
  onClosed: (shift: ShiftRecord) => void
  showToast: (kind: ToastState['kind'], message: string) => void
}

type Step = 'confirm' | 'form'

export function EndShiftModal({ shift, onClose, onClosed, showToast }: EndShiftModalProps) {
  const [step, setStep] = useState<Step>('confirm')
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([])
  const [addingExpense, setAddingExpense] = useState(false)
  const [closingCash, setClosingCash] = useState('0')
  const [closingMpesa, setClosingMpesa] = useState('0')
  const [notes, setNotes] = useState('')
  const [closing, setClosing] = useState(false)

  const loadExpenses = () => {
    window.electronAPI
      .listExpensesByShift(shift.id)
      .then(setExpenses)
      .catch(() => undefined)
  }

  useEffect(() => {
    if (step === 'form') loadExpenses()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  const expenseTotal = expenses.reduce((sum, e) => sum + e.amount, 0)

  const submitClose = async (event: FormEvent) => {
    event.preventDefault()
    setClosing(true)
    try {
      const summary = await window.electronAPI.closeShift({
        shiftId: shift.id,
        closingCashActual: Number(closingCash) || 0,
        closingMpesaActual: Number(closingMpesa) || 0,
        notes: notes.trim() || undefined,
      })
      onClosed(summary.shift)
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not close shift')
    } finally {
      setClosing(false)
    }
  }

  if (step === 'confirm') {
    return (
      <div className="osk-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200/60 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">End shift?</h3>
            <button type="button" onClick={onClose} className="text-slate-400 transition-colors hover:text-slate-600">
              <XIcon width={18} height={18} />
            </button>
          </div>
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            This will close the till and lock it until a new shift is opened. You'll count and enter your closing
            cash and M-Pesa next.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-slate-100 py-2.5 text-sm font-semibold text-slate-600 transition-all duration-150 hover:bg-slate-200 active:scale-[0.98] dark:bg-slate-800 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => setStep('form')}
              className="rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-red-500/30 transition-all duration-150 hover:bg-red-600 active:scale-[0.98]"
            >
              Yes, End Shift
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="osk-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
        <form
          onSubmit={submitClose}
          className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl border border-slate-200/60 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">End shift — {shift.userName}</h3>
            <button type="button" onClick={onClose} className="text-slate-400 transition-colors hover:text-slate-600">
              <XIcon width={18} height={18} />
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-400">Started {formatDateTime(shift.startTime)}</p>

          <div className="mt-4 flex-1 overflow-y-auto pr-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Expenses this shift
              </span>
              <button
                type="button"
                onClick={() => setAddingExpense(true)}
                className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 transition-all duration-150 hover:bg-slate-200 active:scale-[0.98] dark:bg-slate-800 dark:text-slate-300"
              >
                <PlusIcon width={12} height={12} /> Add expense
              </button>
            </div>
            <div className="mt-2 flex flex-col gap-1.5">
              {expenses.length === 0 && <div className="py-2 text-center text-xs text-slate-400">No expenses logged.</div>}
              {expenses.map((expense) => (
                <div
                  key={expense.id}
                  className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-1.5 text-sm dark:border-slate-800"
                >
                  <span className="text-slate-700 dark:text-slate-200">{expense.category}</span>
                  <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                    {toCurrency(expense.amount)}
                  </span>
                </div>
              ))}
              {expenses.length > 0 && (
                <div className="flex items-center justify-between border-t border-slate-100 px-1 pt-1.5 text-xs font-semibold dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400">Total</span>
                  <span className="tabular-nums text-slate-800 dark:text-slate-100">{toCurrency(expenseTotal)}</span>
                </div>
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Closing cash
                </label>
                <FormattedNumberInput
                  value={closingCash}
                  onChange={setClosingCash}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Closing M-Pesa
                </label>
                <FormattedNumberInput
                  value={closingMpesa}
                  onChange={setClosingMpesa}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>

            <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Notes <span className="normal-case font-normal text-slate-400">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. reason for a variance"
              className="mt-1 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <button
            type="submit"
            disabled={closing}
            className="mt-4 w-full rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-red-500/30 transition-all duration-150 hover:bg-red-600 active:scale-[0.98] disabled:opacity-50"
          >
            {closing ? 'Closing…' : 'Close Shift'}
          </button>
        </form>
      </div>

      {addingExpense && (
        <ExpenseModal
          activeShift={shift}
          showToast={showToast}
          onClose={() => {
            setAddingExpense(false)
            loadExpenses()
          }}
        />
      )}
    </>
  )
}
