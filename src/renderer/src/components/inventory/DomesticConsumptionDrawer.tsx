import { useState } from 'react'
import type { FormEvent } from 'react'
import type { ProductRecord } from '../../../../shared/ipc'
import type { ToastState } from '../Toast'
import { XIcon } from '../Icons'
import { FormattedNumberInput } from '../FormattedNumberInput'
import { costPerKg, formatThousands, summarizeStock, toCurrency } from '../../../../shared/stock'

interface DomesticConsumptionDrawerProps {
  productId: number
  products: ProductRecord[]
  shiftId: number
  onClose: () => void
  onSubmitted: () => Promise<void> | void
  showToast: (kind: ToastState['kind'], message: string) => void
}

const fieldLabel = 'block text-xs font-semibold text-slate-500 dark:text-slate-400'
const fieldInput =
  'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white'

function pillClass(active: boolean): string {
  return `flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-150 ${
    active ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 dark:text-slate-400'
  }`
}

export function DomesticConsumptionDrawer({
  productId,
  products,
  shiftId,
  onClose,
  onSubmitted,
  showToast,
}: DomesticConsumptionDrawerProps) {
  const product = products.find((p) => p.id === productId) ?? null
  const [unitMode, setUnitMode] = useState<'BAGS' | 'KG'>('KG')
  const [quantity, setQuantity] = useState('')
  const [cost, setCost] = useState('')
  const [costTouched, setCostTouched] = useState(false)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const quantityKg = product
    ? unitMode === 'BAGS'
      ? (Number(quantity) || 0) * product.weightPerBag
      : Number(quantity) || 0
    : 0

  const suggestedCost = product ? costPerKg(product.buyingPricePerBag, product.weightPerBag) * quantityKg : 0
  const effectiveCost = costTouched ? Number(cost) || 0 : suggestedCost

  const currentStock = product ? summarizeStock(product.totalWeightKg, product.weightPerBag) : null
  const remainingStock = product ? summarizeStock(Math.max(0, product.totalWeightKg - quantityKg), product.weightPerBag) : null
  const exceedsStock = product ? quantityKg > product.totalWeightKg : false
  const canSubmit = product !== null && quantityKg > 0 && !exceedsStock

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit || !product) return
    setSubmitting(true)
    try {
      await window.electronAPI.recordDomesticConsumption({
        shiftId,
        productId: product.id,
        quantityKg,
        costValue: effectiveCost,
        notes: note.trim() || undefined,
      })
      showToast('success', `Recorded ${product.name} taken home`)
      await onSubmitted()
      onClose()
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not record')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="osk-overlay fixed inset-0 z-50 flex justify-end bg-slate-900/60 backdrop-blur-sm">
      <button type="button" onClick={onClose} className="absolute inset-0" aria-label="Close" />
      <form
        onSubmit={submit}
        className="relative flex h-full w-full max-w-sm flex-col overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-2xl animate-[slide-in-right_0.2s_ease-out] dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">Take home</h3>
          <button type="button" onClick={onClose} className="text-slate-400 transition-colors hover:text-slate-600">
            <XIcon width={18} height={18} />
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          For stock taken out for domestic/personal use — not a sale. Reduces stock and counts as a cost on this shift's report.
        </p>

        {product && (
          <div className="mt-4 flex-1 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <label className={fieldLabel}>Product</label>
            <div className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 dark:bg-slate-800 dark:text-slate-100">
              {product.name}
            </div>

            <div className="mt-3 flex items-center gap-1 rounded-full bg-slate-100 p-1 dark:bg-slate-800">
              <button type="button" onClick={() => setUnitMode('BAGS')} className={pillClass(unitMode === 'BAGS')}>
                Bags ({product.weightPerBag}kg)
              </button>
              <button type="button" onClick={() => setUnitMode('KG')} className={pillClass(unitMode === 'KG')}>
                Kilograms
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className={fieldLabel}>{unitMode === 'BAGS' ? 'Number of bags' : 'Quantity (kg)'}</label>
                <FormattedNumberInput value={quantity} onChange={setQuantity} className={fieldInput} />
              </div>
              <div>
                <label className={fieldLabel}>Cost value (KES)</label>
                <FormattedNumberInput
                  value={costTouched ? cost : String(Math.round(suggestedCost))}
                  onChange={(raw) => {
                    setCostTouched(true)
                    setCost(raw)
                  }}
                  className={fieldInput}
                />
              </div>
            </div>

            <label className={`mt-3 ${fieldLabel}`}>
              Note <span className="font-normal normal-case text-slate-400">(optional)</span>
            </label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. owner's personal use"
              className={fieldInput}
            />

            {quantityKg > 0 && currentStock && remainingStock && (
              <div className="mt-3 rounded-lg bg-slate-50 p-2.5 text-xs dark:bg-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Current stock</span>
                  <span className="font-medium tabular-nums text-slate-700 dark:text-slate-200">{currentStock.label}</span>
                </div>
                <div className="mt-0.5 flex items-center justify-between">
                  <span className="text-slate-400">Taking</span>
                  <span className="font-medium tabular-nums text-amber-600 dark:text-amber-400">
                    - {formatThousands(quantityKg.toFixed(2))} kg ({toCurrency(effectiveCost)})
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between border-t border-slate-200 pt-1 dark:border-slate-700">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">Remaining stock</span>
                  <span className="font-bold tabular-nums text-slate-900 dark:text-white">{remainingStock.label}</span>
                </div>
              </div>
            )}
            {exceedsStock && (
              <p className="mt-2 text-xs font-medium text-red-500">Only {currentStock?.label} in stock.</p>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit || submitting}
          className="mt-4 w-full rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-amber-500/30 transition-all duration-150 hover:bg-amber-600 active:scale-[0.98] disabled:opacity-50"
        >
          {submitting ? 'Recording…' : 'Confirm taken home'}
        </button>
      </form>
    </div>
  )
}
