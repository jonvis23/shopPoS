import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { SessionUser, ShiftRecord, UserRecord } from '../../../shared/ipc'
import type { ToastState } from './Toast'
import { FormattedNumberInput } from './FormattedNumberInput'
import { ShiftReviewList } from './ShiftReviewList'
import { XIcon } from './Icons'

interface HandoverShiftModalProps {
  shift: ShiftRecord
  session: SessionUser
  onClose: () => void
  onHandedOver: () => void
  showToast: (kind: ToastState['kind'], message: string) => void
}

// A mid-day hand-over. The shift stays open and the till is counted as it would be
// for a close, but nothing is reset and no Z-report is printed. The incoming person
// then signs in with their own PIN.
export function HandoverShiftModal({ shift, session, onClose, onHandedOver, showToast }: HandoverShiftModalProps) {
  const [users, setUsers] = useState<UserRecord[]>([])
  const [toUserId, setToUserId] = useState<number | null>(null)
  const [closingCash, setClosingCash] = useState('0')
  const [closingMpesa, setClosingMpesa] = useState('0')
  const [reviewed, setReviewed] = useState(false)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.electronAPI
      .listUsers()
      .then((rows) => setUsers(rows.filter((user) => user.isActive && user.id !== session.id)))
      .catch(() => undefined)
  }, [session.id])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (toUserId === null) {
      showToast('error', 'Pick who is taking over the till')
      return
    }
    setBusy(true)
    try {
      await window.electronAPI.handoverShift({
        shiftId: shift.id,
        toUserId,
        closingCashActual: Number(closingCash) || 0,
        closingMpesaActual: Number(closingMpesa) || 0,
        expensesReviewed: reviewed,
        notes: notes.trim() || undefined,
      })
      onHandedOver()
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not hand over the till')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="osk-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <form
        onSubmit={submit}
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl border border-slate-200/60 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">Hand over the till</h3>
          <button type="button" onClick={onClose} className="text-slate-400 transition-colors hover:text-slate-600">
            <XIcon width={18} height={18} />
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          The shift stays open. You're signed out once the count is saved.
        </p>

        <div className="mt-4 flex-1 overflow-y-auto pr-1">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Taking over
          </label>
          {users.length === 0 ? (
            <p className="mt-2 text-xs text-slate-400">
              No other active staff. Add the next person in Settings → Users &amp; Security first.
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {users.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => setToUserId(user.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    toUserId === user.id
                      ? 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-500/50 dark:bg-emerald-500/10 dark:text-emerald-300'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  {user.name}
                </button>
              ))}
            </div>
          )}

          <div className="mt-5">
            <ShiftReviewList
              shiftId={shift.id}
              reviewed={reviewed}
              onReviewedChange={setReviewed}
              refreshKey={0}
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Counted cash
              </label>
              <FormattedNumberInput
                value={closingCash}
                onChange={setClosingCash}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Counted M-Pesa
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
            placeholder="e.g. anything the next person should know"
            className="mt-1 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>

        {(!reviewed || toUserId === null) && (
          <p className="mt-4 text-center text-[11px] text-slate-400">
            {toUserId === null ? 'Pick who is taking over the till.' : 'Tick the review box above to continue.'}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || !reviewed || toUserId === null}
          className="mt-4 w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-500/30 transition-all duration-150 hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save count and hand over'}
        </button>
      </form>
    </div>
  )
}
