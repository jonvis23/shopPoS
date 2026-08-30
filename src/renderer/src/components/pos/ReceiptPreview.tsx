import type { ReceiptDraft } from '../../../../shared/ipc'
import { changeDue, formatReceiptNumber, toCurrency } from '../../../../shared/stock'
import { formatDateTime } from '../../../../shared/datetime'

interface ReceiptPreviewProps {
  draft: ReceiptDraft
}

// Mirrors the actual print template (src/main/receiptPrint.ts) as closely as a
// styled-for-screen mockup can — monospace, black-on-white, dashed rules — so
// what's shown here is a true preview of what comes out of the printer, not a
// prettier stand-in for it.
export function ReceiptPreview({ draft }: ReceiptPreviewProps) {
  const { sale } = draft

  return (
    <div className="mx-auto w-full max-w-[300px] rounded-sm bg-white p-4 font-mono text-[11px] leading-relaxed text-black shadow-lg shadow-slate-900/10 ring-1 ring-slate-900/5">
      {sale.status === 'VOID' && (
        <div className="mb-2 border border-black py-1 text-center text-[10px] font-bold tracking-widest">VOIDED</div>
      )}
      <div className="text-center">
        <div className="text-sm font-bold">{draft.shopName || 'Your Shop Name'}</div>
        {draft.shopTagline && <div className="text-[10px] text-neutral-600">{draft.shopTagline}</div>}
        {draft.headerNote && <div className="text-[10px] text-neutral-600">{draft.headerNote}</div>}
        <div className="text-[10px] text-neutral-600">Receipt {formatReceiptNumber(sale.id)}</div>
        <div className="text-[10px] text-neutral-600">{formatDateTime(sale.createdAt)}</div>
      </div>
      <div className="my-2 border-t border-dashed border-black" />
      <div>Customer: {sale.customerName}</div>
      {draft.showCashierName && draft.cashierName && <div>Cashier: {draft.cashierName}</div>}
      <div className="my-2 border-t border-dashed border-black" />
      <div className="flex flex-col gap-1">
        {sale.items.map((item) => (
          <div key={item.id} className="flex justify-between gap-2">
            <span>
              {item.productName}
              <br />
              <span className="text-[10px] text-neutral-600">
                x{' '}
                {draft.showDualUnit && item.weightPerBag > 0
                  ? `${Math.floor(item.quantityKg / item.weightPerBag)} bags ${(item.quantityKg % item.weightPerBag).toFixed(2)}kg`
                  : `${item.quantityKg}kg`}
                {' @ '}
                {toCurrency(item.unitPricePerKg)}/kg
              </span>
            </span>
            <span className="shrink-0 tabular-nums">{toCurrency(item.subtotal)}</span>
          </div>
        ))}
      </div>
      <div className="my-2 border-t border-dashed border-black" />
      {sale.discount > 0 && (
        <div className="flex justify-between">
          <span>Discount</span>
          <span className="tabular-nums">-{toCurrency(sale.discount)}</span>
        </div>
      )}
      <div className="flex justify-between text-sm font-bold">
        <span>TOTAL</span>
        <span className="tabular-nums">{toCurrency(sale.totalAmount)}</span>
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-neutral-600">
        <span>Cash / M-Pesa</span>
        <span className="tabular-nums">
          {toCurrency(sale.cashPaid)} / {toCurrency(sale.mpesaPaid)}
        </span>
      </div>
      {changeDue(sale) > 0 && (
        <div className="mt-1 flex justify-between text-[10px] font-bold">
          <span>CHANGE</span>
          <span className="tabular-nums">{toCurrency(changeDue(sale))}</span>
        </div>
      )}
      {draft.showDebtBalance && sale.debtAmount > 0 && (
        <div className="mt-1 flex justify-between text-[10px] font-bold">
          <span>Debt</span>
          <span className="tabular-nums">{toCurrency(sale.debtAmount)}</span>
        </div>
      )}
      {sale.status === 'VOID' && (
        <>
          <div className="my-2 border-t border-dashed border-black" />
          <div className="text-[10px] font-bold">
            Voided {sale.voidedAt ? formatDateTime(sale.voidedAt) : ''}
          </div>
          {sale.voidReason && <div className="text-[10px]">Reason: {sale.voidReason}</div>}
        </>
      )}
      <div className="my-2 border-t border-dashed border-black" />
      <div className="text-center text-[10px] text-neutral-600">{draft.footerNote}</div>
    </div>
  )
}
