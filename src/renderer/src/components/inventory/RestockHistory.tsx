import { useEffect, useState } from 'react'
import type { StockReceiptRecord } from '../../../../shared/ipc'
import { formatThousands, toCurrency } from '../../../../shared/stock'
import { formatShortDateTime } from '../../../../shared/datetime'

interface RestockHistoryProps {
  refreshKey: number
  /** Limits the list to one product — used when a tile is selected. */
  productId?: number
}

export function RestockHistory({ refreshKey, productId }: RestockHistoryProps) {
  const [receipts, setReceipts] = useState<StockReceiptRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    window.electronAPI
      .listStockReceipts(40)
      .then(setReceipts)
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }, [refreshKey])

  const visible = productId ? receipts.filter((r) => r.productId === productId).slice(0, 8) : receipts.slice(0, 20)

  if (loading) return <div className="py-6 text-center text-sm text-slate-400">Loading…</div>
  if (visible.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-slate-400">
        {productId ? 'No deliveries logged for this product yet.' : 'No restocks logged yet.'}
      </div>
    )
  }

  // A narrow panel rather than a full-width table, so each delivery reads as two
  // lines: what came in, then who logged it and when.
  return (
    <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
      {visible.map((receipt) => (
        <div key={receipt.id} className="py-2.5">
          <div className="flex items-baseline justify-between gap-2">
            {!productId && (
              <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{receipt.productName}</span>
            )}
            <span className="ml-auto shrink-0 text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
              +{formatThousands(receipt.addedKg.toFixed(2))} kg
            </span>
          </div>
          <div className="mt-0.5 flex items-baseline justify-between gap-2 text-xs text-slate-400">
            <span className="truncate">
              {receipt.userName}
              {receipt.referenceNote ? ` · ${receipt.referenceNote}` : ''}
            </span>
            <span className="shrink-0 tabular-nums">{formatShortDateTime(receipt.createdAt)}</span>
          </div>
          <div className="mt-0.5 text-xs tabular-nums text-slate-400">at {toCurrency(receipt.buyingPricePerBag)}/bag</div>
        </div>
      ))}
    </div>
  )
}
