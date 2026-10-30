import { useState } from 'react'
import type { FormEvent } from 'react'
import type { UserRecord } from '../../../../shared/ipc'
import { ADMIN_RIGHTS, ADMIN_RIGHT_INFO } from '../../../../shared/rights'
import type { AdminRight } from '../../../../shared/rights'
import type { ToastState } from '../Toast'
import { CheckIcon, XIcon } from '../Icons'

interface UserFormModalProps {
  user: UserRecord | null
  onClose: () => void
  onSaved: () => Promise<void> | void
  showToast: (kind: ToastState['kind'], message: string) => void
}

const fieldLabel = 'mt-3 block text-xs font-semibold text-slate-500 dark:text-slate-400'
const fieldInput =
  'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white'

function RightCheckbox({
  right,
  checked,
  onToggle,
}: {
  right: AdminRight
  checked: boolean
  onToggle: () => void
}) {
  const info = ADMIN_RIGHT_INFO[right]
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      className={`flex w-full items-start gap-3 rounded-xl border p-2.5 text-left transition-all duration-150 ${
        checked
          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10'
          : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
      }`}
    >
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
          checked ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 dark:border-slate-600'
        }`}
      >
        {checked && <CheckIcon width={12} height={12} />}
      </span>
      <span>
        <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{info.label}</div>
        <div className="text-xs text-slate-400">{info.hint}</div>
      </span>
    </button>
  )
}

type Step = 'details' | 'rights'

export function UserFormModal({ user, onClose, onSaved, showToast }: UserFormModalProps) {
  const isEdit = user !== null
  const [step, setStep] = useState<Step>('details')
  const [name, setName] = useState(user?.name ?? '')
  const [rights, setRights] = useState<AdminRight[]>(user?.rights ?? [])
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [saving, setSaving] = useState(false)

  const toggleRight = (right: AdminRight) =>
    setRights((current) => (current.includes(right) ? current.filter((r) => r !== right) : [...current, right]))

  const validateDetails = (): boolean => {
    if (!name.trim()) {
      showToast('error', 'Name is required')
      return false
    }
    if (!isEdit) {
      if (pin.length !== 4 || !/^\d+$/.test(pin)) {
        showToast('error', 'PIN must be 4 digits')
        return false
      }
      if (pin !== confirmPin) {
        showToast('error', 'PINs do not match')
        return false
      }
    }
    return true
  }

  const goToRights = (event: FormEvent) => {
    event.preventDefault()
    if (validateDetails()) setStep('rights')
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!validateDetails()) return
    setSaving(true)
    try {
      if (isEdit) {
        await window.electronAPI.updateUser(user.id, { name: name.trim(), rights })
      } else {
        await window.electronAPI.createUser({ name: name.trim(), rights, pin })
      }
      await onSaved()
      onClose()
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not save staff account')
    } finally {
      setSaving(false)
    }
  }

  const showRightsStep = isEdit || step === 'rights'

  return (
    <div className="osk-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <form
        onSubmit={isEdit ? submit : step === 'details' ? goToRights : submit}
        className="flex max-h-[90vh] w-full max-w-md flex-col rounded-2xl border border-slate-200/60 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
            {isEdit ? 'Edit staff account' : step === 'details' ? 'Add staff account' : 'What can they do?'}
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 transition-colors hover:text-slate-600">
            <XIcon width={18} height={18} />
          </button>
        </div>

        {!isEdit && (
          <div className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <span className={step === 'details' ? 'text-emerald-600 dark:text-emerald-400' : ''}>1. Details</span>
            <span>→</span>
            <span className={step === 'rights' ? 'text-emerald-600 dark:text-emerald-400' : ''}>2. Rights</span>
          </div>
        )}

        <div className="mt-1 min-h-0 flex-1 overflow-y-auto pr-1">
          {(isEdit || step === 'details') && (
            <>
              <label className={fieldLabel}>Name</label>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={fieldInput} />

              {!isEdit && (
                <>
                  <label className={fieldLabel}>PIN (4 digits)</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    className={`${fieldInput} text-center tracking-[0.5em]`}
                  />
                  <label className={fieldLabel}>Confirm PIN</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                    className={`${fieldInput} text-center tracking-[0.5em]`}
                  />
                </>
              )}
            </>
          )}

          {showRightsStep && (
            <>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {rights.length === 0
                    ? 'Cashier: sells and logs day-to-day expenses only.'
                    : `${rights.length} of ${ADMIN_RIGHTS.length} ticked`}
                </span>
                <span className="flex gap-3 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setRights([...ADMIN_RIGHTS])}
                    className="text-emerald-600 hover:underline"
                  >
                    Tick all
                  </button>
                  <button type="button" onClick={() => setRights([])} className="text-slate-400 hover:underline">
                    Clear
                  </button>
                </span>
              </div>
              <div className="mt-2 flex flex-col gap-2">
                {ADMIN_RIGHTS.map((right) => (
                  <RightCheckbox
                    key={right}
                    right={right}
                    checked={rights.includes(right)}
                    onToggle={() => toggleRight(right)}
                  />
                ))}
              </div>
              <p className="mt-3 text-[11px] text-slate-400">
                Rights are set when someone signs in. If they are on the till now, the change applies the next time they
                sign in.
              </p>
            </>
          )}
        </div>

        {!isEdit && step === 'rights' ? (
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => setStep('details')}
              className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-semibold text-slate-600 transition-all duration-150 hover:bg-slate-200 active:scale-[0.98] dark:bg-slate-800 dark:text-slate-300"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-500/30 transition-all duration-150 hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Create account'}
            </button>
          </div>
        ) : (
          <button
            type="submit"
            disabled={saving}
            className="mt-5 w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-500/30 transition-all duration-150 hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Next'}
          </button>
        )}
      </form>
    </div>
  )
}
