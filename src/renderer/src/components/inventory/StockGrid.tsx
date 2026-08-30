import type { CategoryRecord, ProductRecord } from '../../../../shared/ipc'
import type { StockSummary } from '../../../../shared/stock'
import { SearchIcon } from '../Icons'

export interface StockRow {
  product: ProductRecord
  stock: StockSummary
  lowStock: boolean
}

interface StockGridProps {
  rows: StockRow[]
  categories: CategoryRecord[]
  searchQuery: string
  onSearchChange: (value: string) => void
  categoryFilterId: number | null
  onCategoryChange: (id: number | null) => void
  selectedProductId: number | null
  onSelectProduct: (id: number) => void
}

export function StockGrid({
  rows,
  categories,
  searchQuery,
  onSearchChange,
  categoryFilterId,
  onCategoryChange,
  selectedProductId,
  onSelectProduct,
}: StockGridProps) {
  const query = searchQuery.trim().toLowerCase()
  const visible = rows.filter(({ product }) => {
    if (categoryFilterId !== null && product.categoryId !== categoryFilterId) return false
    if (query && !product.name.toLowerCase().includes(query)) return false
    return true
  })

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className="relative">
        <SearchIcon width={16} height={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search stock…"
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        />
      </div>

      <div className="mt-2.5 flex max-h-[68px] flex-wrap gap-1.5 overflow-y-auto">
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

      {/* auto-fill rather than a fixed column count, so the grid keeps finger-sized
          tiles and simply lays out more of them on a wider screen. */}
      <div
        className="mt-2.5 grid flex-1 auto-rows-min gap-1.5 overflow-y-auto pb-1 pr-1"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(124px, 1fr))' }}
      >
        {visible.map(({ product, stock, lowStock }) => {
          const active = product.id === selectedProductId
          return (
            <button
              key={product.id}
              type="button"
              onClick={() => onSelectProduct(product.id)}
              title={`${product.name} — ${stock.label || 'out of stock'}`}
              className={`rounded-lg border p-2 text-left shadow-sm transition-all duration-150 hover:shadow-md active:scale-[0.98] ${
                active
                  ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500 dark:bg-emerald-500/10'
                  : lowStock
                    ? 'border-amber-200 bg-amber-50 hover:border-amber-300 dark:border-amber-500/25 dark:bg-amber-500/10'
                    : 'border-slate-200 bg-white hover:border-emerald-300 dark:border-slate-800 dark:bg-slate-900'
              } ${product.isActive ? '' : 'opacity-55'}`}
            >
              <div className="flex items-start gap-1">
                <div className="line-clamp-2 flex-1 text-xs font-semibold leading-tight text-slate-800 dark:text-slate-100">
                  {product.name}
                </div>
                {lowStock && <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" title="Running out" />}
              </div>
              {/* Bags carry the weight — that's the unit stock is counted in — so
                  they're bold, with the loose kg trailing in a lighter tone. */}
              <div className="mt-1.5 text-[11px] tabular-nums">
                <span className={`font-bold ${lowStock ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-200'}`}>
                  {stock.bagsLabel}
                </span>
                {stock.remainderLabel && (
                  <span className="text-slate-500 dark:text-slate-400"> {stock.remainderLabel}</span>
                )}
              </div>
              {!product.isActive && <div className="mt-0.5 text-[10px] font-medium text-slate-400">inactive</div>}
            </button>
          )
        })}

        {visible.length === 0 && (
          <div className="col-span-full py-10 text-center text-sm text-slate-400">
            {rows.length === 0 ? 'No products yet.' : 'No products match your search.'}
          </div>
        )}
      </div>
    </div>
  )
}
