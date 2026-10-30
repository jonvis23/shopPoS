import { useState } from 'react'
import type { FormEvent } from 'react'
import type { DashboardSnapshot, ProductInput, ProductPriceBreak, ProductRecord, SaleUnit } from '../../../shared/ipc'
import type { ToastState } from '../components/Toast'
import { AlertIcon, LockIcon, PlusIcon, XIcon } from '../components/Icons'
import { FormattedNumberInput } from '../components/FormattedNumberInput'
import { AddStockModal } from '../components/inventory/AddStockModal'
import { CountDeliveryModal } from '../components/inventory/CountDeliveryModal'
import { RestockDrawer } from '../components/inventory/RestockDrawer'
import { ProcessingDrawer } from '../components/inventory/ProcessingDrawer'
import { DomesticConsumptionDrawer } from '../components/inventory/DomesticConsumptionDrawer'
import { StockGrid } from '../components/inventory/StockGrid'
import type { StockRow } from '../components/inventory/StockGrid'
import { StockDetailPanel } from '../components/inventory/StockDetailPanel'
import { StockToolsMenu } from '../components/inventory/StockToolsMenu'
import { StockAttentionPanel } from '../components/inventory/StockAttentionPanel'
import { LOW_STOCK_BAGS, isLowStock, summarizeStock, toCurrency } from '../../../shared/stock'

interface InventoryPageProps {
  snapshot: DashboardSnapshot
  canManageProducts: boolean
  canManageStock: boolean
  onProductsChanged: () => Promise<void> | void
  onCategoriesChanged: () => Promise<void> | void
  showToast: (kind: ToastState['kind'], message: string) => void
}

// The form keeps its number fields as raw strings while typing. Round-tripping
// each keystroke through Number() drops a trailing "." the instant it is typed,
// so "0.5" can never be entered; parsing is deferred to submit instead.
interface ProductForm {
  name: string
  categoryId: number | null
  weightPerBag: string
  totalWeightKg: string
  buyingPricePerBag: string
  retailPricePerKg: string
  wholesalePricePerKg: string
  minStockAlertKg: string
  isActive: boolean
  isMillable: boolean
  isMillOutput: boolean
}

const blankProduct = (): ProductForm => ({
  name: '',
  categoryId: null,
  weightPerBag: '90',
  totalWeightKg: '0',
  buyingPricePerBag: '0',
  retailPricePerKg: '0',
  wholesalePricePerKg: '0',
  minStockAlertKg: '100',
  isActive: true,
  isMillable: false,
  isMillOutput: false,
})

function toProductInput(form: ProductForm): ProductInput {
  return {
    name: form.name,
    categoryId: form.categoryId,
    weightPerBag: Number(form.weightPerBag) || 0,
    totalWeightKg: Number(form.totalWeightKg) || 0,
    buyingPricePerBag: Number(form.buyingPricePerBag) || 0,
    retailPricePerKg: Number(form.retailPricePerKg) || 0,
    wholesalePricePerKg: Number(form.wholesalePricePerKg) || 0,
    minStockAlertKg: Number(form.minStockAlertKg) || 0,
    isActive: form.isActive,
    isMillable: form.isMillable,
    isMillOutput: form.isMillOutput,
  }
}

