import { useEffect, useState } from 'react'
import type { DashboardSnapshot, ProductRecord, ReceiptDraft, SaleInput, SaleRecord } from '../../../shared/ipc'
import { formatReceiptNumber, lineSubtotal, resolveQtyFromAmount, resolveUnitPrice, roundQtyKg } from '../../../shared/stock'
import type { ToastState } from '../components/Toast'
import { PlusIcon, XIcon } from '../components/Icons'
import { ProductGrid } from '../components/pos/ProductGrid'
import { ProductDetailPanel } from '../components/pos/ProductDetailPanel'
import type { ActiveField } from '../components/pos/ProductDetailPanel'
import { CartPanel } from '../components/pos/CartPanel'
import { mergeLine, priceLine } from '../components/pos/cartLines'
import type { CartLine } from '../components/pos/CartPanel'
import { CheckoutModal } from '../components/pos/CheckoutModal'
import type { CheckoutPayload } from '../components/pos/CheckoutModal'
import { ReceiptModal } from '../components/pos/ReceiptModal'
import { ResizeHandle } from '../components/pos/ResizeHandle'

interface SaleTab {
  id: number
  items: CartLine[]
  // Set when this tab re-rings a recorded sale: checkout replaces that sale instead of
  // recording a new one. originalKg is what that sale holds, which the edit gives back to stock.
  editOf?: { saleId: number; customerName: string; customerPhone: string; originalKg: Record<number, number> }
}

const LAYOUT_KEY = 'duka-pos-layout'
const DEFAULT_GRID_WIDTH = 420
const DEFAULT_CART_WIDTH = 340
const MIN_GRID_WIDTH = 280
// The product grid auto-fills its columns, so a wider pane simply means more
// columns (3 at the default width, up to ~6 here) rather than wider cards.
const MAX_GRID_WIDTH = 760
const MIN_CART_WIDTH = 280
const MAX_CART_WIDTH = 440

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function loadLayout(): { gridWidth: number; cartWidth: number } {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return {
      gridWidth: clamp(Number(parsed.gridWidth) || DEFAULT_GRID_WIDTH, MIN_GRID_WIDTH, MAX_GRID_WIDTH),
      cartWidth: clamp(Number(parsed.cartWidth) || DEFAULT_CART_WIDTH, MIN_CART_WIDTH, MAX_CART_WIDTH),
    }
  } catch {
    return { gridWidth: DEFAULT_GRID_WIDTH, cartWidth: DEFAULT_CART_WIDTH }
  }
}

interface CurrentSalePageProps {
  snapshot: DashboardSnapshot
  canApproveDiscounts: boolean
  onTabCountChange: (count: number) => void
  onProductsChanged: () => Promise<void> | void
  showToast: (kind: ToastState['kind'], message: string) => void
  /** A recorded sale the admin chose to edit from Transactions. Loaded into a new tab, then cleared. */
  saleToEdit: SaleRecord | null
  onSaleToEditLoaded: () => void
}

