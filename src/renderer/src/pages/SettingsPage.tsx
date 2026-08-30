import { useState } from 'react'
import type { DashboardSnapshot } from '../../../shared/ipc'
import type { Session } from '../components/LoginScreen'
import type { ToastState } from '../components/Toast'
import {
  ClockIcon,
  GraduationIcon,
  LockIcon,
  PackageIcon,
  PrinterIcon,
  ReceiptIcon,
  SettingsIcon,
  SunIcon,
  UsersIcon,
} from '../components/Icons'
import { PracticeModeTab } from './settings/PracticeModeTab'
import { GeneralTab } from './settings/GeneralTab'
import { AppearanceTab } from './settings/AppearanceTab'
import { UsersSecurityTab } from './settings/UsersSecurityTab'
import { HardwareTab } from './settings/HardwareTab'
import { ReceiptTab } from './settings/ReceiptTab'
import { ShiftHistoryTab } from './settings/ShiftHistoryTab'
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

type CategoryKey = 'general' | 'appearance' | 'users' | 'hardware' | 'receipt' | 'shifts' | 'backup' | 'practice'

const CATEGORIES: Array<{
  key: CategoryKey
  label: string
  icon: typeof SettingsIcon
  adminOnly?: boolean
  hint: string
}> = [
  { key: 'general', label: 'General', icon: SettingsIcon, hint: 'Shop name, till name and what staff are allowed to do without an Admin.' },
  { key: 'appearance', label: 'Appearance', icon: SunIcon, hint: 'Theme and screen size — including the softer light themes and text zoom.' },
  { key: 'users', label: 'Users & Security', icon: UsersIcon, adminOnly: true, hint: 'Add staff, change PINs, and see who did what.' },
  { key: 'hardware', label: 'Hardware & Printers', icon: PrinterIcon, hint: 'Choose the receipt printer, turn the on-screen keyboard on or off, and start with Windows.' },
  { key: 'receipt', label: 'Receipts', icon: ReceiptIcon, hint: 'What is printed on a receipt — header, footer and till details.' },
  { key: 'shifts', label: 'Shift History', icon: ClockIcon, hint: 'Past shifts with their totals and Z-reports.' },
  { key: 'backup', label: 'Backup & Data', icon: PackageIcon, hint: 'Save a copy of all shop data, or restore one. Do this regularly.' },
  {
    key: 'practice',
    label: 'Practice mode',
    icon: GraduationIcon,
    adminOnly: true,
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
  const isAdmin = session.role === 'ADMIN'
  const [active, setActive] = useState<CategoryKey>('general')
  const visibleCategories = CATEGORIES.filter((cat) => !cat.adminOnly || isAdmin)

  return (
    <div className="flex h-full">
      <div className="w-56 shrink-0 overflow-y-auto border-r border-slate-200 p-3 dark:border-slate-800">
        <h2 className="px-2 py-2 text-lg font-bold tracking-tight text-slate-900 dark:text-white">Settings</h2>
        <nav className="mt-2 flex flex-col gap-0.5">
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
          <GeneralTab settings={snapshot.settings} isAdmin={isAdmin} onSettingsChanged={onSettingsChanged} showToast={showToast} />
        )}
        {active === 'appearance' && (
          <AppearanceTab settings={snapshot.settings} onSettingsChanged={onSettingsChanged} showToast={showToast} />
        )}
        {active === 'users' && isAdmin && (
          <UsersSecurityTab
            settings={snapshot.settings}
            currentUserId={session.id}
            onSettingsChanged={onSettingsChanged}
            showToast={showToast}
          />
        )}
        {active === 'users' && !isAdmin && (
          <p className="flex items-center gap-1.5 text-sm text-slate-400">
            <LockIcon width={14} height={14} /> Sign in as Admin to manage staff accounts.
          </p>
        )}
        {active === 'hardware' && (
          <HardwareTab settings={snapshot.settings} isAdmin={isAdmin} onSettingsChanged={onSettingsChanged} showToast={showToast} />
        )}
        {active === 'receipt' && (
          <ReceiptTab settings={snapshot.settings} isAdmin={isAdmin} onSettingsChanged={onSettingsChanged} showToast={showToast} />
        )}
        {active === 'shifts' && <ShiftHistoryTab activeShiftId={snapshot.activeShift?.id ?? null} isAdmin={isAdmin} />}
        {active === 'backup' && isAdmin && <BackupTab showToast={showToast} />}
        {active === 'backup' && !isAdmin && (
          <p className="flex items-center gap-1.5 text-sm text-slate-400">
            <LockIcon width={14} height={14} /> Sign in as Admin to export the database.
          </p>
        )}
        {active === 'practice' && isAdmin && (
          <PracticeModeTab active={practiceMode} busy={practiceBusy} onChange={onPracticeModeChange} />
        )}
      </div>
    </div>
  )
}