export function InventoryPage({
  snapshot,
  canManageProducts,
  canManageStock,
  onProductsChanged,
  onCategoriesChanged,
  showToast,
}: InventoryPageProps) {
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<ProductForm>(blankProduct())
  const [priceBreaks, setPriceBreaks] = useState<ProductPriceBreak[]>([])
  // Kept as strings while editing for the same reason as ProductForm: "2." must survive a keystroke.
  const [saleUnits, setSaleUnits] = useState<Array<{ name: string; kg: string }>>([])
  const [saving, setSaving] = useState(false)

  const [selectedProductId, setSelectedProductId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilterId, setCategoryFilterId] = useState<number | null>(null)

  const [restockProductId, setRestockProductId] = useState<number | null>(null)
  const [processingOpen, setProcessingOpen] = useState(false)
  const [addStockOpen, setAddStockOpen] = useState(false)
  const [countDeliveryOpen, setCountDeliveryOpen] = useState(false)
  // Shared by both stock logs in the detail panel. Deliveries and take-home are
  // separate queries but always shown together, so one key refetches both rather
  // than each carrying its own.
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0)
  const [consumptionProductId, setConsumptionProductId] = useState<number | null>(null)

  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')

  const openCreate = () => {
    setEditingId(null)
    setForm(blankProduct())
    setPriceBreaks([])
    setSaleUnits([])
    setFormOpen(true)
  }

  const openEdit = (productId: number) => {
    const product = snapshot.products.find((p) => p.id === productId)
    if (!product) return
    setEditingId(productId)
    setForm({
      name: product.name,
      categoryId: product.categoryId,
      weightPerBag: String(product.weightPerBag),
      totalWeightKg: String(product.totalWeightKg),
      buyingPricePerBag: String(product.buyingPricePerBag),
      retailPricePerKg: String(product.retailPricePerKg),
      wholesalePricePerKg: String(product.wholesalePricePerKg),
      minStockAlertKg: String(product.minStockAlertKg),
      isActive: product.isActive,
      isMillable: product.isMillable,
      isMillOutput: product.isMillOutput,
    })
    setPriceBreaks(product.priceBreaks)
    setSaleUnits(product.saleUnits.map((u) => ({ name: u.name, kg: String(u.kg) })))
    setFormOpen(true)
  }

  const submitProduct = async (event: FormEvent) => {
    event.preventDefault()
    const units: SaleUnit[] = saleUnits.map((u) => ({ name: u.name.trim(), kg: Number(u.kg) || 0 }))
    if (units.some((u) => (u.name && u.kg <= 0) || (!u.name && u.kg > 0))) {
      showToast('error', 'Each container needs both a name and its weight in kg')
      return
    }
    const input: ProductInput = { ...toProductInput(form), saleUnits: units.filter((u) => u.name && u.kg > 0) }
    if (input.wholesalePricePerKg > 0 && input.wholesalePricePerKg > input.retailPricePerKg) {
      showToast('error', 'Wholesale price cannot be higher than retail price')
      return
    }
    setSaving(true)
    try {
      const productId = editingId
        ? (await window.electronAPI.updateProduct(editingId, input)).id
        : (await window.electronAPI.createProduct(input)).id
      // Always sent, even empty — clears any breaks left over from removing
      // every row in the editor below.
      await window.electronAPI.setProductPriceBreaks(productId, priceBreaks)
      showToast('success', editingId ? 'Product updated' : 'Product created')
      await onProductsChanged()
      setFormOpen(false)
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not save product')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (productId: number, isActive: boolean) => {
    try {
      await window.electronAPI.setProductActive(productId, !isActive)
      await onProductsChanged()
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not update product')
    }
  }

  const [deleteTarget, setDeleteTarget] = useState<ProductRecord | null>(null)
  const [deleting, setDeleting] = useState(false)

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const removed = await window.electronAPI.deleteProduct(deleteTarget.id)
      showToast('success', `"${removed.name}" removed`)
      setDeleteTarget(null)
      setSelectedProductId(null)
      await onProductsChanged()
    } catch (error) {
      // The main process refuses when the product has sales/restock history and
      // explains why — surface that verbatim rather than a generic failure.
      showToast('error', error instanceof Error ? error.message : 'Could not remove product')
    } finally {
      setDeleting(false)
    }
  }

  const handleStockMoved = async () => {
    await onProductsChanged()
    setHistoryRefreshKey((k) => k + 1)
  }

  const [printingPriceList, setPrintingPriceList] = useState(false)

  const printPriceList = async () => {
    setPrintingPriceList(true)
    try {
      const result = await window.electronAPI.printPriceList()
      showToast(
        'success',
        result.simulated ? 'Price list printed (simulated — no printer selected)' : 'Price list sent to printer'
      )
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not print price list')
    } finally {
      setPrintingPriceList(false)
    }
  }

  // What needs refilling goes to the front of the grid, emptiest first, so the
  // owner sees it without hunting. Deactivated products sort to the very end and
  // never count as running out — they aren't being sold, so there is nothing to
  // go and buy.
  const rows: StockRow[] = snapshot.products
    .map((product, index) => ({
      product,
      index,
      stock: summarizeStock(product.totalWeightKg, product.weightPerBag),
      lowStock:
        product.isActive && isLowStock(product.totalWeightKg, product.weightPerBag, product.minStockAlertKg),
    }))
    .sort((a, b) => {
      if (a.product.isActive !== b.product.isActive) return a.product.isActive ? -1 : 1
      if (a.lowStock !== b.lowStock) return a.lowStock ? -1 : 1
      if (a.lowStock && b.lowStock) return a.stock.totalKg - b.stock.totalKg
      return a.index - b.index
    })
    .map(({ product, stock, lowStock }) => ({ product, stock, lowStock }))

  // Named rather than counted — "Maize Yellow is running out" tells the owner what
  // to go and buy; "3 under 5 bags" makes them go looking. Long lists collapse to
  // a couple of names plus a count, with the rest in the tooltip.
  const lowStockNames = rows.filter((row) => row.lowStock).map((row) => row.product.name)
  const runningOutLabel = (() => {
    if (lowStockNames.length === 0) return null
    const verb = lowStockNames.length === 1 ? 'is' : 'are'
    if (lowStockNames.length <= 2) return `${lowStockNames.join(' and ')} ${verb} running out`
    return `${lowStockNames.slice(0, 2).join(', ')} and ${lowStockNames.length - 2} more are running out`
  })()

  const selectedRow = rows.find((row) => row.product.id === selectedProductId) ?? null

  const submitCategory = async (event: FormEvent) => {
    event.preventDefault()
    if (!newCategoryName.trim()) return
    try {
      await window.electronAPI.createCategory(newCategoryName)
      setNewCategoryName('')
      setCategoryModalOpen(false)
      await onCategoriesChanged()
      showToast('success', 'Category added')
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not create category')
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">Stock</h2>
          {runningOutLabel && (
            <span
              title={`Under ${LOW_STOCK_BAGS} bag: ${lowStockNames.join(', ')}`}
              className="truncate rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
            >
              {runningOutLabel}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setAddStockOpen(true)}
            disabled={!snapshot.activeShift}
            title={
              snapshot.activeShift
                ? 'Log a delivery — several products at once, in bags or kilograms. This is what adds to what the shop has.'
                : 'Open a shift first'
            }
            className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white shadow-sm shadow-emerald-500/30 transition-all duration-150 hover:bg-emerald-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <PlusIcon width={14} height={14} /> Add Stock
          </button>
          <button
            type="button"
            data-tour="process-stock"
            onClick={() => setProcessingOpen(true)}
            disabled={!snapshot.activeShift}
            title="Clean and sort stock for display, or send it to posho and record what comes back. Needs an open shift."
            className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 transition-all duration-150 hover:bg-slate-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-800 dark:text-slate-300"
          >
            Process stock
          </button>
          {canManageProducts && (
            <button
              type="button"
              data-tour="new-product"
              onClick={openCreate}
              title="Create a product the shop does not stock yet — name, prices, bag size and alert level."
              className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 transition-all duration-150 hover:bg-slate-200 active:scale-[0.98] dark:bg-slate-800 dark:text-slate-300"
            >
              <PlusIcon width={14} height={14} /> New product
            </button>
          )}
          <StockToolsMenu
            printingPriceList={printingPriceList}
            hasActiveShift={Boolean(snapshot.activeShift)}
            onCountDelivery={() => setCountDeliveryOpen(true)}
            onAddCategory={() => setCategoryModalOpen(true)}
            onPrintPriceList={printPriceList}
          />
        </div>
      </div>

      {canManageStock && <StockAttentionPanel onStockChanged={handleStockMoved} showToast={showToast} />}

      <div className="mt-3 flex min-h-0 flex-1 gap-3">
        <StockGrid
          rows={rows}
          categories={snapshot.categories}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          categoryFilterId={categoryFilterId}
          onCategoryChange={setCategoryFilterId}
          selectedProductId={selectedProductId}
          onSelectProduct={(id) => setSelectedProductId((current) => (current === id ? null : id))}
        />
        <div className="w-[22rem] shrink-0 xl:w-[24rem]">
          <StockDetailPanel
            row={selectedRow}
            canManageProducts={canManageProducts}
            hasActiveShift={Boolean(snapshot.activeShift)}
            historyRefreshKey={historyRefreshKey}
            onRestock={() => selectedRow && setRestockProductId(selectedRow.product.id)}
            onTakeHome={() => selectedRow && setConsumptionProductId(selectedRow.product.id)}
            onEdit={() => selectedRow && openEdit(selectedRow.product.id)}
            onToggleActive={() => selectedRow && toggleActive(selectedRow.product.id, selectedRow.product.isActive)}
            onRemove={() => selectedRow && setDeleteTarget(selectedRow.product)}
          />
        </div>
      </div>

      {categoryModalOpen && (
        <div className="osk-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <form
            onSubmit={submitCategory}
            className="w-full max-w-sm rounded-2xl border border-slate-200/60 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Add category</h3>
              <button
                type="button"
                onClick={() => setCategoryModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <XIcon width={18} height={18} />
              </button>
            </div>
            <input
              autoFocus
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="e.g. Pulses"
              className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            <button
              type="submit"
              disabled={!newCategoryName.trim()}
              className="mt-4 w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-500/30 transition-all duration-150 hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-50"
            >
              Add category
            </button>
          </form>
        </div>
      )}

      {formOpen && (
        <div className="osk-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <form onSubmit={submitProduct} className="w-full max-w-md rounded-2xl border border-slate-200/60 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{editingId ? 'Edit product' : 'New product'}</h3>
              <button type="button" onClick={() => setFormOpen(false)} className="text-slate-400 hover:text-slate-600">
                <XIcon width={18} height={18} />
              </button>
            </div>

            <label className="mt-3 block text-xs font-semibold text-slate-500 dark:text-slate-400">Name</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />

            <label className="mt-3 block text-xs font-semibold text-slate-500 dark:text-slate-400">Category</label>
            <select
              value={form.categoryId ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value ? Number(e.target.value) : null }))}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="">Uncategorised</option>
              {snapshot.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">Weight per bag (kg)</label>
                <FormattedNumberInput
                  value={form.weightPerBag}
                  onChange={(raw) => setForm((f) => ({ ...f, weightPerBag: raw }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">Current stock (kg)</label>
                <FormattedNumberInput
                  value={form.totalWeightKg}
                  onChange={(raw) => setForm((f) => ({ ...f, totalWeightKg: raw }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              {canManageProducts && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">Buying price/bag</label>
                  <FormattedNumberInput
                    required
                    value={form.buyingPricePerBag}
                    onChange={(raw) => setForm((f) => ({ ...f, buyingPricePerBag: raw }))}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">Min stock alert (kg)</label>
                <FormattedNumberInput
                  value={form.minStockAlertKg}
                  onChange={(raw) => setForm((f) => ({ ...f, minStockAlertKg: raw }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">Retail price/kg</label>
                <FormattedNumberInput
                  required
                  value={form.retailPricePerKg}
                  onChange={(raw) => setForm((f) => ({ ...f, retailPricePerKg: raw }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">Wholesale price/kg</label>
                <FormattedNumberInput
                  value={form.wholesalePricePerKg}
                  onChange={(raw) => setForm((f) => ({ ...f, wholesalePricePerKg: raw }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>

            {/* Posho is the shop's own milling. A product ticked here can be sent to posho,
                and one ticked here can come back from it. Neither changes its stock or price. */}
            <div className="mt-3 space-y-2 rounded-lg border border-slate-200 p-2.5 dark:border-slate-700">
              <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={form.isMillable}
                  onChange={(e) => setForm((f) => ({ ...f, isMillable: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 accent-emerald-500"
                />
                <span>
                  <span className="font-semibold">Posho</span>
                  <span className="block text-xs text-slate-400">Can be sent to posho (e.g. maize, sorghum, wimbi).</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={form.isMillOutput}
                  onChange={(e) => setForm((f) => ({ ...f, isMillOutput: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 accent-emerald-500"
                />
                <span>
                  <span className="font-semibold">Processed into</span>
                  <span className="block text-xs text-slate-400">Comes back from posho (e.g. uji, mudokoi).</span>
                </span>
              </label>
            </div>

            {/* Always shown (a shopkeeper decides which products need a fixed
                small-weight price, not a hardcoded list), but editing it is a
                pricing decision like Retail/Wholesale above, so it needs the
                same Admin gate as the rest of this form. */}
            <div className="mt-3 rounded-lg border border-slate-200 p-2.5 dark:border-slate-700">
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">Fraction prices</label>
              <p className="mt-0.5 text-[11px] text-slate-400">
                A fixed price for a specific small quantity — a quarter kilo isn&apos;t a quarter of the per-kg price.
                Any quantity not listed here still uses Retail price/kg × quantity as normal.
              </p>

              {canManageProducts ? (
                <>
                  {priceBreaks.length > 0 && (
                    <div className="mt-2 flex flex-col gap-1.5">
                      {priceBreaks.map((brk, index) => (
                        <div key={index} className="flex items-center gap-1.5">
                          <FormattedNumberInput
                            value={String(brk.quantityKg)}
                            placeholder="Qty (kg)"
                            onChange={(raw) =>
                              setPriceBreaks((list) =>
                                list.map((b, i) => (i === index ? { ...b, quantityKg: Number(raw) || 0 } : b))
                              )
                            }
                            className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                          />
                          <span className="text-xs text-slate-400">=</span>
                          <FormattedNumberInput
                            value={String(brk.price)}
                            placeholder="Price (KES)"
                            onChange={(raw) =>
                              setPriceBreaks((list) => list.map((b, i) => (i === index ? { ...b, price: Number(raw) || 0 } : b)))
                            }
                            className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={() => setPriceBreaks((list) => list.filter((_, i) => i !== index))}
                            className="shrink-0 text-slate-300 transition-colors hover:text-red-500"
                            aria-label="Remove fraction price"
                          >
                            <XIcon width={14} height={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[
                      { quantityKg: 0.25, label: '+ ¼' },
                      { quantityKg: 0.5, label: '+ ½' },
                      { quantityKg: 0.75, label: '+ ¾' },
                    ]
                      .filter(({ quantityKg }) => !priceBreaks.some((b) => b.quantityKg === quantityKg))
                      .map(({ quantityKg, label }) => (
                        <button
                          key={quantityKg}
                          type="button"
                          onClick={() => setPriceBreaks((list) => [...list, { quantityKg, price: 0 }])}
                          className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 transition-all duration-150 hover:bg-emerald-100 active:scale-[0.98] dark:bg-emerald-500/10 dark:text-emerald-400"
                        >
                          {label}
                        </button>
                      ))}
                    <button
                      type="button"
                      onClick={() => setPriceBreaks((list) => [...list, { quantityKg: 0, price: 0 }])}
                      className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 transition-all duration-150 hover:bg-slate-200 active:scale-[0.98] dark:bg-slate-800 dark:text-slate-300"
                    >
                      + Custom
                    </button>
                  </div>
                </>
              ) : priceBreaks.length > 0 ? (
                <div className="mt-2 flex flex-col gap-1">
                  {priceBreaks.map((brk, index) => (
                    <div
                      key={index}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400"
                    >
                      {brk.quantityKg} kg = {toCurrency(brk.price)}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-1 text-xs text-slate-400">
                  <LockIcon width={12} height={12} /> Ask an admin with the product rights to set fraction prices.
                </div>
              )}
            </div>

            {/* Same Admin gate as fraction prices: how much a gorogoro holds is
                part of what the customer pays for it. */}
            <div className="mt-3 rounded-lg border border-slate-200 p-2.5 dark:border-slate-700">
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">Containers (gorogoro, debe…)</label>
              <p className="mt-0.5 text-[11px] text-slate-400">
                Weigh one level container of this product and enter it here. The till then shows a button for it, and
                each tap adds one.
              </p>

              {canManageProducts ? (
                <>
                  {saleUnits.length > 0 && (
                    <div className="mt-2 flex flex-col gap-1.5">
                      {saleUnits.map((unit, index) => (
                        <div key={index} className="flex items-center gap-1.5">
                          <input
                            value={unit.name}
                            placeholder="Name"
                            onChange={(e) =>
                              setSaleUnits((list) => list.map((u, i) => (i === index ? { ...u, name: e.target.value } : u)))
                            }
                            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                          />
                          <span className="text-xs text-slate-400">=</span>
                          <FormattedNumberInput
                            value={unit.kg}
                            placeholder="kg"
                            onChange={(raw) =>
                              setSaleUnits((list) => list.map((u, i) => (i === index ? { ...u, kg: raw } : u)))
                            }
                            className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                          />
                          <span className="text-xs text-slate-400">kg</span>
                          <button
                            type="button"
                            onClick={() => setSaleUnits((list) => list.filter((_, i) => i !== index))}
                            className="shrink-0 text-slate-300 transition-colors hover:text-red-500"
                            aria-label="Remove container"
                          >
                            <XIcon width={14} height={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {['Gorogoro', 'Kasuku', 'Debe']
                      .filter((name) => !saleUnits.some((u) => u.name.trim().toLowerCase() === name.toLowerCase()))
                      .map((name) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => setSaleUnits((list) => [...list, { name, kg: '' }])}
                          className="rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 transition-all duration-150 hover:bg-amber-100 active:scale-[0.98] dark:bg-amber-500/10 dark:text-amber-300"
                        >
                          + {name}
                        </button>
                      ))}
                    <button
                      type="button"
                      onClick={() => setSaleUnits((list) => [...list, { name: '', kg: '' }])}
                      className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 transition-all duration-150 hover:bg-slate-200 active:scale-[0.98] dark:bg-slate-800 dark:text-slate-300"
                    >
                      + Custom
                    </button>
                  </div>
                </>
              ) : saleUnits.length > 0 ? (
                <div className="mt-2 flex flex-col gap-1">
                  {saleUnits.map((unit, index) => (
                    <div
                      key={index}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400"
                    >
                      1 {unit.name} = {unit.kg} kg
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-1 text-xs text-slate-400">
                  <LockIcon width={12} height={12} /> Ask an admin with the product rights to set containers.
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={saving}
              className="mt-4 w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-500/30 transition-all duration-150 hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-50"
            >
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create product'}
            </button>
          </form>
        </div>
      )}

      {deleteTarget && (
        <div className="osk-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200/60 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-500 dark:bg-red-950/40">
                <AlertIcon width={18} height={18} />
              </span>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Remove {deleteTarget.name}?</h3>
            </div>
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              This permanently deletes the product from the catalog. It can&apos;t be undone.
            </p>
            <p className="mt-2 text-xs text-slate-400">
              If it has ever been sold, restocked or taken home it will be kept instead — deactivate it to hide it
              from the Sell screen without touching those records.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-xl bg-slate-100 py-2.5 text-sm font-semibold text-slate-600 transition-all duration-150 hover:bg-slate-200 active:scale-[0.98] dark:bg-slate-800 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-red-500/30 transition-all duration-150 hover:bg-red-600 active:scale-[0.98] disabled:opacity-50"
              >
                {deleting ? 'Removing…' : 'Yes, remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {restockProductId !== null && snapshot.activeShift && (
        <RestockDrawer
          productId={restockProductId}
          products={snapshot.products}
          shiftId={snapshot.activeShift.id}
          onClose={() => setRestockProductId(null)}
          onSubmitted={handleStockMoved}
          showToast={showToast}
        />
      )}

      {processingOpen && snapshot.activeShift && (
        <ProcessingDrawer
          products={snapshot.products}
          canManageProducts={canManageProducts}
          shiftId={snapshot.activeShift.id}
          shiftStartedAt={snapshot.activeShift.startTime}
          onClose={() => setProcessingOpen(false)}
          onChanged={handleStockMoved}
          showToast={showToast}
        />
      )}

      {addStockOpen && snapshot.activeShift && (
        <AddStockModal
          products={snapshot.products}
          shiftId={snapshot.activeShift.id}
          onClose={() => setAddStockOpen(false)}
          onSubmitted={handleStockMoved}
          showToast={showToast}
        />
      )}

      {countDeliveryOpen && snapshot.activeShift && (
        <CountDeliveryModal
          products={snapshot.products}
          shiftId={snapshot.activeShift.id}
          onClose={() => setCountDeliveryOpen(false)}
          onSubmitted={handleStockMoved}
          showToast={showToast}
        />
      )}

      {consumptionProductId !== null && snapshot.activeShift && (
        <DomesticConsumptionDrawer
          productId={consumptionProductId}
          products={snapshot.products}
          shiftId={snapshot.activeShift.id}
          onClose={() => setConsumptionProductId(null)}
          onSubmitted={handleStockMoved}
          showToast={showToast}
        />
      )}
    </div>
  )
}
