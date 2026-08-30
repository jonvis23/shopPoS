import { useEffect, useState } from 'react'
import type { UserRecord } from '../../../../shared/ipc'
import type { ToastState } from '../../components/Toast'
import { Toggle } from '../../components/Toggle'
import { PlusIcon } from '../../components/Icons'
import { UserFormModal } from '../../components/settings/UserFormModal'
import { ResetPinModal } from '../../components/settings/ResetPinModal'

interface UsersSecurityTabProps {
  settings: Record<string, string>
  currentUserId: number
  onSettingsChanged: () => Promise<void> | void
  showToast: (kind: ToastState['kind'], message: string) => void
}

export function UsersSecurityTab({ settings, currentUserId, onSettingsChanged, showToast }: UsersSecurityTabProps) {
  const [users, setUsers] = useState<UserRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [formUser, setFormUser] = useState<UserRecord | null | 'new'>(null)
  const [resetPinUser, setResetPinUser] = useState<UserRecord | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      setUsers(await window.electronAPI.listUsers())
    } catch {
      // best-effort; table just stays empty
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const toggleActive = async (user: UserRecord) => {
    try {
      await window.electronAPI.setUserActive(user.id, !user.isActive)
      await load()
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not update staff account')
    }
  }

  const togglePerm = async (key: string, next: boolean) => {
    try {
      await window.electronAPI.setSetting(key, next ? 'true' : 'false')
      await onSettingsChanged()
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not save setting')
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold tracking-tight text-slate-800 dark:text-slate-100">Staff accounts</h3>
        <button
          type="button"
          onClick={() => setFormUser('new')}
          className="flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-emerald-500/30 transition-all duration-150 hover:bg-emerald-600 active:scale-[0.98]"
        >
          <PlusIcon width={13} height={13} /> Add staff
        </button>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 shadow-sm dark:border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:bg-slate-900">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr
                key={user.id}
                className="border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
              >
                <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100">{user.name}</td>
                <td className="px-4 py-2.5 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {user.role}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      user.isActive
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {user.isActive ? 'Active' : 'Deactivated'}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-3 text-xs">
                    <button
                      type="button"
                      onClick={() => setFormUser(user)}
                      className="font-semibold text-slate-500 hover:underline dark:text-slate-400"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setResetPinUser(user)}
                      className="font-semibold text-slate-500 hover:underline dark:text-slate-400"
                    >
                      Reset PIN
                    </button>
                    <button
                      type="button"
                      disabled={user.id === currentUserId}
                      onClick={() => toggleActive(user)}
                      title={user.id === currentUserId ? "You can't deactivate your own account" : undefined}
                      className={`font-semibold ${
                        user.id === currentUserId
                          ? 'cursor-not-allowed text-slate-300 dark:text-slate-700'
                          : user.isActive
                            ? 'text-red-500 hover:underline'
                            : 'text-emerald-600 hover:underline'
                      }`}
                    >
                      {user.isActive ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && users.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-sm text-slate-400" colSpan={4}>
                  No staff accounts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h3 className="mt-6 text-sm font-bold tracking-tight text-slate-800 dark:text-slate-100">Cashier permissions</h3>
      <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-slate-700 dark:text-slate-200">Allow cashiers to apply discounts</div>
            <div className="text-xs text-slate-400">Off by default — discounts require an Admin session.</div>
          </div>
          <Toggle
            checked={settings.perm_allow_cashier_discount === 'true'}
            onChange={(next) => togglePerm('perm_allow_cashier_discount', next)}
          />
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
          <div>
            <div className="text-sm font-medium text-slate-700 dark:text-slate-200">Allow cashiers to void completed sales</div>
            <div className="text-xs text-slate-400">Off by default — voids require an Admin session.</div>
          </div>
          <Toggle
            checked={settings.perm_allow_cashier_void === 'true'}
            onChange={(next) => togglePerm('perm_allow_cashier_void', next)}
          />
        </div>
      </div>

      {formUser && (
        <UserFormModal
          user={formUser === 'new' ? null : formUser}
          onClose={() => setFormUser(null)}
          onSaved={load}
          showToast={showToast}
        />
      )}
      {resetPinUser && (
        <ResetPinModal user={resetPinUser} onClose={() => setResetPinUser(null)} onSaved={load} showToast={showToast} />
      )}
    </div>
  )
}
