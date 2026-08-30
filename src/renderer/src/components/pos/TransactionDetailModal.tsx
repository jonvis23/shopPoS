import { useState } from 'react'
import type { SaleRecord } from '../../../../shared/ipc'
import { changeDue, formatReceiptNumber, toCurrency } from '../../../../shared/stock'
import { formatDateTime } from '../../../../shared/datetime'
import type { ToastState } from '../Toast'
import { PrinterIcon, XIcon } from '../Icons'

interface TransactionDetailModalProps {
  sale: SaleRecord
  onClose: () => void
  showToast: (kind: ToastState['kind'], message: string) => void
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="font-medium tabular-nums text-slate-800 dark:text-slate-100">{value}</span>
    </div>
  )
}

export function TransactionDetailModal({ sale, onClose, showToast }: TransactionDetailModalProps) {
  const [printing, setPrinting] = useState(false)

  const handlePrint = async () => {
    setPrinting(true)
    try {
      const draft = await window.electronAPI.buildReceiptDraft(sale.id)
      const result = await window.electronAPI.printReceipt(draft)
      showToast('success', result.simulated ? 'Receipt printed (simulated — no printer selected)' : 'Receipt printed')
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not print receipt')
    } finally {
      setPrinting(false)
    }
  }

  const subtotal = sale.totalAmount + sale.discount
  const change = changeDue(sale)

  return (
    <div className="osk-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-slate-200/60 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
              Transaction {formatReceiptNumber(sale.id)}
            </h3>
            {sale.status === 'VOID' ? (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600 dark:bg-red-950/40 dark:text-red-400">
                Voided
              </span>
            ) : (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                Completed
              </span>
            )}
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 transition-colors hover:text-slate-600">
            <XIcon width={18} height={18} />
          </button>
        </div>

        <div className="mt-4 flex-1 overflow-y-auto pr-1">
          {sale.status === 'VOID' && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
              <div className="font-semibold">
                Voided {sale.voidedAt ? formatDateTime(sale.voidedAt) : ''}
              </div>
              {sale.voidReason && <div className="mt-0.5 text-xs">Reason: {sale.voidReason}</div>}
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-xl border border-slate-100 bg-slate-50/50 p-3 text-sm dark:border-slate-800 dark:bg-slate-800/30">
            <Row label="Date & time" value={formatDateTime(sale.createdAt)} />
            <Row label="Cashier" value={sale.cashierName} />
            <Row label="Customer" value={sale.customerName} />
            <Row label="Phone" value={sale.customerPhone || '—'} />
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:bg-slate-900">
                <tr>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Qty (kg)</th>
                  <th className="px-3 py-2">Unit price</th>
                  <th className="px-3 py-2">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {sale.items.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-100">{item.productName}</td>
                    <td className="px-3 py-2 tabular-nums text-slate-600 dark:text-slate-300">
                      {item.quantityKg.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-slate-600 dark:text-slate-300">
                      {toCurrency(item.unitPricePerKg)}
                    </td>
                    <td className="px-3 py-2 font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                      {toCurrency(item.subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 rounded-xl border border-slate-100 p-3 text-sm dark:border-slate-800">
            <Row label="Subtotal" value={toCurrency(subtotal)} />
            {sale.discount > 0 && <Row label="Discount" value={`-${toCurrency(sale.discount)}`} />}
            <div className="my-1.5 border-t border-slate-100 dark:border-slate-800" />
            <div className="flex items-center justify-between py-1">
              <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Total</span>
              <span className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                {toCurrency(sale.totalAmount)}
              </span>
            </div>
            <div className="my-1.5 border-t border-slate-100 dark:border-slate-800" />
            <Row label="Cash paid" value={toCurrency(sale.cashPaid)} />
            <Row label="M-Pesa paid" value={toCurrency(sale.mpesaPaid)} />
            {change > 0 && (
              <div className="flex items-center justify-between py-1 text-sm">
                <span className="font-semibold text-slate-600 dark:text-slate-300">Change given</span>
                <span className="font-bold tabular-nums text-slate-900 dark:text-white">{toCurrency(change)}</span>
              </div>
            )}
            {sale.debtAmount > 0 && (
              <div className="flex items-center justify-between py-1 text-sm">
                <span className="text-red-500">Debt</span>
                <span className="font-semibold tabular-nums text-red-500">{toCurrency(sale.debtAmount)}</span>
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handlePrint}
          disabled={printing}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-500/30 transition-all duration-150 hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-50"
        >
          <PrinterIcon width={16} height={16} />
          {printing ? 'Printing…' : 'Print receipt'}
        </button>
      </div>
    </div>
  )
}
