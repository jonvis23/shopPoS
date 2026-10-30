import { useEffect, useState } from 'react'
import type { ExpenseKind, ExpenseRecord, PaymentMethod, ShiftRecord } from '../../../shared/ipc'
import { toCurrency } from '../../../shared/stock'
import { formatTime } from '../../../shared/datetime'
import type { ToastState } from './Toast'
import { XIcon } from './Icons'
import { FormattedNumberInput } from './FormattedNumberInput'

interface ExpenseModalProps {
  activeShift: ShiftRecord
  /** Only people with the monthly bills right can log them. Everyone else sees daily spending only. */
  canLogMonthlyBills: boolean
  onClose: () => void
  showToast: (kind: ToastState['kind'], message: string) => void
}

const CATEGORIES: Record<ExpenseKind, string[]> = {
  DAILY: ['Transport', 'Fuel', 'Labour', 'Cleaning', 'Other'],
  MONTHLY: ['Rent', 'Electricity', 'Water', 'Wi-Fi', 'Licences', 'Other'],
}

const KIND_LABELS: Record<ExpenseKind, string> = {
  DAILY: 'Daily spending',
  MONTHLY: 'Monthly bill',
}

export function ExpenseModal({ activeShift, canLogMonthlyBills, onClose, showToast }: ExpenseModalProps) {
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([])
  const [loading, setLoading] = useState(true)

  const [kind, setKind] = useState<ExpenseKind>('DAILY')
  const [category, setCategory] = useState(CATEGORIES.DAILY[0])
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

  const chooseKind = (next: ExpenseKind) => {
    setKind(next)
    setCategory(CATEGORIES[next][0])
    setCustomCategory('')
  }

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
        kind,
      })
      showToast('success', 'Expense saved')
      setCategory(CATEGORIES[kind][0])
      setCustomCategory('')
      setAmount('0')
      setDescription('')
      setPaymentMethod('CASH')
      await load()
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not save expense')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="osk-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      {/* On a wide screen the form and today's spending sit side by side, so the list
          gets the full height instead of whatever the form leaves over. Narrow screens stack them. */}
      <div className="flex max-h-[85vh] w-full max-w-sm flex-col rounded-2xl border border-slate-200/60 bg-white p-5 shadow-xl md:max-w-3xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">Record an expense</h3>
          <button type="button" onClick={onClose} className="text-slate-400 transition-colors hover:text-slate-600">
            <XIcon width={18} height={18} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row md:gap-6">
        <div className="flex min-w-0 flex-1 flex-col">
        {canLogMonthlyBills && (
          <div className="mt-4 grid grid-cols-2 gap-1.5 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            {(['DAILY', 'MONTHLY'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => chooseKind(option)}
                aria-pressed={kind === option}
                className={`rounded-lg py-1.5 text-xs font-semibold transition-all duration-150 ${
                  kind === option
                    ? 'bg-white text-emerald-600 shadow-sm dark:bg-slate-900 dark:text-emerald-400'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {KIND_LABELS[option]}
              </button>
            ))}
          </div>
        )}
        <p className="mt-1.5 text-[11px] text-slate-400">
          {kind === 'DAILY' ? 'Day-to-day spending from the till.' : 'A bill that comes once a month.'}
        </p>

        <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          What for
        </label>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {CATEGORIES[kind].map((c) => (
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
          Note <span className="normal-case font-normal text-slate-400">(optional)</span>
        </label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Matatu fare to town"
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        />

        {!canSubmit && (
          <p className="mt-3 text-[11px] text-slate-400">
            {resolvedCategory.length === 0 ? 'Choose what it was for, then type the amount.' : 'Type the amount paid, in shillings.'}
          </p>
        )}
        <button
          type="button"
          disabled={!canSubmit || submitting}
          onClick={submit}
          className="mt-3 w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-500/30 transition-all duration-150 hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save expense'}
        </button>

        </div>

        <div className="flex min-h-0 flex-1 flex-col md:w-72 md:shrink-0 md:flex-none md:border-l md:border-slate-100 md:pl-6 md:dark:border-slate-800">
        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3 md:mt-0 md:border-t-0 md:pt-0 dark:border-slate-800">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Spent this shift
          </span>
          <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">{toCurrency(total)}</span>
        </div>

        <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
          {loading && <div className="py-6 text-center text-sm text-slate-400">Loading…</div>}
          {!loading && expenses.length === 0 && (
            <div className="py-6 text-center text-sm text-slate-400">No expenses recorded this shift.</div>
          )}
          <div className="flex flex-col gap-2">
            {expenses.map((expense) => (
              <div
                key={expense.id}
                className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm dark:border-slate-800"
              >
                <div>
                  <div className="font-medium text-slate-800 dark:text-slate-100">
                    {expense.category}
                    {expense.kind === 'MONTHLY' && (
                      <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        Monthly
                      </span>
                    )}
                  </div>
                  {expense.description && <div className="text-xs text-slate-400">{expense.description}</div>}
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
      </div>
    </div>
  )
}
