import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { ReceiptDraft, SaleRecord } from '../../../../shared/ipc'
import type { ToastState } from '../../components/Toast'
import { Toggle } from '../../components/Toggle'
import { LockIcon } from '../../components/Icons'
import { ReceiptPreview } from '../../components/pos/ReceiptPreview'

interface ReceiptTabProps {
  settings: Record<string, string>
  isAdmin: boolean
  onSettingsChanged: () => Promise<void> | void
  showToast: (kind: ToastState['kind'], message: string) => void
}

// A fixed sample sale used purely to drive the live preview below — multiple
// items (one bag-sized, so dual-unit has something to show), a discount, a
// cashier, and a debt balance, so every toggle in this tab visibly does something.
const PREVIEW_SALE: SaleRecord = {
  id: 1024,
  shiftId: 1,
  cashierName: 'Jane (Cashier)',
  customerName: 'Jane Wanjiru',
  customerPhone: '0712 345 678',
  totalAmount: 5000,
  cashPaid: 4000,
  mpesaPaid: 500,
  debtAmount: 500,
  discount: 200,
  status: 'COMPLETED',
  voidReason: null,
  voidedAt: null,
  createdAt: new Date().toISOString(),
  items: [
    {
      id: 1,
      productId: 1,
      productName: 'Sifted Maize Flour',
      quantityKg: 95,
      unitPricePerKg: 50,
      subtotal: 4750,
      weightPerBag: 90,
    },
    {
      id: 2,
      productId: 2,
      productName: 'Green Grams',
      quantityKg: 3,
      unitPricePerKg: 150,
      subtotal: 450,
      weightPerBag: 90,
    },
  ],
}

const fieldLabel = 'mt-3 block text-xs font-semibold text-slate-500 dark:text-slate-400'
const fieldInput =
  'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white'

const TOGGLE_FIELDS: Array<{ key: string; label: string; hint: string }> = [
  { key: 'receipt_show_dual_unit', label: 'Show dual-unit breakdown', hint: 'Bags + kg alongside each line item.' },
  { key: 'receipt_show_cashier_name', label: 'Show cashier name', hint: 'Print who rang up the sale.' },
  { key: 'receipt_show_debt_balance', label: 'Show customer debt balance', hint: 'When the sale left a balance owing.' },
]

export function ReceiptTab({ settings, isAdmin, onSettingsChanged, showToast }: ReceiptTabProps) {
  const [headerNote, setHeaderNote] = useState(settings.receipt_header_note ?? '')
  const [footerNote, setFooterNote] = useState(settings.receipt_footer ?? '')
  const [saving, setSaving] = useState(false)

  const saveText = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      await window.electronAPI.setSetting('receipt_header_note', headerNote)
      await window.electronAPI.setSetting('receipt_footer', footerNote)
      await onSettingsChanged()
      showToast('success', 'Receipt settings saved')
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not save settings')
    } finally {
      setSaving(false)
    }
  }

  const toggleField = async (key: string, next: boolean) => {
    try {
      await window.electronAPI.setSetting(key, next ? 'true' : 'false')
      await onSettingsChanged()
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not save setting')
    }
  }

  const previewDraft: ReceiptDraft = useMemo(
    () => ({
      sale: PREVIEW_SALE,
      shopName: settings.shop_name || 'Your Shop Name',
      shopTagline: settings.shop_tagline || '',
      footerNote,
      headerNote,
      cashierName: 'Jane (Cashier)',
      showDualUnit: settings.receipt_show_dual_unit !== 'false',
      showCashierName: settings.receipt_show_cashier_name !== 'false',
      showDebtBalance: settings.receipt_show_debt_balance !== 'false',
    }),
    [settings, headerNote, footerNote]
  )

  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="max-w-lg flex-1 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-sm font-bold tracking-tight text-slate-800 dark:text-slate-100">Receipt customization</h3>

        {isAdmin ? (
          <form onSubmit={saveText}>
            <label className={fieldLabel}>Header note</label>
            <input value={headerNote} onChange={(e) => setHeaderNote(e.target.value)} className={fieldInput} />

            <label className={fieldLabel}>Footer text</label>
            <input
              value={footerNote}
              onChange={(e) => setFooterNote(e.target.value)}
              placeholder="e.g. Asante kwa kununua nasi!"
              className={fieldInput}
            />

            <button
              type="submit"
              disabled={saving}
              className="mt-4 w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-500/30 transition-all duration-150 hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save receipt text'}
            </button>
          </form>
        ) : (
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-slate-400">Header note</span>
              <span className="font-medium text-slate-700 dark:text-slate-200">{headerNote || '—'}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-400">Footer text</span>
              <span className="font-medium text-slate-700 dark:text-slate-200">{footerNote || '—'}</span>
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
              <LockIcon width={12} height={12} /> Sign in as Admin to edit these.
            </p>
          </div>
        )}

        <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
          {TOGGLE_FIELDS.map((field) => (
            <div key={field.key} className="mt-3 flex items-center justify-between first:mt-0">
              <div>
                <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{field.label}</div>
                <div className="text-xs text-slate-400">{field.hint}</div>
              </div>
              <Toggle
                checked={settings[field.key] !== 'false'}
                onChange={(next) => toggleField(field.key, next)}
                disabled={!isAdmin}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="shrink-0">
        <div className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-400">
          Live preview
        </div>
        <ReceiptPreview draft={previewDraft} />
        <p className="mt-2 max-w-[300px] text-center text-xs text-slate-400">
          Sample sale — updates as you edit the text and toggles on the left.
        </p>
      </div>
    </div>
  )
}
