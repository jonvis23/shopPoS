const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'] as const

interface KeypadProps {
  onKey: (key: (typeof KEYS)[number]) => void
  disabled?: boolean
}

export function Keypad({ onKey, disabled }: KeypadProps) {
  return (
    // overflow-hidden so a squeezed keypad can only ever clip its own keys —
    // digits used to escape the grid and land on top of the Add button below it.
    <div className="grid h-full min-h-0 grid-cols-3 grid-rows-4 gap-1.5 overflow-hidden">
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onKey(key)}
          className="flex h-full w-full items-center justify-center rounded-xl bg-slate-100 text-base font-medium tabular-nums text-slate-700 shadow-sm transition-all duration-100 hover:bg-slate-200 active:scale-95 active:bg-slate-300 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:active:bg-slate-600"
        >
          {key === 'back' ? '⌫' : key}
        </button>
      ))}
    </div>
  )
}
