import { useEffect, useState } from 'react'
import type { RefObject } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from './Icons'

interface MiniCalendarProps {
  anchorRef: RefObject<HTMLButtonElement | null>
  selectedKey: string | null
  highlightKeys: Set<string>
  onSelect: (key: string) => void
  onClear: () => void
  onClose: () => void
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function keyFor(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m, d)
}

export function MiniCalendar({ anchorRef, selectedKey, highlightKeys, onSelect, onClear, onClose }: MiniCalendarProps) {
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const [viewDate, setViewDate] = useState(() => (selectedKey ? parseKey(selectedKey) : new Date()))

  useEffect(() => {
    const anchor = anchorRef.current
    if (anchor) {
      const rect = anchor.getBoundingClientRect()
      setPosition({ top: rect.bottom + 6, left: rect.left })
    }
  }, [anchorRef])

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (containerEl && containerEl.contains(target)) return
      if (anchorRef.current && anchorRef.current.contains(target)) return
      onClose()
    }
    const handleScroll = () => onClose()
    document.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [containerEl, anchorRef, onClose])

  if (!position) return null

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const monthLabel = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const gridStart = new Date(year, month, 1)
  gridStart.setDate(gridStart.getDate() - gridStart.getDay())

  const days: Date[] = []
  const cursor = new Date(gridStart)
  for (let i = 0; i < 42; i += 1) {
    days.push(new Date(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }

  const todayKey = keyFor(new Date())

  const goToToday = () => {
    const today = new Date()
    setViewDate(today)
    onSelect(keyFor(today))
  }

  return (
    <div
      ref={setContainerEl}
      style={{ position: 'fixed', top: position.top, left: position.left }}
      className="z-[70] w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-800"
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setViewDate(new Date(year, month - 1, 1))}
          className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          aria-label="Previous month"
        >
          <ChevronLeftIcon width={14} height={14} />
        </button>
        <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{monthLabel}</span>
        <button
          type="button"
          onClick={() => setViewDate(new Date(year, month + 1, 1))}
          className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          aria-label="Next month"
        >
          <ChevronRightIcon width={14} height={14} />
        </button>
      </div>

      <div className="mt-2 grid grid-cols-7 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {WEEKDAYS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map((date) => {
          const key = keyFor(date)
          const inMonth = date.getMonth() === month
          const isToday = key === todayKey
          const isSelected = key === selectedKey
          const hasSales = highlightKeys.has(key)
          return (
            <button
              key={key}
              type="button"
              onClick={() => (isSelected ? onClear() : onSelect(key))}
              className="flex flex-col items-center justify-center py-0.5"
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                  isSelected
                    ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                    : isToday
                      ? 'border border-emerald-500 text-emerald-600 dark:text-emerald-400'
                      : inMonth
                        ? 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700'
                        : 'text-slate-300 hover:bg-slate-50 dark:text-slate-600 dark:hover:bg-slate-800'
                }`}
              >
                {date.getDate()}
              </span>
              <span className={`mt-0.5 h-1 w-1 rounded-full ${hasSales && !isSelected ? 'bg-emerald-400' : ''}`} />
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onClick={goToToday}
        className="mt-2 w-full rounded-lg py-1.5 text-center text-xs font-semibold text-emerald-600 transition-colors hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
      >
        Today
      </button>
    </div>
  )
}
