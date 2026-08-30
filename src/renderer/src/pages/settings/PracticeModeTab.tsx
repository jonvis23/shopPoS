import { useState } from 'react'
import { AlertIcon, CheckIcon, GraduationIcon } from '../../components/Icons'

interface PracticeModeTabProps {
  active: boolean
  busy: boolean
  onChange: (enter: boolean) => void
}

const POINTS = [
  'Your real sales, shifts, debts and expenses are left exactly as they are — practice runs on a separate copy of the shop.',
  'The copy keeps your products, prices, categories, staff and PINs, so it feels like your own till.',
  'About six weeks of made-up trading is generated, with a shift already open so you can start selling straight away.',
  'A yellow bar stays across the top of the screen the whole time, with the way out on it.',
  'Everything practised is deleted the moment you leave. Backups are paused while you are in here.',
]

export function PracticeModeTab({ active, busy, onChange }: PracticeModeTabProps) {
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="max-w-2xl">
      <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">Practice mode</h3>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        A safe copy of the shop, filled with made-up trading, for getting a feel for the till or training someone —
        without a single real record being touched.
      </p>

      <div className="mt-5 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              active ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/15' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
            }`}
          >
            {active ? <AlertIcon width={18} height={18} /> : <GraduationIcon width={18} height={18} />}
          </span>
          <div>
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {active ? 'Practice mode is on' : 'Currently on your real shop records'}
            </div>
            <div className="text-xs text-slate-400">
              {active
                ? 'Nothing you do right now is being saved to your shop.'
                : 'Every sale you make is recorded for real.'}
            </div>
          </div>
        </div>

        <ul className="mt-4 flex flex-col gap-2">
          {POINTS.map((point) => (
            <li key={point} className="flex gap-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              <CheckIcon width={13} height={13} className="mt-0.5 shrink-0 text-emerald-500" />
              {point}
            </li>
          ))}
        </ul>

        {active ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onChange(false)}
            className="mt-5 w-full rounded-xl bg-slate-800 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:bg-slate-900 active:scale-[0.98] disabled:opacity-50 dark:bg-slate-700"
          >
            {busy ? 'Leaving…' : 'Exit practice mode and delete practice data'}
          </button>
        ) : confirming ? (
          <div className="mt-5 rounded-xl bg-amber-50 p-3 dark:bg-amber-500/10">
            <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
              Finish or clear anything in the cart first — the sell screen is reset when the shop is swapped. Ready?
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-xl bg-white py-2.5 text-sm font-semibold text-slate-600 transition-all duration-150 hover:bg-slate-100 active:scale-[0.98] dark:bg-slate-800 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setConfirming(false)
                  onChange(true)
                }}
                className="rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-amber-500/30 transition-all duration-150 hover:bg-amber-600 active:scale-[0.98] disabled:opacity-50"
              >
                {busy ? 'Building…' : 'Start practice mode'}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirming(true)}
            className="mt-5 w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-500/30 transition-all duration-150 hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-50"
          >
            Start practice mode
          </button>
        )}
      </div>
    </div>
  )
}
