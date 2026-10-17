import { FC, useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Product, CartItem, Customer, NewSalePayload, SaleRecord, PrintMode, PaymentMethod, ShopIdentity } from '../types';
import { Search, Plus, Minus, CheckCircle, ShoppingBag, User, X, Award, Smartphone, Banknote, Printer, HelpCircle, PauseCircle, RotateCcw, Split } from 'lucide-react';
import BillingHelpSheet from './BillingHelpSheet';
import ReceiptPrintBlock from './ReceiptPrintBlock';
import { SHOP_QR_CODE_URL, getPriceForWeight, getCostForWeight, getCartLineId, getWeightPriceBreakdown, formatInventoryUnitPrice, isPieceUnit, PIECE_UNIT, getPieceBillingOptions, getPieceCartLineId } from '../constants';
import { formatReceiptId } from '../utils/receiptFormat';
import { loadHeldBills, addHeldBill, removeHeldBill, HeldBillSession } from '../utils/heldBills';

interface BillingProps {
  products: Product[];
  customers: Customer[];
  categories: import('../types').Category[];
  salesTodayTotal: number;
  shop?: ShopIdentity;
  onCompleteSales: (sales: NewSalePayload[]) => Promise<SaleRecord[]>;
}

interface CompletedBill {
  groupId: string;
  sale: SaleRecord;
  cashReceived?: number;
  changeDue?: number;
}

interface BillGroup {
  id: string;
  name: string;
  customer?: Customer;
  items: CartItem[];
  redeemPoints: boolean;
}

