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

// Thermal heads print grey as a faint dot pattern, so everything here is solid black:
// weight and rules do the work that colour would otherwise do on screen.
function itemRowHtml(item: SaleItemRecord, showDualUnit: boolean): string {
  const qtyLabel =
    showDualUnit && item.weightPerBag > 0
      ? `${Math.floor(item.quantityKg / item.weightPerBag)} bags ${(item.quantityKg % item.weightPerBag).toFixed(2)}kg`
      : `${item.quantityKg}kg`
  return `
    <div class="item">
      <div>
        <div class="item-name">${esc(item.productName)}</div>
        <div class="item-qty">${esc(qtyLabel)} x ${esc(toCurrency(item.unitPricePerKg))}/kg</div>
      </div>
      <div class="amt item-amt">${esc(toCurrency(item.subtotal))}</div>
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
    /* The right margin is wider than the left: the print head drops the last few dots
       of a line, which clipped the final digit of every amount on the right-hand column. */
    padding: 3mm 7mm 6mm 4mm;
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 3.2mm;
    line-height: 1.35;
    color: #000;
  }
  .center { text-align: center; }
  .shop { font-size: 5mm; font-weight: 700; letter-spacing: 0.3mm; text-transform: uppercase; }
  .tagline { font-size: 3mm; font-weight: 700; margin-top: 0.6mm; }
  .note { font-size: 3mm; margin-top: 0.4mm; }
  .meta { display: flex; justify-content: space-between; font-size: 2.9mm; margin-top: 1.2mm; }
  .rule { border-top: 0.3mm dashed #000; margin: 2.2mm 0; }
  .heavy { border-top: 0.7mm solid #000; margin: 2mm 0; }
  .party { margin: 0.6mm 0; }
  .label { font-weight: 700; }
  .item { display: flex; justify-content: space-between; align-items: flex-start; gap: 3mm; margin: 1.8mm 0; }
  .item-name { font-weight: 700; font-size: 3.4mm; }
  .item-qty { font-size: 3mm; }
  .amt { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .item-amt { font-weight: 700; font-size: 3.4mm; }
  .line { display: flex; justify-content: space-between; gap: 3mm; margin: 0.8mm 0; }
  .bold { font-weight: 700; }
  .grand {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    border-top: 0.7mm solid #000;
    border-bottom: 0.7mm solid #000;
    padding: 1.6mm 0;
    margin: 1.5mm 0;
    font-size: 4.6mm;
    font-weight: 700;
  }
  .footer { font-weight: 700; margin-top: 1mm; }
  .void-badge {
    border: 0.5mm solid #000;
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
    <div class="shop">${esc(draft.shopName)}</div>
    ${draft.shopTagline ? `<div class="tagline">${esc(draft.shopTagline)}</div>` : ''}
    ${draft.headerNote ? `<div class="note">${esc(draft.headerNote)}</div>` : ''}
  </div>
  <div class="meta">
    <span>Receipt ${formatReceiptNumber(sale.id)}</span>
    <span>${esc(formatDateTime(sale.createdAt))}</span>
  </div>
  <div class="heavy"></div>
  <div class="party"><span class="label">Customer:</span> ${esc(sale.customerName)}</div>
  ${draft.showCashierName && draft.cashierName ? `<div class="party"><span class="label">Cashier:</span> ${esc(draft.cashierName)}</div>` : ''}
  <div class="rule"></div>
  ${sale.items.map((item) => itemRowHtml(item, draft.showDualUnit)).join('')}
  <div class="rule"></div>
  ${
    sale.discount > 0
      ? `<div class="line"><span>Discount</span><span class="amt">-${esc(toCurrency(sale.discount))}</span></div>`
      : ''
  }
  <div class="grand"><span>TOTAL</span><span class="amt">${esc(toCurrency(sale.totalAmount))}</span></div>
  <div class="line">
    <span>Cash / M-Pesa</span>
    <span class="amt">${esc(toCurrency(sale.cashPaid))} / ${esc(toCurrency(sale.mpesaPaid))}</span>
  </div>
  ${sale.mpesaRef ? `<div class="line"><span>M-Pesa code</span><span class="amt">${esc(sale.mpesaRef)}</span></div>` : ''}
  ${
    changeDue(sale) > 0
      ? `<div class="line bold"><span>CHANGE</span><span class="amt">${esc(toCurrency(changeDue(sale)))}</span></div>`
      : ''
  }
  ${
    draft.showDebtBalance && sale.debtAmount > 0
      ? `<div class="line bold"><span>Debt</span><span class="amt">${esc(toCurrency(sale.debtAmount))}</span></div>`
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
  <div class="center footer">${esc(draft.footerNote)}</div>
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
