import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from './LoginScreen'
import { LockIcon } from './Icons'
import { Logo } from './Logo'
import { MarketBackdrop } from './MarketBackdrop'

const PIN_LENGTH = 4

interface LockScreenProps {
  session: Session
  onUnlock: () => void
  onSwitchUser: () => void
  /** False while a shift is open: the person signed in stays signed in until it is
   * ended or handed over, so the switch control is not offered at all. */
  canSwitchUser: boolean
}

// A step-away lock, not a logout: the app underneath stays fully mounted — shift,
// cart and every open tab untouched — this just sits on top and blocks the view
// until the same PIN is typed again. Unlike LoginScreen it never unmounts the
// shell, so it skips straight to the PIN step for the one user already signed in.
export function LockScreen({ session, onUnlock, onSwitchUser, canSwitchUser }: LockScreenProps) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const pinInputRef = useRef<HTMLInputElement>(null)

  // Belt-and-braces alongside `autoFocus` below: the till underneath is still
  // fully mounted (that's the point of a lock, not a logout), so unlike
  // LoginScreen there's always something else in the document that could have
  // held focus a moment ago. An explicit imperative focus on mount doesn't
  // depend on the browser's autofocus timing winning that race.
  useEffect(() => {
    pinInputRef.current?.focus()
  }, [])

  const submitPin = async (event: FormEvent) => {
    event.preventDefault()
    if (pin.length !== PIN_LENGTH) {
      setError(`PIN must be ${PIN_LENGTH} digits`)
      return
    }
    setBusy(true)
    setError('')
    try {
      await window.electronAPI.login({ userId: session.id, pin })
      onUnlock()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Incorrect PIN')
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="osk-overlay fixed inset-0 z-[80] flex items-center justify-center overflow-hidden">
      <MarketBackdrop />
      <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-white/95 p-6 shadow-2xl backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/95">
        <div className="flex flex-col items-center">
          <Logo size={56} />
          <span className="mt-3 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
            <LockIcon width={16} height={16} />
          </span>
          <h1 className="mt-2 text-lg font-bold tracking-tight text-slate-900 dark:text-white">Till locked</h1>
          <p className="text-xs text-slate-400">Shift and cart are exactly as you left them.</p>
        </div>

        <form onSubmit={submitPin} className="mt-6">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Enter PIN for {session.name}
          </label>
          <input
            ref={pinInputRef}
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
          {canSwitchUser && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Switch user? Any sale not yet checked out on this till will be lost.')) {
                  onSwitchUser()
                }
              }}
              className="mt-2 w-full rounded-lg py-2 text-xs font-semibold text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-200"
            >
              Not {session.name}? Switch user
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
