import { useState } from 'react'
import type { FormEvent } from 'react'
import type { ProductRecord } from '../../../../shared/ipc'
import type { ToastState } from '../Toast'
import { PlusIcon, XIcon } from '../Icons'
import { RestockLineItem, blankRestockLine } from './RestockLineItem'
import type { RestockLineState } from './RestockLineItem'

interface AddStockModalProps {
  products: ProductRecord[]
  shiftId: number
  isAdmin: boolean
  onClose: () => void
  onSubmitted: () => Promise<void> | void
  showToast: (kind: ToastState['kind'], message: string) => void
}

function computeAddedKg(line: RestockLineState, products: ProductRecord[]): number {
  const product = products.find((p) => p.id === line.productId)
  if (!product) return 0
  return line.unitMode === 'BAGS' ? (Number(line.quantity) || 0) * product.weightPerBag : Number(line.quantity) || 0
}

export function AddStockModal({ products, shiftId, isAdmin, onClose, onSubmitted, showToast }: AddStockModalProps) {
  const [lines, setLines] = useState<RestockLineState[]>([blankRestockLine()])
  const [submitting, setSubmitting] = useState(false)

  const updateLine = (index: number, next: RestockLineState) => {
    setLines((prev) => prev.map((l, i) => (i === index ? next : l)))
  }
  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index))
  }
  const addLine = () => setLines((prev) => [...prev, blankRestockLine()])

  const readyLines = lines.filter((l) => l.productId !== null && computeAddedKg(l, products) > 0)
  const canSubmit = readyLines.length > 0

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    try {
      for (const line of readyLines) {
        const product = products.find((p) => p.id === line.productId)
        if (!product) continue
        await window.electronAPI.receiveStock({
          shiftId,
          productId: product.id,
          addedKg: computeAddedKg(line, products),
          newBuyingPricePerBag: isAdmin ? Number(line.price) || product.buyingPricePerBag : undefined,
          referenceNote: line.note.trim() || undefined,
        })
      }
      showToast('success', `Restocked ${readyLines.length} product${readyLines.length === 1 ? '' : 's'}`)
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
      <form
        onSubmit={submit}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-slate-200/60 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">Add stock</h3>
          <button type="button" onClick={onClose} className="text-slate-400 transition-colors hover:text-slate-600">
            <XIcon width={18} height={18} />
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-400">Log a delivery covering one or more products at once.</p>

        {/* Each delivery line is one row wide rather than a stacked form, so a
            three-product delivery still fits without the panel needing to scroll.
            The product suggestions render into <body> (see ProductPicker), so even
            when a very long delivery does scroll they can no longer be clipped. */}
        <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
          {lines.map((line, index) => (
            <RestockLineItem
              key={index}
              products={products}
              isAdmin={isAdmin}
              dense
              value={line}
              onChange={(next) => updateLine(index, next)}
              onRemove={lines.length > 1 ? () => removeLine(index) : undefined}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={addLine}
          className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-slate-100 py-2 text-xs font-semibold text-slate-600 transition-all duration-150 hover:bg-slate-200 active:scale-[0.98] dark:bg-slate-800 dark:text-slate-300"
        >
          <PlusIcon width={13} height={13} /> Add another product
        </button>

        <button
          type="submit"
          disabled={!canSubmit || submitting}
          className="mt-3 w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-500/30 transition-all duration-150 hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-50"
        >
          {submitting ? 'Adding stock…' : `Confirm (${readyLines.length || 0} product${readyLines.length === 1 ? '' : 's'})`}
        </button>
      </form>
    </div>
  )
}
