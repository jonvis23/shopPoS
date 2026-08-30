import { useEffect, useMemo, useRef, useState } from 'react'
import type { CustomerBalance } from '../../../../shared/ipc'
import { formatThousands, toCurrency } from '../../../../shared/stock'
import { CustomerAutocomplete } from '../CustomerAutocomplete'
import { FormattedNumberInput } from '../FormattedNumberInput'
import { PlusIcon, XIcon } from '../Icons'

export interface CheckoutPayload {
  customerName: string
  customerPhone: string
  discount: number
  cashPaid: number
  mpesaPaid: number
}

interface CheckoutModalProps {
  subtotal: number
  submitting: boolean
  canApplyDiscount: boolean
  onConfirm: (payload: CheckoutPayload) => void
  onClose: () => void
}

// The label row for a payment box, with the one-tap shortcut that settles the
// bill. Typing "1,250" on a touch keypad for the hundredth time that day is the
// slowest part of a cash sale, and it is the same number sitting at the top of
// the very same window.
function PaymentLabel({ text, fill, onFill }: { text: string; fill: number; onFill: () => void }) {
  return (
    <div className="flex items-baseline justify-between gap-1">
      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {text}
      </label>
      {fill > 0 && (
        <button
          type="button"
          onClick={onFill}
          title={`Put the whole outstanding ${toCurrency(fill)} here`}
          className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold tabular-nums text-emerald-600 transition-all duration-150 hover:bg-emerald-100 active:scale-95 dark:bg-emerald-500/15 dark:text-emerald-400"
        >
          Fill {formatThousands(String(fill))}
        </button>
      )}
    </div>
  )
}

