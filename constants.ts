import { Product, DailyStat, SaleRecord, Customer } from './types';
import { SEEDED_BRANCH_IDS, SEEDED_CITY_IDS } from './utils/locations';

export const BILLING_WEIGHT_OPTIONS = [
  '50 gms',
  '100 gms',
  '150 gms',
  '200 gms',
  '250 gms',
  '300 gms',
  '350 gms',
  '400 gms',
  '450 gms',
  '500 gms',
  '550 gms',
  '600 gms',
  '650 gms',
  '700 gms',
  '750 gms',
  '800 gms',
  '850 gms',
  '900 gms',
  '950 gms',
  '1 kg'
];

export const normalizeWeightUnit = (unit: string): string => {
  const normalized = unit.trim().toLowerCase().replace(/\s+/g, ' ');
  if (normalized === '1kg') return '1 kg';
  const gmsMatch = normalized.match(/^(\d+)gms?$/);
  if (gmsMatch) return `${gmsMatch[1]} gms`;
  const spacedGmsMatch = normalized.match(/^(\d+)\s+gms?$/);
  if (spacedGmsMatch) return `${spacedGmsMatch[1]} gms`;
  const kgMatch = normalized.match(/^(\d+(?:\.\d+)?)\s*kg$/);
  if (kgMatch) return `${kgMatch[1]} kg`;
  return normalized;
};

export const parseWeightToGrams = (unit: string): number | null => {
  const normalized = normalizeWeightUnit(unit);
  if (normalized === '1 kg') return 1000;
  const gmsMatch = normalized.match(/^(\d+)\s+gms$/);
  if (gmsMatch) return Number(gmsMatch[1]);
  const kgMatch = normalized.match(/^(\d+(?:\.\d+)?)\s+kg$/);
  if (kgMatch) return Number(kgMatch[1]) * 1000;
  return null;
};

export const isWeightUnit = (unit: string) => parseWeightToGrams(unit) !== null;

export const PIECE_UNIT = 'Piece';
export const BILLING_PIECE_MAX = 15;

export const isPieceUnit = (unit: string): boolean => {
  const normalized = unit.trim().toLowerCase();
  return normalized === 'piece' || normalized === 'pieces' || normalized === 'pcs' || normalized === 'pc';
};

export const normalizeProductUnit = (unit: string): string => (isPieceUnit(unit) ? PIECE_UNIT : unit);

export const formatPieceCountLabel = (count: number): string =>
  count === 1 ? '1 Piece' : `${count} Pieces`;

export const getPieceBillingOptions = (pricePerPiece: number) =>
  Array.from({ length: BILLING_PIECE_MAX }, (_, index) => {
    const count = index + 1;
    return {
      count,
      amount: parseFloat((pricePerPiece * count).toFixed(2)),
      label: formatPieceCountLabel(count),
    };
  });

export const getPieceCartLineId = (productId: string) => `${productId}::piece`;

export const PRODUCT_UNIT_OPTIONS = [...BILLING_WEIGHT_OPTIONS, PIECE_UNIT];

export const getBaseWeightGrams = (unit: string): number => {
  const parsed = parseWeightToGrams(unit);
  if (parsed && parsed > 0) return parsed;
  if (unit.trim().toLowerCase() === 'kg') return 1000;
  return 1000;
};

export const getPriceForWeight = (basePrice: number, baseUnit: string, selectedUnit: string): number => {
  const baseGrams = getBaseWeightGrams(baseUnit);
  const selectedGrams = parseWeightToGrams(selectedUnit);
  if (!selectedGrams || baseGrams <= 0 || basePrice <= 0) return basePrice;
  return parseFloat(((basePrice * selectedGrams) / baseGrams).toFixed(2));
};

export const getCostForWeight = (baseCost: number, baseUnit: string, selectedUnit: string): number => {
  return getPriceForWeight(baseCost, baseUnit, selectedUnit);
};

export const formatInventoryUnitPrice = (price: number, unit: string) => `₹${price.toFixed(2)} / ${unit}`;

export const getWeightPriceBreakdown = (basePrice: number, baseUnit: string, baseCost = 0) =>
  BILLING_WEIGHT_OPTIONS.map((unit) => ({
    unit,
    price: getPriceForWeight(basePrice, baseUnit, unit),
    cost: getCostForWeight(baseCost, baseUnit, unit),
    isInventoryUnit: normalizeWeightUnit(unit) === normalizeWeightUnit(baseUnit),
  }));

export const getCartLineId = (productId: string, unit: string) => `${productId}::${normalizeWeightUnit(unit)}`;

