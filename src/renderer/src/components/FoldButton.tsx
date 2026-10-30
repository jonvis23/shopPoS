import type { ReactNode } from 'react'
import { ChevronDownIcon } from './Icons'

interface FoldButtonProps {
  open: boolean
  onToggle: () => void
  className?: string
  children: ReactNode
}

// The header of a list that can be folded away. The whole row is the control, so the
// chevron is only a cue — and the folded state is announced to assistive tech.
export function FoldButton({ open, onToggle, className = '', children }: FoldButtonProps) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className={`flex w-full items-center justify-between gap-2 text-left transition-colors ${className}`}
    >
      <span className="min-w-0 flex-1">{children}</span>
      <ChevronDownIcon
        width={14}
        height={14}
        className={`shrink-0 transition-transform duration-150 ${open ? '' : '-rotate-90'}`}
      />
    </button>
  )
}
