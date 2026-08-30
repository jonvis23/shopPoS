import type { ProductRecord } from '../../../../shared/ipc'
import { WHOLESALE_MIN_KG, formatKg, summarizeStock, toCurrency } from '../../../../shared/stock'
import { FormattedNumberInput } from '../FormattedNumberInput'
import { ArrowLeftIcon } from '../Icons'
import { Keypad } from './Keypad'

const PRESETS_KG = [0.25, 0.5, 0.75, 1, 2, 5, 10, 15, 20, 50, 90]

export type PriceMode = 'retail' | 'wholesale'
export type ActiveField = 'qty' | 'amount'

interface ProductDetailPanelProps {
  product: ProductRecord | null
  priceMode: PriceMode
  qtyStr: string
  amountStr: string
  activeField: ActiveField
  onFocusField: (field: ActiveField) => void
  onQtyChange: (value: string) => void
  onAmountChange: (value: string) => void
  onPreset: (kg: number) => void
  onKeypadKey: (key: string) => void
  onAdd: () => void
  onBack: () => void
}

export function ProductDetailPanel({
  product,
  priceMode,
  qtyStr,
  amountStr,
  activeField,
  onFocusField,
  onQtyChange,
  onAmountChange,
  onPreset,
  onKeypadKey,
  onAdd,
  onBack,
}: ProductDetailPanelProps) {
  if (!product) {
    return (
      <div className="flex h-full min-w-[280px] flex-1 flex-col items-center justify-center gap-1 p-6 text-center text-slate-400">
        <div className="text-sm font-medium">Select a product</div>
        <div className="text-xs">Choose an item from the list to add it to the cart.</div>
      </div>
    )
  }

  const qty = Number(qtyStr) || 0
  const stock = summarizeStock(product.totalWeightKg, product.weightPerBag)
  const overStock = qty > product.totalWeightKg

  return (
    // Two blocks. Which one a thing belongs to is decided by what a cashier
    // cannot work without: the boxes showing what has been entered, the keys that
    // enter it, and Add. Those are pinned. The product's name and its two price
    // cards are reference — worth a scroll on a cramped screen.
    //
    // This panel used to be one unshrinkable column, which held together only
    // while the window was tall enough. Raise the display zoom (Settings →
    // Appearance) and the viewport measures fewer CSS pixels; the keypad's flex-1
    // share collapsed towards zero and its digits — on rows of almost no height —
    // spilled over the caption and the Add button as a pile of overlapping
    // numbers. Now the keypad names a floor it will not go below, the reference
    // half gives way first, and in the last resort the whole panel scrolls rather
    // than cutting anything off.
    <div className="flex h-full min-w-[280px] flex-1 flex-col overflow-y-auto overflow-x-hidden p-3">
      {/* grow-0: keeps its natural height while there is room, so on a normal
          screen the panel looks exactly as it always has. min-h-0: it is also the
          part that gives way when there isn't. */}
      <div className="flex min-h-0 shrink grow-0 basis-auto flex-col overflow-y-auto overflow-x-hidden">
        <button
          type="button"
          onClick={onBack}
          className="flex w-fit shrink-0 items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          <ArrowLeftIcon width={14} height={14} /> Back
        </button>

        <div className="shrink-0">
          <h3 className="mt-1 truncate text-base font-bold tracking-tight text-slate-900 dark:text-white">
            {product.name}
          </h3>
          <div className="text-[11px] uppercase tracking-wide text-slate-400">
            {product.categoryName ?? 'Uncategorised'}
          </div>
          <div className="text-[11px] tabular-nums text-slate-400">In stock: {stock.label}</div>
        </div>

        <div className="mt-2 grid shrink-0 grid-cols-2 gap-1.5">
          <div
            className={`rounded-lg border px-2.5 py-1.5 text-left shadow-sm transition-colors ${
              priceMode === 'retail'
                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10'
                : 'border-slate-200 dark:border-slate-800'
            }`}
          >
            <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
              Retail · under {WHOLESALE_MIN_KG}kg
            </div>
            <div className="text-base font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {product.retailPricePerKg}
            </div>
          </div>
          <div
            className={`rounded-lg border px-2.5 py-1.5 text-left shadow-sm transition-colors ${
              product.wholesalePricePerKg <= 0
                ? 'border-slate-200 opacity-40 dark:border-slate-800'
                : priceMode === 'wholesale'
                  ? 'border-amber-500 bg-amber-50 dark:bg-amber-500/10'
                  : 'border-slate-200 dark:border-slate-800'
            }`}
          >
            <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
              Wholesale · {WHOLESALE_MIN_KG}kg+
            </div>
            <div className="text-base font-bold tabular-nums text-amber-600 dark:text-amber-400">
              {product.wholesalePricePerKg > 0 ? product.wholesalePricePerKg : '—'}
            </div>
          </div>
        </div>

        {/* A hint rather than a control, so it rides with the half that scrolls
            and leaves the pinned half entirely to the boxes, the keys and Add. */}
        <p className="mt-1.5 shrink-0 text-[10px] text-slate-400">Tap digits to enter quantity. Hold ⌫ to clear.</p>
      </div>

      {/* Pinned: the readout, the presets, the keys, and Add. basis-auto rather
          than flex-1's zero basis, so this block's real content height counts
          when the browser decides who has to give way — with a zero basis it
          registers as costing nothing, the reference half above never shrinks,
          and the overflow lands here instead. */}
      <div className="mt-1.5 flex shrink-0 grow basis-auto flex-col">
        {/* Typeable, not read-only. The keypad below is the touch way in; these
            take a physical keyboard too, which is faster for an odd weight like
            2.75 when the till has a keyboard attached. They opt out of the docked
            touch keyboard instead of being locked, so it never slides up over the
            keypad that is already sitting there. */}
        <div
          className="grid shrink-0 grid-cols-2 gap-2"
          // Enter finishes the line, so a weight can be typed and added without
          // the hand leaving the keyboard.
          onKeyDown={(event) => {
            if (event.key === 'Enter' && qty > 0 && !overStock) onAdd()
          }}
        >
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Qty (kg)</label>
            <FormattedNumberInput
              value={qtyStr}
              onChange={onQtyChange}
              onFocus={() => onFocusField('qty')}
              onClick={() => onFocusField('qty')}
              noTouchKeyboard
              className={`mt-0.5 w-full rounded-lg border bg-white px-2.5 py-1.5 text-base font-semibold tabular-nums outline-none transition-shadow dark:bg-slate-900 dark:text-white ${
                activeField === 'qty'
                  ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Amount (KES)</label>
            <FormattedNumberInput
              value={amountStr}
              onChange={onAmountChange}
              onFocus={() => onFocusField('amount')}
              onClick={() => onFocusField('amount')}
              noTouchKeyboard
              className={`mt-0.5 w-full rounded-lg border bg-white px-2.5 py-1.5 text-base font-semibold tabular-nums outline-none transition-shadow dark:bg-slate-900 dark:text-white ${
                activeField === 'amount'
                  ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            />
          </div>
        </div>

        {overStock && (
          <div className="mt-1 shrink-0 text-xs font-medium text-red-500">
            Only {formatKg(product.totalWeightKg)} available.
          </div>
        )}

        <div className="mt-1.5 grid shrink-0 grid-cols-6 gap-1">
          {PRESETS_KG.map((kg) => (
            <button
              key={kg}
              type="button"
              onClick={() => onPreset(kg)}
              className="rounded-lg bg-slate-100 py-1 text-[11px] font-medium tabular-nums text-slate-600 transition-all duration-150 hover:bg-slate-200 active:scale-95 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              {kg}kg
            </button>
          ))}
        </div>

        {/* The floor is four rows the finger can still find. Above it the keypad
            takes whatever height the panel has spare. */}
        <div className="mt-1.5 min-h-[124px] flex-1">
          <Keypad onKey={onKeypadKey} />
        </div>

        <button
          type="button"
          disabled={qty <= 0 || overStock}
          onClick={onAdd}
          className="mt-1.5 w-full shrink-0 rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-500/30 transition-all duration-150 hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
        >
          ✓ Add {qty > 0 ? `· ${toCurrency(Number(amountStr) || 0)}` : ''}
        </button>
      </div>
    </div>
  )
}
