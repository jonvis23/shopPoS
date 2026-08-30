import type { ToastState } from '../../components/Toast'

interface AppearanceTabProps {
  settings: Record<string, string>
  onSettingsChanged: () => Promise<void> | void
  showToast: (kind: ToastState['kind'], message: string) => void
}

const THEME_OPTIONS: Array<{ value: string; label: string; hint: string }> = [
  { value: 'LIGHT', label: 'Light', hint: 'Crisp white — brightest, best in daylight.' },
  { value: 'WARM', label: 'Warm', hint: 'Cream paper tone. Softer on the eyes over a long shift.' },
  { value: 'SAGE', label: 'Sage', hint: 'Muted green-grey. Lowest glare under shop lighting.' },
  { value: 'DARK', label: 'Dark', hint: 'Dark surfaces — easiest at night.' },
  { value: 'SYSTEM', label: 'System', hint: 'Follows the Windows light/dark setting.' },
]

// Small colour chips so the three light options can be told apart before picking.
const THEME_SWATCH: Record<string, string> = {
  LIGHT: 'linear-gradient(135deg, #ffffff 50%, #f1f5f9 50%)',
  WARM: 'linear-gradient(135deg, #fbf7f1 50%, #eae2d5 50%)',
  SAGE: 'linear-gradient(135deg, #f5f8f6 50%, #dde5df 50%)',
  DARK: 'linear-gradient(135deg, #1e293b 50%, #0f172a 50%)',
  SYSTEM: 'linear-gradient(135deg, #ffffff 50%, #0f172a 50%)',
}

const ZOOM_OPTIONS = ['80', '100', '125', '150']

function pillClass(active: boolean): string {
  return `flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-150 active:scale-[0.98] ${
    active
      ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
  }`
}

export function AppearanceTab({ settings, onSettingsChanged, showToast }: AppearanceTabProps) {
  const themeMode = settings.theme_mode ?? 'SYSTEM'
  const zoomPct = settings.display_zoom_pct ?? '100'

  const setSetting = async (key: string, value: string) => {
    try {
      await window.electronAPI.setSetting(key, value)
      await onSettingsChanged()
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not save setting')
    }
  }

  return (
    <div className="max-w-lg rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-sm font-bold tracking-tight text-slate-800 dark:text-slate-100">Appearance &amp; display</h3>

      <label className="mt-4 block text-xs font-semibold text-slate-500 dark:text-slate-400">Theme</label>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {THEME_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setSetting('theme_mode', opt.value)}
            title={opt.hint}
            className={pillClass(themeMode === opt.value)}
          >
            <span
              className="h-3 w-3 shrink-0 rounded-full border border-black/10"
              style={{ backgroundImage: THEME_SWATCH[opt.value] }}
            />
            {opt.label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-slate-400">
        {THEME_OPTIONS.find((opt) => opt.value === themeMode)?.hint ?? ''}
      </p>

      <label className="mt-4 block text-xs font-semibold text-slate-500 dark:text-slate-400">Display scaling</label>
      <div className="mt-1.5 flex items-center gap-1.5">
        {ZOOM_OPTIONS.map((pct) => (
          <button
            key={pct}
            type="button"
            onClick={() => setSetting('display_zoom_pct', pct)}
            className={pillClass(zoomPct === pct)}
          >
            {pct}%
          </button>
        ))}
      </div>
    </div>
  )
}
