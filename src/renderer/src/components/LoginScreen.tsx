import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { SessionUser, UserRecord } from '../../../shared/ipc'
import type { ToastState } from './Toast'
import { LockIcon, UserIcon } from './Icons'
import { Logo } from './Logo'
import { MarketBackdrop } from './MarketBackdrop'
import { TouchModeToggle } from './TouchModeToggle'

export type Session = SessionUser

interface LoginScreenProps {
  onLogin: (session: Session) => void
  showToast: (kind: ToastState['kind'], message: string) => void
  touchModeEnabled: boolean
  onTouchModeChanged: () => Promise<void> | void
}

type Step = 'loading' | 'select-user' | 'pin' | 'first-run-admin-setup'

const PIN_LENGTH = 4

export function LoginScreen({ onLogin, showToast, touchModeEnabled, onTouchModeChanged }: LoginScreenProps) {
  const [step, setStep] = useState<Step>('loading')
  const [users, setUsers] = useState<UserRecord[]>([])
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null)
  const [pin, setPin] = useState('')
  const [name, setName] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const loadUsers = () => {
    window.electronAPI
      .listUsers()
      .then((rows) => {
        setUsers(rows)
        setStep(rows.some((u) => u.isActive) ? 'select-user' : 'first-run-admin-setup')
      })
      .catch(() => setStep('first-run-admin-setup'))
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const selectUser = (user: UserRecord) => {
    setSelectedUser(user)
    setPin('')
    setError('')
    setStep('pin')
  }

  const backToSelect = () => {
    setSelectedUser(null)
    setPin('')
    setName('')
    setConfirmPin('')
    setError('')
    setStep('select-user')
  }

  const submitPin = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedUser) return
    if (pin.length !== PIN_LENGTH) {
      setError(`PIN must be ${PIN_LENGTH} digits`)
      return
    }
    setBusy(true)
    setError('')
    try {
      const session = await window.electronAPI.login({ userId: selectedUser.id, pin })
      onLogin(session)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Incorrect PIN')
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  const submitSetup = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) {
      setError('Your name is required')
      return
    }
    if (pin.length !== PIN_LENGTH || !/^\d+$/.test(pin)) {
      setError(`PIN must be ${PIN_LENGTH} digits`)
      return
    }
    if (pin !== confirmPin) {
      setError('PINs do not match')
      return
    }
    setBusy(true)
    setError('')
    try {
      const user = await window.electronAPI.createUser({ name: name.trim(), role: 'ADMIN', pin })
      const session = await window.electronAPI.login({ userId: user.id, pin })
      onLogin(session)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Could not create Admin account')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex h-screen items-center justify-center overflow-hidden pb-[var(--osk-height,0px)]">
      <MarketBackdrop />
      <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-white/95 p-6 shadow-2xl backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/95">
        <div className="absolute right-3 top-3">
          <TouchModeToggle enabled={touchModeEnabled} onChanged={onTouchModeChanged} />
        </div>
        <div className="flex flex-col items-center">
          <Logo size={56} />
          <h1 className="mt-3 text-lg font-bold tracking-tight text-slate-900 dark:text-white">Duka POS</h1>
          <p className="text-xs text-slate-400">Every bag counts</p>
        </div>

        {step === 'loading' && <p className="mt-6 text-center text-sm text-slate-400">Loading…</p>}

        {step === 'select-user' && (
          <div className="mt-6">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Who's working the till?
            </label>
            <div className="mt-2 flex max-h-72 flex-col gap-1.5 overflow-y-auto">
              {users
                .filter((u) => u.isActive)
                .map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => selectUser(user)}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-left transition-all duration-150 hover:border-emerald-300 hover:bg-emerald-50 active:scale-[0.98] dark:border-slate-700 dark:hover:bg-emerald-500/10"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {user.role === 'ADMIN' ? <LockIcon width={16} height={16} /> : <UserIcon width={16} height={16} />}
                    </span>
                    <span>
                      <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{user.name}</div>
                      <div className="text-[11px] uppercase tracking-wide text-slate-400">{user.role}</div>
                    </span>
                  </button>
                ))}
            </div>
          </div>
        )}

        {step === 'pin' && selectedUser && (
          <form onSubmit={submitPin} className="mt-6">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Enter PIN for {selectedUser.name}
            </label>
            <input
              autoFocus
              type="password"
              inputMode="numeric"
              maxLength={PIN_LENGTH}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-center text-lg tracking-[0.5em] outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            {error && <p className="mt-2 text-xs font-medium text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="mt-4 w-full rounded-lg bg-emerald-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-500/30 transition-all duration-150 hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-60"
            >
              {busy ? 'Checking…' : 'Unlock'}
            </button>
            <button
              type="button"
              onClick={backToSelect}
              className="mt-2 w-full rounded-lg py-2 text-xs font-semibold text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-200"
            >
              Back
            </button>
          </form>
        )}

        {step === 'first-run-admin-setup' && (
          <form onSubmit={submitSetup} className="mt-6">
            <p className="text-xs text-slate-400">First time here — create the Admin account for this shop.</p>
            <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Your name
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Jane"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              New PIN
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={PIN_LENGTH}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-center text-lg tracking-[0.5em] outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Confirm PIN
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={PIN_LENGTH}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-center text-lg tracking-[0.5em] outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            {error && <p className="mt-2 text-xs font-medium text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="mt-4 w-full rounded-lg bg-emerald-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-500/30 transition-all duration-150 hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Create Admin & continue'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
