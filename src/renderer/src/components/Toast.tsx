export type ToastKind = 'info' | 'success' | 'error'

export interface ToastState {
  kind: ToastKind
  message: string
}

const KIND_STYLES: Record<ToastKind, string> = {
  info: 'bg-slate-800 text-white',
  success: 'bg-emerald-600 text-white',
  error: 'bg-red-600 text-white',
}

export function Toast({ toast }: { toast: ToastState | null }) {
  if (!toast) return null

  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[100] -translate-x-1/2 animate-[toast-in_0.2s_ease-out]">
      <div className={`pointer-events-auto rounded-full px-4 py-2 text-sm font-medium shadow-lg ring-1 ring-black/5 ${KIND_STYLES[toast.kind]}`}>
        {toast.message}
      </div>
    </div>
  )
}
