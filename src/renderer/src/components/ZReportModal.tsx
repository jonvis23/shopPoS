import type { ShiftRecord } from '../../../shared/ipc'
import { ZReportContent } from './ZReportContent'

interface ZReportModalProps {
  shift: ShiftRecord
  onClose: () => void
}

// The "just closed a shift" interruption — centered and blocking, since there's
// nothing else worth looking at underneath at that moment. Browsing past shifts
// (Reports → Shift reports) uses ZReportContent directly in a side panel instead.
export function ZReportModal({ shift, onClose }: ZReportModalProps) {
  return (
    <div className="osk-overlay fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-slate-200/60 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <ZReportContent shift={shift} onClose={onClose} />
      </div>
    </div>
  )
}
