import type { ProductRecord } from '../../../../shared/ipc'
import { KG_PER_BAG, WHOLESALE_MIN_KG, formatKg, roundQtyKg, summarizeStock, toCurrency } from '../../../../shared/stock'
import { FormattedNumberInput } from '../FormattedNumberInput'
import { ArrowLeftIcon } from '../Icons'
import { Keypad } from './Keypad'

// Loose weights only. The bag presets come from the product's own bag size —
// a hard-coded 90 offered a "90kg" button on rice sold in 50 kg bales.
const PRESETS_KG = [1, 2, 5, 10, 20, 50]

// Cosmetic only — ¼/½/¾ read faster on a small button than "0.25kg"/"0.5kg",
// and those three are exactly the fractions a fraction price is usually set
// for. Anything else defined (say 1.5kg) just prints as the plain weight.
const FRACTION_LABELS: Record<number, string> = { 0.25: '¼', 0.5: '½', 0.75: '¾' }

function presetLabel(kg: number, bagKg: number): string {
  if (kg === bagKg) return '1 bag'
  if (kg === bagKg * 2) return '2 bags'
  return FRACTION_LABELS[kg] ?? `${kg}kg`
}

function formatCount(n: number): string {
  return String(Math.round(n * 100) / 100)
}

export type PriceMode = 'retail' | 'wholesale' | 'fraction'
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
  /** Adds one container (gorogoro, debe…) to whatever is already entered. */
  onAddUnit: (kg: number) => void
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
  onAddUnit,
  onKeypadKey,
  onAdd,
  onBack,
}: ProductDetailPanelProps) {
  if (!product) {
    return (
      <div className="flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-1 p-6 text-center text-slate-400">
        <div className="text-sm font-medium">Select a product</div>
        <div className="text-xs">Choose an item from the list to add it to the cart.</div>
      </div>
    )
  }

  const qty = Number(qtyStr) || 0
  const stock = summarizeStock(product.totalWeightKg, product.weightPerBag)
  const overStock = qty > product.totalWeightKg

  // Fraction prices (¼/½/¾ kg and any others set on the product) lead the row
  // — they're the weights worth one tap on a loose-goods product — followed
  // by the ordinary whole-kilo presets, minus whatever's already covered.
  const fractionPresets = [...product.priceBreaks].map((b) => b.quantityKg).sort((a, b) => a - b)
  const bagKg = product.weightPerBag > 0 ? product.weightPerBag : KG_PER_BAG
  const loosePresets = PRESETS_KG.filter((kg) => kg < bagKg && !fractionPresets.includes(kg))
  const presets = [...fractionPresets, ...loosePresets, bagKg, bagKg * 2]

  // "= 3 Gorogoro" under the boxes when the weight is a whole number of one of
  // this product's containers — confirms the count without any arithmetic.
  const unitCount = product.saleUnits
    .map((unit) => ({ unit, count: qty / unit.kg }))
    .find(({ count }) => count >= 1 && Math.abs(count - Math.round(count)) < 0.001)

  return (
    // Two blocks. Which one a thing belongs to is decided by what a cashier
    // cannot work without: the boxes showing what has been entered, the keys that
    // enter it, and Add. The product's name, stock and its two price cards are
    // reference, and they always show in full: on a cramped screen their text gets
    // smaller rather than the block scrolling. The keypad is what gives height
    // back, down to a floor where its keys are still touchable. Only if even that
    // is not enough does the whole panel scroll, rather than cutting anything off.
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden p-3">
      {/* grow-0: keeps its natural height while there is room, so on a normal
          screen the panel looks exactly as it always has. min-h-0: it is also the
          part that gives way when there isn't. */}
      <div className="flex shrink-0 flex-col">
        {/* Back sits beside the name and the category and stock share a line, so the
            reference block takes two rows of height rather than four. */}
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onBack}
            title="Back to the product list"
            aria-label="Back"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <ArrowLeftIcon width={14} height={14} />
          </button>
          <h3 className="min-w-0 truncate text-sm font-bold tracking-tight text-slate-900 dark:text-white">
            {product.name}
          </h3>
        </div>
        <div className="truncate pl-7 text-[11px] text-slate-400">
          <span className="uppercase tracking-wide">{product.categoryName ?? 'Uncategorised'}</span>
          <span className="tabular-nums"> · In stock: {stock.label}</span>
        </div>

        <div className="mt-1 grid shrink-0 grid-cols-2 gap-1">
          <div
            className={`rounded-lg border px-2.5 py-1 text-left shadow-sm transition-colors ${
              priceMode === 'retail'
                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10'
                : 'border-slate-200 dark:border-slate-800'
            }`}
          >
            <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
              Retail · under {WHOLESALE_MIN_KG}kg
            </div>
            <div className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {product.retailPricePerKg}
            </div>
          </div>
          <div
            className={`rounded-lg border px-2.5 py-1 text-left shadow-sm transition-colors ${
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
            <div className="text-sm font-bold tabular-nums text-amber-600 dark:text-amber-400">
              {product.wholesalePricePerKg > 0 ? product.wholesalePricePerKg : '—'}
            </div>
          </div>
        </div>

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
            <label
              title="Tap digits to enter quantity. Hold ⌫ to clear."
              className="text-[10px] font-semibold uppercase tracking-wide text-slate-400"
            >
              Qty (kg)
            </label>
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

        {unitCount && !overStock && (
          <div className="mt-1 shrink-0 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            = {formatCount(unitCount.count)} {unitCount.unit.name}
          </div>
        )}

        {overStock && (
          <div className="mt-1 shrink-0 text-xs font-medium text-red-500">
            Only {formatKg(product.totalWeightKg)} available.
          </div>
        )}

        <div className="mt-1.5 grid shrink-0 grid-cols-6 gap-1">
          {presets.map((kg) => (
            <button
              key={kg}
              type="button"
              onClick={() => onPreset(kg)}
              title={fractionPresets.includes(kg) ? `Fixed price for ${kg}kg` : undefined}
              className={`rounded-lg py-1 text-[11px] font-medium tabular-nums transition-all duration-150 active:scale-95 ${
                fractionPresets.includes(kg)
                  ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:hover:bg-emerald-500/25'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {presetLabel(kg, bagKg)}
            </button>
          ))}
        </div>

        {product.saleUnits.length > 0 && (
          <div className="mt-1 grid shrink-0 grid-cols-3 gap-1">
            {product.saleUnits.map((unit) => (
              <button
                key={unit.name}
                type="button"
                onClick={() => onAddUnit(unit.kg)}
                title={`Adds one ${unit.name} (${roundQtyKg(unit.kg)} kg) — tap again for each one`}
                className="truncate rounded-lg bg-amber-100 py-1 text-[11px] font-semibold text-amber-800 transition-all duration-150 hover:bg-amber-200 active:scale-95 dark:bg-amber-500/15 dark:text-amber-300 dark:hover:bg-amber-500/25"
              >
                + {unit.name}
              </button>
            ))}
          </div>
        )}

        {/* The floor is four rows the finger can still find. Above it the keypad
            takes whatever height the panel has spare, and below it the reference
            text above has already shrunk to make room. */}
        <div className="mt-1.5 min-h-[104px] flex-1">
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
