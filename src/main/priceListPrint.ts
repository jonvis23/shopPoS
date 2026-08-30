// Renders the active product catalog as an 80mm-thermal-styled price sheet —
// for pinning up or handing to staff after a price update, not for customers.
// Shares the same HTML->silent-print pipeline as receipts (see receiptPrint.ts).
import type { ProductRecord } from '../shared/ipc'
import { toCurrency } from '../shared/stock'
import { formatDateTime } from '../shared/datetime'

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildPriceListHtml(products: ProductRecord[], shopName: string): string {
  const rows = products
    .map(
      (product) => `
    <div class="row">
      <span>${esc(product.name)}</span>
      <span class="amt">R ${esc(toCurrency(product.retailPricePerKg))} / W ${
        product.wholesalePricePerKg > 0 ? esc(toCurrency(product.wholesalePricePerKg)) : '—'
      }</span>
    </div>`
    )
    .join('')

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    width: 80mm;
    padding: 3mm 4mm 6mm;
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 3mm;
    line-height: 1.5;
    color: #000;
  }
  .center { text-align: center; }
  .title { font-size: 4mm; font-weight: 700; }
  .muted { font-size: 2.6mm; color: #333; }
  .rule { border-top: 0.35mm dashed #000; margin: 2mm 0; }
  .row { display: flex; justify-content: space-between; gap: 3mm; margin: 1.2mm 0; }
  .amt { white-space: nowrap; font-variant-numeric: tabular-nums; font-size: 2.7mm; }
</style>
</head>
<body>
  <div class="center">
    <div class="title">${esc(shopName)}</div>
    <div class="muted">Price List</div>
    <div class="muted">${esc(formatDateTime(new Date()))}</div>
  </div>
  <div class="rule"></div>
  ${rows}
  <div class="rule"></div>
  <div class="center muted">${products.length} product${products.length === 1 ? '' : 's'}</div>
</body>
</html>`
}
