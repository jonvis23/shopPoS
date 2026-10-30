import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { SessionUser, UserRecord } from '../../../shared/ipc'
import { hasRight } from '../../../shared/rights'
import type { ToastState } from './Toast'
import { XIcon } from './Icons'

const PIN_LENGTH = 4

interface ForceLogoutModalProps {
  session: SessionUser
  onClose: () => void
  onLoggedOut: () => void
  showToast: (kind: ToastState['kind'], message: string) => void
}

// The emergency exit from a shift: an Admin signs the till out mid-shift. The shift
// stays open under the same person's name, and the reason goes on the audit trail.
export function ForceLogoutModal({ session, onClose, onLoggedOut, showToast }: ForceLogoutModalProps) {
  const [admins, setAdmins] = useState<UserRecord[]>([])
  const [adminId, setAdminId] = useState<number | null>(null)
  const [adminPin, setAdminPin] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.electronAPI
      .listUsers()
      .then((rows) => setAdmins(rows.filter((user) => user.isActive && hasRight(user, 'manage_staff'))))
      .catch(() => undefined)
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (adminId === null) {
      showToast('error', 'Pick the Admin who is authorising this')
      return
    }
    if (adminPin.length !== PIN_LENGTH) {
      showToast('error', `Admin PIN must be ${PIN_LENGTH} digits`)
      return
    }
    setBusy(true)
    try {
      await window.electronAPI.forceLogout({ adminUserId: adminId, adminPin, reason: reason.trim() })
      onLoggedOut()
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not log out')
      setAdminPin('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="osk-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-slate-200/60 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">Admin override</h3>
          <button type="button" onClick={onClose} className="text-slate-400 transition-colors hover:text-slate-600">
            <XIcon width={18} height={18} />
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          This signs {session.name} out in the middle of the shift. The shift stays open under their name, and anything
          in the cart that hasn't been checked out is lost.
        </p>

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
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

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
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

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Reason
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="e.g. cashier unwell, till needed at the counter"
          className="mt-1 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        />

        <button
          type="submit"
          disabled={busy || !reason.trim()}
          className="mt-4 w-full rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-red-500/30 transition-all duration-150 hover:bg-red-600 active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? 'Signing out…' : 'Sign out with override'}
        </button>
      </form>
    </div>
  )
}
