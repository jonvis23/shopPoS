import { useState } from 'react'
import type { ProductRecord } from '../../../../shared/ipc'
import { SearchIcon } from '../Icons'

interface SearchProductListProps {
  products: ProductRecord[]
  selectedId: number | ''
  onSelect: (id: number) => void
  /** Shown when there is nothing to pick at all, as opposed to nothing matching the search. */
  emptyText: string
}

const kg = (value: number) => `${Number(value.toFixed(2)).toLocaleString('en-KE')} kg`

// A search box over a list of products. Once one is picked the list folds to that product
// alone, so the pane stays short; Change opens the list again.
export function SearchProductList({ products, selectedId, onSelect, emptyText }: SearchProductListProps) {
  const [query, setQuery] = useState('')
  const [changing, setChanging] = useState(false)
  const selected = products.find((product) => product.id === selectedId) ?? null

  if (selected && !changing) {
    return (
      <div className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-emerald-500 bg-emerald-50 px-3 py-2 text-sm dark:bg-emerald-500/10">
        <span className="min-w-0 truncate font-semibold text-slate-800 dark:text-slate-100">{selected.name}</span>
        <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums text-slate-500 dark:text-slate-400">
          <span className="font-bold text-emerald-600 dark:text-emerald-400">R {selected.retailPricePerKg.toFixed(0)}</span>
          {selected.wholesalePricePerKg > 0 && (
            <span className="font-semibold text-amber-600 dark:text-amber-400">W {selected.wholesalePricePerKg.toFixed(0)}</span>
          )}
          {kg(selected.totalWeightKg)}
          <button
            type="button"
            onClick={() => setChanging(true)}
            className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
          >
            Change
          </button>
        </span>
      </div>
    )
  }

  const q = query.trim().toLowerCase()
  const shown = products.filter((product) => !q || product.name.toLowerCase().includes(q))

  return (
    <div>
      <div className="relative mt-1">
        <SearchIcon width={14} height={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products…"
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        />
      </div>
      <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
        {shown.map((product) => {
          const picked = product.id === selectedId
          return (
            <li key={product.id}>
              <button
                type="button"
                aria-pressed={picked}
                onClick={() => {
                  onSelect(product.id)
                  setChanging(false)
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-left text-sm transition-colors ${
                  picked
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10'
                    : 'border-slate-200 hover:border-emerald-300 dark:border-slate-700'
                }`}
              >
                <span className="min-w-0 truncate font-medium text-slate-800 dark:text-slate-100">{product.name}</span>
                <span className="flex shrink-0 items-baseline gap-2 text-[11px] tabular-nums">
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">R {product.retailPricePerKg.toFixed(0)}</span>
                  {product.wholesalePricePerKg > 0 && (
                    <span className="font-semibold text-amber-600 dark:text-amber-400">W {product.wholesalePricePerKg.toFixed(0)}</span>
                  )}
                  <span className="text-slate-400">{kg(product.totalWeightKg)}</span>
                </span>
              </button>
            </li>
          )
        })}
        {shown.length === 0 && (
          <li className="py-3 text-center text-xs text-slate-400">
            {products.length === 0 ? emptyText : 'No product matches that search.'}
          </li>
        )}
      </ul>
    </div>
  )
}
