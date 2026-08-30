import type { ReceiptDraft } from '../../../../shared/ipc'
import { PrinterIcon, XIcon } from '../Icons'
import { ReceiptPreview } from './ReceiptPreview'

interface ReceiptModalProps {
  draft: ReceiptDraft
  printing: boolean
  printerConfigured: boolean
  onPrint: () => void
  onClose: () => void
}

export function ReceiptModal({ draft, printing, printerConfigured, onPrint, onClose }: ReceiptModalProps) {
  return (
    <div className="osk-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200/60 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">Receipt</h3>
          <button type="button" onClick={onClose} className="text-slate-400 transition-colors hover:text-slate-600">
            <XIcon width={18} height={18} />
          </button>
        </div>

        <div className="mt-3">
          <ReceiptPreview draft={draft} />
        </div>

        {/* Plenty of customers don't want a slip. The sale is already recorded by
            the time this opens, so "Okay" is a complete, valid way to finish —
            it just drops straight back to the sell screen for the next customer. */}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={printing}
            className="flex-1 rounded-xl bg-slate-100 py-3 text-sm font-semibold text-slate-600 transition-all duration-150 hover:bg-slate-200 active:scale-[0.98] disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Okay, no receipt
          </button>
          <button
            type="button"
            onClick={onPrint}
            disabled={printing}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-white shadow-sm shadow-emerald-500/30 transition-all duration-150 hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-50"
          >
            <PrinterIcon width={16} height={16} />
            {printing ? 'Printing…' : 'Print receipt'}
          </button>
        </div>
        <p className="mt-2 text-center text-xs text-slate-400">
          {printerConfigured ? 'Sends to the printer set up in Settings.' : 'No printer selected in Settings — this simulates the print job.'}
        </p>
      </div>
    </div>
  )
}
