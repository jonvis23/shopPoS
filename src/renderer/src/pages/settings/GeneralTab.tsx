import { useState } from 'react'
import type { FormEvent } from 'react'
import type { ToastState } from '../../components/Toast'
import { LockIcon } from '../../components/Icons'

interface GeneralTabProps {
  settings: Record<string, string>
  isAdmin: boolean
  onSettingsChanged: () => Promise<void> | void
  showToast: (kind: ToastState['kind'], message: string) => void
}

const fieldLabel = 'mt-3 block text-xs font-semibold text-slate-500 dark:text-slate-400'
const fieldInput =
  'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white'

const FIELDS: Array<{ key: string; label: string }> = [
  { key: 'shop_name', label: 'Shop name' },
  { key: 'shop_tagline', label: 'Tagline' },
  { key: 'shop_branch', label: 'Branch / location' },
  { key: 'shop_phone', label: 'Contact phone' },
  { key: 'shop_email', label: 'Contact email' },
  { key: 'currency', label: 'Currency code' },
]

export function GeneralTab({ settings, isAdmin, onSettingsChanged, showToast }: GeneralTabProps) {
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(FIELDS.map((f) => [f.key, settings[f.key] ?? '']))
  )
  const [saving, setSaving] = useState(false)

  const save = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      for (const field of FIELDS) {
        await window.electronAPI.setSetting(field.key, form[field.key] ?? '')
      }
      await onSettingsChanged()
      showToast('success', 'Settings saved')
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-lg rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-sm font-bold tracking-tight text-slate-800 dark:text-slate-100">Business profile</h3>

      {isAdmin ? (
        <form onSubmit={save}>
          {FIELDS.map((field) => (
            <div key={field.key}>
              <label className={fieldLabel}>{field.label}</label>
              <input
                value={form[field.key] ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                className={fieldInput}
              />
            </div>
          ))}
          <button
            type="submit"
            disabled={saving}
            className="mt-4 w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-500/30 transition-all duration-150 hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </form>
      ) : (
        <div className="mt-3 space-y-2 text-sm">
          {FIELDS.map((field) => (
            <div key={field.key} className="flex justify-between gap-4">
              <span className="text-slate-400">{field.label}</span>
              <span className="font-medium text-slate-700 dark:text-slate-200">{settings[field.key] || '—'}</span>
            </div>
          ))}
          <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
            <LockIcon width={12} height={12} /> Sign in as Admin to edit these.
          </p>
        </div>
      )}
    </div>
  )
}
