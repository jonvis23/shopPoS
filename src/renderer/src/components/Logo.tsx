import logoMark from '../assets/logo-mark.png'

interface LogoProps {
  size?: number
  className?: string
}

// The cereal-bag mark on the app's emerald badge — same artwork as the
// taskbar/window icon (resources/icon.ico, generated from this same source by
// resources/generate-icon-from-source.ps1), imported here so the splash,
// login and top-bar screens can never drift out of sync with it.
export function Logo({ size = 40, className = '' }: LogoProps) {
  return (
    <img
      src={logoMark}
      width={size}
      height={size}
      alt="Duka POS"
      className={`shrink-0 rounded-[22%] drop-shadow-sm ${className}`}
    />
  )
}
