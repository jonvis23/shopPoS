import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties, ReactNode } from 'react'
import { ChevronDownIcon, LockIcon } from '../Icons'

export type Delta = { pct: number; direction: 'up' | 'down' | 'flat' } | 'new' | null

interface MetricTileProps {
  label: string
  value: string
  /** One short line under the value — a share, a ratio, anything that gives the number context. */
  sub?: ReactNode
  tone?: 'warn'
  locked?: boolean
  delta?: Delta
  /** Plain-English explanation behind the ⓘ. Says what is counted and what is not. */
  info?: string
  /** Small caption beside the label — used to mark a tile the product filter can't reach. */
  note?: string
  /** When given, the value becomes a button that opens this breakdown underneath. */
  breakdown?: ReactNode
}

// Closes the panel on a click anywhere outside it or on Escape — the two things
// anyone expects of a popover, and the reason this is shared rather than repeated
// in each tile.
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) close()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, close])
  return ref
}

const INFO_WIDTH = 256 // must match the w-64 below
const EDGE = 8

// The ⓘ panels are rendered into <body> and positioned by hand rather than being
// absolutely placed next to the dot. The dashboard scrolls inside a container
// (`h-full overflow-y-auto`), and a container that scrolls on one axis clips the
// other — so a panel hanging off a right-hand tile was sliced down the middle by
// the edge of the scroll box, which no z-index can undo. Escaping to <body> is
// the only fix; once out there it also has to be kept inside the window itself,
// which is what the clamping below does.
function placeInfo(dot: HTMLElement): CSSProperties {
  const rect = dot.getBoundingClientRect()
  const osk = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--osk-height')) || 0
  const floor = window.innerHeight - osk - EDGE

  // Right-aligned to the dot, then pushed back inside whichever window edge it
  // would have crossed.
  const left = Math.min(Math.max(EDGE, rect.right - INFO_WIDTH), window.innerWidth - INFO_WIDTH - EDGE)
  const below = floor - rect.bottom - 6
  const above = rect.top - EDGE - 6

  return below >= 150 || below >= above
    ? { left, top: rect.bottom + 6, maxHeight: below }
    : { left, bottom: window.innerHeight - rect.top + 6, maxHeight: above }
}

