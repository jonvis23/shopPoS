import { MinusIcon, PlusIcon } from '../Icons'

interface BagCountStepperProps {
  value: string
  onChange: (next: string) => void
}

/** Tap-to-tally bag counter — for counting bags one at a time as a delivery is
 * unloaded, rather than typing a number you have to already know. Still a real
 * input, so a mis-tap can be corrected by typing over it. */
export function BagCountStepper({ value, onChange }: BagCountStepperProps) {
  const step = (delta: number) => {
    const next = Math.max(0, (Number(value) || 0) + delta)
    onChange(String(next))
  }

  return (
    <div className="mt-1 flex items-stretch gap-1.5">
      <button
        type="button"
        onClick={() => step(-1)}
        aria-label="One fewer bag"
        className="flex w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-all duration-150 hover:bg-slate-100 active:scale-95 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <MinusIcon width={16} height={16} />
      </button>
      <input
        value={value}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9]/g, '')
          onChange(raw)
        }}
        inputMode="numeric"
        data-osk="off"
        className="w-full min-w-0 rounded-lg border border-slate-200 px-2 py-2 text-center text-sm font-semibold tabular-nums outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
      />
      <button
        type="button"
        onClick={() => step(1)}
        aria-label="One more bag"
        className="flex w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-sm shadow-emerald-500/30 transition-all duration-150 hover:bg-emerald-600 active:scale-95"
      >
        <PlusIcon width={16} height={16} />
      </button>
    </div>
  )
}
