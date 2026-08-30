import type { ReactNode } from 'react'
import { LOW_STOCK_BAGS, toCurrency } from '../../../../shared/stock'
import { AlertIcon, LockIcon, PackageIcon, PlusIcon } from '../Icons'
import { RestockHistory } from './RestockHistory'
import { TakeHomeHistory } from './TakeHomeHistory'
import type { StockRow } from './StockGrid'

interface StockDetailPanelProps {
  row: StockRow | null
  isAdmin: boolean
  hasActiveShift: boolean
  /** Bumped by any change to the logs below — a delivery or a take-home. */
  historyRefreshKey: number
  onRestock: () => void
  onTakeHome: () => void
  onEdit: () => void
  onToggleActive: () => void
  onRemove: () => void
}

const actionButton =
  'flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-semibold transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40'
const secondaryAction = `${actionButton} bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300`

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-sm font-medium tabular-nums text-slate-700 dark:text-slate-200">{children}</span>
    </div>
  )
}

export function StockDetailPanel({
  row,
  isAdmin,
  hasActiveShift,
  historyRefreshKey,
  onRestock,
  onTakeHome,
  onEdit,
  onToggleActive,
  onRemove,
}: StockDetailPanelProps) {
  const shell =
    'flex h-full w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900'

  // Nothing selected: rather than sit empty, the panel carries the two stock logs
  // that used to be a second table below the product list. Both are here because
  // they answer the same question from opposite ends — what came in, what left
  // without being sold.
  if (!row) {
    return (
      <div className={shell}>
        <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <div className="flex items-center gap-2 text-slate-400">
            <PackageIcon width={15} height={15} />
            <span className="text-xs font-semibold uppercase tracking-wide">Stock movements</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">Pick a product to see its details and options.</p>
        </div>
        <div className="flex-1 overflow-y-auto px-4">
          <div className="pt-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Recent restocks</div>
            <RestockHistory refreshKey={historyRefreshKey} />
          </div>
          <div className="mt-5 border-t border-slate-100 pt-3 dark:border-slate-800">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Recently taken home</div>
            <TakeHomeHistory refreshKey={historyRefreshKey} />
          </div>
        </div>
      </div>
    )
  }

  const { product, stock, lowStock } = row
  // isLowStock trips on either rule, so say which one actually fired rather than
  // printing a bag threshold at a product whose own kg alert is what triggered.
  const lowReason =
    stock.bags < LOW_STOCK_BAGS
      ? `Running out — under ${LOW_STOCK_BAGS} bags`
      : `At or below the ${product.minStockAlertKg} kg alert level`

  return (
    <div className={shell}>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex items-start gap-2">
          <h3 className="flex-1 text-base font-bold leading-tight tracking-tight text-slate-900 dark:text-white">
            {product.name}
          </h3>
          {!product.isActive && (
            <span className="mt-0.5 shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-400 dark:bg-slate-800">
              inactive
            </span>
          )}
        </div>
        <div className="mt-0.5 text-xs text-slate-400">{product.categoryName ?? 'Uncategorised'}</div>

        <div
          className={`mt-3.5 rounded-xl p-3.5 ${
            lowStock ? 'bg-amber-50 dark:bg-amber-500/10' : 'bg-slate-50 dark:bg-slate-800/60'
          }`}
        >
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">In stock</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span
              className={`text-2xl font-bold tabular-nums ${
                lowStock ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'
              }`}
            >
              {stock.bagsLabel}
            </span>
            {stock.remainderLabel && (
              <span className="text-base font-semibold tabular-nums text-slate-600 dark:text-slate-300">
                {stock.remainderLabel}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs tabular-nums text-slate-400">
            {stock.totalLabel} in total · {product.weightPerBag} kg per bag
          </div>
          {lowStock && (
            <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
              <AlertIcon width={13} height={13} /> {lowReason}
            </div>
          )}
        </div>

        <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
          <DetailRow label="Retail / kg">{toCurrency(product.retailPricePerKg)}</DetailRow>
          <DetailRow label="Wholesale / kg">
            {product.wholesalePricePerKg > 0 ? toCurrency(product.wholesalePricePerKg) : '—'}
          </DetailRow>
          <DetailRow label="Buying price / bag">
            {isAdmin ? (
              toCurrency(product.buyingPricePerBag)
            ) : (
              <span className="flex items-center gap-1 text-slate-400">
                <LockIcon width={12} height={12} /> Admin only
              </span>
            )}
          </DetailRow>
          <DetailRow label="Alert below">{product.minStockAlertKg} kg</DetailRow>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onRestock}
            disabled={!hasActiveShift}
            title={hasActiveShift ? undefined : 'Open a shift first'}
            className={`${actionButton} bg-emerald-500 text-white shadow-sm shadow-emerald-500/30 hover:bg-emerald-600`}
          >
            <PlusIcon width={13} height={13} /> Restock
          </button>
          <button
            type="button"
            onClick={onTakeHome}
            disabled={!hasActiveShift}
            title={hasActiveShift ? 'Record stock taken for domestic/personal use' : 'Open a shift first'}
            className={`${actionButton} bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/20`}
          >
            Take home
          </button>
          <button type="button" onClick={onEdit} className={secondaryAction}>
            Edit details
          </button>
          <button type="button" onClick={onToggleActive} className={secondaryAction}>
            {product.isActive ? 'Deactivate' : 'Activate'}
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={onRemove}
              title="Permanently remove this product from the catalog"
              className={`${actionButton} col-span-2 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20`}
            >
              Remove product
            </button>
          )}
        </div>

        <div className="mt-5 border-t border-slate-100 pt-3 dark:border-slate-800">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Deliveries</div>
          <RestockHistory refreshKey={historyRefreshKey} productId={product.id} />
        </div>

        <div className="mt-5 border-t border-slate-100 pt-3 dark:border-slate-800">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Taken home</div>
          <TakeHomeHistory refreshKey={historyRefreshKey} productId={product.id} />
        </div>
      </div>
    </div>
  )
}
