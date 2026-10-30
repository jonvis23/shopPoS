import { useEffect, useMemo, useRef, useState } from 'react'
import type { CategoryRecord, ProductRecord } from '../../../../shared/ipc'
import { WHOLESALE_MIN_KG, isLowStock } from '../../../../shared/stock'
import { SearchIcon, XIcon } from '../Icons'

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

// Anything that doesn't start with a letter (digits, symbols) lands under "#".
function letterOf(name: string): string {
  const first = name.trim().charAt(0).toUpperCase()
  return first >= 'A' && first <= 'Z' ? first : '#'
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
  const gridRef = useRef<HTMLDivElement>(null)
  // The card a jump landed on. A new object per tap restarts the flash even if it's the same card.
  const [flash, setFlash] = useState<{ productId: number } | null>(null)
  const query = searchQuery.trim().toLowerCase()

  useEffect(() => {
    if (!flash) return
    const timer = window.setTimeout(() => setFlash(null), 1800)
    return () => window.clearTimeout(timer)
  }, [flash])
  // A search reaches across every category, so the category pills stop claiming
  // the view while one is typed — otherwise "All" would look selected over a filtered list.
  const searching = query !== ''

  // Sorted by name so the letter rail can jump to a place in the list.
  const visible = useMemo(
    () =>
      products
        .filter((product) => {
          if (!product.isActive) return false
          if (!searching && categoryFilterId !== null && product.categoryId !== categoryFilterId) return false
          if (searching && !product.name.toLowerCase().includes(query)) return false
          return true
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    [products, categoryFilterId, searching, query]
  )

  // The first product under each letter, so the rail can scroll straight to it.
  const letterStarts = useMemo(() => {
    const seen = new Set<string>()
    const starts: Array<{ letter: string; productId: number }> = []
    for (const product of visible) {
      const letter = letterOf(product.name)
      if (seen.has(letter)) continue
      seen.add(letter)
      starts.push({ letter, productId: product.id })
    }
    return starts
  }, [visible])

  const jumpTo = (productId: number) => {
    const grid = gridRef.current
    const target = grid?.querySelector<HTMLElement>(`[data-product-id="${productId}"]`)
    if (!grid || !target) return
    grid.scrollTo({ top: target.offsetTop - 12, behavior: 'smooth' })
    setFlash({ productId })
  }

  return (
    // Capped as a share of the row as well as by the saved width, so it gives way on a narrow screen.
    <div
      className="flex h-full shrink-0 flex-col"
      style={{ width: `min(${width}px, 34%)`, minWidth: 200 }}
      data-tour="product-grid"
    >
      <div className="p-3">
        <div className="relative">
          <SearchIcon width={16} height={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-9 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
          {searchQuery !== '' && (
            <button
              type="button"
              onClick={() => {
                onSearchChange('')
                onCategoryChange(null)
              }}
              aria-label="Clear search"
              title="Clear search and show all products"
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <XIcon width={14} height={14} />
            </button>
          )}
        </div>

        <div className="mt-3 flex max-h-[68px] flex-wrap gap-1.5 overflow-y-auto">
          <button
            type="button"
            onClick={() => onCategoryChange(null)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-all duration-150 active:scale-95 ${
              !searching && categoryFilterId === null
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
                !searching && categoryFilterId === category.id
                  ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {category.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* auto-fill rather than a fixed column count: 3 columns at the default pane
            width, more as the cashier drags it wider, without resizing the cards. */}
        <div
          ref={gridRef}
          className="relative grid flex-1 auto-rows-min gap-1.5 overflow-y-auto p-3 pt-0"
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
                data-product-id={product.id}
                onClick={() => onSelectProduct(product.id)}
                title={
                  hasWholesale
                    ? `${product.name} — wholesale price applies from ${WHOLESALE_MIN_KG}kg`
                    : product.name
                }
                className={`rounded-lg border p-2 text-left shadow-sm transition-all duration-150 hover:shadow-md active:scale-[0.98] ${
                  flash?.productId === product.id ? 'letter-start-flash ' : ''
                }${
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

        {letterStarts.length > 0 && (
          // Fills the grid's height and shrinks its letters to fit, so every letter stays on
          // screen at high zoom rather than the bottom ones being cut off.
          <div className="flex min-h-0 w-7 shrink-0 flex-col items-center justify-evenly py-2 pr-1 text-[11px] font-bold text-slate-500 dark:text-slate-400">
            {letterStarts.map(({ letter, productId }) => (
              <button
                key={letter}
                type="button"
                onClick={() => jumpTo(productId)}
                aria-label={`Jump to ${letter}`}
                className="flex h-5 min-h-0 w-5 shrink items-center justify-center rounded-full transition-colors hover:bg-slate-200 hover:text-emerald-600 dark:hover:bg-slate-800 dark:hover:text-emerald-400"
              >
                {letter}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
