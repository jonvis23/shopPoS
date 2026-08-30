import { useEffect, useState } from 'react'
import type { BackupFileInfo } from '../../../../shared/ipc'
import { formatDateTime } from '../../../../shared/datetime'
import type { ToastState } from '../../components/Toast'
import { AlertIcon, ClockIcon, DownloadIcon, UploadIcon } from '../../components/Icons'

interface BackupTabProps {
  showToast: (kind: ToastState['kind'], message: string) => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

type PendingRestore = { path: string; label: string }

export function BackupTab({ showToast }: BackupTabProps) {
  const [exporting, setExporting] = useState(false)
  const [lastExportPath, setLastExportPath] = useState<string | null>(null)

  const [backups, setBackups] = useState<BackupFileInfo[]>([])
  const [loadingBackups, setLoadingBackups] = useState(true)
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

  const exportDb = async () => {
    setExporting(true)
    try {
      const result = await window.electronAPI.exportDatabase()
      if (result.exported && result.path) {
        setLastExportPath(result.path)
        showToast('success', 'Database exported')
      }
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not export database')
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
    <div className="max-w-lg">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-sm font-bold tracking-tight text-slate-800 dark:text-slate-100">Backup &amp; data management</h3>
        <p className="mt-1 text-xs text-slate-400">
          Every sale, stock change, and customer record is written to disk the instant it happens. Shop data is also
          snapshotted automatically after every shift close and every 15 minutes while a shift is open, so a recent
          copy is always on hand below.
        </p>

        <button
          type="button"
          onClick={exportDb}
          disabled={exporting}
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-500/30 transition-all duration-150 hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-50"
        >
          <DownloadIcon width={14} height={14} />
          {exporting ? 'Exporting…' : 'Export database (.db)'}
        </button>

        {lastExportPath && (
          <p className="mt-2 truncate text-xs text-slate-400" title={lastExportPath}>
            Last export: {lastExportPath}
          </p>
        )}

        <button
          type="button"
          onClick={pickFileToImport}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-2.5 text-sm font-semibold text-slate-600 transition-all duration-150 hover:bg-slate-200 active:scale-[0.98] dark:bg-slate-800 dark:text-slate-300"
        >
          <UploadIcon width={14} height={14} />
          Import from file…
        </button>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 shadow-sm dark:border-slate-800">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:bg-slate-900">
          Recent backups
        </div>
        {loadingBackups && <div className="p-6 text-center text-sm text-slate-400">Loading…</div>}
        {!loadingBackups && backups.length === 0 && (
          <div className="p-6 text-center text-sm text-slate-400">
            No automatic backups yet — one is taken after your first shift close.
          </div>
        )}
        {!loadingBackups && backups.length > 0 && (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {backups.map((backup) => (
              <li key={backup.path} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-200">
                    <ClockIcon width={12} height={12} className="shrink-0 text-slate-400" />
                    {formatDateTime(backup.createdAt)}
                    {backup.kind === 'PRE_IMPORT' && (
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                        Pre-import
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">{formatBytes(backup.sizeBytes)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingRestore({ path: backup.path, label: formatDateTime(backup.createdAt) })}
                  className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pendingRestore && (
        <div className="osk-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200/60 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertIcon width={18} height={18} />
              <h3 className="text-base font-bold tracking-tight">Restore this backup?</h3>
            </div>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              This replaces <span className="font-semibold text-slate-700 dark:text-slate-200">all</span> current sales,
              stock, and customer data with the contents of <span className="font-medium">{pendingRestore.label}</span>.
              A safety copy of what's currently on this till will be made first, and the app will restart.
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
