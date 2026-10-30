import { useState } from 'react'
import type { ProductRecord } from '../../../../shared/ipc'
import { formatThousands, KG_PER_BAG } from '../../../../shared/stock'
import { FormattedNumberInput } from '../FormattedNumberInput'
import type { ToastState } from '../Toast'
import { PackageIcon, PlusIcon, XIcon } from '../Icons'
import { BagCountStepper } from './BagCountStepper'
import { ProductPicker } from './ProductPicker'

interface CountLine {
  productId: number | null
  bags: string
  /** What the scale said for the whole lot, when the sacks weren't standard. Blank = bags × bag size. */
  weighedKg: string
}

const blankLine = (): CountLine => ({ productId: null, bags: '0', weighedKg: '' })

interface CountDeliveryModalProps {
  products: ProductRecord[]
  shiftId: number
  onClose: () => void
  onSubmitted: () => Promise<void> | void
  showToast: (kind: ToastState['kind'], message: string) => void
}

const fieldLabel = 'block text-xs font-semibold text-slate-500 dark:text-slate-400'
const fieldInput =
  'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white'

function nominalKg(line: CountLine, products: ProductRecord[]): number {
  const product = products.find((p) => p.id === line.productId)
  if (!product) return 0
  return (Number(line.bags) || 0) * (product.weightPerBag || KG_PER_BAG)
}

function lineKg(line: CountLine, products: ProductRecord[]): number {
  const weighed = Number(line.weighedKg) || 0
  return weighed > 0 ? weighed : nominalKg(line, products)
}

/** A separate, focused mode for tallying a delivery as it's physically offloaded —
 * one or more products, counted a bag at a time — kept apart from Add stock (which
 * assumes the count is already known) because counting under pressure is where
 * mis-counts and "wait, what were we on" confusion happens. Nothing is written to
 * stock until the whole delivery has been counted, reviewed and confirmed. */
