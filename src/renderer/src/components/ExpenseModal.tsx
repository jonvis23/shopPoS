import { useEffect, useState } from 'react'
import type { ExpenseRecord, PaymentMethod, ShiftRecord } from '../../../shared/ipc'
import { toCurrency } from '../../../shared/stock'
import { formatTime } from '../../../shared/datetime'
import type { ToastState } from './Toast'
import { XIcon } from './Icons'
import { FormattedNumberInput } from './FormattedNumberInput'

interface ExpenseModalProps {
  activeShift: ShiftRecord
  onClose: () => void
  showToast: (kind: ToastState['kind'], message: string) => void
}

const PRESET_CATEGORIES = ['Transport', 'Fuel', 'Electricity', 'Water', 'Rent', 'Labour', 'Other']

export function ExpenseModal({ activeShift, onClose, showToast }: ExpenseModalProps) {
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([])
  const [loading, setLoading] = useState(true)

  const [category, setCategory] = useState(PRESET_CATEGORIES[0])
  const [customCategory, setCustomCategory] = useState('')
  const [amount, setAmount] = useState('0')
  const [description, setDescription] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH')
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const rows = await window.electronAPI.listExpensesByShift(activeShift.id)
      setExpenses(rows)
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not load expenses')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const total = expenses.reduce((sum, e) => sum + e.amount, 0)
  const resolvedCategory = category === 'Other' ? customCategory.trim() : category
  const canSubmit = resolvedCategory.length > 0 && (Number(amount) || 0) > 0

  const submit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      await window.electronAPI.recordExpense({
        shiftId: activeShift.id,
        category: resolvedCategory,
        amount: Number(amount) || 0,
        description: description.trim() || undefined,
        paymentMethod,
      })
      showToast('success', 'Expense logged')
      setCategory(PRESET_CATEGORIES[0])
      setCustomCategory('')
      setAmount('0')
      setDescription('')
      setPaymentMethod('CASH')
      await load()
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not log expense')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="osk-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-sm flex-col rounded-2xl border border-slate-200/60 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">Log expense</h3>
          <button type="button" onClick={onClose} className="text-slate-400 transition-colors hover:text-slate-600">
            <XIcon width={18} height={18} />
          </button>
        </div>

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Category
        </label>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {PRESET_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-150 active:scale-[0.98] ${
                category === c
                  ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        {category === 'Other' && (
          <input
            value={customCategory}
            onChange={(e) => setCustomCategory(e.target.value)}
            placeholder="e.g. Repairs"
            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        )}

        <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Amount (KES)
        </label>
        <FormattedNumberInput
          value={amount}
          onChange={setAmount}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        />

        <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Paid with
        </label>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          {([
            { value: 'CASH', label: 'Cash' },
            { value: 'MPESA', label: 'M-Pesa' },
          ] as Array<{ value: PaymentMethod; label: string }>).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setPaymentMethod(option.value)}
              className={`rounded-lg py-2 text-sm font-semibold transition-all duration-150 active:scale-[0.98] ${
                paymentMethod === option.value
                  ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Description (optional)
        </label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Matatu fare to town"
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        />

        <button
          type="button"
          disabled={!canSubmit || submitting}
          onClick={submit}
          className="mt-4 w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-500/30 transition-all duration-150 hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-50"
        >
          {submitting ? 'Logging…' : 'Add expense'}
        </button>

        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Today's shift expenses
          </span>
          <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">{toCurrency(total)}</span>
        </div>

        <div className="mt-2 flex-1 overflow-y-auto">
          {loading && <div className="py-6 text-center text-sm text-slate-400">Loading…</div>}
          {!loading && expenses.length === 0 && (
            <div className="py-6 text-center text-sm text-slate-400">No expenses logged this shift.</div>
          )}
          <div className="flex flex-col gap-2">
            {expenses.map((expense) => (
              <div
                key={expense.id}
                className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm dark:border-slate-800"
              >
                <div>
                  <div className="font-medium text-slate-800 dark:text-slate-100">{expense.category}</div>
                  {expense.description && (
                    <div className="text-xs text-slate-400">{expense.description}</div>
                  )}
                  <div className="text-xs tabular-nums text-slate-400">
                    {formatTime(expense.createdAt)} · {expense.paymentMethod === 'MPESA' ? 'M-Pesa' : 'Cash'}
                  </div>
                </div>
                <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                  {toCurrency(expense.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
