import { useEffect, useState } from 'react'
import type { DomesticConsumptionRecord } from '../../../../shared/ipc'
import { formatThousands, toCurrency } from '../../../../shared/stock'
import { formatShortDateTime } from '../../../../shared/datetime'

interface TakeHomeHistoryProps {
  refreshKey: number
  /** Limits the list to one product — used when a tile is selected. */
  productId?: number
}

export function TakeHomeHistory({ refreshKey, productId }: TakeHomeHistoryProps) {
  const [entries, setEntries] = useState<DomesticConsumptionRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    window.electronAPI
      .listDomesticConsumption(40)
      .then(setEntries)
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }, [refreshKey])

  const visible = productId ? entries.filter((e) => e.productId === productId).slice(0, 8) : entries.slice(0, 20)

  if (loading) return <div className="py-6 text-center text-sm text-slate-400">Loading…</div>
  if (visible.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-slate-400">
        {productId ? 'No take-home logged for this product yet.' : 'No take-home logged yet.'}
      </div>
    )
  }

  // Same two-line shape as the delivery log next to it, in amber rather than
  // emerald: stock going the other way, and no money involved either time.
  return (
    <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
      {visible.map((entry) => (
        <div key={entry.id} className="py-2.5">
          <div className="flex items-baseline justify-between gap-2">
            {!productId && (
              <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                {entry.productName}
              </span>
            )}
            <span className="ml-auto shrink-0 text-sm font-semibold tabular-nums text-amber-600 dark:text-amber-400">
              -{formatThousands(entry.quantityKg.toFixed(2))} kg
            </span>
          </div>
          <div className="mt-0.5 flex items-baseline justify-between gap-2 text-xs text-slate-400">
            <span className="truncate">
              {entry.recordedBy ?? '—'}
              {entry.notes ? ` · ${entry.notes}` : ''}
            </span>
            <span className="shrink-0 tabular-nums">{formatShortDateTime(entry.createdAt)}</span>
          </div>
          <div className="mt-0.5 text-xs tabular-nums text-slate-400">worth {toCurrency(entry.costValue)}</div>
        </div>
      ))}
    </div>
  )
}
