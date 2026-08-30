import { useEffect, useState } from 'react'
import type { AuditLogRecord, ShiftRecord } from '../../../../shared/ipc'
import { formatDateTime, formatTime } from '../../../../shared/datetime'
import { ZReportModal } from '../../components/ZReportModal'

interface ShiftHistoryTabProps {
  activeShiftId: number | null
  isAdmin: boolean
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

export function ShiftHistoryTab({ activeShiftId, isAdmin }: ShiftHistoryTabProps) {
  const [recentShifts, setRecentShifts] = useState<ShiftRecord[]>([])
  const [reportShift, setReportShift] = useState<ShiftRecord | null>(null)
  const [auditLog, setAuditLog] = useState<AuditLogRecord[]>([])

  useEffect(() => {
    window.electronAPI.listRecentShifts(10).then(setRecentShifts).catch(() => undefined)
  }, [activeShiftId])

  useEffect(() => {
    if (!isAdmin) return
    window.electronAPI.listAuditLog(50).then(setAuditLog).catch(() => undefined)
  }, [isAdmin])

  return (
    <div className="max-w-3xl">
      <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm dark:border-slate-800">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:bg-slate-900">
          Recent shifts
        </div>
        <table className="w-full text-left text-sm">
          <tbody>
            {recentShifts.map((shift) => (
              <tr
                key={shift.id}
                className="border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
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
                    {shift.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right text-xs">
                  {isAdmin && shift.status === 'CLOSED' && (
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
            {recentShifts.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-sm text-slate-400" colSpan={5}>
                  No shift history yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isAdmin && (
        <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 shadow-sm dark:border-slate-800">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:bg-slate-900">
            Audit log
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
                  <td className="px-4 py-2.5 text-xs tabular-nums text-slate-400">
                    {formatDateTime(entry.createdAt)}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{entry.userName}</td>
                  <td className="px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {entry.action}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">{entry.details || '—'}</td>
                </tr>
              ))}
              {auditLog.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-sm text-slate-400" colSpan={4}>
                    No audit activity yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {reportShift && <ZReportModal shift={reportShift} onClose={() => setReportShift(null)} />}
    </div>
  )
}
