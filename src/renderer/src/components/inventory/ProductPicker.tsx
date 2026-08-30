import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ProductRecord } from '../../../../shared/ipc'

interface ProductPickerProps {
  products: ProductRecord[]
  selectedProductId: number | null
  onSelect: (product: ProductRecord) => void
  placeholder?: string
  className: string
}

const MAX_HEIGHT = 232

interface Placement {
  left: number
  width: number
  maxHeight: number
  top?: number
  bottom?: number
}

function measure(input: HTMLInputElement): Placement {
  const rect = input.getBoundingClientRect()
  // The docked on-screen keyboard owns the bottom band of the viewport, so treat
  // it as floor rather than letting suggestions open underneath it.
  const osk = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--osk-height')) || 0
  const floor = window.innerHeight - osk - 8
  const below = floor - rect.bottom - 4
  const above = rect.top - 12
  // Below unless the list would be squeezed there and there's genuinely more room
  // above — which is what happens once the keyboard takes the bottom 260px.
  if (below >= MAX_HEIGHT || below >= above) {
    return { left: rect.left, width: rect.width, top: rect.bottom + 4, maxHeight: Math.min(MAX_HEIGHT, below) }
  }
  return {
    left: rect.left,
    width: rect.width,
    bottom: window.innerHeight - rect.top + 4,
    maxHeight: Math.min(MAX_HEIGHT, above),
  }
}

export function ProductPicker({ products, selectedProductId, onSelect, placeholder, className }: ProductPickerProps) {
  const selected = products.find((p) => p.id === selectedProductId) ?? null
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [placement, setPlacement] = useState<Placement | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const trimmed = query.trim().toLowerCase()
  const matches = products
    .filter((p) => p.isActive)
    .filter((p) => (trimmed ? p.name.toLowerCase().includes(trimmed) : true))
    .slice(0, 8)

  // The suggestion list is rendered into <body> and positioned against the input's
  // own rect. Kept inline it would be clipped by any scrolling ancestor — which is
  // exactly what hid it inside the Add stock modal — and no amount of z-index
  // rescues a child of an `overflow: auto` box.
  //
  // Re-measured every frame while focused rather than on scroll/resize events,
  // because the thing that most often moves this input fires neither: the touch
  // keyboard docking reflows the whole modal by changing a CSS variable. State
  // only updates when the numbers actually change, so the loop costs a rect read.
  useLayoutEffect(() => {
    if (!focused || !inputRef.current) {
      setPlacement(null)
      return
    }
    const input = inputRef.current
    let frame = 0
    let last = ''
    const tick = () => {
      const next = measure(input)
      const key = JSON.stringify(next)
      if (key !== last) {
        last = key
        setPlacement(next)
      }
      frame = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [focused])

  useEffect(() => {
    if (!focused) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') inputRef.current?.blur()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [focused])

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={focused ? query : (selected?.name ?? '')}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          setFocused(true)
          setQuery('')
        }}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder={placeholder}
        className={className}
      />
      {focused &&
        matches.length > 0 &&
        placement &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              left: placement.left,
              top: placement.top,
              bottom: placement.bottom,
              width: placement.width,
              maxHeight: placement.maxHeight,
            }}
            className="z-[70] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800"
          >
            {matches.map((p) => (
              <button
                key={p.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(p)
                  setQuery('')
                  setFocused(false)
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                <span className="truncate font-medium text-slate-800 dark:text-slate-100">{p.name}</span>
                <span className="shrink-0 text-xs text-slate-400">{p.categoryName ?? '—'}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  )
}
