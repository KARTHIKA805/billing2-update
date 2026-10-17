import React, { useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { SaleRecord, Customer, UserRole, CartItem, ShopIdentity } from '../types';
import { canEditBills } from '../utils/access';
import { Clock, Eye, Pencil, Printer, Search, Trash2, X } from 'lucide-react';
import ReceiptPrintBlock from './ReceiptPrintBlock';
import { formatPaymentLabel } from '../utils/receiptFormat';

interface BillsHistoryProps {
  sales: SaleRecord[];
  customers: Customer[];
  userRole: UserRole;
  shop?: ShopIdentity;
  onUpdateSale: (sale: SaleRecord) => Promise<void>;
  onVoidSale: (sale: SaleRecord) => Promise<void>;
}

const isToday = (date: Date) => {
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
};

const BillsHistory: React.FC<BillsHistoryProps> = ({ sales, customers, userRole, shop, onUpdateSale, onVoidSale }) => {
  const [search, setSearch] = useState('');
  const [selectedSale, setSelectedSale] = useState<SaleRecord | null>(null);
  const [editingSale, setEditingSale] = useState<SaleRecord | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [printTargetSaleId, setPrintTargetSaleId] = useState<string | null>(null);

  const customerNameById = useMemo(() => {
    const map = new Map<string, string>();
    customers.forEach((customer) => map.set(customer.id, customer.name));
    return map;
  }, [customers]);

  const filteredSales = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...sales]
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .filter((sale) => {
        if (!query) return true;
        const customerName = sale.customerId ? customerNameById.get(sale.customerId) : sale.billLabel;
        const haystack = [
          sale.id,
          customerName,
          sale.billLabel,
          sale.paymentMethod,
          ...sale.items.map((item) => item.name)
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(query);
      });
  }, [sales, search, customerNameById]);

  const todayTotal = useMemo(
    () => sales.filter((sale) => isToday(sale.timestamp)).reduce((sum, sale) => sum + sale.total, 0),
    [sales]
  );

  const getDisplayCustomer = (sale: SaleRecord) => {
    if (sale.customerId) return customerNameById.get(sale.customerId) || 'Registered Customer';
    return sale.billLabel || sale.customerName || 'Walk-in Customer';
  };

  const openEdit = (sale: SaleRecord) => {
    setEditingSale({
      ...sale,
      items: sale.items.map((item) => ({ ...item }))
    });
    setError('');
  };

  const updateEditItemQty = (cartLineId: string, delta: number) => {
    if (!editingSale) return;
    setEditingSale({
      ...editingSale,
      items: editingSale.items
        .map((item) => item.cartLineId === cartLineId
          ? { ...item, quantity: Math.max(0, item.quantity + delta) }
          : item)
        .filter((item) => item.quantity > 0)
    });
  };

  const recalculateSale = (items: CartItem[], discountAmount = 0): Pick<SaleRecord, 'subtotal' | 'total' | 'roundingAdjustment' | 'paidAmount'> => {
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const beforeRound = subtotal - discountAmount;
    const roundingAdjustment = parseFloat((Math.round(beforeRound) - beforeRound).toFixed(2));
    const total = parseFloat((beforeRound + roundingAdjustment).toFixed(2));
    return { subtotal, total, roundingAdjustment, paidAmount: total };
  };

  const saveEdit = async () => {
    if (!editingSale || editingSale.items.length === 0) {
      setError('Bill must contain at least one item.');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      const totals = recalculateSale(editingSale.items, editingSale.discountAmount ?? 0);
      await onUpdateSale({
        ...editingSale,
        ...totals,
        pointsEarned: Math.floor(totals.total)
      });
      setEditingSale(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to update bill.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleVoid = async (sale: SaleRecord) => {
    if (!window.confirm(`Void bill for ${getDisplayCustomer(sale)} (₹${sale.total.toFixed(2)})?`)) return;
    setIsSaving(true);
    setError('');
    try {
      await onVoidSale(sale);
      if (selectedSale?.id === sale.id) setSelectedSale(null);
      if (editingSale?.id === sale.id) setEditingSale(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to void bill.');
    } finally {
      setIsSaving(false);
    }
  };

  const runBrowserPrint = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
      });
    });
  }, []);

  const printSale = (sale: SaleRecord) => {
    setSelectedSale(sale);
    setPrintTargetSaleId(sale.id);
    window.setTimeout(() => {
      runBrowserPrint();
    }, 250);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20 md:pb-0">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-border)]">Today&apos;s billing total</p>
          <p className="text-3xl font-bold text-[var(--brand-dark)] mt-1">₹{todayTotal.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-border)]">Bills recorded</p>
          <p className="text-3xl font-bold text-[var(--brand-dark)] mt-1">{sales.length}</p>
        </div>
        <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-border)]">Showing</p>
          <p className="text-3xl font-bold text-[var(--brand-dark)] mt-1">{filteredSales.length}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] overflow-hidden">
        <div className="p-4 md:p-5 border-b border-[var(--brand-border)] flex flex-col md:flex-row md:items-center gap-3 justify-between">
          <div>
            <h3 className="text-lg font-bold text-[var(--brand-dark)]">Bills History</h3>
            <p className="text-sm text-[var(--brand-border)]">Separate bill records for each customer checkout.</p>
          </div>
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--brand-border)]" size={18} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search bill, customer, item..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[var(--brand-border)] bg-white text-sm"
            />
          </div>
        </div>

        {error && (
          <div className="mx-4 md:mx-5 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="data-table-wrap">
          <table className="data-table">
            <thead className="bg-[var(--brand-muted)] border-b border-[var(--brand-border)]">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-[var(--brand-border)]">Bill</th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-[var(--brand-border)]">Customer</th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-[var(--brand-border)]">Items</th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-[var(--brand-border)]">Payment</th>
                <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wide text-[var(--brand-border)]">Total</th>
                <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wide text-[var(--brand-border)]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--brand-border)]">
              {filteredSales.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-10 text-center text-[var(--brand-border)]">No bills found.</td></tr>
              ) : filteredSales.map((sale) => (
                <tr key={sale.id} className="hover:bg-[var(--brand-muted)]/60">
                  <td className="px-6 py-4">
                    <div className="text-sm font-semibold text-[var(--brand-dark)]">#{sale.id.slice(0, 8).toUpperCase()}</div>
                    <div className="text-xs text-[var(--brand-border)] flex items-center gap-1 mt-1">
                      <Clock size={12} /> {sale.timestamp.toLocaleString('en-IN')}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-[var(--brand-dark)]">{getDisplayCustomer(sale)}</td>
                  <td className="px-6 py-4 text-sm text-[var(--brand-border)]">{sale.items.length} items</td>
                  <td className="px-6 py-4 text-sm text-[var(--brand-border)]">{formatPaymentLabel(sale)}</td>
                  <td className="px-6 py-4 text-right text-sm font-bold text-[var(--brand-dark)]">₹{sale.total.toFixed(2)}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => setSelectedSale(sale)} className="p-2 rounded-lg border border-[var(--brand-border)] hover:bg-white" title="View"><Eye size={16} /></button>
                      <button onClick={() => printSale(sale)} className="p-2 rounded-lg border border-[var(--brand-border)] hover:bg-white" title="Print"><Printer size={16} /></button>
                      {canEditBills(userRole) && (
                        <>
                          <button onClick={() => openEdit(sale)} className="p-2 rounded-lg border border-[var(--brand-border)] hover:bg-white" title="Edit"><Pencil size={16} /></button>
                          <button onClick={() => handleVoid(sale)} className="p-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50" title="Void"><Trash2 size={16} /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedSale && !editingSale && (
        <div className="fixed inset-0 bg-[var(--brand-dark)]/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-3 sm:p-4">
          <div className="app-modal-panel bg-[var(--brand-surface)] rounded-2xl shadow-xl border border-[var(--brand-border)] overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-[var(--brand-border)] flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-[var(--brand-dark)]">Bill Details</h3>
                <p className="text-sm text-[var(--brand-border)]">{getDisplayCustomer(selectedSale)}</p>
              </div>
              <button onClick={() => setSelectedSale(null)} className="p-1 text-[var(--brand-border)]"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
              {selectedSale.items.map((item) => (
                <div key={item.cartLineId} className="flex justify-between gap-3 text-sm">
                  <span>{item.name} ({item.unit}) x {item.quantity}</span>
                  <span className="font-semibold">₹{(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
              <div className="border-t border-[var(--brand-border)] pt-3 flex justify-between font-bold text-[var(--brand-dark)]">
                <span>Total</span>
                <span>₹{selectedSale.total.toFixed(2)}</span>
              </div>
              <p className="text-sm text-[var(--brand-border)]">Payment: {formatPaymentLabel(selectedSale)}</p>
            </div>
            <div className="p-4 border-t border-[var(--brand-border)] flex justify-end">
              <button
                type="button"
                onClick={() => printSale(selectedSale)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--brand-dark)] text-white text-sm font-medium hover:bg-[var(--brand-bg)]"
              >
                <Printer size={16} />
                Print
              </button>
            </div>
          </div>
        </div>
      )}

      {editingSale && (
        <div className="fixed inset-0 bg-[var(--brand-dark)]/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-3 sm:p-4">
          <div className="app-modal-panel bg-[var(--brand-surface)] rounded-2xl shadow-xl border border-[var(--brand-border)] overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-[var(--brand-border)] flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-[var(--brand-dark)]">Edit Bill</h3>
                <p className="text-sm text-[var(--brand-border)]">{getDisplayCustomer(editingSale)}</p>
              </div>
              <button onClick={() => setEditingSale(null)} className="p-1 text-[var(--brand-border)]"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
              {editingSale.items.map((item) => (
                <div key={item.cartLineId} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--brand-border)] p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--brand-dark)] truncate">{item.name}</p>
                    <p className="text-xs text-[var(--brand-border)]">{item.unit} • ₹{item.price.toFixed(2)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => updateEditItemQty(item.cartLineId, -1)} className="w-7 h-7 rounded-full bg-[var(--brand-muted)]">-</button>
                    <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                    <button onClick={() => updateEditItemQty(item.cartLineId, 1)} className="w-7 h-7 rounded-full bg-[var(--brand-muted)]">+</button>
                  </div>
                </div>
              ))}
              <div className="flex justify-between font-bold text-[var(--brand-dark)] pt-2">
                <span>New total</span>
                <span>₹{recalculateSale(editingSale.items, editingSale.discountAmount ?? 0).total.toFixed(2)}</span>
              </div>
            </div>
            <div className="p-5 border-t border-[var(--brand-border)] flex justify-end gap-3">
              <button onClick={() => setEditingSale(null)} className="px-4 py-2 rounded-xl border border-[var(--brand-border)]">Cancel</button>
              <button onClick={saveEdit} disabled={isSaving} className="px-4 py-2 rounded-xl bg-[var(--brand-dark)] text-white disabled:opacity-60">
                {isSaving ? 'Saving...' : 'Save Bill'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedSale && createPortal(
        <div className="receipt-print-root" aria-hidden="true">
          <ReceiptPrintBlock
            sale={selectedSale}
            customerLabel={getDisplayCustomer(selectedSale)}
            active={printTargetSaleId === selectedSale.id}
            shop={shop}
          />
        </div>,
        document.body
      )}
    </div>
  );
};

export default BillsHistory;