export const MOCK_PRODUCTS: Product[] = [
  { id: 'p1', name: 'Sourdough Loaf', category: 'Bread', price: 180.00, cost: 45.00, stock: 12, minStock: 5, unit: 'pcs' },
  { id: 'p2', name: 'Butter Croissant', category: 'Pastry', price: 120.00, cost: 30.00, stock: 45, minStock: 20, unit: 'pcs' },
  { id: 'p3', name: 'Almond Danish', category: 'Pastry', price: 140.00, cost: 40.00, stock: 8, minStock: 10, unit: 'pcs' },
  { id: 'p4', name: 'Masala Chai', category: 'Beverage', price: 40.00, cost: 10.00, stock: 500, minStock: 100, unit: 'pcs' },
  { id: 'p5', name: 'Cappuccino', category: 'Beverage', price: 150.00, cost: 35.00, stock: 400, minStock: 100, unit: 'pcs' },
  { id: 'p6', name: 'Veg Puff', category: 'Savory', price: 45.00, cost: 12.00, stock: 30, minStock: 15, unit: 'pcs' },
  { id: 'p7', name: 'Chocolate Truffle', category: 'Cake', price: 1200.00, cost: 400.00, stock: 4, minStock: 2, unit: 'kg' },
  { id: 'p8', name: 'Mumbai Vada Pav', category: 'Savory', price: 35.00, cost: 12.00, stock: 50, minStock: 15, unit: 'pcs' },
];

export const MOCK_DAILY_STATS: DailyStat[] = [
  { date: 'Mon', sales: 12000, orders: 45 },
  { date: 'Tue', sales: 14500, orders: 52 },
  { date: 'Wed', sales: 11000, orders: 38 },
  { date: 'Thu', sales: 16000, orders: 60 },
  { date: 'Fri', sales: 21000, orders: 85 },
  { date: 'Sat', sales: 28000, orders: 110 },
  { date: 'Sun', sales: 24000, orders: 95 },
];

export const INITIAL_SALES: SaleRecord[] = [
  { id: 's1', timestamp: new Date(new Date().setHours(8, 30)), total: 240.00, items: [] },
  { id: 's2', timestamp: new Date(new Date().setHours(9, 15)), total: 120.00, items: [] },
  { id: 's3', timestamp: new Date(new Date().setHours(10, 45)), total: 560.00, items: [] },
];

export const MOCK_CUSTOMERS: Customer[] = [
  { id: 'c1', name: 'Aditi Sharma', phone: '9876543210', email: 'aditi@example.com', loyaltyPoints: 120, totalSpent: 4500.50, joinDate: new Date('2023-01-15') },
  { id: 'c2', name: 'Rahul Verma', phone: '9876500001', email: 'rahul@example.com', loyaltyPoints: 45, totalSpent: 1200.00, joinDate: new Date('2023-03-22') },
  { id: 'c3', name: 'Priya Singh', phone: '9876500002', email: 'priya@example.com', loyaltyPoints: 310, totalSpent: 8900.75, joinDate: new Date('2022-11-05') },
];

export const SHOP_NAME = 'Suvai Bakery';
export const SHOP_ADDRESS = 'Main Road, Your City, Tamil Nadu';
export const SHOP_PHONE = '+91 98765 43210';

export const DEMO_CITIES = [
  { id: SEEDED_CITY_IDS.chennai, name: 'Chennai' },
  { id: SEEDED_CITY_IDS.coimbatore, name: 'Coimbatore' },
];

export const DEMO_BRANCHES = [
  {
    id: SEEDED_BRANCH_IDS.tNagar,
    cityId: SEEDED_CITY_IDS.chennai,
    name: 'T. Nagar',
    address: 'Usman Road, T. Nagar, Chennai, Tamil Nadu',
    phone: '+91 98765 43210',
  },
  {
    id: SEEDED_BRANCH_IDS.annaNagar,
    cityId: SEEDED_CITY_IDS.chennai,
    name: 'Anna Nagar',
    address: '2nd Avenue, Anna Nagar, Chennai, Tamil Nadu',
    phone: '+91 98765 43211',
  },
  {
    id: SEEDED_BRANCH_IDS.rsPuram,
    cityId: SEEDED_CITY_IDS.coimbatore,
    name: 'RS Puram',
    address: 'DB Road, RS Puram, Coimbatore, Tamil Nadu',
    phone: '+91 98765 43212',
  },
];

// Placeholder for Shop QR Code (UPI)
export const SHOP_QR_CODE_URL = "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=upi://pay?pa=bakery@upi&pn=SuvaiBakery&mc=5462&tid=123456&tr=123456&tn=BakeryPayment&am=0&cu=INR";
