// Renders a ReceiptDraft as an HTML page sized for 80mm thermal roll paper and
// sends it as a silent print job to an installed Windows printer (e.g. the
// Xprinter XP-Q851L, an 80mm USB ESC/POS printer). Using Chromium's own print
// pipeline — instead of hand-rolled ESC/POS byte commands — means printing
// goes through whatever driver the printer was installed with, so there's no
// native module (node-usb/escpos) to compile against Electron's ABI and no
// vendor-specific command set to maintain.
import { BrowserWindow } from 'electron'
import type { ReceiptDraft, SaleItemRecord } from '../shared/ipc'
import { changeDue, formatReceiptNumber, toCurrency } from '../shared/stock'
import { formatDateTime } from '../shared/datetime'

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function itemRowHtml(item: SaleItemRecord, showDualUnit: boolean): string {
  const qtyLabel =
    showDualUnit && item.weightPerBag > 0
      ? `${Math.floor(item.quantityKg / item.weightPerBag)} bags ${(item.quantityKg % item.weightPerBag).toFixed(2)}kg`
      : `${item.quantityKg}kg`
  return `
    <div class="row">
      <span>${esc(item.productName)}<br /><span class="qty">x ${esc(qtyLabel)} @ ${esc(toCurrency(item.unitPricePerKg))}/kg</span></span>
      <span class="amt">${esc(toCurrency(item.subtotal))}</span>
    </div>`
}

export function buildReceiptHtml(draft: ReceiptDraft): string {
  const { sale } = draft

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    width: 80mm;
    padding: 3mm 4mm 6mm;
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 3.1mm;
    line-height: 1.45;
    color: #000;
  }
  .center { text-align: center; }
  .shop-name { font-size: 4.4mm; font-weight: 700; }
  .muted { font-size: 2.6mm; color: #333; }
  .rule { border-top: 0.35mm dashed #000; margin: 2mm 0; }
  .row { display: flex; justify-content: space-between; gap: 3mm; margin: 1mm 0; }
  .qty { font-size: 2.6mm; color: #333; }
  .amt { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .total-row { display: flex; justify-content: space-between; font-size: 3.8mm; font-weight: 700; margin-top: 1mm; }
  .bold { font-weight: 700; }
  .void-badge {
    border: 0.3mm solid #000;
    text-align: center;
    padding: 1mm;
    font-weight: 700;
    letter-spacing: 0.5mm;
    margin-bottom: 2mm;
  }
</style>
</head>
<body>
  ${sale.status === 'VOID' ? '<div class="void-badge">VOIDED</div>' : ''}
  <div class="center">
    <div class="shop-name">${esc(draft.shopName)}</div>
    ${draft.shopTagline ? `<div class="muted">${esc(draft.shopTagline)}</div>` : ''}
    ${draft.headerNote ? `<div class="muted">${esc(draft.headerNote)}</div>` : ''}
    <div class="muted">Receipt ${formatReceiptNumber(sale.id)}</div>
    <div class="muted">${esc(formatDateTime(sale.createdAt))}</div>
  </div>
  <div class="rule"></div>
  <div>Customer: ${esc(sale.customerName)}</div>
  ${draft.showCashierName && draft.cashierName ? `<div>Cashier: ${esc(draft.cashierName)}</div>` : ''}
  <div class="rule"></div>
  ${sale.items.map((item) => itemRowHtml(item, draft.showDualUnit)).join('')}
  <div class="rule"></div>
  ${
    sale.discount > 0
      ? `<div class="row"><span>Discount</span><span class="amt">-${esc(toCurrency(sale.discount))}</span></div>`
      : ''
  }
  <div class="total-row"><span>TOTAL</span><span class="amt">${esc(toCurrency(sale.totalAmount))}</span></div>
  <div class="row muted">
    <span>Cash / M-Pesa</span>
    <span class="amt">${esc(toCurrency(sale.cashPaid))} / ${esc(toCurrency(sale.mpesaPaid))}</span>
  </div>
  ${
    changeDue(sale) > 0
      ? `<div class="row bold"><span>CHANGE</span><span class="amt">${esc(toCurrency(changeDue(sale)))}</span></div>`
      : ''
  }
  ${
    draft.showDebtBalance && sale.debtAmount > 0
      ? `<div class="row bold"><span>Debt</span><span class="amt">${esc(toCurrency(sale.debtAmount))}</span></div>`
      : ''
  }
  ${
    sale.status === 'VOID'
      ? `<div class="rule"></div>
         <div class="bold">Voided ${sale.voidedAt ? esc(formatDateTime(sale.voidedAt)) : ''}</div>
         ${sale.voidReason ? `<div>Reason: ${esc(sale.voidReason)}</div>` : ''}`
      : ''
  }
  <div class="rule"></div>
  <div class="center muted">${esc(draft.footerNote)}</div>
</body>
</html>`
}

// CSS px -> microns, at the standard 96 CSS-px-per-inch, 25.4mm-per-inch conversion.
const PX_TO_MICRONS = (25.4 / 96) * 1000
const RECEIPT_WIDTH_MICRONS = 80_000 // 80mm
const MIN_RECEIPT_HEIGHT_MICRONS = 40_000 // 40mm floor, so a near-empty draft can't collapse to nothing
const HEIGHT_SAFETY_MARGIN_MICRONS = 5_000 // 5mm slack so the last line/cut mark never clips

export function printReceiptHtml(html: string, deviceName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const printWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })

    printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).then(
      async () => {
        try {
          // @page { size: 80mm auto } isn't honored by every Windows receipt-printer
          // driver — some (e.g. the Xprinter's XP-80 driver) only expose fixed page
          // sizes (their default here is a full ~297mm A4-length page), which prints
          // one correct receipt followed by a large stretch of wasted blank paper.
          // Measuring the actual rendered content and passing an explicit pageSize
          // sidesteps the driver's fixed default entirely.
          const contentHeightPx = await printWindow.webContents.executeJavaScript('document.body.scrollHeight')
          const heightMicrons = Math.max(
            MIN_RECEIPT_HEIGHT_MICRONS,
            Math.round(contentHeightPx * PX_TO_MICRONS) + HEIGHT_SAFETY_MARGIN_MICRONS
          )

          printWindow.webContents.print(
            {
              silent: true,
              deviceName,
              printBackground: false,
              margins: { marginType: 'none' },
              pageSize: { width: RECEIPT_WIDTH_MICRONS, height: heightMicrons },
            },
            (success, errorType) => {
              printWindow.destroy()
              if (!success) {
                reject(new Error(errorType || 'Print job failed'))
                return
              }
              resolve()
            }
          )
        } catch (error) {
          printWindow.destroy()
          reject(error instanceof Error ? error : new Error(String(error)))
        }
      },
      (error) => {
        printWindow.destroy()
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    )
  })
}
