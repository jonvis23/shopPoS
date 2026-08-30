import { toCurrency } from '../../../../shared/stock'
import { CartIcon, XIcon } from '../Icons'

export interface CartLine {
  productId: number
  name: string
  quantityKg: number
  unitPricePerKg: number
  subtotal: number
}

interface CartPanelProps {
  width: number
  items: CartLine[]
  onRemove: (index: number) => void
  onCheckout: () => void
  onClear: () => void
}

export function CartPanel({ width, items, onRemove, onCheckout, onClear }: CartPanelProps) {
  const total = items.reduce((sum, item) => sum + item.subtotal, 0)

  return (
    <aside
      className="flex h-full shrink-0 flex-col bg-white dark:bg-slate-900"
      style={{ width }}
    >
      <div className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-3 text-white shadow-sm">
        <CartIcon width={18} height={18} />
        <div>
          <div className="text-sm font-bold leading-tight tracking-tight">Cart</div>
          <div className="text-[11px] leading-tight tabular-nums text-emerald-50">{items.length} items</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {items.length === 0 && <div className="mt-10 text-center text-sm text-slate-400">Cart is empty</div>}
        <div className="flex flex-col gap-2.5">
          {items.map((item, index) => (
            <div
              key={`${item.productId}-${index}`}
              className="relative rounded-lg border border-slate-100 p-3 pr-8 shadow-sm transition-shadow hover:shadow dark:border-slate-800"
            >
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="absolute right-2 top-2 text-slate-300 transition-colors hover:text-red-500"
                aria-label={`Remove ${item.name}`}
              >
                <XIcon width={14} height={14} />
              </button>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{item.name}</div>
              <div className="text-xs tabular-nums text-slate-400">
                {item.quantityKg.toFixed(2)} × {toCurrency(item.unitPricePerKg)}
              </div>
              <div className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{toCurrency(item.subtotal)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-800">
        <div className="flex items-center justify-between text-sm">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Items</div>
            <div className="font-semibold tabular-nums">{items.length}</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Total</div>
            <div className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{toCurrency(total)}</div>
          </div>
        </div>

        <button
          type="button"
          disabled={items.length === 0}
          onClick={onCheckout}
          className="mt-3 w-full rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-white shadow-sm shadow-emerald-500/30 transition-all duration-150 hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
        >
          ✓ Checkout
        </button>
        <button
          type="button"
          disabled={items.length === 0}
          onClick={onClear}
          className="mt-2 w-full rounded-xl bg-slate-100 py-2 text-sm font-medium text-slate-600 transition-all duration-150 hover:bg-slate-200 active:scale-[0.98] disabled:opacity-40 dark:bg-slate-800 dark:text-slate-300"
        >
          Clear
        </button>
      </div>
    </aside>
  )
}
