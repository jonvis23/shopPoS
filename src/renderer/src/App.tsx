import { useCallback, useEffect, useState } from 'react'
import type { DashboardSnapshot } from '../../shared/ipc'
import { TopNav } from './components/TopNav'
import type { ViewKey } from './components/TopNav'
import { ShiftGateModal } from './components/ShiftGateModal'
import { LoginScreen } from './components/LoginScreen'
import type { Session } from './components/LoginScreen'
import { Toast } from './components/Toast'
import type { ToastState } from './components/Toast'
import { CurrentSalePage } from './pages/CurrentSalePage'
import { TransactionsPage } from './pages/TransactionsPage'
import { InventoryPage } from './pages/InventoryPage'
import { CustomersPage } from './pages/CustomersPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { SettingsPage } from './pages/SettingsPage'
import { SplashScreen } from './components/SplashScreen'
import { OnScreenKeyboard } from './components/OnScreenKeyboard'
import { PracticeModeBanner } from './components/PracticeModeBanner'

const THEME_KEY = 'duka-pos-theme'
// Which light theme the sun/moon button in the top bar returns to. Without this,
// flipping to dark and back would silently drop a cashier's Warm/Sage choice.
const LIGHT_THEME_KEY = 'duka-pos-light-theme'

// Light variants share the whole layout and only retint neutrals — see the
// `html.theme-*` blocks in styles.css.
const LIGHT_THEME_CLASS: Record<string, string> = {
  WARM: 'theme-warm',
  SAGE: 'theme-sage',
}

function isLightTheme(mode: string): boolean {
  return mode === 'LIGHT' || mode in LIGHT_THEME_CLASS
}

// Anything thrown inside a main-process IPC handler reaches the renderer wrapped
// as: Error invoking remote method 'catalog:deleteProduct': Error: <real message>.
// Every toast goes through here so staff read the sentence we wrote rather than
// the plumbing in front of it.
function cleanErrorMessage(message: string): string {
  return message.replace(/^Error invoking remote method '[^']*':\s*(Error:\s*)?/, '')
}

