import { Logo } from './Logo'
import { MarketBackdrop } from './MarketBackdrop'

export function SplashScreen() {
  return (
    <div className="relative flex h-screen items-center justify-center overflow-hidden">
      <MarketBackdrop />
      <div className="relative flex flex-col items-center gap-4">
        <Logo size={96} />
        <div className="text-center">
          <div className="text-2xl font-bold tracking-tight text-white">Duka POS</div>
          <div className="text-sm text-white/60">Every bag counts</div>
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400 [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400 [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400" />
        </div>
      </div>
    </div>
  )
}
