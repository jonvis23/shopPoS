import { useState } from 'react'
import { KeyboardIcon } from './Icons'

// Second entry point for the on-screen keyboard, alongside Settings → Hardware.
// A cashier on a touch-only till can't reach Settings without first typing a PIN,
// so the switch has to be available on the screens that come before that — the
// login card and the shift-open gate.
//
// It writes the same `onscreen_keyboard_enabled` setting the Settings toggle does,
// so the two always agree. No auth check is needed: setSetting only gates the
// `perm_`/`printer_` prefixes, which this isn't.

interface TouchModeToggleProps {
  enabled: boolean
  onChanged: () => Promise<void> | void
  className?: string
}

export function TouchModeToggle({ enabled, onChanged, className = '' }: TouchModeToggleProps) {
  const [busy, setBusy] = useState(false)

  const toggle = async () => {
    setBusy(true)
    try {
      await window.electronAPI.setSetting('onscreen_keyboard_enabled', enabled ? 'false' : 'true')
      await onChanged()
    } catch {
      // Best-effort: the physical keyboard still works either way, and there's no
      // toast host on the login screen to report into.
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={enabled}
      title={enabled ? 'Touch keyboard is on — tap to turn off' : 'Touch keyboard is off — tap to turn on'}
      className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-all duration-150 active:scale-95 disabled:opacity-50 ${
        enabled
          ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30 hover:bg-emerald-600'
          : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
      } ${className}`}
    >
      <KeyboardIcon width={15} height={15} />
      {enabled ? 'Touch' : 'Touch off'}
    </button>
  )
}
