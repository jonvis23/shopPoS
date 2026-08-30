import type { CategoryRecord, ProductRecord } from '../../../../shared/ipc'
import { WHOLESALE_MIN_KG, isLowStock } from '../../../../shared/stock'
import { SearchIcon } from '../Icons'

interface ProductGridProps {
  width: number
  products: ProductRecord[]
  categories: CategoryRecord[]
  searchQuery: string
  onSearchChange: (value: string) => void
  categoryFilterId: number | null
  onCategoryChange: (id: number | null) => void
  selectedProductId: number | null
  onSelectProduct: (id: number) => void
}

export function ProductGrid({
  width,
  products,
  categories,
  searchQuery,
  onSearchChange,
  categoryFilterId,
  onCategoryChange,
  selectedProductId,
  onSelectProduct,
}: ProductGridProps) {
  const query = searchQuery.trim().toLowerCase()
  const visible = products.filter((product) => {
    if (!product.isActive) return false
    if (categoryFilterId !== null && product.categoryId !== categoryFilterId) return false
    if (query && !product.name.toLowerCase().includes(query)) return false
    return true
  })

  return (
    <div className="flex h-full shrink-0 flex-col" style={{ width }}>
      <div className="p-3">
        <div className="relative">
          <SearchIcon width={16} height={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>

        <div className="mt-3 flex max-h-[68px] flex-wrap gap-1.5 overflow-y-auto">
          <button
            type="button"
            onClick={() => onCategoryChange(null)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-all duration-150 active:scale-95 ${
              categoryFilterId === null
                ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            All
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => onCategoryChange(category.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all duration-150 active:scale-95 ${
                categoryFilterId === category.id
                  ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {category.name}
            </button>
          ))}
        </div>
      </div>

      {/* auto-fill rather than a fixed column count: 3 columns at the default pane
          width, more as the cashier drags it wider, without resizing the cards. */}
      <div
        className="grid flex-1 auto-rows-min gap-1.5 overflow-y-auto p-3 pt-0"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))' }}
      >
        {visible.map((product) => {
          const active = product.id === selectedProductId
          const lowStock = isLowStock(product.totalWeightKg, product.weightPerBag, product.minStockAlertKg)
          const hasWholesale = product.wholesalePricePerKg > 0
          return (
            <button
              key={product.id}
              type="button"
              onClick={() => onSelectProduct(product.id)}
              title={
                hasWholesale
                  ? `${product.name} — wholesale price applies from ${WHOLESALE_MIN_KG}kg`
                  : product.name
              }
              className={`rounded-lg border p-2 text-left shadow-sm transition-all duration-150 hover:shadow-md active:scale-[0.98] ${
                active
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10'
                  : 'border-slate-200 bg-white hover:border-emerald-300 dark:border-slate-800 dark:bg-slate-900'
              }`}
            >
              <div className="flex items-start gap-1">
                <div className="line-clamp-2 flex-1 text-xs font-semibold leading-tight text-slate-800 dark:text-slate-100">
                  {product.name}
                </div>
                {lowStock && <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" title="Low stock" />}
              </div>
              <div className="mt-1.5 flex items-baseline justify-between gap-1 text-[11px] tabular-nums">
                {hasWholesale && (
                  <span className="font-semibold text-amber-600 dark:text-amber-400">
                    W {product.wholesalePricePerKg.toFixed(0)}
                  </span>
                )}
                <span className="ml-auto font-bold text-emerald-600 dark:text-emerald-400">
                  R {product.retailPricePerKg.toFixed(0)}
                </span>
              </div>
            </button>
          )
        })}

        {visible.length === 0 && (
          <div className="col-span-full py-10 text-center text-sm text-slate-400">No products match your search.</div>
        )}
      </div>
    </div>
  )
}
