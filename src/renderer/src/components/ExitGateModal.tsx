import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { AdminOverride, SessionUser, ShiftRecord, UserRecord } from '../../../shared/ipc'
import { formatDateTime } from '../../../shared/datetime'
import { hasRight } from '../../../shared/rights'
import type { ToastState } from './Toast'
import { EndShiftModal } from './EndShiftModal'
import { ZReportModal } from './ZReportModal'
import { XIcon } from './Icons'

const PIN_LENGTH = 4

interface ExitGateModalProps {
  shift: ShiftRecord
  session: SessionUser | null
  onCancel: () => void
  showToast: (kind: ToastState['kind'], message: string) => void
}

// Shown when someone closes the window while a shift is open. Ending the shift is the
// way out: the count and expenses go on record, then the Z-report, then the app closes.
// An Admin can still override in an emergency, and the override goes on the audit trail.
export function ExitGateModal({ shift, session, onCancel, showToast }: ExitGateModalProps) {
  const [admins, setAdmins] = useState<UserRecord[]>([])
  const [endingShift, setEndingShift] = useState(false)
  const [closedShift, setClosedShift] = useState<ShiftRecord | null>(null)
  const [overriding, setOverriding] = useState(false)
  const [adminId, setAdminId] = useState<number | null>(null)
  const [adminPin, setAdminPin] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const isOwner = !!session && (shift.userId === null || shift.userId === session.id)

  useEffect(() => {
    window.electronAPI
      .listUsers()
      .then((rows) => setAdmins(rows.filter((user) => user.isActive && hasRight(user, 'manage_staff'))))
      .catch(() => undefined)
  }, [])

  const exit = async (override?: AdminOverride) => {
    setBusy(true)
    try {
      await window.electronAPI.exitApp(override)
    } catch (error) {
      setBusy(false)
      showToast('error', error instanceof Error ? error.message : 'Could not close the app')
    }
  }

  const submitOverride = async (event: FormEvent) => {
    event.preventDefault()
    if (adminId === null) {
      showToast('error', 'Pick the Admin who is authorising this')
      return
    }
    if (adminPin.length !== PIN_LENGTH) {
      showToast('error', `Admin PIN must be ${PIN_LENGTH} digits`)
      return
    }
    if (!reason.trim()) {
      showToast('error', 'Write a reason for the override')
      return
    }
    await exit({ adminUserId: adminId, adminPin, reason: reason.trim() })
    setAdminPin('')
  }

  // The window is still open here, so the Z-report is seen and can be printed before
  // the app closes. Closing it is what ends the exit.
  if (closedShift) {
    return <ZReportModal shift={closedShift} onClose={() => exit()} />
  }

  return (
    <>
      <div className="osk-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
        <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-slate-200/60 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">Shift still open</h3>
            <button type="button" onClick={onCancel} className="text-slate-400 transition-colors hover:text-slate-600">
              <XIcon width={18} height={18} />
            </button>
          </div>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {shift.userName} opened this shift at {formatDateTime(shift.startTime)}. End it before you exit, so the
            cash count and expenses are on record.
          </p>

          {isOwner ? (
            <button
              type="button"
              onClick={() => setEndingShift(true)}
              disabled={busy}
              className="mt-4 w-full rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-red-500/30 transition-all duration-150 hover:bg-red-600 active:scale-[0.98] disabled:opacity-50"
            >
              End shift and exit
            </button>
          ) : (
            <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              {session
                ? `Only ${shift.userName} can end this shift. Ask them to sign in and end it.`
                : `Sign in as ${shift.userName} to end this shift.`}
            </p>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="mt-2 w-full rounded-xl bg-slate-100 py-2.5 text-sm font-semibold text-slate-600 transition-all duration-150 hover:bg-slate-200 active:scale-[0.98] dark:bg-slate-800 dark:text-slate-300"
          >
            Stay in the till
          </button>

          <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
            {!overriding ? (
              <button
                type="button"
                onClick={() => setOverriding(true)}
                className="text-xs font-semibold text-slate-500 underline-offset-2 hover:underline dark:text-slate-400"
              >
                Admin override: exit without ending the shift
              </button>
            ) : (
              <form onSubmit={submitOverride}>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  The shift stays open under {shift.userName}. Whoever opens the till next can end it.
                </p>

                <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Authorised by
                </label>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {admins.map((admin) => (
                    <button
                      key={admin.id}
                      type="button"
                      onClick={() => setAdminId(admin.id)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        adminId === admin.id
                          ? 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-500/50 dark:bg-emerald-500/10 dark:text-emerald-300'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      {admin.name}
                    </button>
                  ))}
                </div>

                <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Admin PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={PIN_LENGTH}
                  value={adminPin}
                  onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, ''))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-center text-lg tracking-[0.5em] outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />

                <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Reason
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="e.g. power cut, UPS battery flat"
                  className="mt-1 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />

                <button
                  type="submit"
                  disabled={busy || !reason.trim()}
                  className="mt-4 w-full rounded-xl bg-slate-700 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50 dark:bg-slate-600 dark:hover:bg-slate-500"
                >
                  {busy ? 'Closing…' : 'Exit with override'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {endingShift && (
        <EndShiftModal
          shift={shift}
          canLogMonthlyBills={!!session && hasRight(session, 'manage_bills')}
          showToast={showToast}
          onClose={() => setEndingShift(false)}
          onClosed={(closed) => {
            setEndingShift(false)
            setClosedShift(closed)
          }}
        />
      )}
    </>
  )
}
