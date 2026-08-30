import { useId } from 'react'

interface LogoProps {
  size?: number
  className?: string
}

// A grain sack mark — a tied sack silhouette with a few spilled kernels at the
// base, on the app's emerald badge. Doubles as the splash/login mark and, once
// rasterized (see scripts/generate-icon), the taskbar/window icon.
export function Logo({ size = 40, className = '' }: LogoProps) {
  const gradientId = useId()

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      role="img"
      aria-label="Duka POS"
      className={`shrink-0 drop-shadow-sm ${className}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="200" y2="200" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#34d399" />
          <stop offset="1" stopColor="#059669" />
        </linearGradient>
      </defs>
      <rect width="200" height="200" rx="44" fill={`url(#${gradientId})`} />
      <path
        d="M100,48 C87,48 82,57 82,68 C58,77 42,102 42,133 C42,164 67,183 100,183 C133,183 158,164 158,133 C158,102 142,77 118,68 C118,57 113,48 100,48 Z"
        fill="#ffffff"
        fillOpacity="0.97"
      />
      <rect x="76" y="64" width="48" height="11" rx="5.5" fill="#047857" />
      <circle cx="72" cy="188" r="6" fill="#047857" />
      <circle cx="100" cy="192" r="7" fill="#047857" />
      <circle cx="128" cy="188" r="6" fill="#047857" />
    </svg>
  )
}
