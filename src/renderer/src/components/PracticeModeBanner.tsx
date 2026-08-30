import { AlertIcon } from './Icons'

interface PracticeModeBannerProps {
  busy: boolean
  onExit: () => void
}

// Deliberately loud and always on top. The one genuinely dangerous thing about a
// practice mode is someone forgetting they are in it and believing the day's
// takings are real, so this never collapses, never scrolls away, and the way out
// is the most obvious button on the screen.
export function PracticeModeBanner({ busy, onExit }: PracticeModeBannerProps) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-500/40 bg-amber-500 px-5 py-1.5 text-amber-950">
      <div className="flex min-w-0 items-center gap-2 truncate text-xs font-bold uppercase tracking-wide">
        <AlertIcon width={15} height={15} className="shrink-0" />
        <span className="shrink-0">Practice mode — nothing here is real</span>
        <span className="hidden truncate font-medium normal-case tracking-normal opacity-80 sm:inline">
          · sales, stock and reports are practice data. Your shop&apos;s records are untouched.
        </span>
      </div>
      <button
        type="button"
        onClick={onExit}
        disabled={busy}
        title="Delete the practice data and return to your real shop records"
        className="shrink-0 rounded-full bg-amber-950 px-3 py-1 text-xs font-bold text-amber-50 transition-all duration-150 hover:bg-amber-900 active:scale-[0.98] disabled:opacity-60"
      >
        {busy ? 'Leaving…' : 'Exit practice mode'}
      </button>
    </div>
  )
}
