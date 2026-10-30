import { useEffect, useMemo, useRef, useState } from 'react'
import type { AuditLogRecord, ShiftRecord } from '../../../../shared/ipc'
import { formatDate, formatDateTime, formatTime } from '../../../../shared/datetime'
import { presetLocalRange, toPeriodRange } from '../../../../shared/period'
import type { LocalRange } from '../../../../shared/period'
import { CalendarIcon } from '../../components/Icons'
import { MiniCalendar } from '../../components/MiniCalendar'
import { ZReportContent } from '../../components/ZReportContent'

interface ShiftHistoryTabProps {
  canViewReports: boolean
}

// How far back the calendar can reach. A year covers a full season of trading.
const LOOKBACK_DAYS = 366

// Same key format MiniCalendar uses for its selection and highlights.
function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function formatDuration(startIso: string, endIso: string | null): string {
  const start = new Date(startIso).getTime()
  const end = endIso ? new Date(endIso).getTime() : Date.now()
  const totalMinutes = Math.max(0, Math.round((end - start) / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}m`
  return `${hours}h ${minutes}m`
}

export function ShiftHistoryTab({ canViewReports }: ShiftHistoryTabProps) {
  const [shifts, setShifts] = useState<ShiftRecord[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [reportShift, setReportShift] = useState<ShiftRecord | null>(null)
  const [auditLog, setAuditLog] = useState<AuditLogRecord[]>([])
  const calendarBtnRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const now = new Date()
    const lookback: LocalRange = {
      from: new Date(now.getFullYear(), now.getMonth(), now.getDate() - LOOKBACK_DAYS),
      to: now,
    }
    window.electronAPI.listShiftsBetween(toPeriodRange(lookback)).then(setShifts).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!canViewReports) return
    window.electronAPI.listAuditLog(50).then(setAuditLog).catch(() => undefined)
  }, [canViewReports])

  // Only this week is listed by default. Older shifts stay out of sight until a date
  // is picked from the calendar, so the list never grows long.
  const weekStart = useMemo(() => presetLocalRange('thisWeek').from.getTime(), [])
  const thisWeek = useMemo(
    () => shifts.filter((shift) => new Date(shift.startTime).getTime() >= weekStart),
    [shifts, weekStart]
  )
  const olderCount = shifts.length - thisWeek.length
  const highlightKeys = useMemo(
    () => new Set(shifts.map((shift) => localDayKey(new Date(shift.startTime)))),
    [shifts]
  )

  const pickedDay = selectedKey
    ? shifts.filter((shift) => localDayKey(new Date(shift.startTime)) === selectedKey)
    : null
  const rows = pickedDay ?? thisWeek
  const pickedLabel = selectedKey
    ? (() => {
        const [y, m, d] = selectedKey.split('-').map(Number)
        return formatDate(new Date(y, m, d))
      })()
    : null

  return (
    // Report open: it docks beside the list at roughly its old centered-modal
    // width, rather than sitting under a blurred overlay — Z-report and shift
    // list are read side by side, not one at a time, and neither has to be
    // closed to see the other. The list keeps its own full width throughout;
    // it does not get squeezed to make room.
    <div className="flex h-full min-h-0 gap-5 overflow-x-auto">
      <div className="w-full max-w-3xl shrink-0 overflow-y-auto pr-1">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">
              {pickedLabel ? `Shifts on ${pickedLabel}` : 'This week'}
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">
              {pickedLabel
                ? 'Tap View report to read a shift’s Z-report.'
                : olderCount > 0
                  ? `${olderCount} older ${olderCount === 1 ? 'shift is' : 'shifts are'} hidden. Pick a date to find ${olderCount === 1 ? 'it' : 'them'}.`
                  : 'Tap View report to read a shift’s Z-report. Open shifts have no report until they are ended.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {pickedLabel && (
              <button
                type="button"
                onClick={() => setSelectedKey(null)}
                className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Back to this week
              </button>
            )}
            <button
              ref={calendarBtnRef}
              type="button"
              onClick={() => setCalendarOpen((open) => !open)}
              aria-pressed={calendarOpen}
              title="Find a shift by date. Days that had a shift are marked on the calendar."
              className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-all duration-150 hover:bg-slate-200 active:scale-95 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <CalendarIcon width={13} height={13} /> Pick a date
            </button>
          </div>
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 shadow-sm dark:border-slate-800">
          <table className="w-full text-left text-sm">
            <tbody>
              {rows.map((shift) => (
                <tr
                  key={shift.id}
                  className={`border-t border-slate-100 transition-colors first:border-t-0 dark:border-slate-800 ${
                    reportShift?.id === shift.id
                      ? 'bg-emerald-50/70 dark:bg-emerald-500/10'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{shift.userName}</td>
                  <td className="px-4 py-2.5 text-xs tabular-nums text-slate-400">
                    {formatDateTime(shift.startTime)}
                    {' → '}
                    {shift.endTime ? formatTime(shift.endTime) : 'now'}
                  </td>
                  <td className="px-4 py-2.5 text-xs tabular-nums text-slate-400">
                    {formatDuration(shift.startTime, shift.endTime)}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    <span
                      className={`rounded-full px-2 py-0.5 font-medium ${
                        shift.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {shift.status === 'ACTIVE' ? 'Open' : 'Ended'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs">
                    {canViewReports && shift.status === 'CLOSED' && (
                      <button
                        type="button"
                        onClick={() => setReportShift(shift)}
                        className="font-semibold text-emerald-600 hover:underline"
                      >
                        View report
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-slate-400" colSpan={5}>
                    {pickedLabel
                      ? 'No shifts were opened on this day.'
                      : 'No shifts yet this week. Open a shift on the Sell screen and it will appear here. Use Pick a date for older ones.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {calendarOpen && (
          <MiniCalendar
            anchorRef={calendarBtnRef}
            selectedKey={selectedKey}
            highlightKeys={highlightKeys}
            onSelect={(key) => {
              setSelectedKey(key)
              setCalendarOpen(false)
            }}
            onClear={() => {
              setSelectedKey(null)
              setCalendarOpen(false)
            }}
            onClose={() => setCalendarOpen(false)}
          />
        )}

        {canViewReports && (
          <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 shadow-sm dark:border-slate-800">
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:bg-slate-900">
              Activity log
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:bg-slate-900">
                <tr>
                  <th className="px-4 py-2">When</th>
                  <th className="px-4 py-2">Who</th>
                  <th className="px-4 py-2">Action</th>
                  <th className="px-4 py-2">Details</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-4 py-2.5 text-xs tabular-nums text-slate-400">{formatDateTime(entry.createdAt)}</td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{entry.userName}</td>
                    <td className="px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200">{entry.action}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">{entry.details || '—'}</td>
                  </tr>
                ))}
                {auditLog.length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-center text-sm text-slate-400" colSpan={4}>
                      Nothing logged yet. Sign-ins, sales voids and shift changes will show here.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {reportShift && (
        <div className="flex w-full max-w-lg shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <ZReportContent shift={reportShift} onClose={() => setReportShift(null)} />
        </div>
      )}
    </div>
  )
}
