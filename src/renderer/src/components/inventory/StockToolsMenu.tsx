import { useEffect, useRef, useState } from 'react'
import { MoreIcon, PrinterIcon, TagIcon } from '../Icons'

interface StockToolsMenuProps {
  printingPriceList: boolean
  onAddCategory: () => void
  onPrintPriceList: () => void
}

const item =
  'flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800'

export function StockToolsMenu({ printingPriceList, onAddCategory, onPrintPriceList }: StockToolsMenuProps) {
  const [open, setOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false)
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

  const run = (action: () => void) => {
    setOpen(false)
    action()
  }

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="More stock tools"
        aria-label="More stock tools"
        aria-expanded={open}
        className="flex items-center rounded-lg bg-slate-100 px-2.5 py-2 text-slate-600 transition-all duration-150 hover:bg-slate-200 active:scale-[0.98] dark:bg-slate-800 dark:text-slate-300"
      >
        <MoreIcon width={16} height={16} />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1.5 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => run(onAddCategory)}
            title="Group products so they can be filtered on the Sell and Stock screens — e.g. Rice, Legumes, Flour."
            className={item}
          >
            <TagIcon width={14} height={14} className="text-slate-400" /> Add category…
          </button>
          <button
            type="button"
            disabled={printingPriceList}
            onClick={() => run(onPrintPriceList)}
            title="Print today's retail and wholesale prices for every product — for the counter or the wall."
            className={item}
          >
            <PrinterIcon width={14} height={14} className="text-slate-400" />
            {printingPriceList ? 'Printing…' : 'Print price list'}
          </button>
        </div>
      )}
    </div>
  )
}
