import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { CustomerBalance, CustomerHistoryEvent, DashboardSnapshot, PaymentMethod } from '../../../shared/ipc'
import type { ToastState } from '../components/Toast'
import { CustomerAutocomplete } from '../components/CustomerAutocomplete'
import { FormattedNumberInput } from '../components/FormattedNumberInput'
import { PlusIcon, SearchIcon, XIcon } from '../components/Icons'
import { toCurrency } from '../../../shared/stock'
import { formatDateTime } from '../../../shared/datetime'

interface CustomersPageProps {
  snapshot: DashboardSnapshot
  showToast: (kind: ToastState['kind'], message: string) => void
}

export function CustomersPage({ snapshot, showToast }: CustomersPageProps) {
  const [balances, setBalances] = useState<CustomerBalance[]>([])
  const [loading, setLoading] = useState(true)
  const [repayCustomer, setRepayCustomer] = useState<string | null>(null)
  const [amount, setAmount] = useState('0')
  const [method, setMethod] = useState<PaymentMethod>('CASH')
  const [submitting, setSubmitting] = useState(false)

  const [addDebtOpen, setAddDebtOpen] = useState(false)
  const [newDebtName, setNewDebtName] = useState('')
  const [newDebtPhone, setNewDebtPhone] = useState('')
  const [newDebtAmount, setNewDebtAmount] = useState('0')
  const [newDebtNote, setNewDebtNote] = useState('')
  const [addingDebt, setAddingDebt] = useState(false)
  const [newDebtPhoneHint, setNewDebtPhoneHint] = useState<'filled' | 'missing' | null>(null)
  const newDebtPhoneRef = useRef<HTMLInputElement>(null)

  const [historyCustomer, setHistoryCustomer] = useState<string | null>(null)
  const [historyEvents, setHistoryEvents] = useState<CustomerHistoryEvent[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const rows = await window.electronAPI.listCustomerBalances()
      setBalances(rows)
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not load customers')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submitRepayment = async (event: FormEvent) => {
    event.preventDefault()
    if (!repayCustomer || !snapshot.activeShift) return
    setSubmitting(true)
    try {
      await window.electronAPI.recordDebtRepayment({
        shiftId: snapshot.activeShift.id,
        customerName: repayCustomer,
        amountPaid: Number(amount) || 0,
        paymentMethod: method,
      })
      showToast('success', 'Repayment recorded')
      setRepayCustomer(null)
      setAmount('0')
      await load()
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not record repayment')
    } finally {
      setSubmitting(false)
    }
  }

  const submitNewDebt = async (event: FormEvent) => {
    event.preventDefault()
    if (!snapshot.activeShift) return
    setAddingDebt(true)
    try {
      await window.electronAPI.recordCustomerDebt({
        shiftId: snapshot.activeShift.id,
        customerName: newDebtName,
        customerPhone: newDebtPhone.trim() || undefined,
        amount: Number(newDebtAmount) || 0,
        note: newDebtNote.trim() || undefined,
      })
      showToast('success', 'Customer debt recorded')
      setAddDebtOpen(false)
      setNewDebtName('')
      setNewDebtPhone('')
      setNewDebtAmount('0')
      setNewDebtNote('')
      await load()
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not record debt')
    } finally {
      setAddingDebt(false)
    }
  }

  const openHistory = async (customerName: string) => {
    setHistoryCustomer(customerName)
    setHistoryLoading(true)
    try {
      const events = await window.electronAPI.getCustomerHistory(customerName)
      setHistoryEvents(events)
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not load history')
    } finally {
      setHistoryLoading(false)
    }
  }

  const totalOutstanding = balances.reduce((sum, b) => sum + b.outstanding, 0)
  const query = searchQuery.trim().toLowerCase()
  const visibleBalances = query
    ? balances.filter(
        (b) => b.customerName.toLowerCase().includes(query) || (b.phone ?? '').includes(query)
      )
    : balances

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">Customers</h2>
        <div className="flex items-center gap-4">
          <div className="text-sm text-slate-500 dark:text-slate-400">
            Debt: <span className="font-bold tabular-nums text-red-500">{toCurrency(totalOutstanding)}</span>
          </div>
          <button
            type="button"
            onClick={() => setAddDebtOpen(true)}
            title="Record credit that did not come from a sale on this till — an opening balance carried over from the notebook, for example."
            className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white shadow-sm shadow-emerald-500/30 transition-all duration-150 hover:bg-emerald-600 active:scale-[0.98]"
          >
            <PlusIcon width={14} height={14} /> Add customer debt
          </button>
        </div>
      </div>

      <div className="relative mt-4 max-w-xs">
        <SearchIcon width={16} height={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name or phone…"
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        />
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 shadow-sm dark:border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:bg-slate-900">
            <tr>
              <th className="px-4 py-2.5">Customer</th>
              <th className="px-4 py-2.5">Phone</th>
              <th className="px-4 py-2.5">Debt given</th>
              <th className="px-4 py-2.5">Repaid</th>
              <th className="px-4 py-2.5">Debt</th>
              <th className="px-4 py-2.5">Last activity</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {visibleBalances.map((balance) => (
              <tr key={balance.customerName} className="border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40">
                <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100">{balance.customerName}</td>
                <td className="px-4 py-2.5 tabular-nums text-slate-500 dark:text-slate-400">{balance.phone || '—'}</td>
                <td className="px-4 py-2.5 tabular-nums text-slate-600 dark:text-slate-300">{toCurrency(balance.totalDebt)}</td>
                <td className="px-4 py-2.5 tabular-nums text-slate-600 dark:text-slate-300">{toCurrency(balance.totalRepaid)}</td>
                <td className={`px-4 py-2.5 font-semibold tabular-nums ${balance.outstanding > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                  {toCurrency(balance.outstanding)}
                </td>
                <td className="px-4 py-2.5 text-xs tabular-nums text-slate-400">{formatDateTime(balance.lastActivityAt)}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-3 text-xs">
                    <button
                      type="button"
                      onClick={() => openHistory(balance.customerName)}
                      title="Every credit sale and repayment for this customer, newest first."
                      className="font-semibold text-slate-500 hover:underline dark:text-slate-400"
                    >
                      View history
                    </button>
                    {balance.outstanding > 0 && (
                      <button
                        type="button"
                        onClick={() => setRepayCustomer(balance.customerName)}
                        title="Take money against what this customer owes. It counts towards the current shift's cash or M-Pesa."
                        className="font-semibold text-emerald-600 hover:underline"
                      >
                        Record payment
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && visibleBalances.length === 0 && (
          <div className="p-6 text-center text-sm text-slate-400">
            {query ? 'No customers match your search.' : 'No customer debt on record.'}
          </div>
        )}
        {loading && <div className="p-6 text-center text-sm text-slate-400">Loading…</div>}
      </div>

      {repayCustomer && (
        <div className="osk-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <form onSubmit={submitRepayment} className="w-full max-w-xs rounded-2xl border border-slate-200/60 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Repayment · {repayCustomer}</h3>
              <button type="button" onClick={() => setRepayCustomer(null)} className="text-slate-400 hover:text-slate-600">
                <XIcon width={18} height={18} />
              </button>
            </div>

            <label className="mt-3 block text-xs font-semibold text-slate-500 dark:text-slate-400">Amount paid</label>
            <FormattedNumberInput
              required
              value={amount}
              onChange={setAmount}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />

            <label className="mt-3 block text-xs font-semibold text-slate-500 dark:text-slate-400">Payment method</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {(['CASH', 'MPESA'] as PaymentMethod[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`rounded-lg py-2 text-xs font-semibold transition-all duration-150 active:scale-[0.98] ${
                    method === m
                      ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {m === 'CASH' ? 'Cash' : 'M-Pesa'}
                </button>
              ))}
            </div>

            <button
              type="submit"
              disabled={submitting || !snapshot.activeShift}
              className="mt-4 w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-500/30 transition-all duration-150 hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-50"
            >
              {submitting ? 'Recording…' : 'Record payment'}
            </button>
            {!snapshot.activeShift && <p className="mt-2 text-center text-xs text-red-500">Open a shift first.</p>}
          </form>
        </div>
      )}

      {addDebtOpen && (
        <div className="osk-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <form onSubmit={submitNewDebt} className="w-full max-w-xs rounded-2xl border border-slate-200/60 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Add customer debt</h3>
              <button type="button" onClick={() => setAddDebtOpen(false)} className="text-slate-400 hover:text-slate-600">
                <XIcon width={18} height={18} />
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              For opening balances from before this system, or any credit given outside a sale.
            </p>

            <label className="mt-3 block text-xs font-semibold text-slate-500 dark:text-slate-400">Customer name</label>
            <CustomerAutocomplete
              value={newDebtName}
              onChange={setNewDebtName}
              onSelect={(customer) => {
                setNewDebtName(customer.customerName)
                if (customer.phone) {
                  setNewDebtPhone(customer.phone)
                  setNewDebtPhoneHint('filled')
                  window.setTimeout(() => setNewDebtPhoneHint((h) => (h === 'filled' ? null : h)), 1600)
                } else {
                  setNewDebtPhone('')
                  setNewDebtPhoneHint('missing')
                  newDebtPhoneRef.current?.focus()
                }
              }}
              candidates={balances}
              placeholder="e.g. Mary Wanjiru"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />

            <label className="mt-3 block text-xs font-semibold text-slate-500 dark:text-slate-400">Phone number (optional)</label>
            <input
              ref={newDebtPhoneRef}
              type="tel"
              value={newDebtPhone}
              onChange={(e) => {
                setNewDebtPhone(e.target.value)
                setNewDebtPhoneHint(null)
              }}
              placeholder="e.g. 0712 345 678"
              className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none transition-all duration-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:bg-slate-800 dark:text-white ${
                newDebtPhoneHint === 'filled'
                  ? 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-400/30 dark:bg-emerald-500/10'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            />
            {newDebtPhoneHint === 'filled' && (
              <p className="mt-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                ✓ Contact auto-filled from their last visit
              </p>
            )}
            {newDebtPhoneHint === 'missing' && (
              <p className="mt-1 text-[11px] font-medium text-amber-600 dark:text-amber-500">
                No phone on file for {newDebtName.trim() || 'this customer'} — add one to make their debt easier to track.
              </p>
            )}

            <label className="mt-3 block text-xs font-semibold text-slate-500 dark:text-slate-400">Amount owed</label>
            <FormattedNumberInput
              required
              value={newDebtAmount}
              onChange={setNewDebtAmount}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />

            <label className="mt-3 block text-xs font-semibold text-slate-500 dark:text-slate-400">Note (optional)</label>
            <input
              value={newDebtNote}
              onChange={(e) => setNewDebtNote(e.target.value)}
              placeholder="e.g. Opening balance from paper ledger"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />

            <button
              type="submit"
              disabled={addingDebt || !snapshot.activeShift}
              className="mt-4 w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-500/30 transition-all duration-150 hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-50"
            >
              {addingDebt ? 'Recording…' : 'Add debt'}
            </button>
            {!snapshot.activeShift && <p className="mt-2 text-center text-xs text-red-500">Open a shift first.</p>}
          </form>
        </div>
      )}

      {historyCustomer && (
        <div className="osk-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl border border-slate-200/60 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">History · {historyCustomer}</h3>
              <button
                type="button"
                onClick={() => {
                  setHistoryCustomer(null)
                  setHistoryEvents([])
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <XIcon width={18} height={18} />
              </button>
            </div>

            <div className="mt-3 flex-1 overflow-y-auto">
              {historyLoading && <div className="py-8 text-center text-sm text-slate-400">Loading…</div>}
              {!historyLoading && historyEvents.length === 0 && (
                <div className="py-8 text-center text-sm text-slate-400">No transactions on record.</div>
              )}
              <div className="flex flex-col gap-2.5">
                {historyEvents.map((event) => (
                  <div
                    key={`${event.type}-${event.id}`}
                    className="rounded-lg border border-slate-100 p-3 text-sm dark:border-slate-800"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-semibold uppercase tracking-wide ${
                          event.type === 'SALE'
                            ? 'text-slate-500 dark:text-slate-400'
                            : event.type === 'REPAYMENT'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {event.type === 'SALE' ? 'Sale' : event.type === 'REPAYMENT' ? 'Repayment' : 'Debt added'}
                      </span>
                      <span className="text-xs tabular-nums text-slate-400">{formatDateTime(event.createdAt)}</span>
                    </div>

                    {event.type === 'SALE' && (
                      <>
                        <div className="mt-1.5 flex flex-col gap-0.5">
                          {event.items?.map((item) => (
                            <div key={item.id} className="flex justify-between text-xs text-slate-600 dark:text-slate-300">
                              <span>
                                {item.productName} · {item.quantityKg.toFixed(2)}kg × {toCurrency(item.unitPricePerKg)}
                              </span>
                              <span className="tabular-nums">{toCurrency(item.subtotal)}</span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-x-3 text-xs tabular-nums text-slate-400">
                          <span>Cash {toCurrency(event.cashPaid ?? 0)}</span>
                          <span>M-Pesa {toCurrency(event.mpesaPaid ?? 0)}</span>
                          {(event.debtAmount ?? 0) > 0 && (
                            <span className="font-semibold text-red-500">Debt {toCurrency(event.debtAmount ?? 0)}</span>
                          )}
                        </div>
                      </>
                    )}

                    {event.type === 'REPAYMENT' && (
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Paid via {event.paymentMethod === 'CASH' ? 'Cash' : 'M-Pesa'}
                      </div>
                    )}

                    {event.type === 'DEBT_ENTRY' && event.note && (
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{event.note}</div>
                    )}

                    <div className="mt-1.5 text-right text-sm font-bold tabular-nums text-slate-900 dark:text-white">
                      {toCurrency(event.amount)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
