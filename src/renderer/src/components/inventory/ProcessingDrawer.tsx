import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { ProductRecord, StockConversionRecord } from '../../../../shared/ipc'
import type { ToastState } from '../Toast'
import { XIcon } from '../Icons'
import { SearchProductList } from './SearchProductList'

interface ProcessingDrawerProps {
  products: ProductRecord[]
  /** Only admins can add a product, so only they get the button that creates a missing display product. */
  canManageProducts: boolean
  shiftId: number
  /** A batch finished after this can still be corrected, even if it was taken out in an earlier shift. */
  shiftStartedAt: string
  onClose: () => void
  /** Stock has moved, so the grid and the owner's attention list both need to reload. */
  onChanged: () => Promise<void> | void
  showToast: (kind: ToastState['kind'], message: string) => void
}

type Tab = 'CLEANING' | 'MILLING'

// One open batch at a time shows a form: bringing the output back, or cancelling it.
type OpenAction = { id: number; mode: 'return' | 'cancel' }
// A finished batch from this shift can be corrected or voided, one at a time.
type RecentAction = { id: number; mode: 'edit' | 'void' }

// Cleaned stock always goes into the product named after its source. The admin creates
// that product in the catalogue and sets its prices there, like any other product.
const DISPLAY_SUFFIX = ' Display'

const fieldLabel = 'mt-3 block text-xs font-semibold text-slate-500 dark:text-slate-400'
const miniLabel = 'block text-xs font-semibold text-slate-500 dark:text-slate-400'
const fieldInput =
  'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white'
const primaryButton =
  'mt-4 w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-500/30 transition-all duration-150 hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-40 disabled:shadow-none'
const secondaryButton =
  'rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-all duration-150 hover:bg-slate-200 active:scale-[0.98] disabled:opacity-40 dark:bg-slate-800 dark:text-slate-300'
const dangerButton =
  'flex-1 rounded-lg bg-red-500 py-2 text-xs font-semibold text-white transition-all duration-150 hover:bg-red-600 disabled:opacity-40'

const kg = (value: number) => `${Number(value.toFixed(2)).toLocaleString('en-KE')} kg`

