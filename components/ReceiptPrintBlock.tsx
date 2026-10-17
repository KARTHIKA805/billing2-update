import { FC } from 'react';
import { SaleRecord } from '../types';
import { SHOP_NAME } from '../constants';
import { ShopIdentity } from '../types';
import { formatPaymentLabel, formatReceiptId } from '../utils/receiptFormat';

interface ReceiptPrintBlockProps {
  sale: SaleRecord;
  customerLabel?: string;
  active?: boolean;
  cashReceived?: number;
  changeDue?: number;
  shop?: ShopIdentity;
}

const ReceiptPrintBlock: FC<ReceiptPrintBlockProps> = ({
  sale,
  customerLabel,
  active = false,
  cashReceived,
  changeDue,
  shop,
}) => {
  const shopName = shop?.name || SHOP_NAME;
  const label = customerLabel || sale.billLabel || sale.customerName || 'Walk-in Customer';
  const receiptTimestamp = sale.timestamp.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div
      className={`thermal-receipt-print font-bold ${active ? 'thermal-receipt-print--active' : ''}`}
      aria-hidden="true"
    >
      <div className="thermal-receipt-print__header font-bold">
        <div className="font-bold text-[12px] uppercase tracking-wide">{shopName}</div>
        <div className="font-bold text-[10px] mt-1">Bill: {formatReceiptId(sale.id)}</div>
        <div className="font-bold text-[10px]">{receiptTimestamp}</div>
      </div>
      <div className="thermal-receipt-print__divider" />
      <div className="space-y-1 text-[10px] font-bold thermal-receipt-print__group">
        <div className="font-bold">{label}</div>
        {sale.items.map((item) => (
          <div key={item.cartLineId} className="flex justify-between gap-2 font-bold">
            <span className="flex-1 font-bold">{item.name} ({item.unit}) x {item.quantity}</span>
            <span className="font-bold">₹{(item.price * item.quantity).toFixed(2)}</span>
          </div>
        ))}
        <div className="flex justify-between text-[10px] font-bold pt-1">
          <span>Subtotal</span>
          <span>₹{(sale.subtotal ?? sale.total).toFixed(2)}</span>
        </div>
        {(sale.discountAmount ?? 0) > 0 && (
          <div className="flex justify-between text-[10px] font-bold">
            <span>Discount</span>
            <span>-₹{(sale.discountAmount ?? 0).toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between text-[10px] font-bold pt-1 border-t border-dashed border-slate-200">
          <span>Total</span>
          <span>₹{sale.total.toFixed(2)}</span>
        </div>
      </div>
      <div className="thermal-receipt-print__divider" />
      <div className="text-[10px] text-center font-bold">
        <div>Payment: {formatPaymentLabel(sale)}</div>
        {cashReceived !== undefined && (
          <>
            <div>Received: ₹{cashReceived.toFixed(2)}</div>
            <div>Change: ₹{(changeDue ?? 0).toFixed(2)}</div>
          </>
        )}
        <div>Thank you for shopping!</div>
      </div>
    </div>
  );
};

export default ReceiptPrintBlock;
