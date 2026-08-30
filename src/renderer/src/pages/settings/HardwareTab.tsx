import { useEffect, useState } from 'react'
import type { PrinterInfo } from '../../../../shared/ipc'
import type { ToastState } from '../../components/Toast'
import { Toggle } from '../../components/Toggle'
import { PrinterIcon } from '../../components/Icons'

interface HardwareTabProps {
  settings: Record<string, string>
  isAdmin: boolean
  onSettingsChanged: () => Promise<void> | void
  showToast: (kind: ToastState['kind'], message: string) => void
}

export function HardwareTab({ settings, isAdmin, onSettingsChanged, showToast }: HardwareTabProps) {
  const [printing, setPrinting] = useState(false)
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [loadingPrinters, setLoadingPrinters] = useState(true)
  // Auto-start lives in the Windows registry, not the settings table, so it is
  // read from the OS on mount — it may have been set by the installer checkbox.
  const [autoStart, setAutoStart] = useState(false)
  const [autoStartAvailable, setAutoStartAvailable] = useState(true)
  const autoPrint = settings.auto_print_receipt === 'true'
  const selectedPrinter = settings.printer_device_name ?? ''
  const onScreenKeyboard = settings.onscreen_keyboard_enabled !== 'false'

  useEffect(() => {
    let cancelled = false
    setLoadingPrinters(true)
    window.electronAPI
      .listPrinters()
      .then((list) => {
        if (!cancelled) setPrinters(list)
      })
      .catch(() => {
        if (!cancelled) setPrinters([])
      })
      .finally(() => {
        if (!cancelled) setLoadingPrinters(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    window.electronAPI
      .getAutoStart()
      .then((enabled) => {
        if (!cancelled) setAutoStart(enabled)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const printerIsConnected = selectedPrinter !== '' && printers.some((printer) => printer.name === selectedPrinter)

  const toggleAutoStart = async (next: boolean) => {
    try {
      const applied = await window.electronAPI.setAutoStart(next)
      setAutoStart(applied)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not change start-up behaviour'
      // Running from `npm run dev` can't register a login item — say so plainly
      // and grey the row out rather than leaving a toggle that silently fails.
      if (message.includes('installed app')) setAutoStartAvailable(false)
      showToast('error', message)
    }
  }

  const toggleAutoPrint = async (next: boolean) => {
    try {
      await window.electronAPI.setSetting('auto_print_receipt', next ? 'true' : 'false')
      await onSettingsChanged()
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not save setting')
    }
  }

  const toggleOnScreenKeyboard = async (next: boolean) => {
    try {
      await window.electronAPI.setSetting('onscreen_keyboard_enabled', next ? 'true' : 'false')
      await onSettingsChanged()
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not save setting')
    }
  }

  const changePrinter = async (deviceName: string) => {
    try {
      await window.electronAPI.setSetting('printer_device_name', deviceName)
      await onSettingsChanged()
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not save printer selection')
    }
  }

  const printTest = async () => {
    setPrinting(true)
    try {
      const draft = await window.electronAPI.buildTestReceiptDraft()
      const result = await window.electronAPI.printReceipt(draft)
      showToast('success', result.simulated ? 'Test receipt printed (simulated — no printer selected)' : 'Test receipt sent to printer')
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not print test receipt')
    } finally {
      setPrinting(false)
    }
  }

  return (
    <div className="max-w-lg rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-sm font-bold tracking-tight text-slate-800 dark:text-slate-100">Hardware &amp; printers</h3>

      <div className="mt-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-slate-700 dark:text-slate-200">Receipt printer</div>
          <span
            className={`h-2 w-2 rounded-full ${printerIsConnected ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`}
            title={printerIsConnected ? 'Connected' : 'Not connected'}
          />
        </div>
        <p className="text-xs text-slate-400">
          Pick the Windows printer to send receipts to — e.g. an 80mm USB thermal printer like the Xprinter XP-Q851L.
          Install its Windows driver first so it shows up here.
        </p>
        <select
          value={selectedPrinter}
          onChange={(event) => changePrinter(event.target.value)}
          disabled={!isAdmin || loadingPrinters}
          className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
        >
          <option value="">Not configured (simulate print)</option>
          {printers.map((printer) => (
            <option key={printer.name} value={printer.name}>
              {printer.displayName}
            </option>
          ))}
        </select>
        {!loadingPrinters && printers.length === 0 && (
          <p className="mt-1 text-xs text-amber-500">No printers found by Windows. Install the printer driver, then reopen this tab.</p>
        )}
        {selectedPrinter !== '' && !loadingPrinters && !printerIsConnected && (
          <p className="mt-1 text-xs text-amber-500">
            &quot;{selectedPrinter}&quot; is no longer detected — check the USB cable and that Windows shows it as online.
          </p>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-slate-700 dark:text-slate-200">Auto-print receipt</div>
          <div className="text-xs text-slate-400">Print automatically when a sale is completed.</div>
        </div>
        <Toggle checked={autoPrint} onChange={toggleAutoPrint} disabled={!isAdmin} />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-slate-700 dark:text-slate-200">On-screen keyboard</div>
          <div className="text-xs text-slate-400">
            Pops up a touch keyboard when you tap a text box. A physical keyboard still works either way.
          </div>
        </div>
        <Toggle checked={onScreenKeyboard} onChange={toggleOnScreenKeyboard} disabled={!isAdmin} />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-slate-700 dark:text-slate-200">Start with Windows</div>
          <div className="text-xs text-slate-400">
            {autoStartAvailable
              ? 'Opens the till automatically when this computer is switched on.'
              : 'Only available in the installed app, not when running from source.'}
          </div>
        </div>
        <Toggle checked={autoStart} onChange={toggleAutoStart} disabled={!isAdmin || !autoStartAvailable} />
      </div>

      <button
        type="button"
        onClick={printTest}
        disabled={printing}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 py-2.5 text-sm font-semibold text-slate-600 transition-all duration-150 hover:bg-slate-200 active:scale-[0.98] disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300"
      >
        <PrinterIcon width={16} height={16} />
        {printing ? 'Printing…' : 'Print test receipt'}
      </button>
      <p className="mt-2 text-center text-xs text-slate-400">
        {printerIsConnected ? 'Sends a real test print to the selected printer.' : 'No printer selected — this simulates the print job.'}
      </p>
    </div>
  )
}
