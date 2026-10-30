import { useEffect, useRef, useState } from 'react'
import type { SaleRecord } from '../../../shared/ipc'
import { summarizeStock, toCurrency } from '../../../shared/stock'
import { PackageIcon } from './Icons'

interface DayProductsChipProps {
  sales: SaleRecord[]
  canViewReports: boolean
}

interface ProductTotal {
  name: string
  kg: number
  weightPerBag: number
  revenue: number
}

// Voided sales are excluded for the same reason they're excluded from the day's
// revenue: the goods went back on the shelf, so counting their kilos here would
// disagree with both the revenue beside it and the stock on the Stock screen.
function summarise(sales: SaleRecord[]): ProductTotal[] {
  const totals = new Map<string, ProductTotal>()
  for (const sale of sales) {
    if (sale.status === 'VOID') continue
    for (const item of sale.items) {
      const existing = totals.get(item.productName)
      if (existing) {
        existing.kg += item.quantityKg
        existing.revenue += item.subtotal
      } else {
        totals.set(item.productName, {
          name: item.productName,
          kg: item.quantityKg,
          weightPerBag: item.weightPerBag,
          revenue: item.subtotal,
        })
      }
    }
  }
  return [...totals.values()].sort((a, b) => b.kg - a.kg)
}

export function DayProductsChip({ sales, canViewReports }: DayProductsChipProps) {
  const [open, setOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false)
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

  const totals = summarise(sales)
  if (totals.length === 0) return null

  const totalKg = totals.reduce((sum, row) => sum + row.kg, 0)
  const heaviest = totals[0].kg
  // Mixed products, so the day's overall total falls back to the standard bag
  // size — each row below still converts against its own product's actual bag size.
  const totalLabel = totals.length === 1 ? summarizeStock(totalKg, totals[0].weightPerBag).label : summarizeStock(totalKg).label

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="What was actually sold this day — every product and how many bags went out, heaviest first."
        className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium shadow-sm transition-colors ${
          open
            ? 'bg-emerald-500 text-white'
            : 'bg-white text-slate-500 hover:text-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
        }`}
      >
        <PackageIcon width={12} height={12} />
        {totals.length} product{totals.length === 1 ? '' : 's'} · {totalLabel}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1.5 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-baseline justify-between gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-800">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Sold this day</span>
            <span className="text-xs font-bold tabular-nums text-slate-700 dark:text-slate-200">{totalLabel}</span>
          </div>
          <div className="max-h-64 overflow-y-auto px-3 py-1.5">
            {totals.map((row) => (
              <div key={row.name} className="py-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">{row.name}</span>
                  <span className="shrink-0 text-xs font-bold tabular-nums text-slate-800 dark:text-slate-100">
                    {summarizeStock(row.kg, row.weightPerBag).label}
                  </span>
                </div>
                {/* A bar against the day's best seller, so the ranking is readable
                    without comparing numbers one by one. */}
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${heaviest > 0 ? Math.max(4, (row.kg / heaviest) * 100) : 0}%` }}
                    />
                  </div>
                  {canViewReports && (
                    <span className="shrink-0 text-[10px] tabular-nums text-slate-400">{toCurrency(row.revenue)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
