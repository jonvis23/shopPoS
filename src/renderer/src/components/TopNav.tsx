import { useEffect, useRef, useState } from 'react'
import {
  CartIcon,
  ChartIcon,
  ChevronDownIcon,
  LockIcon,
  MoonIcon,
  PackageIcon,
  PlusIcon,
  ReceiptIcon,
  SettingsIcon,
  SunIcon,
  UsersIcon,
} from './Icons'
import type { ShiftRecord } from '../../../shared/ipc'
import { hasRight } from '../../../shared/rights'
import { formatShortDateTime } from '../../../shared/datetime'
import type { ToastState } from './Toast'
import type { Session } from './LoginScreen'
import { ExpenseModal } from './ExpenseModal'
import { EndShiftModal } from './EndShiftModal'
import { HandoverShiftModal } from './HandoverShiftModal'
import { ForceLogoutModal } from './ForceLogoutModal'
import { ZReportModal } from './ZReportModal'
import { Logo } from './Logo'

export type ViewKey = 'analytics' | 'current' | 'transactions' | 'inventory' | 'customers' | 'settings'

// `hint` shows on hover. It's there for staff who are new to the till — one plain
// sentence saying what the screen is for. Sell is left without one: it's the
// screen everybody starts on and it explains itself.
const NAV_ITEMS: Array<{ key: ViewKey; label: string; icon: typeof CartIcon; hint?: string }> = [
  {
    key: 'analytics',
    label: 'Reports',
    icon: ChartIcon,
    hint: 'How the shop is doing — sales, profit, best sellers and busiest hours for today, this week or any date range.',
  },
  { key: 'current', label: 'Sell', icon: CartIcon },
  {
    key: 'transactions',
    label: 'Transactions',
    icon: ReceiptIcon,
    hint: 'Every sale and expense already recorded. Search by customer, phone or receipt number, reprint a receipt, or void a sale.',
  },
  {
    key: 'inventory',
    label: 'Stock',
    icon: PackageIcon,
    hint: 'What is in the store: bags left of each product, prices, and where you add stock, record take-home or edit a product.',
  },
  {
    key: 'customers',
    label: 'Customers',
    icon: UsersIcon,
    hint: 'People who buy on credit — what each one still owes, and where you record their repayments.',
  },
  {
    key: 'settings',
    label: 'Settings',
    icon: SettingsIcon,
    hint: 'Shop details, staff accounts and PINs, printer, receipts, past shifts, backups and appearance.',
  },
]

interface TopNavProps {
  activeView: ViewKey
  onChangeView: (view: ViewKey) => void
  dark: boolean
  onToggleDark: () => void
  session: Session
  activeShift: ShiftRecord | null
  saleTabCount: number
  now: Date
  showToast: (kind: ToastState['kind'], message: string) => void
  onShiftClosed: () => Promise<void> | void
  onLock: () => void
  onLogout: () => void
  /** The till has been signed out by a hand-over or an Admin override, which have
   * already done the sign-out in main, so the renderer only needs to drop its session. */
  onSessionEnded: () => void
  onShowHelp: () => void
}

const formatHeaderDate = formatShortDateTime

