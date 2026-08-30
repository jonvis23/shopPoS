import { useState } from 'react'
import type { FormEvent } from 'react'
import type { UserRecord } from '../../../../shared/ipc'
import type { ToastState } from '../Toast'
import { XIcon } from '../Icons'

interface ResetPinModalProps {
  user: UserRecord
  onClose: () => void
  onSaved: () => Promise<void> | void
  showToast: (kind: ToastState['kind'], message: string) => void
}

const fieldInput =
  'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-center text-sm tracking-[0.5em] outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white'

export function ResetPinModal({ user, onClose, onSaved, showToast }: ResetPinModalProps) {
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (pin.length !== 4 || !/^\d+$/.test(pin)) {
      showToast('error', 'PIN must be 4 digits')
      return
    }
    if (pin !== confirmPin) {
      showToast('error', 'PINs do not match')
      return
    }
    setSaving(true)
    try {
      await window.electronAPI.setUserPin(user.id, pin)
      showToast('success', `PIN reset for ${user.name}`)
      await onSaved()
      onClose()
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not reset PIN')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="osk-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-slate-200/60 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">Reset PIN — {user.name}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 transition-colors hover:text-slate-600">
            <XIcon width={18} height={18} />
          </button>
        </div>

        <label className="mt-4 block text-xs font-semibold text-slate-500 dark:text-slate-400">New PIN</label>
        <input
          autoFocus
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          className={fieldInput}
        />
        <label className="mt-3 block text-xs font-semibold text-slate-500 dark:text-slate-400">Confirm PIN</label>
        <input
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
          className={fieldInput}
        />

        <button
          type="submit"
          disabled={saving}
          className="mt-5 w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-500/30 transition-all duration-150 hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Reset PIN'}
        </button>
      </form>
    </div>
  )
}
