import { toCurrency } from '../../../../shared/stock'
import { CartIcon, MinusIcon, PlusIcon, XIcon } from '../Icons'

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
  /** Step a line up or down by whole kilos; the parent re-resolves the tier price. */
  onAdjustQty: (index: number, deltaKg: number) => void
  onCheckout: () => void
  onClear: () => void
}

// "85.000" is clutter in a dense list — trailing zeros go, so 85, 7.5, 0.769.
function trimQty(kg: number): string {
  return kg.toFixed(3).replace(/\.?0+$/, '')
}

export function CartPanel({ width, items, onRemove, onAdjustQty, onCheckout, onClear }: CartPanelProps) {
  const total = items.reduce((sum, item) => sum + item.subtotal, 0)

  return (
    // The saved width is a ceiling, not a fixed size: on a narrow or zoomed window the cart
    // gives up width to the grid and detail panes only down to its minimum, so the
    // amounts on the right are never pushed off-screen.
    <aside
      className="flex h-full shrink-0 flex-col bg-white dark:bg-slate-900"
      style={{ width: `min(${width}px, 36%)`, minWidth: 240 }}
    >
      <div className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2.5 text-white shadow-sm">
        <CartIcon width={17} height={17} />
        <div className="text-sm font-bold leading-tight tracking-tight">Cart</div>
        <div className="ml-auto text-[11px] font-medium tabular-nums text-emerald-50">
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </div>
      </div>

      {/* Rows are two tight lines each (~56px), so around ten stay visible before
          the list needs scrolling. */}
      <div className="flex-1 overflow-y-auto px-2.5 py-2">
        {items.length === 0 && <div className="mt-10 text-center text-sm text-slate-400">Cart is empty</div>}
        <div className="flex flex-col gap-1.5">
          {items.map((item, index) => (
            <div
              key={`${item.productId}-${index}`}
              className="rounded-lg border border-slate-100 px-2.5 py-1.5 transition-colors hover:border-slate-200 dark:border-slate-800 dark:hover:border-slate-700"
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-800 dark:text-slate-100">
                  {item.name}
                </span>
                <span className="shrink-0 whitespace-nowrap text-[13px] font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {toCurrency(item.subtotal)}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  className="-mr-0.5 shrink-0 text-slate-300 transition-colors hover:text-red-500"
                  aria-label={`Remove ${item.name}`}
                >
                  <XIcon width={13} height={13} />
                </button>
              </div>

              <div className="mt-1 flex items-center gap-2">
                <div className="flex shrink-0 items-center overflow-hidden rounded-md border border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => onAdjustQty(index, -1)}
                    className="flex h-6 w-6 items-center justify-center text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    aria-label={`Reduce ${item.name} by 1 kg`}
                  >
                    <MinusIcon width={12} height={12} />
                  </button>
                  <span className="min-w-[2.5rem] px-1 text-center text-[13px] font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                    {trimQty(item.quantityKg)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onAdjustQty(index, 1)}
                    className="flex h-6 w-6 items-center justify-center text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    aria-label={`Add 1 kg to ${item.name}`}
                  >
                    <PlusIcon width={12} height={12} />
                  </button>
                </div>
                <span className="min-w-0 flex-1 truncate text-right text-[11px] tabular-nums text-slate-400">
                  kg × {toCurrency(item.unitPricePerKg)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-slate-100 px-4 py-2.5 dark:border-slate-800">
        <div className="flex items-center justify-between text-sm">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Items</div>
            <div className="font-semibold tabular-nums">{items.length}</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Total</div>
            <div className="whitespace-nowrap text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {toCurrency(total)}
            </div>
          </div>
        </div>

        <button
          type="button"
          disabled={items.length === 0}
          data-tour="checkout"
          onClick={onCheckout}
          className="mt-2.5 w-full rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-white shadow-sm shadow-emerald-500/30 transition-all duration-150 hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
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