function App() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [activeView, setActiveView] = useState<ViewKey>('current')
  const [dark, setDark] = useState(() => localStorage.getItem(THEME_KEY) === 'dark')
  const [toast, setToast] = useState<ToastState | null>(null)
  const [shiftBusy, setShiftBusy] = useState(false)
  const [saleTabCount, setSaleTabCount] = useState(1)
  const [now, setNow] = useState(() => new Date())
  const [practiceMode, setPracticeMode] = useState(false)
  const [practiceBusy, setPracticeBusy] = useState(false)

  const themeMode = snapshot?.settings.theme_mode ?? 'SYSTEM'

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', dark)
    // A light variant class is only ever present while the app is light, so the
    // `.dark` variant and the `theme-*` palettes can never both be in play.
    for (const [mode, className] of Object.entries(LIGHT_THEME_CLASS)) {
      root.classList.toggle(className, !dark && themeMode === mode)
    }
    localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light')
  }, [dark, themeMode])

  useEffect(() => {
    const resolve = () => {
      if (themeMode === 'DARK') return true
      if (isLightTheme(themeMode)) return false
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    setDark(resolve())
    if (isLightTheme(themeMode)) localStorage.setItem(LIGHT_THEME_KEY, themeMode)
    if (themeMode !== 'SYSTEM') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const listener = () => setDark(mq.matches)
    mq.addEventListener('change', listener)
    return () => mq.removeEventListener('change', listener)
  }, [themeMode])

  useEffect(() => {
    const pct = Number(snapshot?.settings.display_zoom_pct) || 100
    window.electronAPI.setZoomFactor(pct / 100)
  }, [snapshot?.settings.display_zoom_pct])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(timer)
  }, [toast])

  const showToast = useCallback((kind: ToastState['kind'], message: string) => {
    setToast({ kind, message: cleanErrorMessage(message) })
  }, [])

  const isAdmin = session?.role === 'ADMIN'

  const loadSnapshot = useCallback(async () => {
    try {
      const next = await window.electronAPI.bootstrap()
      setSnapshot(next)
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    loadSnapshot()
  }, [loadSnapshot])

  useEffect(() => {
    window.electronAPI
      .getPracticeMode()
      .then((status) => setPracticeMode(status.active))
      .catch(() => undefined)
  }, [])

  // Switching modes repoints the main process at a different database file, so
  // everything the renderer is holding — snapshot, open carts, the view you were
  // on — has to be rebuilt from the file that is now live.
  const switchPracticeMode = useCallback(
    async (enter: boolean) => {
      setPracticeBusy(true)
      try {
        const status = enter
          ? await window.electronAPI.enterPracticeMode(42)
          : await window.electronAPI.exitPracticeMode()
        setPracticeMode(status.active)
        setActiveView('current')
        await loadSnapshot()
        if (status.generated) {
          showToast(
            'success',
            `Practice mode on — ${status.generated.sales} sales across ${status.generated.days} days to play with`
          )
        } else if (!status.active) {
          showToast('success', 'Back on your real shop records')
        }
      } catch (error) {
        showToast('error', error instanceof Error ? error.message : 'Could not switch mode')
      } finally {
        setPracticeBusy(false)
      }
    },
    [loadSnapshot, showToast]
  )

  const refreshProducts = useCallback(async () => {
    const products = await window.electronAPI.listProducts()
    setSnapshot((prev) => (prev ? { ...prev, products } : prev))
  }, [])

  const refreshShift = useCallback(async () => {
    const activeShift = await window.electronAPI.getActiveShift()
    setSnapshot((prev) => (prev ? { ...prev, activeShift } : prev))
  }, [])

  const refreshSettings = useCallback(async () => {
    const settings = await window.electronAPI.getSettings()
    setSnapshot((prev) => (prev ? { ...prev, settings } : prev))
  }, [])

  const refreshCategories = useCallback(async () => {
    const categories = await window.electronAPI.listCategories()
    setSnapshot((prev) => (prev ? { ...prev, categories } : prev))
  }, [])

  const handleOpenShift = async (openingCash: number, openingMpesa: number, notes: string) => {
    setShiftBusy(true)
    try {
      await window.electronAPI.openShift({ openingCash, openingMpesa, notes: notes || undefined })
      await refreshShift()
      showToast('success', 'Shift opened')
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not open shift')
    } finally {
      setShiftBusy(false)
    }
  }

  const toggleDark = async () => {
    // Going light returns to whichever light theme was last chosen, not a hard-coded
    // plain "LIGHT" — otherwise the top-bar toggle would quietly undo Warm/Sage.
    const lastLight = localStorage.getItem(LIGHT_THEME_KEY) ?? 'LIGHT'
    const nextMode = dark ? (isLightTheme(lastLight) ? lastLight : 'LIGHT') : 'DARK'
    setDark(!dark)
    try {
      await window.electronAPI.setSetting('theme_mode', nextMode)
      await refreshSettings()
    } catch {
      // theme toggle is best-effort; local state already flipped
    }
  }

  if (loading || !snapshot) {
    return <SplashScreen />
  }

  const onScreenKeyboardEnabled = snapshot.settings.onscreen_keyboard_enabled !== 'false'

  if (!session) {
    return (
      <>
        <LoginScreen
          onLogin={setSession}
          showToast={showToast}
          touchModeEnabled={onScreenKeyboardEnabled}
          onTouchModeChanged={refreshSettings}
        />
        <OnScreenKeyboard enabled={onScreenKeyboardEnabled} />
      </>
    )
  }

  return (
    // pb-[--osk-height] shrinks the shell (box-sizing: border-box) while the docked
    // keyboard is open, so the app resizes instead of being covered by it.
    <div className="app-shell flex h-screen flex-col bg-slate-50 pb-[var(--osk-height,0px)] text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {practiceMode && <PracticeModeBanner busy={practiceBusy} onExit={() => switchPracticeMode(false)} />}
      <TopNav
        activeView={activeView}
        onChangeView={setActiveView}
        dark={dark}
        onToggleDark={toggleDark}
        activeShift={snapshot.activeShift}
        saleTabCount={saleTabCount}
        now={now}
        showToast={showToast}
        onShiftClosed={refreshShift}
        onLogout={() => {
          setSession(null)
          setActiveView('current')
        }}
      />

      <main className="flex-1 overflow-hidden">
        {!snapshot.activeShift ? (
          <div className="flex h-full items-center justify-center text-slate-300 dark:text-slate-700">
            <div className="text-sm font-medium">Till locked</div>
          </div>
        ) : (
          <>
            {/* The sell screen is hidden with CSS rather than unmounted. Every other
                view can be thrown away and rebuilt from the database, but a cart
                that hasn't been checked out exists only in this component's state —
                unmounting it to go and check a receipt in Transactions silently
                discarded the customer's items. */}
            <div className={activeView === 'current' ? 'h-full' : 'hidden'}>
              {/* Keyed on the mode so switching in or out builds a fresh sell
                  screen: a cart started for a real customer must never be
                  checked out against practice data, or the other way round. */}
              <CurrentSalePage
                key={practiceMode ? 'practice' : 'real'}
                snapshot={snapshot}
                isAdmin={isAdmin}
                onTabCountChange={setSaleTabCount}
                onProductsChanged={refreshProducts}
                showToast={showToast}
              />
            </div>
            {activeView === 'transactions' && (
              <TransactionsPage
                snapshot={snapshot}
                isAdmin={isAdmin}
                onProductsChanged={refreshProducts}
                showToast={showToast}
              />
            )}
            {activeView === 'inventory' && (
              <InventoryPage
                snapshot={snapshot}
                isAdmin={isAdmin}
                onProductsChanged={refreshProducts}
                onCategoriesChanged={refreshCategories}
                showToast={showToast}
              />
            )}
            {activeView === 'customers' && <CustomersPage snapshot={snapshot} showToast={showToast} />}
            {activeView === 'analytics' && <AnalyticsPage isAdmin={isAdmin} />}
            {activeView === 'settings' && (
              <SettingsPage
                snapshot={snapshot}
                session={session}
                onSettingsChanged={refreshSettings}
                showToast={showToast}
                practiceMode={practiceMode}
                practiceBusy={practiceBusy}
                onPracticeModeChange={switchPracticeMode}
              />
            )}
          </>
        )}
      </main>

      {!snapshot.activeShift && (
        <ShiftGateModal
          busy={shiftBusy}
          userName={session.name}
          onOpenShift={handleOpenShift}
          touchModeEnabled={onScreenKeyboardEnabled}
          onTouchModeChanged={refreshSettings}
        />
      )}
      <OnScreenKeyboard enabled={onScreenKeyboardEnabled} />
      <Toast toast={toast} />
    </div>
  )
}

export default App