export function CountDeliveryModal({ products, shiftId, onClose, onSubmitted, showToast }: CountDeliveryModalProps) {
  const [step, setStep] = useState<'counting' | 'review'>('counting')
  const [lines, setLines] = useState<CountLine[]>([blankLine()])
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const updateLine = (index: number, next: CountLine) => setLines((prev) => prev.map((l, i) => (i === index ? next : l)))
  const removeLine = (index: number) => setLines((prev) => prev.filter((_, i) => i !== index))
  const addLine = () => setLines((prev) => [...prev, blankLine()])

  const countedLines = lines.filter((l) => l.productId !== null && (Number(l.bags) || 0) > 0)
  const totalBags = countedLines.reduce((sum, l) => sum + (Number(l.bags) || 0), 0)
  const totalKg = countedLines.reduce((sum, l) => sum + lineKg(l, products), 0)

  const submit = async () => {
    setSubmitting(true)
    try {
      for (const line of countedLines) {
        const product = products.find((p) => p.id === line.productId)
        if (!product) continue
        await window.electronAPI.receiveStock({
          shiftId,
          productId: product.id,
          addedKg: lineKg(line, products),
          referenceNote: note.trim() || undefined,
        })
      }
      showToast('success', `Added ${countedLines.length} product${countedLines.length === 1 ? '' : 's'} to stock`)
      await onSubmitted()
      onClose()
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not add stock')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="osk-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl border border-slate-200/60 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
              <PackageIcon width={16} height={16} />
            </span>
            <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
              {step === 'counting' ? 'Count delivery' : 'Review count'}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 transition-colors hover:text-slate-600">
            <XIcon width={18} height={18} />
          </button>
        </div>

        {step === 'counting' ? (
          <>
            <p className="mt-1 text-xs text-slate-400">
              Tally bags as they're offloaded. Nothing is added to stock yet — count everything first, then review.
            </p>

            <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
              {lines.map((line, index) => {
                const product = products.find((p) => p.id === line.productId) ?? null
                return (
                  <div key={index} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                    <div className="flex items-start gap-2.5">
                      <div className="flex-1">
                        <label className={fieldLabel}>Product</label>
                        <ProductPicker
                          products={products}
                          selectedProductId={line.productId}
                          onSelect={(p) => updateLine(index, { ...line, productId: p.id })}
                          placeholder="Search product…"
                          className={fieldInput}
                        />
                      </div>
                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLine(index)}
                          className="mt-6 shrink-0 text-slate-400 transition-colors hover:text-red-500"
                          aria-label="Remove line"
                        >
                          <XIcon width={16} height={16} />
                        </button>
                      )}
                    </div>
                    {product && (
                      <div className="mt-3">
                        <label className={fieldLabel}>Bags counted ({product.weightPerBag}kg each)</label>
                        <BagCountStepper value={line.bags} onChange={(raw) => updateLine(index, { ...line, bags: raw })} />
                        <p className="mt-1.5 text-xs text-slate-400">
                          = {formatThousands(lineKg(line, products).toFixed(0))} kg
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <button
              type="button"
              onClick={addLine}
              className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-slate-100 py-2 text-xs font-semibold text-slate-600 transition-all duration-150 hover:bg-slate-200 active:scale-[0.98] dark:bg-slate-800 dark:text-slate-300"
            >
              <PlusIcon width={13} height={13} /> Add another product
            </button>

            <button
              type="button"
              disabled={countedLines.length === 0}
              onClick={() => setStep('review')}
              className="mt-3 w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-500/30 transition-all duration-150 hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-50"
            >
              Finish counting
              {countedLines.length > 0
                ? ` (${totalBags} bag${totalBags === 1 ? '' : 's'}, ${countedLines.length} product${countedLines.length === 1 ? '' : 's'})`
                : ''}
            </button>
          </>
        ) : (
          <>
            <p className="mt-1 text-xs text-slate-400">
              Check the count before it's added to stock. Numbers can still be corrected below.
            </p>

            <div className="mt-4 flex-1 space-y-2 overflow-y-auto pr-1">
              {countedLines.map((line) => {
                const product = products.find((p) => p.id === line.productId)
                if (!product) return null
                const index = lines.indexOf(line)
                const nominal = nominalKg(line, products)
                return (
                  <div key={product.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{product.name}</p>
                        <p className="text-xs text-slate-400">
                          {formatThousands(lineKg(line, products).toFixed(1).replace(/\.0$/, ''))} kg
                          {Number(line.weighedKg) > 0 ? ' (weighed)' : ''}
                        </p>
                      </div>
                      <div className="w-32 shrink-0">
                        <BagCountStepper value={line.bags} onChange={(raw) => updateLine(index, { ...line, bags: raw })} />
                      </div>
                    </div>
                    <div className="mt-2">
                      <label className={fieldLabel}>
                        Weighed total (kg) <span className="font-normal text-slate-400">optional</span>
                      </label>
                      <FormattedNumberInput
                        value={line.weighedKg}
                        placeholder={formatThousands(String(nominal))}
                        onChange={(raw) => updateLine(index, { ...line, weighedKg: raw })}
                        className={fieldInput}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-3 flex items-baseline justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
              <span className="font-semibold text-slate-600 dark:text-slate-300">
                Total: {totalBags} bag{totalBags === 1 ? '' : 's'}
              </span>
              <span className="font-bold tabular-nums text-slate-900 dark:text-white">
                {formatThousands(totalKg.toFixed(1).replace(/\.0$/, ''))} kg
              </span>
            </div>

            <label className={`mt-3 ${fieldLabel}`}>
              Delivery / offloading note <span className="font-normal normal-case text-slate-400">(optional)</span>
            </label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. KBZ 123X — Mwea Supplier, DN #4521"
              className={fieldInput}
            />

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setStep('counting')}
                className="rounded-xl bg-slate-100 py-2.5 text-sm font-semibold text-slate-600 transition-all duration-150 hover:bg-slate-200 active:scale-[0.98] dark:bg-slate-800 dark:text-slate-300"
              >
                Back to counting
              </button>
              <button
                type="button"
                disabled={submitting || countedLines.length === 0}
                onClick={submit}
                className="rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-500/30 transition-all duration-150 hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-50"
              >
                {submitting ? 'Adding…' : 'Confirm & add to stock'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
