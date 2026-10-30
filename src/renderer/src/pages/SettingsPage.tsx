import { useState } from 'react'
import type { DashboardSnapshot } from '../../../shared/ipc'
import { hasRight } from '../../../shared/rights'
import type { AdminRight } from '../../../shared/rights'
import type { Session } from '../components/LoginScreen'
import type { ToastState } from '../components/Toast'
import { GraduationIcon, PackageIcon, PrinterIcon, ReceiptIcon, SettingsIcon, SunIcon, UsersIcon } from '../components/Icons'
import { PracticeModeTab } from './settings/PracticeModeTab'
import { GeneralTab } from './settings/GeneralTab'
import { AppearanceTab } from './settings/AppearanceTab'
import { UsersSecurityTab } from './settings/UsersSecurityTab'
import { HardwareTab } from './settings/HardwareTab'
import { ReceiptTab } from './settings/ReceiptTab'
import { BackupTab } from './settings/BackupTab'

interface SettingsPageProps {
  snapshot: DashboardSnapshot
  session: Session
  onSettingsChanged: () => Promise<void> | void
  showToast: (kind: ToastState['kind'], message: string) => void
  practiceMode: boolean
  practiceBusy: boolean
  onPracticeModeChange: (enter: boolean) => void
}

type CategoryKey = 'general' | 'appearance' | 'users' | 'hardware' | 'receipt' | 'backup' | 'practice'

// A tab with a `right` is only in the menu for people who have that right. Anyone
// without it never sees the tab, rather than seeing it locked.
const CATEGORIES: Array<{
  key: CategoryKey
  label: string
  icon: typeof SettingsIcon
  right?: AdminRight
  hint: string
}> = [
  { key: 'general', label: 'Shop', icon: SettingsIcon, right: 'manage_settings', hint: 'Shop name, till name, and the rules staff work under.' },
  { key: 'appearance', label: 'Appearance', icon: SunIcon, hint: 'Theme and screen size — including the softer light themes and text zoom.' },
  { key: 'users', label: 'Staff', icon: UsersIcon, right: 'manage_staff', hint: 'Add people, set what each one can do, and change PINs.' },
  { key: 'hardware', label: 'Printer & screen', icon: PrinterIcon, right: 'manage_settings', hint: 'Receipt printer, the on-screen keyboard, and starting with Windows.' },
  { key: 'receipt', label: 'Receipts', icon: ReceiptIcon, right: 'manage_settings', hint: 'What is printed on a receipt — header, footer and till details.' },
  { key: 'backup', label: 'Backup', icon: PackageIcon, right: 'manage_backups', hint: 'Save a copy of all shop data, or load one back. Do this regularly.' },
  {
    key: 'practice',
    label: 'Practice mode',
    icon: GraduationIcon,
    right: 'manage_settings',
    hint: 'Fill a throwaway copy of the shop with made-up trading, to learn on or train staff without touching real records.',
  },
]

export function SettingsPage({
  snapshot,
  session,
  onSettingsChanged,
  showToast,
  practiceMode,
  practiceBusy,
  onPracticeModeChange,
}: SettingsPageProps) {
  const visibleCategories = CATEGORIES.filter((cat) => !cat.right || hasRight(session, cat.right))
  const [active, setActive] = useState<CategoryKey>(visibleCategories[0].key)
  const canManageSettings = hasRight(session, 'manage_settings')

  return (
    <div className="flex h-full">
      <div className="w-56 shrink-0 overflow-y-auto border-r border-slate-200 p-3 dark:border-slate-800">
        <h2 className="px-2 py-2 text-lg font-bold tracking-tight text-slate-900 dark:text-white">Settings</h2>
        <nav className="mt-2 flex flex-col gap-0.5" data-tour="settings-tabs">
          {visibleCategories.map((cat) => {
            const Icon = cat.icon
            const activeItem = cat.key === active
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => setActive(cat.key)}
                title={cat.hint}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-all duration-150 ${
                  activeItem
                    ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                }`}
              >
                <Icon width={16} height={16} />
                {cat.label}
              </button>
            )
          })}
        </nav>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {active === 'general' && (
          <GeneralTab
            settings={snapshot.settings}
            canManageSettings={canManageSettings}
            onSettingsChanged={onSettingsChanged}
            showToast={showToast}
          />
        )}
        {active === 'appearance' && (
          <AppearanceTab settings={snapshot.settings} onSettingsChanged={onSettingsChanged} showToast={showToast} />
        )}
        {active === 'users' && (
          <UsersSecurityTab
            settings={snapshot.settings}
            currentUserId={session.id}
            onSettingsChanged={onSettingsChanged}
            showToast={showToast}
          />
        )}
        {active === 'hardware' && (
          <HardwareTab
            settings={snapshot.settings}
            canManageSettings={canManageSettings}
            onSettingsChanged={onSettingsChanged}
            showToast={showToast}
          />
        )}
        {active === 'receipt' && (
          <ReceiptTab
            settings={snapshot.settings}
            canManageSettings={canManageSettings}
            onSettingsChanged={onSettingsChanged}
            showToast={showToast}
          />
        )}
        {active === 'backup' && <BackupTab showToast={showToast} />}
        {active === 'practice' && (
          <PracticeModeTab active={practiceMode} busy={practiceBusy} onChange={onPracticeModeChange} />
        )}
      </div>
    </div>
  )
}
