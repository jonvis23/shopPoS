import { useEffect, useState } from 'react'
import type { StockAttention } from '../../../../shared/ipc'
import { formatDateTime } from '../../../../shared/datetime'
import { formatThousands, toCurrency } from '../../../../shared/stock'
import type { ToastState } from '../Toast'
import { AlertIcon } from '../Icons'
import { FoldButton } from '../FoldButton'

interface StockAttentionPanelProps {
  /** Rejecting a delivery takes its stock back out, so the stock grid has to reload. */
  onStockChanged: () => Promise<void> | void
  showToast: (kind: ToastState['kind'], message: string) => void
}

const kgLabel = (kg: number) => `${formatThousands(kg.toFixed(1).replace(/\.0$/, ''))} kg`

// Only the owner sees this, and only what the owner has yet to look at: deliveries that
// went in while the owner was away (approve, or reject to take them back out) and
// everything taken home since the owner last looked. Staff can't clear either list.
export function StockAttentionPanel({ onStockChanged, showToast }: StockAttentionPanelProps) {
  const [attention, setAttention] = useState<StockAttention | null>(null)
  const [open, setOpen] = useState(true)
  const [rejectingId, setRejectingId] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = async () => {
    try {
      setAttention(await window.electronAPI.getStockAttention())
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not load stock to check')
    }
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const approve = async (id: number) => {
    setBusy(true)
    try {
      await window.electronAPI.approveStockReceipt(id)
      showToast('success', 'Delivery approved')
      await reload()
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not approve delivery')
    } finally {
      setBusy(false)
    }
  }

  const markChecked = async (id: number) => {
    setBusy(true)
    try {
      await window.electronAPI.markConversionReviewed(id)
      await reload()
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not mark as checked')
    } finally {
      setBusy(false)
    }
  }

  const reject = async (id: number) => {
    if (!reason.trim()) {
      showToast('error', 'Write why the delivery is being rejected')
      return
    }
    setBusy(true)
    try {
      await window.electronAPI.rejectStockReceipt({ id, reason: reason.trim() })
      showToast('success', 'Delivery rejected and taken out of stock')
      setRejectingId(null)
      setReason('')
      await onStockChanged()
      await reload()
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not reject delivery')
    } finally {
      setBusy(false)
    }
  }

  const markSeen = async (id: number) => {
    setBusy(true)
    try {
      await window.electronAPI.markTakeHomeReviewed(id)
      await reload()
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not mark as seen')
    } finally {
      setBusy(false)
    }
  }

  if (!attention) return null
  const pendingCount = attention.pendingReceipts.length
  const takeHomeCount = attention.unreviewedTakeHome.length
  const checkCount = attention.unreviewedConversions.length
  const millCount = attention.openConversions.length
  if (pendingCount === 0 && takeHomeCount === 0 && checkCount === 0 && millCount === 0) return null

  return (
    <section data-tour="stock-attention" className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-500/30 dark:bg-amber-500/5">
      <FoldButton open={open} onToggle={() => setOpen((value) => !value)}>
        <span className="flex items-center gap-2">
          <AlertIcon width={14} height={14} className="text-amber-600 dark:text-amber-400" />
          <span className="text-xs font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">
            Needs attention · {pendingCount + takeHomeCount + checkCount}
          </span>
        </span>
      </FoldButton>

      {open && pendingCount > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            Deliveries waiting for approval ({pendingCount})
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            This stock is already in the shop and can be sold. Approve it if the count is right, or reject it to take it
            back out.
          </p>
          <ul className="mt-2 space-y-2">
            {attention.pendingReceipts.map((receipt) => (
              <li key={receipt.id} className="rounded-lg bg-white p-2.5 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {receipt.productName} <span className="font-bold text-emerald-600 dark:text-emerald-400">+{kgLabel(receipt.addedKg)}</span>
                    </p>
                    <p className="text-xs text-slate-400">
                      Added by {receipt.userName} · {formatDateTime(receipt.createdAt)}
                      {receipt.referenceNote ? ` · ${receipt.referenceNote}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => approve(receipt.id)}
                      className="rounded-lg bg-emerald-500 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm shadow-emerald-500/30 transition-all duration-150 hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setRejectingId(rejectingId === receipt.id ? null : receipt.id)
                        setReason('')
                      }}
                      className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-all duration-150 hover:bg-slate-200 active:scale-[0.98] disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300"
                    >
                      Reject
                    </button>
                  </div>
                </div>
                {rejectingId === receipt.id && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Why is it being rejected? e.g. wrong product, count was short"
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                    <button
                      type="button"
                      disabled={busy || !reason.trim()}
                      onClick={() => reject(receipt.id)}
                      className="shrink-0 rounded-lg bg-red-500 px-2.5 py-1.5 text-xs font-semibold text-white transition-all duration-150 hover:bg-red-600 active:scale-[0.98] disabled:opacity-50"
                    >
                      Reject delivery
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {open && takeHomeCount > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            Taken home, not yet seen ({takeHomeCount})
          </p>
          <ul className="mt-2 space-y-2">
            {attention.unreviewedTakeHome.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 rounded-lg bg-white p-2.5 dark:bg-slate-900">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {entry.productName} <span className="font-bold text-amber-600 dark:text-amber-400">{kgLabel(entry.quantityKg)}</span>
                  </p>
                  <p className="text-xs text-slate-400">
                    Taken by {entry.recordedBy} · {formatDateTime(entry.createdAt)} · worth {toCurrency(entry.costValue)} at cost
                    {entry.notes ? ` · ${entry.notes}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => markSeen(entry.id)}
                  className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-all duration-150 hover:bg-slate-200 active:scale-[0.98] disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300"
                >
                  Mark as seen
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {open && checkCount > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            Processed stock to check ({checkCount})
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            The stock has already moved. Check the weights and the product it went into, then mark it as checked.
          </p>
          <ul className="mt-2 space-y-2">
            {attention.unreviewedConversions.map((batch) => (
              <li key={batch.id} className="flex items-center justify-between gap-3 rounded-lg bg-white p-2.5 dark:bg-slate-900">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {batch.sourceName} {kgLabel(batch.sourceKg)} → {batch.outputName} {kgLabel(batch.outputKg ?? 0)}
                  </p>
                  <p className="text-xs text-slate-400">
                    {batch.kind === 'CLEANING' ? 'Cleaned' : 'Processed'} by {batch.recordedBy}
                    {batch.completedBy && batch.completedBy !== batch.recordedBy ? ` · returned by ${batch.completedBy}` : ''}
                    {' · '}
                    {formatDateTime(batch.completedAt ?? batch.createdAt)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => markChecked(batch.id)}
                  className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-all duration-150 hover:bg-slate-200 active:scale-[0.98] disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300"
                >
                  Mark as checked
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {open && millCount > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Not finished yet ({millCount})</p>
          <ul className="mt-2 space-y-1">
            {attention.openConversions.map((batch) => (
              <li key={batch.id} className="text-xs text-slate-500 dark:text-slate-400">
                {batch.sourceName} {kgLabel(batch.sourceKg)} · sent by {batch.recordedBy} · {formatDateTime(batch.createdAt)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
