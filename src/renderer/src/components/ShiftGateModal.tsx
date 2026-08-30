import { useState } from 'react'
import type { FormEvent } from 'react'
import { ClockIcon } from './Icons'
import { formatDateTime } from '../../../shared/datetime'
import { FormattedNumberInput } from './FormattedNumberInput'
import { TouchModeToggle } from './TouchModeToggle'

interface ShiftGateModalProps {
  busy: boolean
  userName: string
  onOpenShift: (openingCash: number, openingMpesa: number, notes: string) => Promise<void> | void
  touchModeEnabled: boolean
  onTouchModeChanged: () => Promise<void> | void
}

export function ShiftGateModal({ busy, userName, onOpenShift, touchModeEnabled, onTouchModeChanged }: ShiftGateModalProps) {
  const [openingCash, setOpeningCash] = useState('0')
  const [openingMpesa, setOpeningMpesa] = useState('0')
  const [notes, setNotes] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onOpenShift(Number(openingCash) || 0, Number(openingMpesa) || 0, notes.trim())
  }

  return (
    <div className="osk-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="mb-1 flex items-start justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 font-bold text-white shadow-sm shadow-emerald-500/30">
            D
          </div>
          <TouchModeToggle enabled={touchModeEnabled} onChanged={onTouchModeChanged} />
        </div>
        <h2 className="mt-3 text-lg font-bold tracking-tight text-slate-900 dark:text-white">Open a shift to start selling</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Record your opening cash and M-Pesa float before the till unlocks.
        </p>

        <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-slate-400">
          <ClockIcon width={13} height={13} />
          {formatDateTime(new Date())}
        </div>

        <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
          <span className="text-slate-400">Opening shift as</span>{' '}
          <span className="font-semibold text-slate-800 dark:text-slate-100">{userName}</span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Opening cash</label>
            <FormattedNumberInput
              value={openingCash}
              onChange={setOpeningCash}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Opening M-Pesa</label>
            <FormattedNumberInput
              value={openingMpesa}
              onChange={setOpeningMpesa}
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
          placeholder="e.g. float provided by owner, reason for late open…"
          className="mt-1 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        />

        <button
          type="submit"
          disabled={busy}
          className="mt-6 w-full rounded-lg bg-emerald-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-500/30 transition-all duration-150 hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? 'Opening shift…' : 'Open Shift'}
        </button>
      </form>
    </div>
  )
}
