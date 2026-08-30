import { useEffect, useRef, useState } from 'react'
import { PERIOD_PRESET_LABELS, PERIOD_PRESET_ORDER } from '../../../shared/period'
import type { PeriodPresetKey } from '../../../shared/period'
import { CalendarIcon } from './Icons'

export type PeriodSelection = PeriodPresetKey | 'custom'

interface AnalyticsPeriodPickerProps {
  selection: PeriodSelection
  customFrom: string | null
  customTo: string | null
  onPresetSelect: (key: PeriodPresetKey) => void
  onCustomApply: (from: string, to: string) => void
}

const pillBase = 'rounded-full px-3 py-1 text-xs font-medium transition-all duration-150 active:scale-95'
const pillActive = 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
const pillInactive = 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'

function formatCustomLabel(from: string, to: string): string {
  const fmt = (s: string) => {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }
  return `${fmt(from)} – ${fmt(to)}`
}

export function AnalyticsPeriodPicker({
  selection,
  customFrom,
  customTo,
  onPresetSelect,
  onCustomApply,
}: AnalyticsPeriodPickerProps) {
  const [open, setOpen] = useState(false)
  const [draftFrom, setDraftFrom] = useState(customFrom ?? '')
  const [draftTo, setDraftTo] = useState(customTo ?? '')
  const anchorRef = useRef<HTMLButtonElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (popoverRef.current?.contains(target)) return
      if (anchorRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  const apply = () => {
    if (!draftFrom || !draftTo) return
    onCustomApply(draftFrom, draftTo)
    setOpen(false)
  }

  return (
    <div className="relative flex flex-wrap items-center gap-1.5">
      {PERIOD_PRESET_ORDER.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onPresetSelect(key)}
          title={`Show every figure on this screen for ${PERIOD_PRESET_LABELS[key].toLowerCase()}, compared with the period before it.`}
          className={`${pillBase} ${selection === key ? pillActive : pillInactive}`}
        >
          {PERIOD_PRESET_LABELS[key]}
        </button>
      ))}
      <button
        ref={anchorRef}
        type="button"
        onClick={() => {
          setDraftFrom(customFrom ?? '')
          setDraftTo(customTo ?? '')
          setOpen((v) => !v)
        }}
        title="Pick your own start and end date — for a specific week, a month, or the run-up to a season."
        className={`${pillBase} flex items-center gap-1 ${selection === 'custom' ? pillActive : pillInactive}`}
      >
        <CalendarIcon width={12} height={12} />
        {selection === 'custom' && customFrom && customTo ? formatCustomLabel(customFrom, customTo) : 'Custom'}
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="absolute right-0 top-full z-[70] mt-2 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-800"
        >
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">From</label>
          <input
            type="date"
            value={draftFrom}
            max={draftTo || undefined}
            onChange={(e) => setDraftFrom(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
          <label className="mt-2 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">To</label>
          <input
            type="date"
            value={draftTo}
            min={draftFrom || undefined}
            onChange={(e) => setDraftTo(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 rounded-lg bg-slate-100 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!draftFrom || !draftTo}
              onClick={apply}
              className="flex-1 rounded-lg bg-emerald-500 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
