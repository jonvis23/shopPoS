import type { ReceiptDraft } from '../../../../shared/ipc'
import { changeDue, formatReceiptNumber, toCurrency } from '../../../../shared/stock'
import { formatDateTime } from '../../../../shared/datetime'

interface ReceiptPreviewProps {
  draft: ReceiptDraft
}

// Mirrors the actual print template (src/main/receiptPrint.ts) as closely as a
// styled-for-screen mockup can — monospace, solid black on white, bold where the
// printed receipt is bold — so what's shown here is a true preview of the printout.
export function ReceiptPreview({ draft }: ReceiptPreviewProps) {
  const { sale } = draft

  return (
    <div className="mx-auto w-full max-w-[300px] rounded-sm bg-white px-4 pb-5 pt-4 font-mono text-[11px] leading-snug text-black shadow-lg shadow-slate-900/10 ring-1 ring-slate-900/5">
      {sale.status === 'VOID' && (
        <div className="mb-2 border-2 border-black py-1 text-center text-[10px] font-bold tracking-widest">VOIDED</div>
      )}

      <div className="text-center">
        <div className="text-sm font-bold uppercase tracking-wide">{draft.shopName || 'Your Shop Name'}</div>
        {draft.shopTagline && <div className="mt-0.5 font-bold">{draft.shopTagline}</div>}
        {draft.headerNote && <div className="mt-0.5">{draft.headerNote}</div>}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px]">
        <span>Receipt {formatReceiptNumber(sale.id)}</span>
        <span>{formatDateTime(sale.createdAt)}</span>
      </div>

      <div className="my-2 border-t-2 border-black" />

      <div>
        <span className="font-bold">Customer:</span> {sale.customerName}
      </div>
      {draft.showCashierName && draft.cashierName && (
        <div>
          <span className="font-bold">Cashier:</span> {draft.cashierName}
        </div>
      )}

      <div className="my-2 border-t border-dashed border-black" />

      {sale.items.map((item) => (
        <div key={item.id} className="my-1.5 flex items-start justify-between gap-2">
          <div>
            <div className="font-bold">{item.productName}</div>
            <div className="text-[10px]">
              {draft.showDualUnit && item.weightPerBag > 0
                ? `${Math.floor(item.quantityKg / item.weightPerBag)} bags ${(item.quantityKg % item.weightPerBag).toFixed(2)}kg`
                : `${item.quantityKg}kg`}{' '}
              x {toCurrency(item.unitPricePerKg)}/kg
            </div>
          </div>
          <span className="shrink-0 font-bold tabular-nums">{toCurrency(item.subtotal)}</span>
        </div>
      ))}

      <div className="my-2 border-t border-dashed border-black" />

      {sale.discount > 0 && (
        <div className="flex justify-between">
          <span>Discount</span>
          <span className="tabular-nums">-{toCurrency(sale.discount)}</span>
        </div>
      )}
      <div className="my-1 flex items-baseline justify-between border-y-2 border-black py-1.5 text-base font-bold">
        <span>TOTAL</span>
        <span className="tabular-nums">{toCurrency(sale.totalAmount)}</span>
      </div>
      <div className="flex justify-between">
        <span>Cash / M-Pesa</span>
        <span className="tabular-nums">
          {toCurrency(sale.cashPaid)} / {toCurrency(sale.mpesaPaid)}
        </span>
      </div>
      {sale.mpesaRef && (
        <div className="flex justify-between">
          <span>M-Pesa code</span>
          <span className="tabular-nums">{sale.mpesaRef}</span>
        </div>
      )}
      {changeDue(sale) > 0 && (
        <div className="mt-0.5 flex justify-between font-bold">
          <span>CHANGE</span>
          <span className="tabular-nums">{toCurrency(changeDue(sale))}</span>
        </div>
      )}
      {draft.showDebtBalance && sale.debtAmount > 0 && (
        <div className="mt-0.5 flex justify-between font-bold">
          <span>Debt</span>
          <span className="tabular-nums">{toCurrency(sale.debtAmount)}</span>
        </div>
      )}
      {sale.status === 'VOID' && (
        <>
          <div className="my-2 border-t border-dashed border-black" />
          <div className="font-bold">Voided {sale.voidedAt ? formatDateTime(sale.voidedAt) : ''}</div>
          {sale.voidReason && <div>Reason: {sale.voidReason}</div>}
        </>
      )}

      <div className="my-2 border-t border-dashed border-black" />
      <div className="text-center font-bold">{draft.footerNote}</div>
    </div>
  )
}