export function CurrentSalePage({
  snapshot,
  canApproveDiscounts,
  onTabCountChange,
  onProductsChanged,
  showToast,
  saleToEdit,
  onSaleToEditLoaded,
}: CurrentSalePageProps) {
  const canApplyDiscount = canApproveDiscounts || snapshot.settings.perm_allow_cashier_discount === 'true'
  const [tabs, setTabs] = useState<SaleTab[]>([{ id: 1, items: [] }])
  const [activeTabId, setActiveTabId] = useState(1)
  const [nextTabId, setNextTabId] = useState(2)

  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilterId, setCategoryFilterId] = useState<number | null>(null)

  const [selectedProductId, setSelectedProductId] = useState<number | null>(null)
  const [qtyStr, setQtyStr] = useState('0')
  const [amountStr, setAmountStr] = useState('0')
  const [activeField, setActiveField] = useState<ActiveField>('qty')

  const [gridWidth, setGridWidth] = useState(() => loadLayout().gridWidth)
  const [cartWidth, setCartWidth] = useState(() => loadLayout().cartWidth)

  useEffect(() => {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ gridWidth, cartWidth }))
  }, [gridWidth, cartWidth])

  const resizeGrid = (deltaX: number) => {
    setGridWidth((w) => clamp(w + deltaX, MIN_GRID_WIDTH, MAX_GRID_WIDTH))
  }

  const resizeCart = (deltaX: number) => {
    setCartWidth((w) => clamp(w - deltaX, MIN_CART_WIDTH, MAX_CART_WIDTH))
  }

  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [submittingSale, setSubmittingSale] = useState(false)
  const [receiptDraft, setReceiptDraft] = useState<ReceiptDraft | null>(null)
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    onTabCountChange(tabs.length)
  }, [tabs.length, onTabCountChange])

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0]

  // Stock the open edit gives back on submit, so it counts as available while editing.
  const availableKg = (product: ProductRecord) => product.totalWeightKg + (activeTab.editOf?.originalKg[product.id] ?? 0)
  const selectedProduct = snapshot.products.find((product) => product.id === selectedProductId) ?? null
  const qtyNum = Number(qtyStr) || 0
  const { price: unitPrice, mode: priceMode } = selectedProduct
    ? resolveUnitPrice(
        qtyNum,
        selectedProduct.retailPricePerKg,
        selectedProduct.wholesalePricePerKg,
        selectedProduct.priceBreaks
      )
    : { price: 0, mode: 'retail' as const }

  const resetSelection = () => {
    setSelectedProductId(null)
    setQtyStr('0')
    setAmountStr('0')
    setActiveField('qty')
  }

  // Lines come back at today's catalogue price, not the price on the old receipt: the
  // server prices the replacement from the product list and refuses a stale price.
  useEffect(() => {
    if (!saleToEdit) return
    const originalKg: Record<number, number> = {}
    const items = saleToEdit.items.map((item): CartLine => {
      originalKg[item.productId] = (originalKg[item.productId] ?? 0) + item.quantityKg
      const line: CartLine = {
        productId: item.productId,
        name: item.productName,
        quantityKg: item.quantityKg,
        unitPricePerKg: item.unitPricePerKg,
        subtotal: item.subtotal,
      }
      const product = snapshot.products.find((p) => p.id === item.productId)
      return product ? priceLine(line, item.quantityKg, product) : line
    })
    setTabs((prev) => [
      ...prev,
      {
        id: nextTabId,
        items,
        editOf: {
          saleId: saleToEdit.id,
          customerName: saleToEdit.customerName === 'Walk-in' ? '' : saleToEdit.customerName,
          customerPhone: saleToEdit.customerPhone ?? '',
          originalKg,
        },
      },
    ])
    setActiveTabId(nextTabId)
    setNextTabId((id) => id + 1)
    resetSelection()
    setSearchQuery('')
    setCategoryFilterId(null)
    onSaleToEditLoaded()
  }, [saleToEdit])

  const addTab = () => {
    setTabs((prev) => [...prev, { id: nextTabId, items: [] }])
    setActiveTabId(nextTabId)
    setNextTabId((id) => id + 1)
    resetSelection()
    // A fresh sale starts from the full catalog — the previous customer's search
    // and category filter would otherwise carry over and slow down the next one.
    // (Switching between two in-progress sales deliberately keeps its filters.)
    setSearchQuery('')
    setCategoryFilterId(null)
  }

  const closeTab = (id: number) => {
    const tab = tabs.find((t) => t.id === id)
    if (!tab) return
    if (tabs.length === 1) {
      setTabs([{ id, items: [] }])
      return
    }
    if (tab.items.length > 0 && !window.confirm(`Discard ${tab.items.length} item(s) in this sale?`)) return

    const remaining = tabs.filter((t) => t.id !== id)
    setTabs(remaining)
    if (activeTabId === id) setActiveTabId(remaining[0].id)
  }

  const selectProduct = (id: number) => {
    setSelectedProductId(id)
    setQtyStr('0')
    setAmountStr('0')
    setActiveField('qty')
  }

  const updateQty = (value: string) => {
    setQtyStr(value)
    if (!selectedProduct) return
    const nextQty = Number(value) || 0
    const { price } = resolveUnitPrice(
      nextQty,
      selectedProduct.retailPricePerKg,
      selectedProduct.wholesalePricePerKg,
      selectedProduct.priceBreaks
    )
    setAmountStr(String(lineSubtotal(nextQty, price)))
  }

  const updateAmount = (value: string) => {
    setAmountStr(value)
    if (!selectedProduct) return
    const amtNum = Number(value) || 0
    const { qty } = resolveQtyFromAmount(
      amtNum,
      selectedProduct.retailPricePerKg,
      selectedProduct.wholesalePricePerKg,
      selectedProduct.priceBreaks
    )
    setQtyStr(String(roundQtyKg(qty)))
  }

  // Containers stack: three taps on Gorogoro is three gorogoro, the way the
  // customer asked for it, with no kilo arithmetic in between.
  const addUnit = (kg: number) => {
    setActiveField('qty')
    updateQty(String(roundQtyKg(qtyNum + kg)))
  }

  const handleKeypadKey = (key: string) => {
    const current = activeField === 'qty' ? qtyStr : amountStr
    let next: string
    if (key === 'back') {
      next = current.length <= 1 ? '0' : current.slice(0, -1)
    } else if (key === '.') {
      next = current.includes('.') ? current : `${current}.`
    } else {
      next = current === '0' ? key : current + key
    }
    if (activeField === 'qty') updateQty(next)
    else updateAmount(next)
  }

  const handleAdd = () => {
    if (!selectedProduct) return
    const qty = roundQtyKg(Number(qtyStr) || 0)
    if (qty <= 0 || qty > availableKg(selectedProduct)) return

    const line: CartLine = {
      productId: selectedProduct.id,
      name: selectedProduct.name,
      quantityKg: qty,
      unitPricePerKg: unitPrice,
      subtotal: lineSubtotal(qty, unitPrice),
    }
    // Merging into a line already in the cart can't exceed stock either.
    const inCart = activeTab.items.find((item) => item.productId === selectedProduct.id)?.quantityKg ?? 0
    if (inCart + qty > availableKg(selectedProduct) + 1e-9) {
      showToast('error', `Only ${roundQtyKg(availableKg(selectedProduct) - inCart)} kg more of ${selectedProduct.name} in stock`)
      return
    }
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === activeTabId ? { ...tab, items: mergeLine(tab.items, line, selectedProduct) } : tab
      )
    )
    resetSelection()
    // Back to the full catalogue for the next item, so the cashier never has to clear
    // the search by hand between products.
    setSearchQuery('')
    setCategoryFilterId(null)
  }

  const removeItem = (index: number) => {
    setTabs((prev) =>
      prev.map((tab) => (tab.id === activeTabId ? { ...tab, items: tab.items.filter((_, i) => i !== index) } : tab))
    )
  }

  // Whole-kilo +/- from the cart. Steps down to zero remove the line; the unit
  // price is re-resolved so crossing the wholesale threshold either way retiers.
  const adjustItemQty = (index: number, deltaKg: number) => {
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== activeTabId) return tab
        const target = tab.items[index]
        if (!target) return tab
        const nextQty = roundQtyKg(target.quantityKg + deltaKg)
        if (nextQty <= 0) return { ...tab, items: tab.items.filter((_, i) => i !== index) }
        const product = snapshot.products.find((p) => p.id === target.productId)
        const cappedQty = product ? Math.min(nextQty, availableKg(product)) : nextQty
        if (cappedQty <= 0) return tab
        const items = tab.items.map((item, i) => (i === index ? priceLine(item, cappedQty, product) : item))
        return { ...tab, items }
      })
    )
  }

  const clearCart = () => {
    setTabs((prev) => prev.map((tab) => (tab.id === activeTabId ? { ...tab, items: [] } : tab)))
  }

  const confirmCheckout = async (payload: CheckoutPayload) => {
    if (!snapshot.activeShift) {
      showToast('error', 'No active shift')
      return
    }
    setSubmittingSale(true)
    const editOf = activeTab.editOf
    const saleInput: SaleInput = {
      shiftId: snapshot.activeShift.id,
      customerName: payload.customerName,
      customerPhone: payload.customerPhone || undefined,
      items: activeTab.items.map((item) => ({
        productId: item.productId,
        quantityKg: item.quantityKg,
        unitPricePerKg: item.unitPricePerKg,
      })),
      cashPaid: payload.cashPaid,
      mpesaPaid: payload.mpesaPaid,
      mpesaRef: payload.mpesaRef || undefined,
      discount: payload.discount,
      debtRepayment: payload.debtRepayment ?? undefined,
    }
    try {
      const sale = editOf
        ? await window.electronAPI.editSale({ saleId: editOf.saleId, sale: saleInput })
        : await window.electronAPI.recordSale(saleInput)
      const draft = await window.electronAPI.buildReceiptDraft(sale.id)
      setReceiptDraft(draft)
      setCheckoutOpen(false)
      if (snapshot.settings.auto_print_receipt === 'true') {
        window.electronAPI.printReceipt(draft).catch(() => undefined)
      }
      setTabs((prev) =>
        prev.map((tab) => (tab.id === activeTabId ? { ...tab, items: [], editOf: undefined } : tab))
      )
      await onProductsChanged()
      const doneLabel = editOf ? 'Sale updated' : 'Sale recorded'
      showToast(
        'success',
        payload.debtRepayment
          ? `${doneLabel} · KES ${payload.debtRepayment.amount.toLocaleString('en-KE')} taken off ${sale.customerName}'s debt`
          : doneLabel
      )
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not record sale')
    } finally {
      setSubmittingSale(false)
    }
  }

  const printReceipt = async () => {
    if (!receiptDraft) return
    setPrinting(true)
    try {
      const result = await window.electronAPI.printReceipt(receiptDraft)
      showToast('success', result.simulated ? 'Receipt printed (simulated — no printer selected)' : 'Receipt printed')
      setReceiptDraft(null)
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not print receipt')
    } finally {
      setPrinting(false)
    }
  }

  const cartTotal = activeTab.items.reduce((sum, item) => sum + item.subtotal, 0)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTabId(tab.id)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 active:scale-[0.98] ${
              tab.id === activeTabId
                ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {tab.editOf ? `Edit ${formatReceiptNumber(tab.editOf.saleId)}` : `Sale ${index + 1}`}
            {tab.items.length > 0 && (
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] tabular-nums ${
                  tab.id === activeTabId ? 'bg-white/25' : 'bg-emerald-500 text-white'
                }`}
              >
                {tab.items.length}
              </span>
            )}
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation()
                closeTab(tab.id)
              }}
              className="opacity-60 transition-opacity hover:opacity-100"
            >
              <XIcon width={12} height={12} />
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={addTab}
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-sm shadow-emerald-500/30 transition-all duration-150 hover:bg-emerald-600 active:scale-95"
          aria-label="New sale"
        >
          <PlusIcon width={14} height={14} />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <ProductGrid
          width={gridWidth}
          products={snapshot.products}
          categories={snapshot.categories}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          categoryFilterId={categoryFilterId}
          onCategoryChange={setCategoryFilterId}
          selectedProductId={selectedProductId}
          onSelectProduct={selectProduct}
        />
        <ResizeHandle onResize={resizeGrid} />
        <ProductDetailPanel
          product={selectedProduct}
          priceMode={priceMode}
          qtyStr={qtyStr}
          amountStr={amountStr}
          activeField={activeField}
          onFocusField={setActiveField}
          onQtyChange={updateQty}
          onAmountChange={updateAmount}
          onPreset={(kg) => updateQty(String(kg))}
          onAddUnit={addUnit}
          onKeypadKey={handleKeypadKey}
          onAdd={handleAdd}
          onBack={resetSelection}
        />
        <ResizeHandle onResize={resizeCart} />
        <CartPanel
          width={cartWidth}
          items={activeTab.items}
          onRemove={removeItem}
          onAdjustQty={adjustItemQty}
          onCheckout={() => setCheckoutOpen(true)}
          onClear={clearCart}
        />
      </div>

      {checkoutOpen && (
        <CheckoutModal
          subtotal={cartTotal}
          submitting={submittingSale}
          canApplyDiscount={canApplyDiscount}
          initialCustomerName={activeTab.editOf?.customerName}
          initialCustomerPhone={activeTab.editOf?.customerPhone}
          onConfirm={confirmCheckout}
          onClose={() => setCheckoutOpen(false)}
        />
      )}
      {receiptDraft && (
        <ReceiptModal
          draft={receiptDraft}
          printing={printing}
          printerConfigured={Boolean(snapshot.settings.printer_device_name)}
          onPrint={printReceipt}
          onClose={() => setReceiptDraft(null)}
        />
      )}
    </div>
  )
}
