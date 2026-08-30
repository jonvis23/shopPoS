import { useState } from 'react'
import type { CustomerBalance } from '../../../shared/ipc'

interface CustomerAutocompleteProps {
  value: string
  onChange: (value: string) => void
  onSelect: (customer: CustomerBalance) => void
  candidates: CustomerBalance[]
  placeholder?: string
  className: string
}

export function CustomerAutocomplete({
  value,
  onChange,
  onSelect,
  candidates,
  placeholder,
  className,
}: CustomerAutocompleteProps) {
  const [focused, setFocused] = useState(false)

  const query = value.trim().toLowerCase()
  const matches =
    query.length === 0
      ? []
      : candidates
          .filter((c) => c.customerName.toLowerCase().includes(query) || (c.phone ?? '').includes(query))
          .slice(0, 6)

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder={placeholder}
        className={className}
      />
      {focused && matches.length > 0 && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
          {matches.map((c) => (
            <button
              key={c.customerName}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(c)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <span className="font-medium text-slate-800 dark:text-slate-100">{c.customerName}</span>
              {c.phone && <span className="text-xs tabular-nums text-slate-400">{c.phone}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