const Billing: FC<BillingProps> = ({ products, customers, categories, salesTodayTotal, shop, onCompleteSales }) => {
  const [groups, setGroups] = useState<BillGroup[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [categoryScrollIndex, setCategoryScrollIndex] = useState(0);
  const [customerSearch, setCustomerSearch] = useState('');
  const [checkoutStep, setCheckoutStep] = useState<'cart' | 'payment' | 'success'>('cart');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>('CASH');
  const [splitCashAmount, setSplitCashAmount] = useState('');
  const [splitUpiAmount, setSplitUpiAmount] = useState('');
  const [heldBills, setHeldBills] = useState<HeldBillSession[]>(() => loadHeldBills());
  const [showHeldPanel, setShowHeldPanel] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [saleError, setSaleError] = useState('');
  const [printMode, setPrintMode] = useState<PrintMode>('all');
  const [selectedPrintGroupIds, setSelectedPrintGroupIds] = useState<string[]>([]);
  const [completedBills, setCompletedBills] = useState<CompletedBill[]>([]);
  const [activePrintSaleIds, setActivePrintSaleIds] = useState<string[]>([]);
  const [cashReceived, setCashReceived] = useState('');
  const [pendingPrint, setPendingPrint] = useState(false);
  const [showHelpGuide, setShowHelpGuide] = useState(false);
  const [weightPickerProduct, setWeightPickerProduct] = useState<Product | null>(null);
  const [piecePickerProduct, setPiecePickerProduct] = useState<Product | null>(null);
  const [selectedWeightUnits, setSelectedWeightUnits] = useState<string[]>([]);
  const [selectedPieceCounts, setSelectedPieceCounts] = useState<number[]>([]);
  const hasAutoPrintedRef = useRef(false);

  const categoryNamesFromProducts = useMemo(() => {
    return Array.from(new Set(products.map((product) => product.category).filter(Boolean))).sort();
  }, [products]);

  const combinedCategories = useMemo(() => {
    // Use provided categories with images, but keep any product-derived category names
    const names = new Set<string>();
    categoryNamesFromProducts.forEach(n => names.add(n));
    (categories || []).forEach(c => names.add(c.name));
    return ['All', ...Array.from(names).sort()];
  }, [categoryNamesFromProducts, categories]);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = search.toLowerCase();
    return products
      .filter((p) => {
        const matchesText = p.name.toLowerCase().includes(normalizedSearch) || p.category.toLowerCase().includes(normalizedSearch);
        const matchesCategory = categoryFilter === 'All' || p.category === categoryFilter;
        return matchesText && matchesCategory;
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [products, search, categoryFilter]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return [];
    return customers.filter(c => 
      c.name.toLowerCase().includes(customerSearch.toLowerCase()) || 
      c.phone.includes(customerSearch)
    );
  }, [customers, customerSearch]);

  const activeGroup = useMemo(() => {
    return groups.find((group) => group.id === activeGroupId) ?? groups[0] ?? null;
  }, [groups, activeGroupId]);

  const billableGroups = useMemo(
    () => groups.filter((group) => group.items.length > 0),
    [groups]
  );

  useEffect(() => {
    setSelectedPrintGroupIds((prev) => prev.filter((id) => groups.some((group) => group.id === id)));
  }, [groups]);

  const resolvePrintSaleIds = (mode: PrintMode = printMode, bills: CompletedBill[] = completedBills) => {
    if (mode === 'skip' || bills.length === 0) return [];
    if (mode === 'all') return bills.map((bill) => bill.sale.id);
    return bills
      .filter((bill) => selectedPrintGroupIds.includes(bill.groupId))
      .map((bill) => bill.sale.id);
  };

  const runBrowserPrint = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
      });
    });
  }, []);

  const triggerPrint = (saleIds: string[]) => {
    if (saleIds.length === 0) return;
    setActivePrintSaleIds(saleIds);
    setPendingPrint(true);
  };

  useEffect(() => {
    if (!pendingPrint || activePrintSaleIds.length === 0) return;
    const timer = window.setTimeout(() => {
      runBrowserPrint();
      setPendingPrint(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [pendingPrint, activePrintSaleIds, runBrowserPrint]);

  useEffect(() => {
    if (checkoutStep !== 'success') {
      hasAutoPrintedRef.current = false;
      return;
    }
    if (hasAutoPrintedRef.current || completedBills.length === 0 || printMode === 'skip') return;

    const saleIds = resolvePrintSaleIds(printMode, completedBills);
    if (saleIds.length === 0) return;

    hasAutoPrintedRef.current = true;
    triggerPrint(saleIds);
  }, [checkoutStep, completedBills, printMode, selectedPrintGroupIds]);

  const clearCustomerFromGroup = (groupId: string) => {
    setGroups((prev) => prev.map((group) => {
      if (group.id !== groupId) return group;
      return { ...group, customer: undefined, redeemPoints: false };
    }));
    setCustomerSearch('');
  };

  const createGroup = (name: string, customer?: Customer) => {
    const id = `grp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newGroup: BillGroup = {
      id,
      name,
      customer,
      items: [],
      redeemPoints: false,
    };
    setGroups((prev) => [...prev, newGroup]);
    setActiveGroupId(id);
    setCustomerSearch('');
  };

  const assignCustomerToGroup = (customer: Customer) => {
    if (!activeGroup) {
      createGroup(`Customer ${groups.length + 1}`, customer);
      return;
    }
    setGroups((prev) => prev.map((group) => {
      if (group.id !== activeGroup.id) return group;
      return { ...group, customer, redeemPoints: false };
    }));
    setCustomerSearch('');
  };

  const toggleRedeemPoints = (enabled: boolean) => {
    if (!activeGroup) return;
    setGroups((prev) => prev.map((group) => {
      if (group.id !== activeGroup.id) return group;
      return { ...group, redeemPoints: enabled };
    }));
  };

  const addToCartWithPieces = (product: Product, pieceCount: number) => {
    const unitPrice = product.price;
    const unitCost = product.cost;
    const cartLineId = getPieceCartLineId(product.id);
    const cartItem: CartItem = {
      ...product,
      unit: PIECE_UNIT,
      price: unitPrice,
      cost: unitCost,
      quantity: pieceCount,
      cartLineId,
    };

    const addItemToGroup = (groupId: string | null, createIfMissing: boolean) => {
      if (!groupId && createIfMissing) {
        const groupName = `Customer ${groups.length + 1}`;
        const group: BillGroup = {
          id: `grp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: groupName,
          items: [cartItem],
          redeemPoints: false,
        };
        setGroups((prev) => [...prev, group]);
        setActiveGroupId(group.id);
        return;
      }

      setGroups((prev) => prev.map((group) => {
        if (group.id !== groupId) return group;
        const existing = group.items.find((item) => item.cartLineId === cartLineId);
        if (existing) {
          const newQuantity = Math.min(existing.quantity + pieceCount, product.stock);
          return {
            ...group,
            items: group.items.map((item) => item.cartLineId === cartLineId ? { ...item, quantity: newQuantity } : item),
          };
        }
        return {
          ...group,
          items: [...group.items, cartItem],
        };
      }));
    };

    if (!activeGroup) {
      addItemToGroup(null, true);
      return;
    }

    addItemToGroup(activeGroup.id, false);
  };

  const addToCartWithWeight = (product: Product, selectedUnit: string) => {
    const unitPrice = getPriceForWeight(product.price, product.unit, selectedUnit);
    const unitCost = getCostForWeight(product.cost, product.unit, selectedUnit);
    const cartLineId = getCartLineId(product.id, selectedUnit);
    const cartItem: CartItem = {
      ...product,
      unit: selectedUnit,
      price: unitPrice,
      cost: unitCost,
      quantity: 1,
      cartLineId,
    };

    if (!activeGroup) {
      const groupName = `Customer ${groups.length + 1}`;
      const group: BillGroup = {
        id: `grp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: groupName,
        items: [cartItem],
        redeemPoints: false,
      };
      setGroups((prev) => [...prev, group]);
      setActiveGroupId(group.id);
      return;
    }

    setGroups((prev) => prev.map((group) => {
      if (group.id !== activeGroup.id) return group;
      const existing = group.items.find((item) => item.cartLineId === cartLineId);
      if (existing) {
        const newQuantity = Math.min(existing.quantity + 1, product.stock);
        return {
          ...group,
          items: group.items.map((item) => item.cartLineId === cartLineId ? { ...item, quantity: newQuantity } : item),
        };
      }
      return {
        ...group,
        items: [...group.items, cartItem],
      };
    }));
  };

  const openWeightPicker = (product: Product) => {
    setPiecePickerProduct(null);
    setSelectedPieceCounts([]);
    setSelectedWeightUnits([]);
    setWeightPickerProduct(product);
  };

  const openPiecePicker = (product: Product) => {
    setWeightPickerProduct(null);
    setSelectedWeightUnits([]);
    setSelectedPieceCounts([]);
    setPiecePickerProduct(product);
  };

  const handleProductSelect = (product: Product) => {
    if (isPieceUnit(product.unit)) {
      openPiecePicker(product);
      return;
    }
    openWeightPicker(product);
  };

  const closeWeightPicker = () => {
    setWeightPickerProduct(null);
    setSelectedWeightUnits([]);
  };

  const closePiecePicker = () => {
    setPiecePickerProduct(null);
    setSelectedPieceCounts([]);
  };

  const toggleWeightUnitSelection = (unit: string) => {
    setSelectedWeightUnits((prev) =>
      prev.includes(unit) ? prev.filter((selected) => selected !== unit) : [...prev, unit]
    );
  };

  const togglePieceCountSelection = (count: number) => {
    setSelectedPieceCounts((prev) =>
      prev.includes(count) ? prev.filter((selected) => selected !== count) : [...prev, count]
    );
  };

  const handleAddSelectedPieces = () => {
    if (!piecePickerProduct || selectedPieceCounts.length === 0) return;
    const totalPieces = selectedPieceCounts.reduce((sum, count) => sum + count, 0);
    addToCartWithPieces(piecePickerProduct, totalPieces);
    setSelectedPieceCounts([]);
    closePiecePicker();
  };

  const handleAddSelectedWeights = () => {
    if (!weightPickerProduct || selectedWeightUnits.length === 0) return;
    selectedWeightUnits.forEach((unit) => addToCartWithWeight(weightPickerProduct, unit));
    setSelectedWeightUnits([]);
    closeWeightPicker();
  };

  const updateQuantity = (groupId: string, cartLineId: string, delta: number) => {
    setGroups((prev) => prev.map((group) => {
      if (group.id !== groupId) return group;
      return {
        ...group,
        items: group.items.map((item) => {
          if (item.cartLineId === cartLineId) {
            const newQty = Math.max(0, Math.min(item.quantity + delta, item.stock));
            return { ...item, quantity: newQty };
          }
          return item;
        }).filter((item) => item.quantity > 0),
      };
    }));
  };

  const removeGroup = (groupId: string) => {
    setGroups((prev) => {
      const next = prev.filter((group) => group.id !== groupId);
      if (activeGroupId === groupId) {
        setActiveGroupId(next[0]?.id ?? null);
      }
      return next;
    });
  };

  const removeItem = (groupId: string, cartLineId: string) => {
    setGroups((prev) => prev.map((group) => {
      if (group.id !== groupId) return group;
      return { ...group, items: group.items.filter((it) => it.cartLineId !== cartLineId) };
    }));
  };

  const getGroupSubtotal = (group: BillGroup) => group.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const getGroupDiscount = (group: BillGroup) => {
    if (!group.redeemPoints || !group.customer) return 0;
    return Math.min(getGroupSubtotal(group), 50);
  };
  const getGroupTotal = (group: BillGroup) => {
    const subtotal = getGroupSubtotal(group);
    const discount = getGroupDiscount(group);
    return parseFloat((subtotal - discount).toFixed(2));
  };

  const totalSubtotal = groups.reduce((sum, group) => sum + getGroupSubtotal(group), 0);
  const totalDiscount = groups.reduce((sum, group) => sum + getGroupDiscount(group), 0);
  const invoiceTotalBeforeRound = totalSubtotal - totalDiscount;
  const roundingAdjustment = parseFloat((Math.round(invoiceTotalBeforeRound) - invoiceTotalBeforeRound).toFixed(2));
  const finalTotal = parseFloat((invoiceTotalBeforeRound + roundingAdjustment).toFixed(2));
  const paidAmount = finalTotal;

  const combinedItems = groups.flatMap((group) => group.items);
  const activeGroupSubtotal = activeGroup ? getGroupSubtotal(activeGroup) : 0;
  const activeGroupItems = activeGroup?.items ?? [];
  const activeGroupCanRedeem = !!activeGroup?.customer && activeGroup.customer.loyaltyPoints >= 50 && activeGroupItems.length > 0;
  const activeGroupRedeemPoints = activeGroup?.redeemPoints ?? false;
  const hasInvoiceItems = groups.some((group) => group.items.length > 0);

  const handleProceedToPayment = () => {
    if (!hasInvoiceItems) return;
    setSplitCashAmount('');
    setSplitUpiAmount('');
    setCheckoutStep('payment');
  };

  const refreshHeldBills = () => setHeldBills(loadHeldBills());

  const handleHoldBill = () => {
    if (!hasInvoiceItems) return;
    const defaultLabel = activeGroup?.customer?.name ?? activeGroup?.name ?? `Held ${heldBills.length + 1}`;
    const label = window.prompt('Label for held bill (optional):', defaultLabel);
    if (label === null) return;

    const session: HeldBillSession = {
      id: `held-${Date.now()}`,
      label: label.trim() || defaultLabel,
      savedAt: new Date().toISOString(),
      groups: groups.map((group) => ({
        ...group,
        items: group.items.map((item) => ({ ...item })),
      })),
      activeGroupId,
    };
    addHeldBill(session);
    refreshHeldBills();
    setGroups([]);
    setActiveGroupId(null);
    setCustomerSearch('');
  };

  const handleResumeHeldBill = (session: HeldBillSession) => {
    if (hasInvoiceItems) {
      const ok = window.confirm('Current cart has items. Replace with held bill?');
      if (!ok) return;
    }
    setGroups(session.groups.map((group) => ({
      ...group,
      items: group.items.map((item) => ({ ...item })),
    })));
    setActiveGroupId(session.activeGroupId);
    removeHeldBill(session.id);
    refreshHeldBills();
    setShowHeldPanel(false);
    setCheckoutStep('cart');
  };

  const handleDeleteHeldBill = (id: string) => {
    removeHeldBill(id);
    refreshHeldBills();
  };

  const buildSaleEntries = () => {
    const splitCashTotal = paymentMethod === 'SPLIT' ? parseFloat(splitCashAmount) || 0 : 0;
    const splitUpiTotal = paymentMethod === 'SPLIT' ? parseFloat(splitUpiAmount) || 0 : 0;

    const entries = billableGroups.map((group) => {
      const subtotal = getGroupSubtotal(group);
      const discount = getGroupDiscount(group);
      const beforeRound = subtotal - discount;
      const rounding = parseFloat((Math.round(beforeRound) - beforeRound).toFixed(2));
      const total = parseFloat((beforeRound + rounding).toFixed(2));
      return {
        groupId: group.id,
        payload: {
          items: group.items,
          subtotal,
          total,
          taxAmount: 0,
          roundingAdjustment: rounding,
          paidAmount: total,
          paymentMethod: (paymentMethod || 'CASH') as PaymentMethod,
          customerId: group.customer?.id,
          customerName: group.customer?.name,
          billLabel: group.customer?.name ?? group.name,
          pointsRedeemed: discount > 0 ? 50 : 0,
          pointsEarned: Math.floor(total),
          discountAmount: discount,
        } satisfies NewSalePayload,
      };
    });

    if (paymentMethod !== 'SPLIT' || finalTotal <= 0) return entries;

    let assignedCash = 0;
    let assignedUpi = 0;
    return entries.map((entry, index) => {
      let cashPaid: number;
      let upiPaid: number;
      if (index === entries.length - 1) {
        cashPaid = parseFloat((splitCashTotal - assignedCash).toFixed(2));
        upiPaid = parseFloat((splitUpiTotal - assignedUpi).toFixed(2));
      } else {
        const ratio = entry.payload.total / finalTotal;
        cashPaid = parseFloat((splitCashTotal * ratio).toFixed(2));
        upiPaid = parseFloat((splitUpiTotal * ratio).toFixed(2));
        assignedCash += cashPaid;
        assignedUpi += upiPaid;
      }
      return {
        ...entry,
        payload: {
          ...entry.payload,
          paymentMethod: 'SPLIT',
          cashPaid,
          upiPaid,
        },
      };
    });
  };

  const handleConfirmPayment = async () => {
    setIsProcessing(true);
    setSaleError('');
    try {
      const entries = buildSaleEntries();
      if (entries.length === 0) {
        throw new Error('No billable items found.');
      }
      const createdSales = await onCompleteSales(entries.map((entry) => entry.payload));
      const cashAmount = paymentMethod === 'CASH' && cashReceived.trim()
        ? parseFloat(cashReceived)
        : undefined;
      const bills: CompletedBill[] = entries.map((entry, index) => ({
        groupId: entry.groupId,
        sale: createdSales[index],
        cashReceived: entries.length === 1 && cashAmount !== undefined && !Number.isNaN(cashAmount)
          ? cashAmount
          : undefined,
        changeDue: entries.length === 1 && cashAmount !== undefined && !Number.isNaN(cashAmount)
          ? parseFloat(Math.max(0, cashAmount - createdSales[index].total).toFixed(2))
          : undefined,
      }));
      setCompletedBills(bills);
      setCheckoutStep('success');
    } catch (err: any) {
      const msg = err?.message || String(err) || 'Unknown error';
      if (/fetch|network|connect/i.test(msg)) {
        setSaleError('Network error: could not reach the database. Check your internet connection and try again.');
      } else {
        setSaleError(`Sale failed: ${msg}`);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStartNewBill = () => {
    setGroups([]);
    setActiveGroupId(null);
    setCustomerSearch('');
    setCheckoutStep('cart');
    setPaymentMethod('CASH');
    setSplitCashAmount('');
    setSplitUpiAmount('');
    setSaleError('');
    setPrintMode('all');
    setSelectedPrintGroupIds([]);
    setCompletedBills([]);
    setActivePrintSaleIds([]);
    setCashReceived('');
    setPendingPrint(false);
    setShowHeldPanel(false);
    hasAutoPrintedRef.current = false;
  };

  const printReceipt = (saleIds?: string[]) => {
    const ids = saleIds ?? resolvePrintSaleIds();
    triggerPrint(ids);
  };

  const togglePrintGroupSelection = (groupId: string) => {
    setSelectedPrintGroupIds((prev) => {
      if (prev.includes(groupId)) return prev.filter((id) => id !== groupId);
      return [...prev, groupId];
    });
  };

  const handlePrintModeChange = (mode: PrintMode) => {
    setPrintMode(mode);
    if (mode === 'selected') {
      setSelectedPrintGroupIds((prev) => {
        if (prev.length > 0) return prev.filter((id) => billableGroups.some((group) => group.id === id));
        return billableGroups.map((group) => group.id);
      });
      return;
    }
    setSelectedPrintGroupIds([]);
  };

  const weightPickerOptions = useMemo(() => {
    if (!weightPickerProduct) return [];
    return getWeightPriceBreakdown(weightPickerProduct.price, weightPickerProduct.unit, weightPickerProduct.cost);
  }, [weightPickerProduct]);

  const piecePickerOptions = useMemo(() => {
    if (!piecePickerProduct) return [];
    return getPieceBillingOptions(piecePickerProduct.price);
  }, [piecePickerProduct]);

  const selectedWeightTotal = useMemo(() => {
    if (!weightPickerProduct || selectedWeightUnits.length === 0) return 0;
    return selectedWeightUnits.reduce((sum, unit) => {
      return sum + getPriceForWeight(weightPickerProduct.price, weightPickerProduct.unit, unit);
    }, 0);
  }, [weightPickerProduct, selectedWeightUnits]);

  const selectedPieceSummary = useMemo(() => {
    if (!piecePickerProduct || selectedPieceCounts.length === 0) {
      return { totalPieces: 0, totalAmount: 0 };
    }
    const totalPieces = selectedPieceCounts.reduce((sum, count) => sum + count, 0);
    return {
      totalPieces,
      totalAmount: parseFloat((piecePickerProduct.price * totalPieces).toFixed(2)),
    };
  }, [piecePickerProduct, selectedPieceCounts]);

  const cashReceivedAmount = cashReceived.trim() ? parseFloat(cashReceived) : NaN;
  const checkoutChangeDue = paymentMethod === 'CASH' && !Number.isNaN(cashReceivedAmount) && cashReceivedAmount >= finalTotal
    ? parseFloat((cashReceivedAmount - finalTotal).toFixed(2))
    : null;

  const splitCashParsed = splitCashAmount.trim() ? parseFloat(splitCashAmount) : NaN;
  const splitUpiParsed = splitUpiAmount.trim() ? parseFloat(splitUpiAmount) : NaN;
  const splitIsValid = paymentMethod !== 'SPLIT' || (
    !Number.isNaN(splitCashParsed) &&
    !Number.isNaN(splitUpiParsed) &&
    splitCashParsed >= 0 &&
    splitUpiParsed >= 0 &&
    Math.abs(splitCashParsed + splitUpiParsed - finalTotal) < 0.01
  );

  if (checkoutStep === 'success') {
    const printedCount = printMode === 'skip' ? 0 : resolvePrintSaleIds().length;

    return (
      <div className="h-full flex flex-col items-center justify-center animate-fade-in p-4 sm:p-6 md:p-8 overflow-y-auto">
        <div className="text-center mb-5">
          <div className="bg-[var(--brand-accent)]/20 p-6 rounded-full text-[var(--brand-dark)] mb-4 animate-scale-up inline-flex">
            <CheckCircle size={56} />
          </div>
          <h2 className="text-2xl font-bold text-[var(--brand-dark)] mb-2">Payment Successful!</h2>
          <p className="text-[var(--brand-border)] text-sm">
            {printMode === 'skip'
              ? 'Transaction recorded. No receipt was printed automatically.'
              : `${printedCount} receipt${printedCount === 1 ? '' : 's'} sent to printer.`}
          </p>
          {completedBills.length > 1 && paymentMethod === 'CASH' && checkoutChangeDue !== null && (
            <p className="text-sm font-semibold text-[var(--brand-dark)] mt-2">
              Total received ₹{cashReceivedAmount.toFixed(2)} • Change ₹{checkoutChangeDue.toFixed(2)}
            </p>
          )}
        </div>

        <div className="w-full max-w-lg space-y-3 mb-5">
          {completedBills.map((bill) => {
            const label = bill.sale.billLabel || bill.sale.customerName || 'Walk-in Customer';
            const wasPrinted = printMode !== 'skip' && resolvePrintSaleIds().includes(bill.sale.id);
            return (
              <div key={bill.sale.id} className="rounded-xl border border-[var(--brand-border)] bg-white p-4 flex items-center justify-between gap-3">
                <div className="min-w-0 text-left">
                  <p className="font-semibold text-[var(--brand-dark)] truncate">{label}</p>
                  <p className="text-xs text-[var(--brand-border)] mt-0.5">
                    {formatReceiptId(bill.sale.id)} • ₹{bill.sale.total.toFixed(2)}
                    {wasPrinted ? ' • Printed' : printMode === 'skip' ? ' • Not printed' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => printReceipt([bill.sale.id])}
                  className="inline-flex items-center gap-1.5 shrink-0 px-3 py-2 rounded-lg border border-[var(--brand-border)] text-sm font-medium text-[var(--brand-dark)] hover:bg-[var(--brand-muted)]"
                >
                  <Printer size={14} />
                  Reprint
                </button>
              </div>
            );
          })}
        </div>

        <div className="w-full max-w-lg mb-4 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-border)] mb-3">Print again</p>
          <div className="flex flex-wrap gap-2 mb-3">
            <button
              type="button"
              className={`px-3 py-2 rounded-xl border text-sm ${printMode === 'all' ? 'bg-[var(--brand-dark)] text-[var(--brand-text-light)]' : 'bg-white text-[var(--brand-border)]'}`}
              onClick={() => handlePrintModeChange('all')}
            >
              All
            </button>
            <button
              type="button"
              className={`px-3 py-2 rounded-xl border text-sm ${printMode === 'selected' ? 'bg-[var(--brand-dark)] text-[var(--brand-text-light)]' : 'bg-white text-[var(--brand-border)]'}`}
              onClick={() => handlePrintModeChange('selected')}
            >
              Selected
            </button>
          </div>
          {printMode === 'selected' && (
            <div className="space-y-2 mb-3 text-sm">
              {completedBills.map((bill) => (
                <label key={bill.groupId} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedPrintGroupIds.includes(bill.groupId)}
                      onChange={() => togglePrintGroupSelection(bill.groupId)}
                    />
                    <span className="truncate">{bill.sale.billLabel || bill.sale.customerName}</span>
                  </div>
                  <span className="text-xs text-[var(--brand-border)] shrink-0">₹{bill.sale.total.toFixed(2)}</span>
                </label>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => printReceipt()}
            disabled={printMode === 'selected' && resolvePrintSaleIds().length === 0}
            className="btn btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {printMode === 'selected'
              ? `Reprint Selected (${resolvePrintSaleIds().length})`
              : `Reprint All (${completedBills.length})`}
          </button>
        </div>

        <button type="button" onClick={handleStartNewBill} className="btn btn-secondary max-w-lg">
          Start New Bill
        </button>

        {createPortal(
          <div className="receipt-print-root" aria-hidden="true">
            {completedBills.map((bill) => (
              <ReceiptPrintBlock
                key={bill.sale.id}
                sale={bill.sale}
                customerLabel={bill.sale.billLabel || bill.sale.customerName}
                active={activePrintSaleIds.includes(bill.sale.id)}
                cashReceived={bill.cashReceived}
                changeDue={bill.changeDue}
                shop={shop}
              />
            ))}
          </div>,
          document.body
        )}
      </div>
    );
  }

  // Payment Selection Screen
  if (checkoutStep === 'payment') {
      return (
          <div className="h-full flex flex-col items-center justify-center animate-fade-in p-3 sm:p-4">
              <div className="bg-[var(--brand-surface)] p-5 sm:p-8 rounded-2xl shadow-xl border border-[var(--brand-border)] max-w-md w-full max-h-[92dvh] overflow-y-auto">
                  <div className="flex justify-between items-center mb-6">
                      <h2 className="text-xl font-bold text-[var(--brand-dark)]">Select Payment Method</h2>
                      <button onClick={() => setCheckoutStep('cart')} className="text-[var(--brand-border)] hover:text-[var(--brand-dark)]">
                          <X size={24} />
                      </button>
                  </div>
                  
                  <div className="text-center mb-6">
                      <p className="text-[var(--brand-border)] text-sm mb-1">Review each customer's bill</p>
                      <h2 className="text-2xl font-bold text-[var(--brand-dark)]">Checkout Review</h2>
                  </div>

                  <div className="space-y-3 mb-8 rounded-3xl border border-[var(--brand-border)] bg-white p-4 text-sm text-[var(--brand-dark)]">
                    {groups.map((group) => (
                      <div key={group.id} className="space-y-1">
                        <div className="flex justify-between font-semibold">
                          <span>{group.customer?.name ?? group.name}</span>
                          <span>₹{getGroupTotal(group).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-[var(--brand-border)] text-xs">
                          <span>Subtotal</span>
                          <span>₹{getGroupSubtotal(group).toFixed(2)}</span>
                        </div>
                        {getGroupDiscount(group) > 0 && (
                          <div className="flex justify-between text-[var(--brand-border)] text-xs">
                            <span>Discount</span>
                            <span>-₹{getGroupDiscount(group).toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-8">
                      <button 
                          onClick={() => { setPaymentMethod('CASH'); setSplitCashAmount(''); setSplitUpiAmount(''); }}
                          className={`p-3 rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition-all ${
                              paymentMethod === 'CASH' ? 'border-[var(--brand-accent)] bg-[var(--brand-accent)]/20 text-[var(--brand-dark)]' : 'border-[var(--brand-border)] bg-[var(--brand-surface)] text-[var(--brand-border)] hover:border-[var(--brand-dark)]'
                          }`}
                      >
                          <Banknote size={28} />
                          <span className="font-semibold text-sm">Cash</span>
                      </button>
                      <button 
                          onClick={() => { setPaymentMethod('UPI'); setSplitCashAmount(''); setSplitUpiAmount(''); }}
                          className={`p-3 rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition-all ${
                              paymentMethod === 'UPI' ? 'border-[var(--brand-accent)] bg-[var(--brand-accent)]/20 text-[var(--brand-dark)]' : 'border-[var(--brand-border)] bg-[var(--brand-surface)] text-[var(--brand-border)] hover:border-[var(--brand-dark)]'
                          }`}
                      >
                          <Smartphone size={28} />
                          <span className="font-semibold text-sm">UPI</span>
                      </button>
                      <button 
                          onClick={() => { setPaymentMethod('SPLIT'); setSplitCashAmount(''); setSplitUpiAmount(''); }}
                          className={`p-3 rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition-all ${
                              paymentMethod === 'SPLIT' ? 'border-[var(--brand-accent)] bg-[var(--brand-accent)]/20 text-[var(--brand-dark)]' : 'border-[var(--brand-border)] bg-[var(--brand-surface)] text-[var(--brand-border)] hover:border-[var(--brand-dark)]'
                          }`}
                      >
                          <Split size={28} />
                          <span className="font-semibold text-sm">Split</span>
                      </button>
                  </div>

                  {paymentMethod === 'CASH' && (
                      <div className="mb-6 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-muted)] p-4 space-y-3">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-[var(--brand-border)]">Amount due</span>
                            <span className="font-bold text-[var(--brand-dark)]">₹{finalTotal.toFixed(2)}</span>
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-[var(--brand-dark)] mb-1.5">Cash received (₹)</label>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              inputMode="decimal"
                              placeholder="Enter amount customer gave"
                              value={cashReceived}
                              onChange={(e) => setCashReceived(e.target.value)}
                              className="w-full px-3 py-2.5 rounded-lg border border-[var(--brand-border)] bg-white text-[var(--brand-text-dark)]"
                            />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {[...new Set([finalTotal, 100, 200, 500, 1000].map((amount) => Number(amount.toFixed(2))))]
                              .sort((a, b) => a - b)
                              .map((amount) => (
                              <button
                                key={amount}
                                type="button"
                                onClick={() => setCashReceived(amount.toFixed(2))}
                                className="px-3 py-1.5 rounded-lg border border-[var(--brand-border)] bg-white text-xs font-medium text-[var(--brand-dark)] hover:bg-[var(--brand-surface)]"
                              >
                                {Math.abs(amount - finalTotal) < 0.01 ? 'Exact' : `₹${amount}`}
                              </button>
                            ))}
                          </div>
                          {checkoutChangeDue !== null && (
                            <div className="rounded-lg bg-[var(--brand-accent)]/25 border border-[var(--brand-border)] px-3 py-2 flex items-center justify-between">
                              <span className="text-sm font-medium text-[var(--brand-dark)]">Change to return</span>
                              <span className="text-lg font-bold text-[var(--brand-dark)]">₹{checkoutChangeDue.toFixed(2)}</span>
                            </div>
                          )}
                          {cashReceived.trim() && checkoutChangeDue === null && (
                            <p className="text-xs text-red-600">Received amount is less than total due.</p>
                          )}
                      </div>
                  )}

                  {paymentMethod === 'UPI' && (
                      <div className="mb-6 text-center bg-[var(--brand-muted)] p-6 rounded-xl border border-[var(--brand-border)] animate-fade-in">
                          <p className="text-sm text-[var(--brand-border)] mb-4">Scan QR to Pay</p>
                          <div className="w-40 h-40 bg-[var(--brand-surface)] p-2 rounded-lg shadow-sm mx-auto mb-4 border border-[var(--brand-border)]">
                              <img src={SHOP_QR_CODE_URL} alt="Shop UPI QR" className="w-full h-full object-contain" />
                          </div>
                      </div>
                  )}

                  {paymentMethod === 'SPLIT' && (
                      <div className="mb-6 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-muted)] p-4 space-y-3 animate-fade-in">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-[var(--brand-border)]">Total due</span>
                            <span className="font-bold text-[var(--brand-dark)]">₹{finalTotal.toFixed(2)}</span>
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-[var(--brand-dark)] mb-1.5">Cash portion (₹)</label>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              inputMode="decimal"
                              placeholder="Cash amount"
                              value={splitCashAmount}
                              onChange={(e) => {
                                const value = e.target.value;
                                setSplitCashAmount(value);
                                const cash = parseFloat(value);
                                if (!Number.isNaN(cash)) {
                                  setSplitUpiAmount(parseFloat(Math.max(0, finalTotal - cash).toFixed(2)).toString());
                                } else {
                                  setSplitUpiAmount('');
                                }
                              }}
                              className="w-full px-3 py-2.5 rounded-lg border border-[var(--brand-border)] bg-white text-[var(--brand-text-dark)]"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-[var(--brand-dark)] mb-1.5">UPI portion (₹)</label>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              inputMode="decimal"
                              placeholder="UPI amount"
                              value={splitUpiAmount}
                              onChange={(e) => {
                                const value = e.target.value;
                                setSplitUpiAmount(value);
                                const upi = parseFloat(value);
                                if (!Number.isNaN(upi)) {
                                  setSplitCashAmount(parseFloat(Math.max(0, finalTotal - upi).toFixed(2)).toString());
                                } else {
                                  setSplitCashAmount('');
                                }
                              }}
                              className="w-full px-3 py-2.5 rounded-lg border border-[var(--brand-border)] bg-white text-[var(--brand-text-dark)]"
                            />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {[0.5, 0.25, 0.75].map((ratio) => {
                              const cash = parseFloat((finalTotal * ratio).toFixed(2));
                              const upi = parseFloat((finalTotal - cash).toFixed(2));
                              const label = ratio === 0.5 ? '50/50' : ratio === 0.25 ? '25% cash' : '75% cash';
                              return (
                                <button
                                  key={ratio}
                                  type="button"
                                  onClick={() => {
                                    setSplitCashAmount(cash.toFixed(2));
                                    setSplitUpiAmount(upi.toFixed(2));
                                  }}
                                  className="px-3 py-1.5 rounded-lg border border-[var(--brand-border)] bg-white text-xs font-medium text-[var(--brand-dark)] hover:bg-[var(--brand-surface)]"
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                          {splitCashAmount.trim() && splitUpiAmount.trim() && !splitIsValid && (
                            <p className="text-xs text-red-600">Cash + UPI must equal ₹{finalTotal.toFixed(2)}.</p>
                          )}
                          {splitIsValid && (
                            <div className="rounded-lg bg-[var(--brand-accent)]/25 border border-[var(--brand-border)] px-3 py-2 text-sm text-[var(--brand-dark)]">
                              Cash ₹{splitCashParsed.toFixed(2)} + UPI ₹{splitUpiParsed.toFixed(2)}
                            </div>
                          )}
                      </div>
                  )}

                  <div className="mb-6 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-muted)] p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-border)] mb-3">After payment, print</p>
                    <div className="flex flex-wrap gap-2 mb-3">
                      <button
                        type="button"
                        className={`px-3 py-2 rounded-xl border text-sm ${printMode === 'all' ? 'bg-[var(--brand-dark)] text-[var(--brand-text-light)]' : 'bg-white text-[var(--brand-border)]'}`}
                        onClick={() => handlePrintModeChange('all')}
                      >
                        All receipts
                      </button>
                      <button
                        type="button"
                        className={`px-3 py-2 rounded-xl border text-sm ${printMode === 'selected' ? 'bg-[var(--brand-dark)] text-[var(--brand-text-light)]' : 'bg-white text-[var(--brand-border)]'}`}
                        onClick={() => handlePrintModeChange('selected')}
                      >
                        Selected only
                      </button>
                      <button
                        type="button"
                        className={`px-3 py-2 rounded-xl border text-sm ${printMode === 'skip' ? 'bg-[var(--brand-dark)] text-[var(--brand-text-light)]' : 'bg-white text-[var(--brand-border)]'}`}
                        onClick={() => handlePrintModeChange('skip')}
                      >
                        Skip print
                      </button>
                    </div>
                    {printMode === 'selected' && (
                      <div className="space-y-2 text-sm">
                        {billableGroups.map((group) => (
                          <label key={group.id} className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={selectedPrintGroupIds.includes(group.id)}
                                onChange={() => togglePrintGroupSelection(group.id)}
                              />
                              <span className="truncate">{group.customer?.name ?? group.name}</span>
                            </div>
                            <span className="text-xs text-[var(--brand-border)] shrink-0">₹{getGroupTotal(group).toFixed(2)}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  <button 
                      onClick={handleConfirmPayment}
                      disabled={!paymentMethod || isProcessing || (paymentMethod === 'SPLIT' && !splitIsValid)}
                      className="w-full bg-[var(--brand-dark)] text-[var(--brand-text-light)] py-4 rounded-xl font-bold text-lg hover:bg-[var(--brand-bg)] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-[var(--brand-border)] flex items-center justify-center gap-3"
                  >
                      {isProcessing ? (
                        <>
                          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                          </svg>
                          Processing...
                        </>
                      ) : (
                        paymentMethod === 'UPI'
                          ? 'Confirm Payment Received'
                          : paymentMethod === 'SPLIT'
                            ? 'Complete Split Payment'
                            : 'Complete Cash Sale'
                      )}
                  </button>
                  {saleError && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm text-center">
                      {saleError}
                    </div>
                  )}
              </div>
          </div>
      )
  }

  return (
    <div className="billing-page">
      <div className="billing-topbar">
        <div className="billing-stat">
          <span className="billing-stat__label">Today</span>
          <span>₹{salesTodayTotal.toFixed(2)}</span>
        </div>
        <div className="billing-stat">
          <span className="billing-stat__label">Queue</span>
          <span>{groups.length}</span>
        </div>
        <div className="billing-stat">
          <span className="billing-stat__label">Active</span>
          <span>₹{(activeGroup ? getGroupTotal(activeGroup) : 0).toFixed(2)}</span>
        </div>
        <div className="billing-search">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--brand-border)] pointer-events-none" size={14} />
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={() => setShowHeldPanel(true)}
          className="billing-stat hover:bg-[var(--brand-muted)] transition-colors"
          title="Held bills"
          aria-label="View held bills"
        >
          <PauseCircle size={14} className="text-[var(--brand-dark)]" />
          <span>Held{heldBills.length > 0 ? ` (${heldBills.length})` : ''}</span>
        </button>
        <button
          type="button"
          onClick={() => setShowHelpGuide(true)}
          className="billing-stat hover:bg-[var(--brand-muted)] transition-colors"
          title="Billing quick guide"
          aria-label="Open billing quick guide"
        >
          <HelpCircle size={14} className="text-[var(--brand-dark)]" />
          <span>Guide</span>
        </button>
      </div>

      <BillingHelpSheet open={showHelpGuide} onClose={() => setShowHelpGuide(false)} />

      <div className="billing-body">
        <section className="billing-products">
          <div className="billing-products__categories category-strip-wrapper">
            <div className="category-strip category-strip--compact">
              <button
                type="button"
                id="cat-filter-all"
                onClick={() => setCategoryFilter('All')}
                className={`category-chip ${categoryFilter === 'All' ? 'category-chip--active' : ''}`}
              >
                <div className="category-chip__img-wrap">
                  <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
                    <circle cx="20" cy="20" r="20" fill="#7f1e2820" />
                    <rect x="10" y="10" width="8" height="8" rx="2" fill="#7f1e28" opacity=".8" />
                    <rect x="22" y="10" width="8" height="8" rx="2" fill="#7f1e28" opacity=".6" />
                    <rect x="10" y="22" width="8" height="8" rx="2" fill="#7f1e28" opacity=".6" />
                    <rect x="22" y="22" width="8" height="8" rx="2" fill="#7f1e28" opacity=".4" />
                  </svg>
                </div>
                <span className="category-chip__label">All</span>
                <span className="category-chip__bar" />
              </button>

              {(categories || []).map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  id={`cat-filter-${cat.id}`}
                  onClick={() => setCategoryFilter(cat.name)}
                  className={`category-chip ${categoryFilter === cat.name ? 'category-chip--active' : ''}`}
                >
                  <div className="category-chip__img-wrap">
                    {cat.imageUrl
                      ? <img src={cat.imageUrl} alt={cat.name} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-[var(--brand-dark)] text-lg font-bold">{cat.name[0]}</div>
                    }
                  </div>
                  <span className="category-chip__label">{cat.name}</span>
                  <span className="category-chip__bar" />
                </button>
              ))}
            </div>
          </div>

          <div className="billing-products__grid">
            {filteredProducts.map(product => (
              <button
                key={product.id}
                type="button"
                onClick={() => handleProductSelect(product)}
                disabled={product.stock <= 0}
                className="billing-product-card"
              >
                <div className="flex justify-between items-start gap-1 mb-0.5">
                  <span className="text-[9px] font-bold uppercase tracking-wide text-[var(--brand-border)] truncate max-w-[55%]">{product.category}</span>
                  <span className="text-[10px] sm:text-xs font-bold text-[var(--brand-dark)] shrink-0">
                    {isPieceUnit(product.unit)
                      ? formatInventoryUnitPrice(product.price, PIECE_UNIT)
                      : formatInventoryUnitPrice(product.price, product.unit)}
                  </span>
                </div>
                <h4 className="font-semibold text-[var(--brand-dark)] truncate text-[11px] sm:text-sm leading-tight">{product.name}</h4>
                <p className={`text-[9px] sm:text-[10px] mt-0.5 ${product.stock < 10 ? 'text-[var(--brand-accent)]' : 'text-[var(--brand-border)]'}`}>
                  {product.stock} left
                </p>
              </button>
            ))}
          </div>
        </section>

        <aside className="billing-cart">
          <div className="billing-queue">
            {groups.map((group, index) => (
              <button
                key={group.id}
                type="button"
                onClick={() => setActiveGroupId(group.id)}
                className={`billing-queue__chip ${activeGroup?.id === group.id ? 'billing-queue__chip--active' : ''}`}
              >
                <span className="billing-queue__name">#{index + 1} {group.customer?.name ?? group.name}</span>
                <span className="billing-queue__meta">{group.items.length} items • ₹{getGroupTotal(group).toFixed(0)}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => createGroup(`Customer ${groups.length + 1}`)}
              className="billing-queue__chip shrink-0 !items-center !justify-center !min-w-[4.5rem] text-[var(--brand-dark)] font-semibold"
            >
              + Add
            </button>
          </div>

          <div className="billing-cart__customer">
            {activeGroup ? (
              activeGroup.customer ? (
                <div className="flex justify-between items-center gap-2 bg-white p-1.5 rounded-lg border border-[var(--brand-border)]">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[var(--brand-dark)] truncate">{activeGroup.customer.name}</div>
                    <div className="text-[10px] text-[var(--brand-dark)] flex items-center gap-1">
                      <Award size={10} /> {activeGroup.customer.loyaltyPoints} pts
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => clearCustomerFromGroup(activeGroup.id)}
                    className="shrink-0 p-1 rounded-full border border-[var(--brand-border)] text-[var(--brand-border)] hover:text-[var(--brand-dark)]"
                    aria-label="Remove customer"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <User className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--brand-border)]" size={14} />
                  <input
                    type="text"
                    placeholder="Customer name / phone"
                    className="w-full pl-7 pr-2 py-1.5 rounded-lg border border-[var(--brand-border)] text-xs bg-white"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                  />
                  {customerSearch && filteredCustomers.length > 0 && (
                    <div className="absolute top-full left-0 w-full bg-white border border-[var(--brand-border)] rounded-lg shadow-lg mt-1 z-20 max-h-32 overflow-y-auto">
                      {filteredCustomers.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="w-full text-left px-3 py-1.5 hover:bg-[var(--brand-muted)] text-xs"
                          onClick={() => assignCustomerToGroup(c)}
                        >
                          <div className="font-medium text-[var(--brand-dark)]">{c.name}</div>
                          <div className="text-[10px] text-[var(--brand-border)]">{c.phone}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            ) : (
              <p className="text-[10px] text-[var(--brand-border)]">Tap + Add to start a customer bill.</p>
            )}
          </div>

          <div className="billing-cart__items">
            {!activeGroup || activeGroupItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-[var(--brand-border)] text-xs py-4">
                <ShoppingBag size={24} className="mb-1 opacity-50" />
                <p>{activeGroup ? 'Add products to this bill.' : 'No customer selected.'}</p>
              </div>
            ) : (
              activeGroupItems.map((item) => (
                <div key={item.cartLineId} className="billing-cart-item">
                  <div className="min-w-0 flex-1">
                    <div className="billing-cart-item__name">{item.name}</div>
                    <div className="billing-cart-item__meta">{item.unit} • ₹{item.price.toFixed(2)}</div>
                  </div>
                  <div className="billing-cart-item__qty">
                    <button type="button" onClick={() => updateQuantity(activeGroup.id, item.cartLineId, -1)} aria-label="Decrease">
                      <Minus size={10} />
                    </button>
                    <span className="text-[10px] font-semibold w-3 text-center">{item.quantity}</span>
                    <button type="button" onClick={() => updateQuantity(activeGroup.id, item.cartLineId, 1)} aria-label="Increase">
                      <Plus size={10} />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(activeGroup.id, item.cartLineId)}
                    className="p-0.5 text-[var(--brand-border)] hover:text-[var(--brand-dark)]"
                    aria-label="Remove item"
                  >
                    <X size={12} />
                  </button>
                  <div className="billing-cart-item__price">₹{(item.price * item.quantity).toFixed(0)}</div>
                </div>
              ))
            )}
          </div>

          <div className="billing-cart__footer">
            {activeGroupCanRedeem && (
              <label className="mb-2 flex items-center gap-2 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-accent)]/15 px-2 py-1.5 text-[10px] font-medium text-[var(--brand-dark)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={activeGroupRedeemPoints}
                  onChange={(e) => toggleRedeemPoints(e.target.checked)}
                  className="rounded w-3.5 h-3.5"
                />
                Redeem 50 pts (₹50 off)
              </label>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleHoldBill}
                disabled={!hasInvoiceItems}
                className="flex-1 inline-flex items-center justify-center gap-1.5 border border-[var(--brand-border)] bg-white text-[var(--brand-dark)] py-2 rounded-lg text-sm font-semibold hover:bg-[var(--brand-muted)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <PauseCircle size={14} />
                Hold
              </button>
              <button
                type="button"
                onClick={handleProceedToPayment}
                disabled={!hasInvoiceItems}
                className="flex-[2] bg-[var(--brand-dark)] text-[var(--brand-text-light)] py-2 rounded-lg text-sm font-semibold hover:bg-[var(--brand-bg)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Checkout • ₹{finalTotal.toFixed(2)}
              </button>
            </div>
          </div>
        </aside>
      </div>

      {showHeldPanel && (
        <div className="fixed inset-0 bg-[var(--brand-dark)]/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-3 sm:p-4">
          <div className="app-modal-panel bg-[var(--brand-surface)] rounded-2xl shadow-xl border border-[var(--brand-border)] overflow-hidden w-full max-w-md">
            <div className="p-4 sm:p-5 border-b border-[var(--brand-border)] flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-[var(--brand-dark)]">Held Bills</h3>
                <p className="text-sm text-[var(--brand-border)]">Pause a bill and serve another customer.</p>
              </div>
              <button type="button" onClick={() => setShowHeldPanel(false)} className="p-1 text-[var(--brand-border)]">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 sm:p-5 max-h-[60vh] overflow-y-auto space-y-3">
              {heldBills.length === 0 ? (
                <p className="text-sm text-[var(--brand-border)] text-center py-6">No held bills. Use Hold on the cart to save a bill for later.</p>
              ) : (
                heldBills.map((session) => {
                  const itemCount = session.groups.reduce((sum, group) => sum + group.items.length, 0);
                  const savedAt = new Date(session.savedAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
                  return (
                    <div key={session.id} className="rounded-xl border border-[var(--brand-border)] bg-white p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-[var(--brand-dark)] truncate">{session.label}</p>
                        <p className="text-xs text-[var(--brand-border)] mt-0.5">
                          {session.groups.length} customer{session.groups.length === 1 ? '' : 's'} • {itemCount} items • {savedAt}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleResumeHeldBill(session)}
                          className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-[var(--brand-dark)] text-white text-xs font-semibold hover:bg-[var(--brand-bg)]"
                        >
                          <RotateCcw size={12} />
                          Resume
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteHeldBill(session.id)}
                          className="p-2 rounded-lg border border-[var(--brand-border)] text-[var(--brand-border)] hover:text-red-600 hover:border-red-200"
                          aria-label="Delete held bill"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {piecePickerProduct && (
        <div className="fixed inset-0 bg-[var(--brand-dark)]/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-3 sm:p-4">
          <div className="app-modal-panel bg-[var(--brand-surface)] rounded-2xl shadow-xl overflow-hidden border border-[var(--brand-border)] animate-scale-up">
            <div className="p-5 border-b border-[var(--brand-border)] bg-[var(--brand-muted)]">
              <div className="flex justify-between items-start gap-3">
                <div>
                  <h3 className="text-lg font-bold text-[var(--brand-dark)]">Select Pieces</h3>
                  <p className="text-sm text-[var(--brand-border)]">{piecePickerProduct.name}</p>
                  <p className="text-sm font-semibold text-[var(--brand-dark)] mt-2">
                    Price per piece: {formatInventoryUnitPrice(piecePickerProduct.price, PIECE_UNIT)}
                  </p>
                  <p className="text-xs text-[var(--brand-border)] mt-1">
                    Tap one or more quantities, then add to bill. Amounts are calculated automatically.
                  </p>
                </div>
                <button onClick={closePiecePicker} className="text-[var(--brand-border)] hover:text-[var(--brand-dark)] p-1 shrink-0">
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="p-5 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {piecePickerOptions.map(({ count, amount, label }) => {
                  const isSelected = selectedPieceCounts.includes(count);
                  const outOfStock = count > piecePickerProduct.stock;
                  return (
                  <button
                    key={count}
                    type="button"
                    onClick={() => !outOfStock && togglePieceCountSelection(count)}
                    disabled={outOfStock}
                    className={`rounded-xl border px-3 py-3 text-center transition-colors ${
                      outOfStock
                        ? 'border-[var(--brand-border)] bg-[var(--brand-muted)] opacity-50 cursor-not-allowed'
                        : isSelected
                          ? 'border-[var(--brand-dark)] bg-[var(--brand-dark)]/10 hover:bg-[var(--brand-dark)]/15'
                          : 'border-[var(--brand-border)] bg-white hover:border-[var(--brand-dark)] hover:bg-[var(--brand-muted)]'
                    }`}
                  >
                    <div className="text-sm font-semibold text-[var(--brand-dark)]">{label}</div>
                    <div className="text-xs text-[var(--brand-border)] mt-1">₹{amount.toFixed(2)}</div>
                  </button>
                  );
                })}
              </div>
            </div>
            <div className="p-5 border-t border-[var(--brand-border)] bg-[var(--brand-muted)] space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--brand-border)]">
                  {selectedPieceCounts.length === 0
                    ? 'No quantities selected'
                    : `${selectedPieceCounts.length} option${selectedPieceCounts.length === 1 ? '' : 's'} • ${selectedPieceSummary.totalPieces} piece${selectedPieceSummary.totalPieces === 1 ? '' : 's'}`}
                </span>
                <span className="font-semibold text-[var(--brand-dark)]">
                  {selectedPieceCounts.length > 0 ? `₹${selectedPieceSummary.totalAmount.toFixed(2)}` : '—'}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedPieceCounts([])}
                  disabled={selectedPieceCounts.length === 0}
                  className="flex-1 py-3 rounded-xl border border-[var(--brand-border)] bg-white text-[var(--brand-dark)] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={handleAddSelectedPieces}
                  disabled={selectedPieceCounts.length === 0 || selectedPieceSummary.totalPieces > piecePickerProduct.stock}
                  className="flex-[2] py-3 rounded-xl bg-[var(--brand-dark)] text-[var(--brand-text-light)] font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add to Bill
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {weightPickerProduct && (
        <div className="fixed inset-0 bg-[var(--brand-dark)]/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-3 sm:p-4">
          <div className="app-modal-panel bg-[var(--brand-surface)] rounded-2xl shadow-xl overflow-hidden border border-[var(--brand-border)] animate-scale-up">
            <div className="p-5 border-b border-[var(--brand-border)] bg-[var(--brand-muted)]">
              <div className="flex justify-between items-start gap-3">
                <div>
                  <h3 className="text-lg font-bold text-[var(--brand-dark)]">Select Weight</h3>
                  <p className="text-sm text-[var(--brand-border)]">{weightPickerProduct.name}</p>
                  <p className="text-sm font-semibold text-[var(--brand-dark)] mt-2">
                    Inventory price: {formatInventoryUnitPrice(weightPickerProduct.price, weightPickerProduct.unit)}
                  </p>
                  <p className="text-xs text-[var(--brand-border)] mt-1">
                    Tap one or more weights, then add to bill. Prices are auto-calculated from inventory.
                  </p>
                </div>
                <button onClick={closeWeightPicker} className="text-[var(--brand-border)] hover:text-[var(--brand-dark)] p-1 shrink-0">
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="p-5 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {weightPickerOptions.map(({ unit, price, isInventoryUnit }) => {
                  const isSelected = selectedWeightUnits.includes(unit);
                  return (
                  <button
                    key={unit}
                    type="button"
                    onClick={() => toggleWeightUnitSelection(unit)}
                    className={`rounded-xl border px-3 py-3 text-center transition-colors ${
                      isSelected
                        ? 'border-[var(--brand-dark)] bg-[var(--brand-dark)]/10 hover:bg-[var(--brand-dark)]/15'
                        : isInventoryUnit
                          ? 'border-[var(--brand-border)] bg-white hover:border-[var(--brand-dark)] hover:bg-[var(--brand-muted)]'
                          : 'border-[var(--brand-border)] bg-white hover:border-[var(--brand-dark)] hover:bg-[var(--brand-muted)]'
                    }`}
                  >
                    <div className="text-sm font-semibold text-[var(--brand-dark)]">{unit}</div>
                    <div className="text-xs text-[var(--brand-border)] mt-1">₹{price.toFixed(2)}</div>
                    {isInventoryUnit && (
                      <div className="text-[10px] font-semibold text-[var(--brand-dark)] mt-1 uppercase tracking-wide">
                        Inventory
                      </div>
                    )}
                  </button>
                  );
                })}
              </div>
            </div>
            <div className="p-5 border-t border-[var(--brand-border)] bg-[var(--brand-muted)] space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--brand-border)]">
                  {selectedWeightUnits.length === 0
                    ? 'No weights selected'
                    : `${selectedWeightUnits.length} weight${selectedWeightUnits.length === 1 ? '' : 's'} selected`}
                </span>
                <span className="font-semibold text-[var(--brand-dark)]">
                  {selectedWeightUnits.length > 0 ? `₹${selectedWeightTotal.toFixed(2)}` : '—'}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedWeightUnits([])}
                  disabled={selectedWeightUnits.length === 0}
                  className="flex-1 py-3 rounded-xl border border-[var(--brand-border)] bg-white text-[var(--brand-dark)] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={handleAddSelectedWeights}
                  disabled={selectedWeightUnits.length === 0}
                  className="flex-[2] py-3 rounded-xl bg-[var(--brand-dark)] text-[var(--brand-text-light)] font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add to Bill
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Billing;