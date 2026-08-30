import { useState } from 'react'
import type { FormEvent } from 'react'
import type { ProductRecord } from '../../../../shared/ipc'
import type { ToastState } from '../Toast'
import { XIcon } from '../Icons'
import { RestockLineItem, blankRestockLine } from './RestockLineItem'
import type { RestockLineState } from './RestockLineItem'

interface RestockDrawerProps {
  productId: number
  products: ProductRecord[]
  shiftId: number
  isAdmin: boolean
  onClose: () => void
  onSubmitted: () => Promise<void> | void
  showToast: (kind: ToastState['kind'], message: string) => void
}

export function RestockDrawer({ productId, products, shiftId, isAdmin, onClose, onSubmitted, showToast }: RestockDrawerProps) {
  const product = products.find((p) => p.id === productId) ?? null
  const [line, setLine] = useState<RestockLineState>(() => ({
    ...blankRestockLine(),
    productId,
    price: product ? String(product.buyingPricePerBag) : '',
  }))
  const [submitting, setSubmitting] = useState(false)

  const addedKg = product
    ? line.unitMode === 'BAGS'
      ? (Number(line.quantity) || 0) * product.weightPerBag
      : Number(line.quantity) || 0
    : 0
  const canSubmit = addedKg > 0

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit || !product) return
    setSubmitting(true)
    try {
      await window.electronAPI.receiveStock({
        shiftId,
        productId: product.id,
        addedKg,
        newBuyingPricePerBag: isAdmin ? Number(line.price) || product.buyingPricePerBag : undefined,
        referenceNote: line.note.trim() || undefined,
      })
      showToast('success', `Restocked ${product.name}`)
      await onSubmitted()
      onClose()
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not restock')
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
          <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">Restock</h3>
          <button type="button" onClick={onClose} className="text-slate-400 transition-colors hover:text-slate-600">
            <XIcon width={18} height={18} />
          </button>
        </div>

        <div className="mt-4 flex-1">
          <RestockLineItem products={products} isAdmin={isAdmin} locked value={line} onChange={setLine} />
        </div>

        <button
          type="submit"
          disabled={!canSubmit || submitting}
          className="mt-4 w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-500/30 transition-all duration-150 hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-50"
        >
          {submitting ? 'Restocking…' : 'Confirm restock'}
        </button>
      </form>
    </div>
  )
}
