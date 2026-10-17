export enum ViewState {
  LOGIN = 'LOGIN',
  DASHBOARD = 'DASHBOARD',
  BILLING = 'BILLING',
  BILLS = 'BILLS',
  CATEGORIES = 'CATEGORIES',
  INVENTORY = 'INVENTORY',
  CUSTOMERS = 'CUSTOMERS',
  USERS = 'USERS',
  LOCATIONS = 'LOCATIONS',
}

export enum UserRole {
  EMPLOYEE = 'employee',
  BRANCH_ADMIN = 'branch_admin',
  CITY_MANAGER = 'city_manager',
  SUPER_ADMIN = 'super_admin',
}

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  minStock: number;
  unit: string;
  deletedAt?: Date;
}

export interface Category {
  id: string;
  name: string;
  createdAt: Date;
  imageUrl?: string;
  
}

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  minStock: number;
  createdAt: Date;
  deletedAt?: Date;
}

export interface ProductIngredient {
  id: string;
  productId: string;
  ingredientId: string;
  quantityPerUnit: number;
}

export interface InventoryAdjustment {
  id: string;
  productId?: string;
  ingredientId?: string;
  branchId?: string;
  adjustment: number;
  reason: string;
  createdBy: string;
  createdAt: Date;
}

export interface City {
  id: string;
  name: string;
}

export interface Branch {
  id: string;
  cityId: string;
  name: string;
  address: string;
  phone: string;
}

export interface AppUser {
  id: string;
  email: string;
  role: UserRole;
  cityId?: string | null;
  branchId?: string | null;
  createdAt: Date;
}

export interface SessionProfile {
  id?: string;
  email?: string;
  role: UserRole;
  cityId: string | null;
  branchId: string | null;
}

export interface ShopIdentity {
  name: string;
  address: string;
  phone: string;
}

export interface CartItem extends Product {
  quantity: number;
  cartLineId: string;
}

export type PaymentMethod = 'CASH' | 'UPI' | 'SPLIT' | 'OTHER';

export interface SaleRecord {
  id: string;
  timestamp: Date;
  branchId?: string;
  items: CartItem[];
  subtotal?: number;
  taxAmount?: number;
  roundingAdjustment?: number;
  total: number;
  paidAmount?: number;
  paymentMethod?: PaymentMethod;
  cashPaid?: number;
  upiPaid?: number;
  customerId?: string;
  customerName?: string;
  billLabel?: string;
  pointsEarned?: number;
  pointsRedeemed?: number;
  discountAmount?: number;
}

export type NewSalePayload = Omit<SaleRecord, 'id' | 'timestamp'>;

export type PrintMode = 'all' | 'selected' | 'skip';

export interface DailyStat {
  date: string;
  sales: number;
  orders: number;
}

export interface NotificationItem {
  id: string;
  type: 'warning' | 'info' | 'success';
  message: string;
  timestamp: Date;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  loyaltyPoints: number;
  totalSpent: number;
  notes?: string;
  joinDate: Date;
}
