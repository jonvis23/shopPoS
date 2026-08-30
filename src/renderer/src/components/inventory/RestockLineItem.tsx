import type { ProductRecord } from '../../../../shared/ipc'
import { formatThousands, summarizeStock, toCurrency } from '../../../../shared/stock'
import { FormattedNumberInput } from '../FormattedNumberInput'
import { LockIcon, XIcon } from '../Icons'
import { ProductPicker } from './ProductPicker'

export interface RestockLineState {
  productId: number | null
  unitMode: 'BAGS' | 'KG'
  quantity: string
  price: string
  note: string
}

export function blankRestockLine(): RestockLineState {
  return { productId: null, unitMode: 'BAGS', quantity: '', price: '', note: '' }
}

interface RestockLineItemProps {
  products: ProductRecord[]
  isAdmin: boolean
  locked?: boolean
  /** One row per delivery line instead of a stacked form — for the wide Add stock modal. */
  dense?: boolean
  value: RestockLineState
  onChange: (value: RestockLineState) => void
  onRemove?: () => void
}

const fieldLabel = 'block text-xs font-semibold text-slate-500 dark:text-slate-400'
const fieldInput =
  'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white'

function pillClass(active: boolean): string {
  return `flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-150 ${
    active ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 dark:text-slate-400'
  }`
}

export function RestockLineItem({ products, isAdmin, locked, dense, value, onChange, onRemove }: RestockLineItemProps) {
  const product = products.find((p) => p.id === value.productId) ?? null
  const update = (patch: Partial<RestockLineState>) => onChange({ ...value, ...patch })

  const addedKg = product
    ? value.unitMode === 'BAGS'
      ? (Number(value.quantity) || 0) * product.weightPerBag
      : Number(value.quantity) || 0
    : 0

  const currentStock = product ? summarizeStock(product.totalWeightKg, product.weightPerBag) : null
  const newStock = product ? summarizeStock(product.totalWeightKg + addedKg, product.weightPerBag) : null

  const productField = locked ? (
    <div className="mt-1 truncate rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 dark:bg-slate-800 dark:text-slate-100">
      {product?.name ?? '—'}
    </div>
  ) : (
    <ProductPicker
      products={products}
      selectedProductId={value.productId}
      onSelect={(p) => update({ productId: p.id, price: value.price || String(p.buyingPricePerBag) })}
      placeholder="Search product…"
      className={fieldInput}
    />
  )

  const unitToggle = product && (
    <div className="mt-1 flex items-center gap-1 rounded-full bg-slate-100 p-1 dark:bg-slate-800">
      <button type="button" onClick={() => update({ unitMode: 'BAGS' })} className={pillClass(value.unitMode === 'BAGS')}>
        Bags
      </button>
      <button type="button" onClick={() => update({ unitMode: 'KG' })} className={pillClass(value.unitMode === 'KG')}>
        Kg
      </button>
    </div>
  )

  const priceField =
    product &&
    (isAdmin ? (
      <FormattedNumberInput value={value.price} onChange={(raw) => update({ price: raw })} className={fieldInput} />
    ) : (
      <div className="mt-1 flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        <LockIcon width={12} height={12} /> {toCurrency(product.buyingPricePerBag)}
      </div>
    ))

  // A single line of arithmetic — what's there now, what's arriving, what it
  // becomes — so a delivery can be checked against the note without scrolling.
  const summary = addedKg > 0 && currentStock && newStock && (
    <div className="mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs dark:bg-slate-800">
      <span className="text-slate-400">Now</span>
      <span className="font-medium tabular-nums text-slate-700 dark:text-slate-200">{currentStock.label}</span>
      <span className="text-slate-300 dark:text-slate-600">→</span>
      <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
        + {formatThousands(addedKg.toFixed(2))} kg{value.unitMode === 'BAGS' ? ` (${value.quantity} bags)` : ''}
      </span>
      <span className="text-slate-300 dark:text-slate-600">→</span>
      <span className="font-bold tabular-nums text-slate-900 dark:text-white">{newStock.label}</span>
    </div>
  )

  if (dense) {
    return (
      <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
        <div className="flex items-end gap-2.5">
          <div className="grid flex-1 grid-cols-12 gap-2.5">
            <div className={product ? 'col-span-4' : 'col-span-12'}>
              <label className={fieldLabel}>Product</label>
              {productField}
            </div>
            {product && (
              <>
                <div className="col-span-2">
                  <label className={fieldLabel}>Unit</label>
                  {unitToggle}
                </div>
                <div className="col-span-2">
                  <label className={fieldLabel}>{value.unitMode === 'BAGS' ? `Bags (${product.weightPerBag}kg)` : 'Kilograms'}</label>
                  <FormattedNumberInput value={value.quantity} onChange={(raw) => update({ quantity: raw })} className={fieldInput} />
                </div>
                <div className="col-span-2">
                  <label className={fieldLabel}>Buy/bag</label>
                  {priceField}
                </div>
                <div className="col-span-2">
                  <label className={fieldLabel}>Reference</label>
                  <input
                    value={value.note}
                    onChange={(e) => update({ note: e.target.value })}
                    placeholder="Optional"
                    className={fieldInput}
                  />
                </div>
              </>
            )}
          </div>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="mb-2.5 shrink-0 text-slate-400 transition-colors hover:text-red-500"
              aria-label="Remove line"
            >
              <XIcon width={16} height={16} />
            </button>
          )}
        </div>
        {summary}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <label className={fieldLabel}>Product</label>
          {productField}
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="mt-6 text-slate-400 transition-colors hover:text-red-500"
            aria-label="Remove line"
          >
            <XIcon width={16} height={16} />
          </button>
        )}
      </div>

      {product && (
        <>
          <div className="mt-3 flex items-center gap-1 rounded-full bg-slate-100 p-1 dark:bg-slate-800">
            <button type="button" onClick={() => update({ unitMode: 'BAGS' })} className={pillClass(value.unitMode === 'BAGS')}>
              Bags ({product.weightPerBag}kg)
            </button>
            <button type="button" onClick={() => update({ unitMode: 'KG' })} className={pillClass(value.unitMode === 'KG')}>
              Kilograms
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className={fieldLabel}>{value.unitMode === 'BAGS' ? 'Number of bags' : 'Quantity (kg)'}</label>
              <FormattedNumberInput value={value.quantity} onChange={(raw) => update({ quantity: raw })} className={fieldInput} />
            </div>
            <div>
              <label className={fieldLabel}>Buying price/bag (KES)</label>
              {priceField}
            </div>
          </div>

          <label className={`mt-3 ${fieldLabel}`}>
            Supplier / reference <span className="font-normal normal-case text-slate-400">(optional)</span>
          </label>
          <input
            value={value.note}
            onChange={(e) => update({ note: e.target.value })}
            placeholder="e.g. KBZ 123X — Mwea Supplier, DN #4521"
            className={fieldInput}
          />

          {summary}
        </>
      )}
    </div>
  )
}
