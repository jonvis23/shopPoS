import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties } from 'react'
import type { ProductRecord } from '../../../../shared/ipc'
import { ChevronDownIcon, SearchIcon, XIcon } from '../Icons'

interface ProductFilterPickerProps {
  products: ProductRecord[]
  selectedId: number | null
  onChange: (productId: number | null) => void
}

const PANEL_WIDTH = 264
const EDGE = 8

// Positioned by hand into <body> for the same reason the ⓘ panels are: the
// dashboard scrolls inside a container, and a container that scrolls on one axis
// clips the other, so an absolutely-placed dropdown gets sliced at the edge.
function place(anchor: HTMLElement): CSSProperties {
  const rect = anchor.getBoundingClientRect()
  const osk = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--osk-height')) || 0
  const floor = window.innerHeight - osk - EDGE
  const left = Math.min(Math.max(EDGE, rect.right - PANEL_WIDTH), window.innerWidth - PANEL_WIDTH - EDGE)
  const below = floor - rect.bottom - 6
  const above = rect.top - EDGE - 6
  return below >= 220 || below >= above
    ? { left, top: rect.bottom + 6, maxHeight: below }
    : { left, bottom: window.innerHeight - rect.top + 6, maxHeight: above }
}

export function ProductFilterPicker({ products, selectedId, onChange }: ProductFilterPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [style, setStyle] = useState<CSSProperties | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const selected = products.find((product) => product.id === selectedId) ?? null

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const pool = products.filter((product) => product.isActive || product.id === selectedId)
    if (!needle) return pool
    return pool.filter(
      (product) =>
        product.name.toLowerCase().includes(needle) ||
        (product.categoryName ?? '').toLowerCase().includes(needle)
    )
  }, [products, query, selectedId])

  useLayoutEffect(() => {
    if (!open) {
      setStyle(null)
      return
    }
    const update = () => {
      if (buttonRef.current) setStyle(place(buttonRef.current))
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const pick = (productId: number | null) => {
    onChange(productId)
    setOpen(false)
    setQuery('')
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          title="Narrow the dashboard to a single product"
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-150 active:scale-[0.98] ${
            selected
              ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
          }`}
        >
          <span className="max-w-[10rem] truncate">{selected ? selected.name : 'All products'}</span>
          <ChevronDownIcon width={13} height={13} className={open ? 'rotate-180' : ''} />
        </button>
        {selected && (
          <button
            type="button"
            onClick={() => pick(null)}
            aria-label="Show all products again"
            title="Show all products again"
            className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          >
            <XIcon width={13} height={13} />
          </button>
        )}
      </div>

      {open &&
        style &&
        createPortal(
          <div
            ref={panelRef}
            style={style}
            className="fixed z-[70] flex w-[264px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="relative shrink-0 border-b border-slate-100 p-2 dark:border-slate-800">
              <SearchIcon
                width={14}
                height={14}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search products…"
                className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-2 text-xs outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-1">
              <button
                type="button"
                onClick={() => pick(null)}
                className={`w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold transition-colors ${
                  selectedId === null
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                All products
              </button>
              {matches.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => pick(product.id)}
                  className={`flex w-full items-baseline justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                    selectedId === product.id
                      ? 'bg-emerald-50 font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className="truncate">{product.name}</span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-400">
                    {product.categoryName ?? ''}
                  </span>
                </button>
              ))}
              {matches.length === 0 && (
                <div className="px-2.5 py-4 text-center text-xs text-slate-400">No product matches “{query}”.</div>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