export function TopNav({
  activeView,
  onChangeView,
  dark,
  onToggleDark,
  session,
  activeShift,
  saleTabCount,
  now,
  showToast,
  onShiftClosed,
  onLock,
  onLogout,
  onSessionEnded,
  onShowHelp,
}: TopNavProps) {
  const visibleItems = NAV_ITEMS.filter((item) => item.key !== 'analytics' || hasRight(session, 'view_reports'))
  const activeLabel = NAV_ITEMS.find((item) => item.key === activeView)?.label ?? ''
  // The person who opened the shift is the only one who can end or hand it over.
  // A shift from before user tracking has no owner and stays open to anyone.
  const isShiftOwner = !!activeShift && (activeShift.userId === null || activeShift.userId === session.id)
  const [expenseModalOpen, setExpenseModalOpen] = useState(false)
  const [endShiftOpen, setEndShiftOpen] = useState(false)
  const [handoverOpen, setHandoverOpen] = useState(false)
  const [forceLogoutOpen, setForceLogoutOpen] = useState(false)
  const [zReportShift, setZReportShift] = useState<ShiftRecord | null>(null)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!userMenuOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (!userMenuRef.current?.contains(event.target as Node)) setUserMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [userMenuOpen])

  return (
    <header className="border-b border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {/* Nothing in this bar may wrap or push the page wider than the window.
          Raising the display zoom leaves the app fewer CSS pixels to lay out in,
          and the bar used to answer that by squashing "End Shift" onto two lines
          and shunting the whole shell sideways behind a horizontal scrollbar.
          Instead the padding and gaps tighten first, then the parts that are
          merely informative (the wordmark, the clock, the shift chip) step out of
          the way — the six navigation buttons never do. */}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 xl:gap-6 xl:px-5">
        <div className="flex shrink-0 items-center gap-3">
          <Logo size={36} />
          <div className="hidden leading-tight lg:block">
            <div className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">Duka POS</div>
            <div className="text-[11px] text-slate-400">Every bag counts</div>
          </div>
        </div>

        <nav className="flex shrink-0 items-center gap-0.5 xl:gap-1">
          {visibleItems.map((item) => {
            const Icon = item.icon
            const active = item.key === activeView
            return (
              <button
                key={item.key}
                type="button"
                data-tour={`nav-${item.key}`}
                onClick={() => onChangeView(item.key)}
                title={item.hint}
                className={`flex flex-col items-center gap-0.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-[11px] font-medium transition-all duration-150 md:px-2.5 xl:px-4 ${
                  active
                    ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                }`}
              >
                <Icon width={18} height={18} />
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-1.5 lg:gap-2 xl:gap-4">
          <div className="hidden whitespace-nowrap text-right leading-tight xl:block">
            <div className="text-[11px] text-slate-400">Home / {activeLabel}</div>
            <div className="flex items-center justify-end gap-1.5 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Online <span className="mx-1 text-slate-300 dark:text-slate-600">·</span> {formatHeaderDate(now)}
            </div>
          </div>

          {activeView === 'current' && (
            <span className="hidden whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium tabular-nums text-slate-500 dark:bg-slate-800 dark:text-slate-400 2xl:inline-block">
              Tabs {saleTabCount}
            </span>
          )}

          <button
            type="button"
            data-tour="expense"
            onClick={() => setExpenseModalOpen(true)}
            disabled={!activeShift}
            title={
              activeShift
                ? 'Record money paid out of the till — transport, fuel, rent. It shows up under the day in Transactions.'
                : 'Open a shift first'
            }
            className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-all duration-150 hover:bg-slate-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <PlusIcon width={14} height={14} /> <span className="hidden lg:inline">Expense</span>
          </button>

          <button
            type="button"
            data-tour="help"
            onClick={onShowHelp}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="How to use Duka POS"
            title="Show the step-by-step guide to using Duka POS."
          >
            ?
          </button>

          <button
            type="button"
            onClick={onToggleDark}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="Toggle dark mode"
            title={
              dark
                ? 'Switch back to your light theme. More light themes are in Settings → Appearance.'
                : 'Switch to the dark theme — easier on the eyes at night.'
            }
          >
            {dark ? <SunIcon width={16} height={16} /> : <MoonIcon width={16} height={16} />}
          </button>

          {activeShift && isShiftOwner && (
            <button
              type="button"
              data-tour="end-shift"
              onClick={() => setEndShiftOpen(true)}
              title="Close the till for this shift — count the cash and M-Pesa, note any difference, then print the Z-report."
              className="shrink-0 whitespace-nowrap rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition-all duration-150 hover:bg-red-100 active:scale-[0.98] dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20"
            >
              End Shift
            </button>
          )}

          <div ref={userMenuRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setUserMenuOpen((o) => !o)}
              aria-expanded={userMenuOpen}
              title={`${session.name} — ${activeShift ? 'shift active' : 'no shift open'}`}
              className={`flex items-center gap-2 rounded-full border py-1 pl-1 shadow-sm transition-colors lg:pr-2.5 ${
                userMenuOpen
                  ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10'
                  : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
              }`}
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[11px] font-semibold text-white dark:bg-slate-600">
                {session.name.charAt(0).toUpperCase()}
              </div>
              <div className="hidden whitespace-nowrap leading-tight lg:block">
                <div className="max-w-[7rem] truncate text-[11px] font-semibold text-slate-800 dark:text-slate-100">
                  {session.name}
                </div>
                <div className="text-[10px] text-slate-400">
                  {!activeShift ? 'No shift' : isShiftOwner ? 'Shift active' : `Shift: ${activeShift.userName}`}
                </div>
              </div>
              <ChevronDownIcon width={12} height={12} className="hidden shrink-0 text-slate-400 lg:block" />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 z-30 mt-1.5 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                <div className="border-b border-slate-100 px-3 py-2 dark:border-slate-800">
                  <div className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{session.name}</div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">{session.role}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false)
                    onLock()
                  }}
                  title="Step away without closing the shift — the cart and everything else stays exactly as it is."
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <LockIcon width={13} height={13} /> Lock screen
                </button>
                {!activeShift && (
                  <button
                    type="button"
                    onClick={() => {
                      setUserMenuOpen(false)
                      onLogout()
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Log out
                  </button>
                )}
                {activeShift && isShiftOwner && (
                  <button
                    type="button"
                    onClick={() => {
                      setUserMenuOpen(false)
                      setHandoverOpen(true)
                    }}
                    title="Count the till and pass the open shift to the next person. No Z-report — the shift carries on."
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Hand over shift
                  </button>
                )}
                {activeShift && (
                  <button
                    type="button"
                    onClick={() => {
                      setUserMenuOpen(false)
                      setForceLogoutOpen(true)
                    }}
                    title="Sign the till out mid-shift with an Admin PIN and a reason. The shift stays open."
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Admin override…
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {expenseModalOpen && activeShift && (
        <ExpenseModal
          activeShift={activeShift}
          canLogMonthlyBills={hasRight(session, 'manage_bills')}
          onClose={() => setExpenseModalOpen(false)}
          showToast={showToast}
        />
      )}

      {endShiftOpen && activeShift && (
        <EndShiftModal
          shift={activeShift}
          canLogMonthlyBills={hasRight(session, 'manage_bills')}
          showToast={showToast}
          onClose={() => setEndShiftOpen(false)}
          onClosed={async (closedShift) => {
            setEndShiftOpen(false)
            setZReportShift(closedShift)
            await onShiftClosed()
          }}
        />
      )}

      {handoverOpen && activeShift && (
        <HandoverShiftModal
          shift={activeShift}
          session={session}
          showToast={showToast}
          onClose={() => setHandoverOpen(false)}
          onHandedOver={async () => {
            setHandoverOpen(false)
            // The login screen reads the owner from the snapshot, so it must see the new one.
            await onShiftClosed()
            showToast('success', 'Till handed over — the next person signs in with their PIN')
            onSessionEnded()
          }}
        />
      )}

      {forceLogoutOpen && (
        <ForceLogoutModal
          session={session}
          showToast={showToast}
          onClose={() => setForceLogoutOpen(false)}
          onLoggedOut={() => {
            setForceLogoutOpen(false)
            onSessionEnded()
          }}
        />
      )}

      {zReportShift && (
        <ZReportModal
          shift={zReportShift}
          onClose={() => {
            setZReportShift(null)
            onLogout()
          }}
        />
      )}
    </header>
  )
}