export function InfoDot({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false)
  const [style, setStyle] = useState<CSSProperties | null>(null)
  const dotRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open) {
      setStyle(null)
      return
    }
    const update = () => {
      if (dotRef.current) setStyle(placeInfo(dotRef.current))
    }
    update()
    window.addEventListener('resize', update)
    // Capture phase, because the scroll that moves the tile happens on the
    // dashboard's own container and never reaches the window otherwise.
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (dotRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <>
      <button
        ref={dotRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`What is ${label}?`}
        aria-expanded={open}
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold leading-none transition-colors ${
          open
            ? 'border-emerald-500 bg-emerald-500 text-white'
            : 'border-slate-300 text-slate-400 hover:border-slate-400 hover:text-slate-600 dark:border-slate-600 dark:text-slate-500'
        }`}
      >
        i
      </button>
      {open &&
        style &&
        createPortal(
          <div
            ref={panelRef}
            style={style}
            className="fixed z-[70] w-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-300">
              {label}
            </div>
            <p className="mt-1.5 text-xs normal-case leading-relaxed tracking-normal text-slate-500 dark:text-slate-400">
              {text}
            </p>
          </div>,
          document.body
        )}
    </>
  )
}

// Marks a figure the product filter deliberately left alone. Without it a
// shop-wide number sitting in a filtered dashboard reads as though it belonged to
// the product, which is a worse lie than not offering the filter at all.
export function ShopWideChip({ reason }: { reason: string }) {
  return (
    <span
      title={reason}
      className="shrink-0 whitespace-nowrap rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400"
    >
      whole shop
    </span>
  )
}

export function MetricTile({ label, value, sub, tone, locked, delta, info, note, breakdown }: MetricTileProps) {
  const [open, setOpen] = useState(false)
  const ref = useDismiss(open, () => setOpen(false))
  const expandable = Boolean(breakdown) && !locked

  const body = (
    <>
      <div
        className={`mt-1 flex items-baseline gap-1.5 text-xl font-bold tabular-nums tracking-tight ${
          tone === 'warn' ? 'text-red-500' : 'text-slate-900 dark:text-white'
        }`}
      >
        {value}
        {expandable && (
          <ChevronDownIcon
            width={13}
            height={13}
            className={`shrink-0 text-slate-300 transition-transform duration-150 dark:text-slate-600 ${open ? 'rotate-180' : ''}`}
          />
        )}
      </div>
      {sub && <div className="mt-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">{sub}</div>}
      {delta && (
        <div
          className={`mt-0.5 text-[10px] font-semibold ${
            delta === 'new'
              ? 'text-sky-500'
              : delta.direction === 'up'
                ? 'text-emerald-500'
                : delta.direction === 'down'
                  ? 'text-red-500'
                  : 'text-slate-400'
          }`}
        >
          {delta === 'new'
            ? 'New'
            : `${delta.direction === 'up' ? '▲' : delta.direction === 'down' ? '▼' : '–'} ${Math.abs(delta.pct).toFixed(0)}% vs prior period`}
        </div>
      )}
    </>
  )

  return (
    <div ref={ref} className="relative">
      <div
        className={`rounded-xl border bg-white p-4 shadow-sm transition-shadow dark:bg-slate-900 ${
          open
            ? 'border-emerald-400 shadow-md dark:border-emerald-500/50'
            : 'border-slate-200 hover:shadow-md dark:border-slate-800'
        }`}
      >
        {/* The ⓘ is its own button, so the tile itself can't be one — a button
            cannot contain a button. The value area below carries the click. */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
          <div className="flex shrink-0 items-center gap-1">
            {note && <ShopWideChip reason={note} />}
            {info && <InfoDot label={label} text={info} />}
          </div>
        </div>

        {locked ? (
          <div className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-400 dark:text-slate-500">
            <LockIcon width={14} height={14} />
            Admin only
          </div>
        ) : expandable ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            title={`Break down ${label.toLowerCase()}`}
            className="w-full text-left"
          >
            {body}
          </button>
        ) : (
          body
        )}
      </div>

      {open && breakdown && (
        <div className="absolute left-0 right-0 z-30 mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
          {breakdown}
        </div>
      )}
    </div>
  )
}

export function BreakdownShell({
  title,
  total,
  children,
  empty,
}: {
  title: string
  total?: string
  children: ReactNode
  empty?: string
}) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-2 border-b border-slate-100 px-3.5 py-2 dark:border-slate-800">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</span>
        {total && <span className="text-xs font-bold tabular-nums text-slate-700 dark:text-slate-200">{total}</span>}
      </div>
      <div className="max-h-72 overflow-y-auto px-3.5 py-2">
        {empty ? <div className="py-5 text-center text-xs text-slate-400">{empty}</div> : children}
      </div>
    </>
  )
}

// One row of a ranked breakdown: name, value, and a bar scaled against the biggest
// row so the ranking reads without comparing digits.
export function BreakdownRow({
  name,
  value,
  share,
  max,
  amount,
  barClass = 'bg-emerald-500',
}: {
  name: string
  value: number
  share: string
  max: number
  amount: string
  barClass?: string
}) {
  return (
    <div className="py-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">{name}</span>
        <span className="shrink-0 text-xs font-bold tabular-nums text-slate-800 dark:text-slate-100">{amount}</span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className={`h-full rounded-full ${barClass}`}
            style={{ width: `${max > 0 ? Math.max(4, (value / max) * 100) : 0}%` }}
          />
        </div>
        <span className="shrink-0 text-[10px] tabular-nums text-slate-400">{share}</span>
      </div>
    </div>
  )
}