// Cleaning and posho both move kilos out of one product and into another. A batch is taken
// out first and finished when it comes back. Anyone on the till can record it; the owner
// checks it later in Needs attention.
export function ProcessingDrawer({
  products,
  canManageProducts,
  shiftId,
  shiftStartedAt,
  onClose,
  onChanged,
  showToast,
}: ProcessingDrawerProps) {
  const [tab, setTab] = useState<Tab>('CLEANING')
  const [batches, setBatches] = useState<StockConversionRecord[]>([])
  const [busy, setBusy] = useState(false)

  // Admin-only: the display product is created here with its prices, if it doesn't exist yet.
  const [creatingDisplay, setCreatingDisplay] = useState(false)
  const [displayRetailStr, setDisplayRetailStr] = useState('')
  const [displayWholesaleStr, setDisplayWholesaleStr] = useState('')

  // Clean & sort (Display): taking kilos out
  const [sourceId, setSourceId] = useState<number | ''>('')
  const [sourceKgStr, setSourceKgStr] = useState('')

  // Posho: sending out
  const [millSourceId, setMillSourceId] = useState<number | ''>('')
  const [millKgStr, setMillKgStr] = useState('')

  // Coming back, for either kind: the kilos weighed, and for posho the product it went into
  const [openAction, setOpenAction] = useState<OpenAction | null>(null)
  const [returnOutputId, setReturnOutputId] = useState<number | ''>('')
  const [returnKgStr, setReturnKgStr] = useState('')

  // Reason for cancelling an open batch, or for voiding or correcting a finished one
  const [reasonStr, setReasonStr] = useState('')

  // Correcting or voiding a finished batch
  const [recentAction, setRecentAction] = useState<RecentAction | null>(null)
  const [editSourceStr, setEditSourceStr] = useState('')
  const [editOutputStr, setEditOutputStr] = useState('')

  const activeProducts = products.filter((p) => p.isActive)

  // What can be cleaned: anything in stock except the display products themselves.
  const cleanChoices = activeProducts.filter((p) => p.totalWeightKg > 0 && !p.name.endsWith(DISPLAY_SUFFIX))
  const source = cleanChoices.find((p) => p.id === sourceId) ?? null
  const displayName = source ? `${source.name}${DISPLAY_SUFFIX}` : ''
  const displayProduct = displayName ? activeProducts.find((p) => p.name === displayName) ?? null : null
  const cleanSourceKg = Number(sourceKgStr) || 0
  const cleanStartValid = source !== null && cleanSourceKg > 0 && cleanSourceKg <= source.totalWeightKg

  // Posho: only products ticked as millable can go to posho, and only products ticked as
  // milled into can come back from it.
  const millChoices = activeProducts.filter((p) => p.isMillable && p.totalWeightKg > 0)
  const millOutputChoices = activeProducts.filter((p) => p.isMillOutput)
  const millSource = millChoices.find((p) => p.id === millSourceId) ?? null
  const millKg = Number(millKgStr) || 0
  const millValid = millSource !== null && millKg > 0 && millKg <= millSource.totalWeightKg

  const openCleaning = batches.filter((b) => b.status === 'OPEN' && b.kind === 'CLEANING')
  const openPosho = batches.filter((b) => b.status === 'OPEN' && b.kind === 'MILLING')
  const recent = batches.filter((b) => b.status !== 'OPEN').slice(0, 10)

  const refresh = async () => {
    setBatches(await window.electronAPI.listStockConversions(50))
  }

  useEffect(() => {
    refresh().catch((error: unknown) =>
      showToast('error', error instanceof Error ? error.message : 'Could not load processing')
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Runs one action, then brings the list and the grid up to date. The form it came from is
  // cleared by the caller only on success, so a failed save keeps what was typed.
  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true)
    try {
      await action()
      showToast('success', success)
      await refresh()
      await onChanged()
      return true
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not record processing')
      return false
    } finally {
      setBusy(false)
    }
  }

  // The display product takes its category and bag size from its source, and is created with no
  // stock and no cost. Its cost comes from the batches that are cleaned into it.
  const createDisplayProduct = async () => {
    if (source === null) return
    const retail = Number(displayRetailStr) || 0
    if (retail <= 0) {
      showToast('error', 'Enter the retail price per kg')
      return
    }
    setBusy(true)
    try {
      await window.electronAPI.createProduct({
        name: displayName,
        categoryId: source.categoryId,
        weightPerBag: source.weightPerBag,
        totalWeightKg: 0,
        buyingPricePerBag: 0,
        retailPricePerKg: retail,
        wholesalePricePerKg: Number(displayWholesaleStr) || 0,
        minStockAlertKg: 0,
        isActive: true,
        isMillable: false,
        isMillOutput: false,
        saleUnits: [],
      })
      showToast('success', `Created ${displayName}`)
      setCreatingDisplay(false)
      await onChanged()
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not create the product')
    } finally {
      setBusy(false)
    }
  }

  const startCleaning = async (event: FormEvent) => {
    event.preventDefault()
    if (!cleanStartValid || source === null) return
    const done = await run(
      () =>
        window.electronAPI.recordStockConversion({
          shiftId,
          kind: 'CLEANING',
          sourceProductId: source.id,
          sourceKg: cleanSourceKg,
        }),
      `${source.name}: ${kg(cleanSourceKg)} taken for cleaning`
    )
    if (done) {
      setSourceId('')
      setSourceKgStr('')
    }
  }

  const finishCleaning = async (batch: StockConversionRecord) => {
    const kgAfter = Number(returnKgStr) || 0
    if (kgAfter <= 0) return
    const done = await run(
      () => window.electronAPI.completeCleaning({ id: batch.id, outputKg: kgAfter }),
      `${batch.sourceName}${DISPLAY_SUFFIX}: ${kg(kgAfter)} is ready to sell`
    )
    if (done) {
      setOpenAction(null)
      setReturnKgStr('')
    }
  }

  const sendToMill = async (event: FormEvent) => {
    event.preventDefault()
    if (!millValid || millSource === null) return
    const done = await run(
      () =>
        window.electronAPI.recordStockConversion({
          shiftId,
          kind: 'MILLING',
          sourceProductId: millSource.id,
          sourceKg: millKg,
        }),
      `${millSource.name}: ${kg(millKg)} sent to posho`
    )
    if (done) {
      setMillSourceId('')
      setMillKgStr('')
    }
  }

  const returnFromPosho = async (batch: StockConversionRecord) => {
    const kgBack = Number(returnKgStr) || 0
    if (returnOutputId === '' || kgBack <= 0) return
    const outputName = millOutputChoices.find((p) => p.id === returnOutputId)?.name ?? 'Posho'
    const done = await run(
      () =>
        window.electronAPI.completeMilling({
          id: batch.id,
          outputProductId: returnOutputId,
          outputKg: kgBack,
        }),
      `${outputName}: ${kg(kgBack)} is back and ready to sell`
    )
    if (done) {
      setOpenAction(null)
      setReturnOutputId('')
      setReturnKgStr('')
    }
  }

  const cancelBatch = async (batch: StockConversionRecord) => {
    const reason = reasonStr.trim()
    if (!reason) {
      showToast('error', 'Write why this batch is being cancelled')
      return
    }
    const done = await run(
      () => window.electronAPI.cancelMilling({ id: batch.id, reason }),
      'Batch cancelled and returned to stock'
    )
    if (done) {
      setOpenAction(null)
      setReasonStr('')
    }
  }

  const correctBatch = async (batch: StockConversionRecord) => {
    const reason = reasonStr.trim()
    if (!reason) {
      showToast('error', 'Write why this batch is being corrected')
      return
    }
    const done = await run(
      () =>
        window.electronAPI.editConversion({
          id: batch.id,
          sourceKg: Number(editSourceStr) || 0,
          outputKg: Number(editOutputStr) || 0,
          reason,
        }),
      'Batch corrected. The original is kept on record.'
    )
    if (done) {
      setRecentAction(null)
      setReasonStr('')
    }
  }

  const voidBatch = async (batch: StockConversionRecord) => {
    const reason = reasonStr.trim()
    if (!reason) {
      showToast('error', 'Write why this batch is being voided')
      return
    }
    const done = await run(
      () => window.electronAPI.voidConversion({ id: batch.id, reason }),
      'Batch voided. The stock is back where it was.'
    )
    if (done) {
      setRecentAction(null)
      setReasonStr('')
    }
  }

  const closeOpenAction = () => {
    setOpenAction(null)
    setReturnKgStr('')
    setReturnOutputId('')
    setReasonStr('')
  }

  // One batch that is out: its state, then either its return form, its cancel form, or its buttons.
  const renderOpenBatch = (batch: StockConversionRecord, returnForm: ReactNode, returnLabel: string) => {
    const action = openAction?.id === batch.id ? openAction : null
    return (
      <li key={batch.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
        <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {batch.sourceName} <span className="text-amber-600 dark:text-amber-400">{kg(batch.sourceKg)}</span>
        </div>
        <div className="text-xs text-slate-400">Taken by {batch.recordedBy}</div>

        {action?.mode === 'return' ? (
          <div className="mt-2">
            {returnForm}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={busy || (Number(returnKgStr) || 0) <= 0}
                onClick={() => (batch.kind === 'CLEANING' ? finishCleaning(batch) : returnFromPosho(batch))}
                className="flex-1 rounded-lg bg-emerald-500 py-2 text-xs font-semibold text-white transition-all duration-150 hover:bg-emerald-600 disabled:opacity-40"
              >
                {returnLabel}
              </button>
              <button type="button" onClick={closeOpenAction} className={secondaryButton}>
                Close
              </button>
            </div>
          </div>
        ) : action?.mode === 'cancel' ? (
          <div className="mt-2">
            <label className={fieldLabel}>Why is it being cancelled?</label>
            <input
              value={reasonStr}
              onChange={(e) => setReasonStr(e.target.value)}
              placeholder="e.g. Bag lost"
              className={fieldInput}
            />
            <div className="mt-3 flex gap-2">
              <button type="button" disabled={busy} onClick={() => cancelBatch(batch)} className={dangerButton}>
                Cancel batch
              </button>
              <button type="button" onClick={closeOpenAction} className={secondaryButton}>
                Keep it
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setOpenAction({ id: batch.id, mode: 'return' })
                setReturnOutputId('')
                setReturnKgStr('')
              }}
              className="flex-1 rounded-lg bg-emerald-500 py-2 text-xs font-semibold text-white transition-all duration-150 hover:bg-emerald-600"
            >
              {batch.kind === 'CLEANING' ? 'Finish cleaning' : "It's back"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpenAction({ id: batch.id, mode: 'cancel' })
                setReasonStr('')
              }}
              className={secondaryButton}
            >
              Cancel
            </button>
          </div>
        )}
      </li>
    )
  }

  const cleaningReturnForm = (
    <>
      <label className={fieldLabel}>Kilos weighed after cleaning</label>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        value={returnKgStr}
        onChange={(e) => setReturnKgStr(e.target.value)}
        className={fieldInput}
      />
    </>
  )

  return (
    <div className="osk-overlay fixed inset-0 z-50 flex justify-end bg-slate-900/60 backdrop-blur-sm">
      <button type="button" onClick={onClose} className="absolute inset-0" aria-label="Close" />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-2xl animate-[slide-in-right_0.2s_ease-out] dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">Process stock</h3>
          <button type="button" onClick={onClose} className="text-slate-400 transition-colors hover:text-slate-600">
            <XIcon width={18} height={18} />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          {(['CLEANING', 'MILLING'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`rounded-lg py-1.5 text-xs font-semibold transition-all duration-150 ${
                tab === value
                  ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-white'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {value === 'CLEANING' ? 'Clean & sort (Display)' : 'Posho'}
            </button>
          ))}
        </div>

        {tab === 'CLEANING' && (
          <div className="mt-2">
            <form onSubmit={startCleaning} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Take for cleaning</h4>
              <label className={fieldLabel}>Taken from</label>
              <SearchProductList
                products={cleanChoices}
                selectedId={sourceId}
                onSelect={setSourceId}
                emptyText="No product in stock to clean."
              />

              <div className="mt-3">
                <label className={miniLabel}>Kilos taken</label>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={sourceKgStr}
                  onChange={(e) => setSourceKgStr(e.target.value)}
                  className={fieldInput}
                />
              </div>

              <label className={fieldLabel}>Becomes</label>
              <div className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                {source === null ? (
                  <span className="text-slate-400">Pick what is being cleaned first.</span>
                ) : displayProduct ? (
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{displayName}</span>
                ) : (
                  <span className="text-red-600 dark:text-red-400">
                    No product called “{displayName}” yet.
                    {canManageProducts ? '' : ' Ask the owner to add it in Stock with its prices.'}
                  </span>
                )}
              </div>

              {source !== null && !displayProduct && canManageProducts && !creatingDisplay && (
                <button
                  type="button"
                  onClick={() => {
                    setCreatingDisplay(true)
                    setDisplayRetailStr('')
                    setDisplayWholesaleStr('')
                  }}
                  className={`${secondaryButton} mt-2 w-full py-2 text-sm`}
                >
                  Create “{displayName}”
                </button>
              )}

              {source !== null && !displayProduct && canManageProducts && creatingDisplay && (
                <div className="mt-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    New display product
                  </h4>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <label className={miniLabel}>Retail / kg</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.5"
                        value={displayRetailStr}
                        onChange={(e) => setDisplayRetailStr(e.target.value)}
                        className={fieldInput}
                      />
                    </div>
                    <div>
                      <label className={miniLabel}>Wholesale / kg</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.5"
                        value={displayWholesaleStr}
                        onChange={(e) => setDisplayWholesaleStr(e.target.value)}
                        className={fieldInput}
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={busy || (Number(displayRetailStr) || 0) <= 0}
                      onClick={createDisplayProduct}
                      className="flex-1 rounded-lg bg-emerald-500 py-2 text-xs font-semibold text-white transition-all duration-150 hover:bg-emerald-600 disabled:opacity-40"
                    >
                      {busy ? 'Creating…' : `Create ${displayName}`}
                    </button>
                    <button type="button" onClick={() => setCreatingDisplay(false)} className={secondaryButton}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <button type="submit" disabled={!cleanStartValid || busy} className={primaryButton}>
                {busy ? 'Saving…' : 'Take for cleaning'}
              </button>
            </form>

            <h4 className="mt-5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Being cleaned ({openCleaning.length})
            </h4>
            {openCleaning.length === 0 && <p className="mt-2 text-xs text-slate-400">Nothing is being cleaned.</p>}
            <ul className="mt-2 space-y-2">
              {openCleaning.map((batch) => renderOpenBatch(batch, cleaningReturnForm, 'Save cleaned kilos'))}
            </ul>
          </div>
        )}

        {tab === 'MILLING' && (
          <div className="mt-2">
            <form onSubmit={sendToMill} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Send to posho</h4>
              <label className={fieldLabel}>Product</label>
              <SearchProductList
                products={millChoices}
                selectedId={millSourceId}
                onSelect={setMillSourceId}
                emptyText="No product is ticked Posho in its settings yet."
              />
              <label className={fieldLabel}>Kilos sent</label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={millKgStr}
                onChange={(e) => setMillKgStr(e.target.value)}
                className={fieldInput}
              />
              <button type="submit" disabled={!millValid || busy} className={primaryButton}>
                {busy ? 'Saving…' : 'Send to posho'}
              </button>
            </form>

            <h4 className="mt-5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Out at posho ({openPosho.length})
            </h4>
            {openPosho.length === 0 && <p className="mt-2 text-xs text-slate-400">Nothing is at posho.</p>}
            <ul className="mt-2 space-y-2">
              {openPosho.map((batch) =>
                renderOpenBatch(
                  batch,
                  <>
                    <label className={fieldLabel}>Processed into</label>
                    <SearchProductList
                      products={millOutputChoices.filter((p) => p.id !== batch.sourceProductId)}
                      selectedId={returnOutputId}
                      onSelect={setReturnOutputId}
                      emptyText="No product is ticked Processed into in its settings yet."
                    />
                    <label className={fieldLabel}>Kilos weighed back</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={returnKgStr}
                      onChange={(e) => setReturnKgStr(e.target.value)}
                      className={fieldInput}
                    />
                  </>,
                  'Save returned posho'
                )
              )}
            </ul>
          </div>
        )}

        <h4 className="mt-6 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Recent</h4>
        {recent.length === 0 && <p className="mt-2 text-xs text-slate-400">Nothing processed yet.</p>}
        <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
          {recent.map((batch) => {
            const finished = batch.status === 'DONE'
            const finishedThisShift =
              batch.shiftId === shiftId ||
              (batch.completedAt !== null && Date.parse(batch.completedAt) >= Date.parse(shiftStartedAt))
            const mine = finished && finishedThisShift && batch.outputProductId !== null
            const action = recentAction?.id === batch.id ? recentAction : null
            return (
              <li key={batch.id} className="py-2 text-xs">
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={`font-semibold ${
                      batch.status === 'VOID' || batch.status === 'CANCELLED'
                        ? 'text-slate-400 line-through'
                        : 'text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {batch.sourceName} {kg(batch.sourceKg)}
                    {batch.outputName && batch.outputKg !== null ? ` → ${batch.outputName} ${kg(batch.outputKg)}` : ''}
                  </span>
                  <span
                    className={`shrink-0 font-semibold ${
                      batch.status === 'VOID' || batch.status === 'CANCELLED'
                        ? 'text-slate-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {batch.status === 'VOID' ? 'Voided' : batch.status === 'CANCELLED' ? 'Cancelled' : 'Done'}
                  </span>
                </div>
                <div className="text-slate-400">
                  {batch.recordedBy}
                  {batch.reviewedAt ? ' · checked' : finished ? ' · to check' : ''}
                  {batch.status === 'VOID' && batch.voidReason ? ` · ${batch.voidReason}` : ''}
                </div>

                {mine &&
                  (action?.mode === 'edit' ? (
                    <div className="mt-2 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className={miniLabel}>Kilos taken</label>
                          <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            value={editSourceStr}
                            onChange={(e) => setEditSourceStr(e.target.value)}
                            className={fieldInput}
                          />
                        </div>
                        <div>
                          <label className={miniLabel}>Kilos out</label>
                          <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            value={editOutputStr}
                            onChange={(e) => setEditOutputStr(e.target.value)}
                            className={fieldInput}
                          />
                        </div>
                      </div>
                      <input
                        value={reasonStr}
                        onChange={(e) => setReasonStr(e.target.value)}
                        placeholder="Why is it being corrected?"
                        className={fieldInput}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => correctBatch(batch)}
                          className="flex-1 rounded-lg bg-emerald-500 py-2 text-xs font-semibold text-white transition-all duration-150 hover:bg-emerald-600 disabled:opacity-40"
                        >
                          Save correction
                        </button>
                        <button type="button" onClick={() => setRecentAction(null)} className={secondaryButton}>
                          Close
                        </button>
                      </div>
                    </div>
                  ) : action?.mode === 'void' ? (
                    <div className="mt-2 space-y-2">
                      <input
                        value={reasonStr}
                        onChange={(e) => setReasonStr(e.target.value)}
                        placeholder="Why is it being voided?"
                        className={fieldInput}
                      />
                      <div className="flex gap-2">
                        <button type="button" disabled={busy} onClick={() => voidBatch(batch)} className={dangerButton}>
                          Void batch
                        </button>
                        <button type="button" onClick={() => setRecentAction(null)} className={secondaryButton}>
                          Keep it
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setRecentAction({ id: batch.id, mode: 'edit' })
                          setEditSourceStr(String(batch.sourceKg))
                          setEditOutputStr(String(batch.outputKg ?? ''))
                          setReasonStr('')
                        }}
                        className={secondaryButton}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRecentAction({ id: batch.id, mode: 'void' })
                          setReasonStr('')
                        }}
                        className="rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition-all duration-150 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400"
                      >
                        Void
                      </button>
                    </div>
                  ))}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