export function CheckoutModal({ subtotal, submitting, canApplyDiscount, onConfirm, onClose }: CheckoutModalProps) {
  const [customerName, setCustomerName] = useState('Walk-in')
  const [customerPhone, setCustomerPhone] = useState('')
  const [discount, setDiscount] = useState('0')
  const [discountOpen, setDiscountOpen] = useState(false)
  const [cashPaid, setCashPaid] = useState('0')
  const [mpesaPaid, setMpesaPaid] = useState('0')
  const [knownCustomers, setKnownCustomers] = useState<CustomerBalance[]>([])
  const [phoneHint, setPhoneHint] = useState<'filled' | 'missing' | null>(null)
  const phoneInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    window.electronAPI.listCustomerBalances().then(setKnownCustomers).catch(() => undefined)
  }, [])

  const total = Math.max(0, subtotal - (Number(discount) || 0))
  const paid = (Number(cashPaid) || 0) + (Number(mpesaPaid) || 0)
  const balance = useMemo(() => total - paid, [total, paid])
  const isDebt = balance > 0
  const trimmedName = customerName.trim()
  const debtNeedsName = isDebt && (!trimmedName || trimmedName.toLowerCase() === 'walk-in')

  // What is still owed. Almost always the whole bill, which is why the shortcut
  // is worth having; but if one method has already been part-entered, filling the
  // other should settle the remainder rather than overshoot to the full total.
  const remaining = Math.round(Math.max(0, balance) * 100) / 100

  const fillFrom = (current: string, set: (value: string) => void) => {
    const next = Math.round(((Number(current) || 0) + remaining) * 100) / 100
    set(String(next))
  }

  const submit = () => {
    if (debtNeedsName) return
    onConfirm({
      customerName: trimmedName || 'Walk-in',
      customerPhone: customerPhone.trim(),
      discount: Number(discount) || 0,
      cashPaid: Number(cashPaid) || 0,
      mpesaPaid: Number(mpesaPaid) || 0,
    })
  }

  return (
    <div className="osk-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200/60 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">Checkout</h3>
          <button type="button" onClick={onClose} className="text-slate-400 transition-colors hover:text-slate-600">
            <XIcon width={18} height={18} />
          </button>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800">
          <span className="text-sm text-slate-500 dark:text-slate-400">Subtotal</span>
          <span className="text-base font-bold tabular-nums text-slate-900 dark:text-white">{toCurrency(subtotal)}</span>
        </div>

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Customer name</label>
        <CustomerAutocomplete
          value={customerName}
          onChange={setCustomerName}
          onSelect={(customer) => {
            setCustomerName(customer.customerName)
            if (customer.phone) {
              setCustomerPhone(customer.phone)
              setPhoneHint('filled')
              window.setTimeout(() => setPhoneHint((h) => (h === 'filled' ? null : h)), 1600)
            } else {
              setCustomerPhone('')
              setPhoneHint('missing')
              phoneInputRef.current?.focus()
            }
          }}
          candidates={knownCustomers}
          placeholder="Search by name or phone…"
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        />
        {debtNeedsName && (
          <p className="mt-1 text-xs font-medium text-red-500">
            A named customer is required to record the balance as debt — "Walk-in" can't be tracked for repayment.
          </p>
        )}

        <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Phone number (optional)
        </label>
        <input
          ref={phoneInputRef}
          type="tel"
          value={customerPhone}
          onChange={(e) => {
            setCustomerPhone(e.target.value)
            setPhoneHint(null)
          }}
          placeholder="e.g. 0712 345 678"
          className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none transition-all duration-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:bg-slate-800 dark:text-white ${
            phoneHint === 'filled'
              ? 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-400/30 dark:bg-emerald-500/10'
              : 'border-slate-200 dark:border-slate-700'
          }`}
        />
        {phoneHint === 'filled' && (
          <p className="mt-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            ✓ Contact auto-filled from their last visit
          </p>
        )}
        {phoneHint === 'missing' && (
          <p className="mt-1 text-[11px] font-medium text-amber-600 dark:text-amber-500">
            No phone on file for {trimmedName || 'this customer'} — add one to make their debt easier to track.
          </p>
        )}

        {canApplyDiscount && (
          <div className="mt-3">
            {discountOpen ? (
              <>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Discount (KES)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setDiscountOpen(false)
                      setDiscount('0')
                    }}
                    className="text-xs font-semibold text-slate-400 transition-colors hover:text-red-500"
                  >
                    Remove
                  </button>
                </div>
                <FormattedNumberInput
                  autoFocus
                  value={discount}
                  onChange={setDiscount}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </>
            ) : (
              <button
                type="button"
                onClick={() => setDiscountOpen(true)}
                className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-all duration-150 hover:bg-slate-200 active:scale-[0.98] dark:bg-slate-800 dark:text-slate-300"
              >
                <PlusIcon width={12} height={12} /> Add discount
              </button>
            )}
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <PaymentLabel text="Cash paid" fill={remaining} onFill={() => fillFrom(cashPaid, setCashPaid)} />
            <FormattedNumberInput
              value={cashPaid}
              onChange={setCashPaid}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div>
            <PaymentLabel text="M-Pesa paid" fill={remaining} onFill={() => fillFrom(mpesaPaid, setMpesaPaid)} />
            <FormattedNumberInput
              value={mpesaPaid}
              onChange={setMpesaPaid}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="font-semibold text-slate-500 dark:text-slate-400">{balance > 0 ? 'Debt' : 'Change'}</span>
          <span className={`font-bold tabular-nums ${balance > 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
            {toCurrency(Math.abs(balance))}
          </span>
        </div>

        <button
          type="button"
          disabled={submitting || debtNeedsName}
          onClick={submit}
          className="mt-4 w-full rounded-xl bg-emerald-500 py-3 text-sm font-semibold tabular-nums text-white shadow-sm shadow-emerald-500/30 transition-all duration-150 hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-50"
        >
          {submitting ? 'Recording sale…' : `Confirm · ${toCurrency(total)}`}
        </button>
      </div>
    </div>
  )
}
