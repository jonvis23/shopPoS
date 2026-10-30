import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { BackupFileInfo, BackupKind } from '../../../../shared/ipc'
import { formatDateTime } from '../../../../shared/datetime'
import type { ToastState } from '../../components/Toast'
import { AlertIcon, CheckIcon, DownloadIcon, UploadIcon } from '../../components/Icons'

interface BackupTabProps {
  showToast: (kind: ToastState['kind'], message: string) => void
}

// The table opens on the newest rows. Older ones are one click away, so a long
// history never pushes the actions off the screen.
const INITIAL_ROWS = 8

type Filter = 'ALL' | 'AUTO' | 'PRE_IMPORT'

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'ALL', label: 'All' },
  { key: 'AUTO', label: 'Automatic' },
  { key: 'PRE_IMPORT', label: 'Before a restore' },
]

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatRelative(iso: string, now: number): string {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.round(hours / 24)
  return days === 1 ? 'yesterday' : `${days} days ago`
}

const KIND_BADGE: Record<BackupKind, { label: string; className: string }> = {
  AUTO: {
    label: 'Automatic',
    className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  },
  PRE_IMPORT: {
    label: 'Before a restore',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  },
}

type PendingRestore = { path: string; label: string }

export function BackupTab({ showToast }: BackupTabProps) {
  const [exporting, setExporting] = useState(false)
  const [lastExportPath, setLastExportPath] = useState<string | null>(null)

  const [backups, setBackups] = useState<BackupFileInfo[]>([])
  const [loadingBackups, setLoadingBackups] = useState(true)
  const [filter, setFilter] = useState<Filter>('ALL')
  const [showAll, setShowAll] = useState(false)
  const [pendingRestore, setPendingRestore] = useState<PendingRestore | null>(null)
  const [restoring, setRestoring] = useState(false)

  const loadBackups = async () => {
    setLoadingBackups(true)
    try {
      const rows = await window.electronAPI.listBackups()
      setBackups(rows)
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not load backups')
    } finally {
      setLoadingBackups(false)
    }
  }

  useEffect(() => {
    loadBackups()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Captured once per load so every "2 hr ago" on the screen is measured from the same moment.
  const now = useMemo(() => Date.now(), [backups])
  const newest = backups[0]
  const totalBytes = backups.reduce((sum, backup) => sum + backup.sizeBytes, 0)

  const visible = useMemo(() => {
    const rows = filter === 'ALL' ? backups : backups.filter((backup) => backup.kind === filter)
    return showAll ? rows : rows.slice(0, INITIAL_ROWS)
  }, [backups, filter, showAll])

  const filteredCount = filter === 'ALL' ? backups.length : backups.filter((b) => b.kind === filter).length

  const exportDb = async () => {
    setExporting(true)
    try {
      const result = await window.electronAPI.exportDatabase()
      if (result.exported && result.path) {
        setLastExportPath(result.path)
        showToast('success', 'Copy saved')
      }
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not save a copy')
    } finally {
      setExporting(false)
    }
  }

  const pickFileToImport = async () => {
    try {
      const path = await window.electronAPI.pickImportFile()
      if (!path) return
      const fileName = path.split(/[/\\]/).pop() ?? path
      setPendingRestore({ path, label: fileName })
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not read that file')
    }
  }

  const confirmRestore = async () => {
    if (!pendingRestore) return
    setRestoring(true)
    try {
      await window.electronAPI.restoreBackup(pendingRestore.path)
      // On success the app relaunches before this ever resolves — reaching here
      // without throwing means it returned early (e.g. no active database), which
      // shouldn't normally happen, but don't leave the UI stuck if it does.
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not restore that backup')
      setRestoring(false)
      setPendingRestore(null)
    }
  }

  return (
    <div className="max-w-3xl space-y-5">
      <header>
        <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">Backup</h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Your shop is saved automatically. Keep a copy somewhere else too.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Last backup" value={newest ? formatRelative(newest.createdAt, now) : 'None yet'} />
        <Stat label="Backups kept" value={String(backups.length)} />
        <Stat label="Space used" value={backups.length > 0 ? formatBytes(totalBytes) : '—'} />
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <ActionCard
          title="Save a copy"
          description="Make a single file of all shop data. Put it on a USB stick or cloud folder."
          action={
            <button
              type="button"
              onClick={exportDb}
              disabled={exporting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-500/30 transition-all duration-150 hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-50"
            >
              <DownloadIcon width={14} height={14} />
              {exporting ? 'Saving…' : 'Save a copy'}
            </button>
          }
          footnote={lastExportPath ? `Last saved to ${lastExportPath}` : undefined}
        />
        <ActionCard
          title="Load a backup file"
          description="Replace the shop data with a file you saved earlier. The app restarts afterwards."
          action={
            <button
              type="button"
              onClick={pickFileToImport}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-700 transition-all duration-150 hover:bg-slate-50 active:scale-[0.98] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <UploadIcon width={14} height={14} />
              Choose file…
            </button>
          }
        />
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Saved backups</h3>
          <div role="tablist" className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            {FILTERS.map((option) => (
              <button
                key={option.key}
                type="button"
                role="tab"
                aria-selected={filter === option.key}
                onClick={() => {
                  setFilter(option.key)
                  setShowAll(false)
                }}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all duration-150 ${
                  filter === option.key
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {loadingBackups && <div className="px-4 py-10 text-center text-sm text-slate-400">Loading backups…</div>}

        {!loadingBackups && backups.length === 0 && (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">No backups yet</p>
            <p className="mt-1 text-xs text-slate-400">The first one is made when you end your first shift.</p>
          </div>
        )}

        {!loadingBackups && backups.length > 0 && filteredCount === 0 && (
          <div className="px-4 py-8 text-center text-sm text-slate-400">No backups of this kind.</div>
        )}

        {!loadingBackups && visible.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:bg-slate-950/40">
              <tr>
                <th className="px-4 py-2 font-semibold">Date</th>
                <th className="px-4 py-2 font-semibold">Type</th>
                <th className="px-4 py-2 text-right font-semibold">Size</th>
                <th className="px-4 py-2 text-right font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {visible.map((backup) => (
                <tr key={backup.path} className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800 dark:text-slate-100">{formatDateTime(backup.createdAt)}</div>
                    <div className="text-xs text-slate-400">{formatRelative(backup.createdAt, now)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${KIND_BADGE[backup.kind].className}`}>
                      {KIND_BADGE[backup.kind].label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-500 dark:text-slate-400">
                    {formatBytes(backup.sizeBytes)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setPendingRestore({ path: backup.path, label: formatDateTime(backup.createdAt) })}
                      className="rounded-md px-2.5 py-1 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                    >
                      Restore
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!loadingBackups && filteredCount > INITIAL_ROWS && (
          <div className="border-t border-slate-100 px-4 py-2.5 text-center dark:border-slate-800">
            <button
              type="button"
              onClick={() => setShowAll((open) => !open)}
              className="text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
            >
              {showAll ? 'Show fewer' : `Show all ${filteredCount} backups`}
            </button>
          </div>
        )}
      </section>

      <p className="flex items-start gap-2 text-xs text-slate-400">
        <CheckIcon width={12} height={12} className="mt-0.5 shrink-0 text-emerald-500" />
        Automatic backups keep the 20 most recent. Older ones are removed when a new one is made.
      </p>

      {pendingRestore && (
        <div className="osk-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200/60 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertIcon width={18} height={18} />
              <h3 className="text-base font-bold tracking-tight">Restore this backup?</h3>
            </div>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              This replaces <span className="font-semibold text-slate-700 dark:text-slate-200">all</span> current sales,
              stock and customer data with <span className="font-medium">{pendingRestore.label}</span>. The current data
              is saved first, and the app restarts.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setPendingRestore(null)}
                disabled={restoring}
                className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-semibold text-slate-600 transition-all duration-150 hover:bg-slate-200 active:scale-[0.98] disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRestore}
                disabled={restoring}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-red-500/30 transition-all duration-150 hover:bg-red-600 active:scale-[0.98] disabled:opacity-50"
              >
                {restoring ? 'Restoring…' : 'Restore & restart'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-base font-semibold tabular-nums text-slate-900 dark:text-white">{value}</div>
    </div>
  )
}

function ActionCard({
  title,
  description,
  action,
  footnote,
}: {
  title: string
  description: string
  action: ReactNode
  footnote?: string
}) {
  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
      <p className="mt-1 flex-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>
      <div className="mt-4">{action}</div>
      {footnote && (
        <p className="mt-2 truncate text-[11px] text-slate-400" title={footnote}>
          {footnote}
        </p>
      )}
    </div>
  )
}
