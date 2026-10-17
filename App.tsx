import React, { useState, useEffect, useMemo, Suspense, lazy } from 'react';
import {
  signIn as supabaseSignIn,
  signOut as supabaseSignOut,
  supabase,
  getUser,
  getSessionProfile,
  resolveUserRoleFromMetadata,
  getCities,
  getBranches,
  addCity as apiAddCity,
  updateCity as apiUpdateCity,
  deleteCity as apiDeleteCity,
  addBranch as apiAddBranch,
  updateBranch as apiUpdateBranch,
  deleteBranch as apiDeleteBranch,
  getProducts,
  getCategories,
  getSales,
  getCustomers,
  getIngredients,
  getInventoryAdjustments,
  adjustProductStock as apiAdjustProductStock,
  adjustIngredientStock as apiAdjustIngredientStock,
  addProduct as apiAddProduct,
  addCategory as apiAddCategory,
  addIngredient as apiAddIngredient,
  updateProduct as apiUpdateProduct,
  updateIngredient as apiUpdateIngredient,
  deleteProduct as apiDeleteProduct,
  deleteIngredient as apiDeleteIngredient,
  getDeletedProducts,
  getDeletedIngredients,
  restoreProduct as apiRestoreProduct,
  restoreIngredient as apiRestoreIngredient,
  addCustomer as apiAddCustomer,
  deleteCustomer as apiDeleteCustomer,
  createSale as apiCreateSale,
  updateSale as apiUpdateSale,
  voidSale as apiVoidSale,
  touchUserLastSignIn
} from './services/supabaseService';
import { ViewState, Product, SaleRecord, Customer, UserRole, Category, Ingredient, InventoryAdjustment, City, Branch, SessionProfile, ShopIdentity } from './types';
import { DEMO_BRANCHES, DEMO_CITIES, MOCK_DAILY_STATS, SHOP_ADDRESS, SHOP_NAME, SHOP_PHONE } from './constants';
import Billing from './components/Billing';
import Layout from "./components/Layout";
import LocationPicker from './components/LocationPicker';
import { updateCategory, deleteCategory } from './services/supabaseService';
import { clearAppDataCache, loadAppDataCache, saveAppDataCache } from './utils/dataCache';
import {
  canAccessBilling,
  canEditCategories,
  canEditInventory,
  canManageLocations,
  canManageUsers,
  canSwitchLocation,
  defaultLandingView,
  normalizeUserRole,
} from './utils/access';
import { isUuid, resolveBranchId, resolveCityId } from './utils/locations';

import { Lock, User, Loader2 } from 'lucide-react';

const Dashboard = lazy(() => import('./components/Dashboard'));
const EmployeeDashboard = lazy(() => import('./components/EmployeeDashboard'));
const BillsHistory = lazy(() => import('./components/BillsHistory'));
const Inventory = lazy(() => import('./components/Inventory'));
const Customers = lazy(() => import('./components/Customers'));
const Users = lazy(() => import('./components/Users'));
const Categories = lazy(() => import('./components/Categories'));
const Locations = lazy(() => import('./components/Locations'));

const PageLoader = () => (
  <div className="flex items-center justify-center py-16">
    <Loader2 className="animate-spin text-[var(--brand-dark)]" size={32} />
  </div>
);

const DEMO_AUTH_STORAGE_KEY = 'suvai_demo_auth';
const LOCATION_STORAGE_KEY = 'suvai_location';

const readStoredDemoProfile = (): SessionProfile | null => {
  const stored = sessionStorage.getItem(DEMO_AUTH_STORAGE_KEY);
  if (!stored) return null;
  if (stored === 'admin' || stored === UserRole.SUPER_ADMIN) {
    return { role: UserRole.SUPER_ADMIN, cityId: null, branchId: null };
  }
  if (stored === UserRole.EMPLOYEE) {
    return { role: UserRole.EMPLOYEE, cityId: DEMO_CITIES[0].id, branchId: DEMO_BRANCHES[0].id };
  }
  try {
    const parsed = JSON.parse(stored);
    if (!parsed?.role) return null;
    return {
      role: normalizeUserRole(parsed.role),
      cityId: resolveCityId(parsed.cityId),
      branchId: resolveBranchId(parsed.branchId),
    };
  } catch {
    return null;
  }
};

const readStoredLocation = (): { cityId: string | null; branchId: string | null } | null => {
  const stored = sessionStorage.getItem(LOCATION_STORAGE_KEY);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    return {
      cityId: resolveCityId(parsed.cityId),
      branchId: resolveBranchId(parsed.branchId),
    };
  } catch {
    return null;
  }
};

const writeStoredLocation = (cityId: string | null, branchId: string | null) => {
  sessionStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify({ cityId, branchId }));
};

const resolveDemoProfile = (username: string): SessionProfile | null => {
  const value = username.trim().toLowerCase();
  if (value === 'admin' || value.startsWith('admin@')) {
    return { role: UserRole.SUPER_ADMIN, cityId: null, branchId: null };
  }
  if (value === 'city' || value.startsWith('city@')) {
    return { role: UserRole.CITY_MANAGER, cityId: DEMO_CITIES[0].id, branchId: null };
  }
  if (value === 'branch' || value.startsWith('branch@')) {
    return { role: UserRole.BRANCH_ADMIN, cityId: DEMO_CITIES[0].id, branchId: DEMO_BRANCHES[0].id };
  }
  if (value === 'employee' || value.startsWith('employee@')) {
    return { role: UserRole.EMPLOYEE, cityId: DEMO_CITIES[0].id, branchId: DEMO_BRANCHES[0].id };
  }
  return null;
};

const readCachedAppData = () => loadAppDataCache({ allowStale: true });

// Login Component
const Login = ({ onLogin }: { onLogin: (profile: SessionProfile, isDemo?: boolean) => void }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const email = username.trim();
      const loginPassword = password.trim();
      const demoProfile = resolveDemoProfile(email);
      if (demoProfile && loginPassword === 'demo') {
        onLogin(demoProfile, true);
        return;
      }

      if (!supabase) {
        setError('Database connection not configured. Please check environment variables.');
        setLoading(false);
        return;
      }

      const { error } = await supabaseSignIn(email, loginPassword);
      if (error) {
        setError(error.message || 'Authentication failed.');
        setLoading(false);
        return;
      }
      const { data } = await getUser();
      if (data.user?.id) {
        await touchUserLastSignIn(data.user.id);
      }
      const profile = await getSessionProfile(data.user);
      onLogin(profile, false);

    } catch (err: any) {
      setError(err?.message || 'Unexpected error during authentication.');
      setLoading(false);
    }
  };

  return (
<div className="min-h-screen flex items-center justify-center bg-[var(--brand-muted)] p-4">
      <div className="bg-[var(--brand-surface)] p-8 rounded-2xl shadow-xl w-full max-w-sm border border-[var(--brand-border)]">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-[var(--brand-accent)] rounded-xl mx-auto mb-4 flex items-center justify-center shadow-lg shadow-[var(--brand-border)]">
            <Lock className="text-[var(--brand-dark)]" size={24} />
          </div>
          <h1 className="text-2xl font-bold text-[var(--brand-text-dark)]">Welcome Back</h1>
          <p className="text-[var(--brand-text-dark)] text-sm mt-1">City and branch login</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-[var(--brand-text-dark)] uppercase mb-1.5 ml-1">Email</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--brand-border)] z-10" size={18} />
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-[var(--brand-border)] focus:ring-2 focus:ring-[var(--brand-accent)]/20 focus:border-[var(--brand-accent)] outline-none transition-all text-[var(--brand-text-dark)] bg-white placeholder-slate-300"
                placeholder="Email or demo user"
                required
                autoComplete="username"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--brand-text-dark)] uppercase mb-1.5 ml-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--brand-border)] z-10" size={18} />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-[var(--brand-border)] focus:ring-2 focus:ring-[var(--brand-accent)]/20 focus:border-[var(--brand-accent)] outline-none transition-all text-[var(--brand-text-dark)] bg-white placeholder-slate-300"
                required
              />
            </div>
          </div>

          {error && <p className="text-red-500 text-sm text-center bg-red-50 py-2 rounded-lg">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[var(--brand-dark)] text-[var(--brand-text-light)] py-3.5 rounded-xl font-medium hover:bg-[var(--brand-bg)] transition-all shadow-lg shadow-[var(--brand-border)] active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : 'Sign In'}
          </button>
          <p className="text-[11px] text-center text-[var(--brand-border)] leading-relaxed">
            Demo: admin / city / branch / employee — password <span className="font-semibold">demo</span>
          </p>
        </form>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const initialDemoProfile = readStoredDemoProfile();
  const initialLocation = readStoredLocation();
  const initialCache = initialDemoProfile ? readCachedAppData() : null;

  const [isLoggedIn, setIsLoggedIn] = useState(!!initialDemoProfile);
  const [isAuthLoading, setIsAuthLoading] = useState(!initialDemoProfile);
  const [userRole, setUserRole] = useState<UserRole | null>(initialDemoProfile?.role ?? null);
  const [assignedCityId, setAssignedCityId] = useState<string | null>(initialDemoProfile?.cityId ?? null);
  const [assignedBranchId, setAssignedBranchId] = useState<string | null>(initialDemoProfile?.branchId ?? null);
  const [selectedCityId, setSelectedCityId] = useState<string | null>(
    initialLocation?.cityId ?? initialDemoProfile?.cityId ?? null
  );
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(
    initialLocation?.branchId ?? initialDemoProfile?.branchId ?? null
  );
  const [cities, setCities] = useState<City[]>(DEMO_CITIES);
  const [branches, setBranches] = useState<Branch[]>(DEMO_BRANCHES);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [isDemoSession, setIsDemoSession] = useState(!!initialDemoProfile);
  const [currentView, setCurrentView] = useState<ViewState>(
    defaultLandingView(initialDemoProfile?.role ?? UserRole.SUPER_ADMIN)
  );

  // Data State
  const [products, setProducts] = useState<Product[]>(initialCache?.products ?? []);
  const [categories, setCategories] = useState<Category[]>(initialCache?.categories ?? []);
  const [ingredients, setIngredients] = useState<Ingredient[]>(initialCache?.ingredients ?? []);
  const [inventoryAdjustments, setInventoryAdjustments] = useState<InventoryAdjustment[]>(
    initialCache?.inventoryAdjustments ?? []
  );
  const [sales, setSales] = useState<SaleRecord[]>(initialCache?.sales ?? []);
  const [customers, setCustomers] = useState<Customer[]>(initialCache?.customers ?? []);
  const [isSyncingData, setIsSyncingData] = useState(false);

  const applyProfile = (profile: SessionProfile, options?: { skipLocation?: boolean }) => {
    setUserRole(profile.role);
    setAssignedCityId(profile.cityId);
    setAssignedBranchId(profile.branchId);
    if (options?.skipLocation) return;
    if (!canSwitchLocation(profile.role)) {
      setSelectedCityId(profile.cityId);
      setSelectedBranchId(profile.branchId);
      if (profile.cityId || profile.branchId) {
        writeStoredLocation(profile.cityId, profile.branchId);
      }
      return;
    }
    const stored = readStoredLocation();
    if (stored) {
      setSelectedCityId(stored.cityId ?? profile.cityId);
      setSelectedBranchId(stored.branchId);
      return;
    }
    setSelectedCityId(profile.cityId);
    setSelectedBranchId(profile.branchId);
  };

  // Dynamic stats derived from interactions
  const [notifications, setNotifications] = useState<{id: string, message: string}[]>([]);

  const applyCachedData = (cached: ReturnType<typeof readCachedAppData>) => {
    if (!cached?.products?.length) return false;

    setProducts(cached.products);
    setCategories(cached.categories);
    setCustomers(cached.customers);
    setIngredients(cached.ingredients);
    setSales(cached.sales);
    setInventoryAdjustments(cached.inventoryAdjustments);
    return true;
  };

  // Restore auth session on refresh
  useEffect(() => {
    let isMounted = true;

    const restoreSession = async () => {
      try {
        const storedDemoProfile = readStoredDemoProfile();
        if (storedDemoProfile) {
          if (!isMounted) return;
          applyCachedData(readCachedAppData());
          applyProfile(storedDemoProfile);
          setIsDemoSession(true);
          setIsLoggedIn(true);
          setCurrentView(defaultLandingView(storedDemoProfile.role));
          setIsAuthLoading(false);
          return;
        }

        if (!supabase) {
          if (isMounted) setIsAuthLoading(false);
          return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;

        const quickRole = resolveUserRoleFromMetadata(session.user) ?? UserRole.SUPER_ADMIN;
        if (!isMounted) return;
        applyCachedData(readCachedAppData());
        applyProfile({
          role: quickRole,
          cityId: session.user.user_metadata?.city_id ?? null,
          branchId: session.user.user_metadata?.branch_id ?? null,
        });
        setIsLoggedIn(true);
        setCurrentView(defaultLandingView(quickRole));

        getSessionProfile(session.user)
          .then((verifiedProfile) => {
            if (!isMounted) return;
            applyProfile(verifiedProfile);
            setCurrentView(defaultLandingView(verifiedProfile.role));
          })
          .catch((error) => {
            console.error('Failed to verify user role:', error);
          });
      } catch (error) {
        console.error('Failed to restore session:', error);
      } finally {
        if (isMounted) {
          setIsAuthLoading(false);
        }
      }
    };

    restoreSession();

    if (!supabase) {
      return () => {
        isMounted = false;
      };
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'INITIAL_SESSION' || sessionStorage.getItem(DEMO_AUTH_STORAGE_KEY)) return;

      if (session?.user) {
        try {
          if (event === 'SIGNED_IN') {
            await touchUserLastSignIn(session.user.id);
          }
          const profile = await getSessionProfile(session.user);
          if (!isMounted) return;
          applyProfile(profile);
          setIsLoggedIn(true);
        } catch (error) {
          console.error('Failed to resolve user role:', error);
        }
      } else if (isMounted) {
        setIsLoggedIn(false);
        setUserRole(null);
        setAssignedCityId(null);
        setAssignedBranchId(null);
        clearAppDataCache();
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const saveCurrentDataCache = (
    data: {
      products: Product[];
      categories: Category[];
      customers: Customer[];
      ingredients: Ingredient[];
      sales: SaleRecord[];
      inventoryAdjustments: InventoryAdjustment[];
    }
  ) => {
    saveAppDataCache(data);
  };

  const fetchSecondaryData = async (prods: Product[]) => {
    const [ings, adjustments, sls] = await Promise.all([
      getIngredients(),
      getInventoryAdjustments(),
      getSales(prods),
    ]);

    setIngredients(ings);
    setInventoryAdjustments(adjustments);
    setSales(sls);

    return { ings, adjustments, sls };
  };

  const fetchData = async (options?: { background?: boolean }) => {
    const hasCachedProducts = products.length > 0;
    const isBackground = options?.background ?? hasCachedProducts;
    if (!isBackground) setIsSyncingData(true);

    try {
      const [prods, cats, custs, nextCities, nextBranches] = await Promise.all([
        getProducts(selectedBranchId),
        getCategories(),
        getCustomers(),
        getCities(),
        getBranches(),
      ]);
      setCities(nextCities);
      setBranches(nextBranches);
      setSelectedCityId((current) => resolveCityId(current, nextCities) ?? current);
      setSelectedBranchId((current) => resolveBranchId(current, nextBranches) ?? current);
      setAssignedCityId((current) => resolveCityId(current, nextCities) ?? current);
      setAssignedBranchId((current) => resolveBranchId(current, nextBranches) ?? current);

      setProducts(prods);
      setCategories(cats);
      setCustomers(custs);

      const secondary = await fetchSecondaryData(prods);

      saveCurrentDataCache({
        products: prods,
        categories: cats,
        customers: custs,
        ingredients: secondary.ings,
        sales: secondary.sls,
        inventoryAdjustments: secondary.adjustments,
      });
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setIsSyncingData(false);
    }
  };

  useEffect(() => {
    if (!isLoggedIn) return;
    const hasCache = applyCachedData(readCachedAppData());
    void fetchData({ background: hasCache });
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    const loadBranchStock = async () => {
      try {
        const prods = await getProducts(selectedBranchId);
        if (!cancelled) setProducts(prods);
      } catch (error) {
        console.error('Failed to load branch stock:', error);
      }
    };
    void loadBranchStock();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, selectedBranchId]);

  useEffect(() => {
    if (!userRole) return;
    if (currentView === ViewState.USERS && !canManageUsers(userRole)) {
      setCurrentView(defaultLandingView(userRole));
    }
    if (currentView === ViewState.CATEGORIES && !canEditCategories(userRole)) {
      setCurrentView(defaultLandingView(userRole));
    }
    if (currentView === ViewState.LOCATIONS && !canManageLocations(userRole)) {
      setCurrentView(defaultLandingView(userRole));
    }
    if (currentView === ViewState.BILLING && !canAccessBilling(userRole)) {
      setCurrentView(defaultLandingView(userRole));
    }
    if (currentView === ViewState.BILLING && !selectedBranchId && canSwitchLocation(userRole) && canAccessBilling(userRole)) {
      setShowLocationPicker(true);
    }
  }, [currentView, userRole, selectedBranchId]);

  const scopedSales = useMemo(() => {
    const cityBranchIds = selectedCityId
      ? branches.filter((branch) => branch.cityId === selectedCityId).map((branch) => branch.id)
      : [];

    return sales.filter((sale) => {
      if (!sale.branchId) return isDemoSession || !selectedBranchId;
      if (selectedBranchId) return sale.branchId === selectedBranchId;
      if (selectedCityId) return cityBranchIds.includes(sale.branchId);
      return true;
    });
  }, [sales, selectedBranchId, selectedCityId, branches, isDemoSession]);

  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId) ?? null;
  const selectedCity = cities.find((city) => city.id === (selectedCityId ?? selectedBranch?.cityId)) ?? null;
  const shopIdentity: ShopIdentity = {
    name: selectedBranch ? `${SHOP_NAME} — ${selectedBranch.name}` : SHOP_NAME,
    address: selectedBranch?.address || selectedCity?.name || SHOP_ADDRESS,
    phone: selectedBranch?.phone || SHOP_PHONE,
  };

  const branchSummaries = useMemo(() => {
    const scopedBranches = selectedCityId
      ? branches.filter((branch) => branch.cityId === selectedCityId)
      : branches;
    if (selectedBranchId || scopedBranches.length <= 1) return [];
    return scopedBranches.map((branch) => {
      const branchSales = sales.filter((sale) => sale.branchId === branch.id);
      return {
        id: branch.id,
        name: branch.name,
        cityName: cities.find((city) => city.id === branch.cityId)?.name || '',
        sales: branchSales.reduce((sum, sale) => sum + sale.total, 0),
        orders: branchSales.length,
      };
    });
  }, [branches, cities, sales, selectedBranchId, selectedCityId]);

  const locationLabel = selectedBranch
    ? `${selectedCity?.name || 'City'} · ${selectedBranch.name}`
    : selectedCity
      ? `${selectedCity.name} · All branches`
      : 'All cities';

  const salesTodayTotal = useMemo(() => {
    const now = new Date();
    return scopedSales
      .filter((sale) =>
        sale.timestamp.getFullYear() === now.getFullYear() &&
        sale.timestamp.getMonth() === now.getMonth() &&
        sale.timestamp.getDate() === now.getDate()
      )
      .reduce((sum, sale) => sum + sale.total, 0);
  }, [scopedSales]);

  useEffect(() => {
    // Calculate notifications based on low stock
    const lowStockProducts = products.filter(p => p.stock <= p.minStock);
    const lowStockIngredients = ingredients.filter(i => i.currentStock <= i.minStock);
    
    const notifs = [
      ...lowStockProducts.map(p => ({ id: `p-${p.id}`, message: `Product ${p.name} is low on stock (${p.stock} left)` })),
      ...lowStockIngredients.map(i => ({ id: `i-${i.id}`, message: `Ingredient ${i.name} is low on stock (${i.currentStock} left)` }))
    ];
    setNotifications(notifs);
  }, [products, ingredients]);

  const applySaleResultsLocally = (createdSales: SaleRecord[]) => {
    if (createdSales.length === 0) return;

    setSales((prev) => [...createdSales, ...prev]);

    const qtyByProduct = new Map<string, number>();
    const customerUpdates = new Map<string, { pointsDelta: number; totalDelta: number }>();

    for (const sale of createdSales) {
      for (const item of sale.items) {
        if (!item.id) continue;
        qtyByProduct.set(item.id, (qtyByProduct.get(item.id) || 0) + item.quantity);
      }
      if (sale.customerId) {
        const existing = customerUpdates.get(sale.customerId) || { pointsDelta: 0, totalDelta: 0 };
        existing.pointsDelta += (sale.pointsEarned ?? 0) - (sale.pointsRedeemed ?? 0);
        existing.totalDelta += sale.total;
        customerUpdates.set(sale.customerId, existing);
      }
    }

    setProducts((prev) => prev.map((product) => {
      const soldQty = qtyByProduct.get(product.id);
      if (!soldQty) return product;
      return { ...product, stock: Math.max(0, product.stock - soldQty) };
    }));

    setCustomers((prev) => prev.map((customer) => {
      const update = customerUpdates.get(customer.id);
      if (!update) return customer;
      return {
        ...customer,
        loyaltyPoints: customer.loyaltyPoints + update.pointsDelta,
        totalSpent: customer.totalSpent + update.totalDelta,
      };
    }));
  };

  const refreshAfterSale = async () => {
    try {
      const [prods, custs] = await Promise.all([getProducts(selectedBranchId), getCustomers()]);
      setProducts(prods);
      setCustomers(custs);

      const cached = readCachedAppData();
      if (cached) {
        saveAppDataCache({
          ...cached,
          products: prods,
          customers: custs,
        });
      }
    } catch (error) {
      console.error('Failed to refresh after sale:', error);
    }
  };

  const handleCompleteSales = async (salesPayload: Omit<SaleRecord, 'id' | 'timestamp'>[]): Promise<SaleRecord[]> => {
    const branchId = resolveBranchId(selectedBranchId, branches);
    if (!branchId || !isUuid(branchId)) {
      if (userRole && canSwitchLocation(userRole)) {
        setShowLocationPicker(true);
      }
      throw new Error('Select a branch before creating a bill.');
    }

    const pendingSales: SaleRecord[] = salesPayload.map((salePayload) => ({
      id: '',
      timestamp: new Date(),
      ...salePayload,
      branchId,
      pointsEarned: salePayload.pointsEarned ?? Math.floor(salePayload.total),
    }));

    const saleIds = await Promise.all(pendingSales.map((sale) => apiCreateSale(sale)));
    const createdSales = pendingSales.map((sale, index) => ({
      ...sale,
      id: saleIds[index],
      timestamp: new Date(),
    }));

    applySaleResultsLocally(createdSales);
    void refreshAfterSale();

    return createdSales;
  };

  const handleUpdateSale = async (sale: SaleRecord) => {
    await apiUpdateSale(sale);
    await fetchData({ background: true });
  };

  const handleVoidSale = async (sale: SaleRecord) => {
    await apiVoidSale(sale);
    await fetchData({ background: true });
  };

  const handleAddCustomer = async (customerData: Omit<Customer, 'id' | 'joinDate' | 'loyaltyPoints' | 'totalSpent'>) => {
    try {
      if (customerData.phone) {
        const exists = customers.some(c => c.phone === customerData.phone);
        if (exists) {
          alert('A customer with this phone number already exists.');
          return;
        }
      }
      await apiAddCustomer(customerData);
      await fetchData({ background: true });
    } catch (error) {
      console.error("Failed to add customer:", error);
      alert("Failed to add customer.");
    }
  };

  const handleDeleteCustomer = async (customerId: string) => {
    try {
      await apiDeleteCustomer(customerId);
      await fetchData({ background: true });
    } catch (error: any) {
      console.error("Failed to delete customer:", error);
      const msg = error?.message || error?.error_description || JSON.stringify(error);
      alert(`Failed to delete customer. Error: ${msg}`);
    }
  };

  const handleAddProduct = async (productData: Omit<Product, 'id'>) => {
    try {
      await apiAddProduct(productData, selectedBranchId);
      await fetchData({ background: true });
    } catch (error: any) {
      console.error("Failed to add product:", error);
      const msg = error?.message || error?.error_description || JSON.stringify(error);
      alert(`Failed to add product.\n\nError: ${msg}\n\nCheck the browser console (F12) for details.`);
    }
  };

  const handleAddCategory = async (name: string, imageFile?: File | null) => {
    try {
      await apiAddCategory(name, imageFile as any);
      const latestCategories = await getCategories();
      setCategories(latestCategories);
    } catch (error: any) {
      console.error("Failed to add category:", error);
      const msg = error?.message || error?.error_description || JSON.stringify(error);
      alert(`Failed to add category.\n\nError: ${msg}`);
      throw error;
    }
  };

  const handleUpdateProduct = async (updatedProduct: Product) => {
    try {
      await apiUpdateProduct(updatedProduct, selectedBranchId);
      await fetchData({ background: true });
    } catch (error: any) {
      console.error("Failed to update product:", error);
      const msg = error?.message || error?.error_description || JSON.stringify(error);
      alert(`Failed to update product.\n\nError: ${msg}`);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    try {
      await apiDeleteProduct(productId);
      await fetchData({ background: true });
    } catch (error: any) {
      console.error("Failed to delete product:", error);
      const msg = error?.message || error?.error_description || JSON.stringify(error);
      alert(`Failed to delete product.\n\nError: ${msg}`);
    }
  };

  const handleFetchDeletedItems = async () => {
    const [deletedProducts, deletedIngredients] = await Promise.all([
      getDeletedProducts(),
      getDeletedIngredients()
    ]);
    return { products: deletedProducts, ingredients: deletedIngredients };
  };

  const handleRestoreProduct = async (productId: string) => {
    try {
      await apiRestoreProduct(productId);
      await fetchData({ background: true });
    } catch (error: any) {
      console.error('Failed to restore product:', error);
      const msg = error?.message || error?.error_description || JSON.stringify(error);
      alert(`Failed to restore product.\n\nError: ${msg}`);
      throw error;
    }
  };

  const handleRestoreIngredient = async (ingredientId: string) => {
    try {
      await apiRestoreIngredient(ingredientId);
      await fetchData({ background: true });
    } catch (error: any) {
      console.error('Failed to restore ingredient:', error);
      const msg = error?.message || error?.error_description || JSON.stringify(error);
      alert(`Failed to restore ingredient.\n\nError: ${msg}`);
      throw error;
    }
  };

  const handleAddIngredient = async (ingredientData: Omit<Ingredient, 'id' | 'createdAt'>) => {
    try {
      await apiAddIngredient(ingredientData);
      await fetchData({ background: true });
    } catch (error: any) {
      console.error('Failed to add ingredient:', error);
      const msg = error?.message || error?.error_description || JSON.stringify(error);
      alert(`Failed to add ingredient. ${msg}`);
    }
  };

  const handleUpdateIngredient = async (updatedIngredient: Ingredient) => {
    try {
      await apiUpdateIngredient(updatedIngredient);
      await fetchData({ background: true });
    } catch (error: any) {
      console.error('Failed to update ingredient:', error);
      const msg = error?.message || error?.error_description || JSON.stringify(error);
      alert(`Failed to update ingredient. ${msg}`);
    }
  };

  const handleDeleteIngredient = async (ingredientId: string) => {
    try {
      await apiDeleteIngredient(ingredientId);
      await fetchData({ background: true });
    } catch (error: any) {
      console.error('Failed to delete ingredient:', error);
      const msg = error?.message || error?.error_description || JSON.stringify(error);
      alert(`Failed to delete ingredient. ${msg}`);
    }
  };

  const handleAdjustProductStock = async (productId: string, adjustment: number, reason: string) => {
    try {
      if (!selectedBranchId) {
        throw new Error('Select a branch before changing product stock.');
      }
      await apiAdjustProductStock(productId, adjustment, reason, userRole ?? 'system', selectedBranchId);
      await fetchData({ background: true });
    } catch (error: any) {
      console.error('Failed to adjust product stock:', error);
      alert(`Failed to adjust stock. ${error?.message || ''}`);
    }
  };

  const handleAdjustIngredientStock = async (ingredientId: string, adjustment: number, reason: string) => {
    try {
      await apiAdjustIngredientStock(ingredientId, adjustment, reason, userRole ?? 'system');
      await fetchData({ background: true });
    } catch (error: any) {
      console.error('Failed to adjust ingredient stock:', error);
      alert(`Failed to adjust ingredient stock. ${error?.message || ''}`);
    }
  };

  const refreshLocations = async () => {
    const [nextCities, nextBranches] = await Promise.all([getCities(), getBranches()]);
    setCities(nextCities);
    setBranches(nextBranches);
    return { nextCities, nextBranches };
  };

  const handleAddCity = async (name: string) => {
    const created = await apiAddCity(name);
    if (!supabase) {
      setCities((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      return;
    }
    await refreshLocations();
  };

  const handleUpdateCity = async (id: string, name: string) => {
    const updated = await apiUpdateCity(id, name);
    if (!supabase) {
      setCities((prev) => prev.map((city) => (city.id === id ? updated : city)));
      return;
    }
    await refreshLocations();
  };

  const handleDeleteCity = async (id: string) => {
    await apiDeleteCity(id);
    if (!supabase) {
      setCities((prev) => prev.filter((city) => city.id !== id));
      setBranches((prev) => prev.filter((branch) => branch.cityId !== id));
    } else {
      await refreshLocations();
    }
    if (selectedCityId === id) {
      setSelectedCityId(null);
      setSelectedBranchId(null);
      writeStoredLocation(null, null);
    }
  };

  const handleAddBranch = async (payload: { cityId: string; name: string; address?: string; phone?: string }) => {
    const created = await apiAddBranch(payload);
    if (!supabase) {
      setBranches((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      return;
    }
    await refreshLocations();
  };

  const handleUpdateBranch = async (branch: Branch) => {
    const updated = await apiUpdateBranch(branch);
    if (!supabase) {
      setBranches((prev) => prev.map((item) => (item.id === branch.id ? updated : item)));
      return;
    }
    await refreshLocations();
  };

  const handleDeleteBranch = async (id: string) => {
    await apiDeleteBranch(id);
    if (!supabase) {
      setBranches((prev) => prev.filter((branch) => branch.id !== id));
    } else {
      await refreshLocations();
    }
    if (selectedBranchId === id) {
      setSelectedBranchId(null);
      writeStoredLocation(selectedCityId, null);
    }
  };

  const handleLogin = (profile: SessionProfile, isDemo = false) => {
    if (isDemo) {
      sessionStorage.setItem(DEMO_AUTH_STORAGE_KEY, JSON.stringify(profile));
      applyCachedData(readCachedAppData());
      setCities(DEMO_CITIES);
      setBranches(DEMO_BRANCHES);
    } else {
      sessionStorage.removeItem(DEMO_AUTH_STORAGE_KEY);
    }
    setIsDemoSession(isDemo);
    applyProfile(profile);
    setIsLoggedIn(true);
    setIsAuthLoading(false);
    setCurrentView(defaultLandingView(profile.role));
    if (canSwitchLocation(profile.role) && !readStoredLocation()) {
      setShowLocationPicker(true);
    }
  };

  const requireBillingBranch = currentView === ViewState.BILLING && canAccessBilling(userRole ?? UserRole.EMPLOYEE);

  const handleConfirmLocation = (selection: { cityId: string | null; branchId: string | null }) => {
    if (requireBillingBranch && !selection.branchId) {
      setShowLocationPicker(true);
      return;
    }
    setSelectedCityId(selection.cityId);
    setSelectedBranchId(selection.branchId);
    writeStoredLocation(selection.cityId, selection.branchId);
    setShowLocationPicker(false);
  };

  const handleCancelLocation = () => {
    setShowLocationPicker(false);
    if (requireBillingBranch && !selectedBranchId) {
      setCurrentView(ViewState.DASHBOARD);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--brand-muted)] p-4">
        <div className="flex flex-col items-center gap-4 bg-[var(--brand-surface)] border border-[var(--brand-border)] rounded-3xl shadow-xl p-8">
          <Loader2 className="animate-spin text-[var(--brand-dark)]" size={48} />
          <p className="text-[var(--brand-text-dark)] font-medium">Restoring session...</p>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <Login onLogin={handleLogin} />;
  }

  if (showLocationPicker && userRole && canSwitchLocation(userRole)) {
    return (
      <LocationPicker
        role={userRole}
        cities={cities}
        branches={branches}
        assignedCityId={assignedCityId}
        assignedBranchId={assignedBranchId}
        initialCityId={selectedCityId}
        initialBranchId={selectedBranchId}
        allowAll={!requireBillingBranch}
        requireBranch={requireBillingBranch}
        title={requireBillingBranch ? 'Choose an outlet' : undefined}
        subtitle={requireBillingBranch
          ? 'Billing is per branch. Pick one outlet. All branches is only for dashboards.'
          : undefined}
        confirmLabel={requireBillingBranch ? 'Open billing' : 'Continue'}
        onConfirm={handleConfirmLocation}
        onCancel={readStoredLocation() ? handleCancelLocation : undefined}
      />
    );
  }

  return (
    <Layout
      currentView={currentView}
      fillViewport={currentView === ViewState.BILLING}
      onChangeView={setCurrentView}
      onLogout={async () => {
        try {
          sessionStorage.removeItem(DEMO_AUTH_STORAGE_KEY);
          sessionStorage.removeItem(LOCATION_STORAGE_KEY);
          if (supabase) await supabaseSignOut();
        } catch (err) {
          console.warn('Sign-out failed:', err);
        }
        clearAppDataCache();
        setIsLoggedIn(false);
        setUserRole(null);
        setAssignedCityId(null);
        setAssignedBranchId(null);
        setSelectedCityId(null);
        setSelectedBranchId(null);
        setShowLocationPicker(false);
        setIsDemoSession(false);
      }}
      notifications={notifications}
      userRole={userRole ?? UserRole.SUPER_ADMIN}
      locationLabel={locationLabel}
      cities={cities}
      branches={branches}
      selectedCityId={selectedCityId}
      selectedBranchId={selectedBranchId}
      onChangeLocation={canSwitchLocation(userRole ?? UserRole.SUPER_ADMIN) ? () => setShowLocationPicker(true) : undefined}
    >
      {isSyncingData && products.length === 0 && (
        <div className="mx-3 sm:mx-4 md:mx-6 mt-2 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-2 text-sm text-[var(--brand-dark)] flex items-center gap-2">
          <Loader2 className="animate-spin shrink-0" size={16} />
          Syncing latest products...
        </div>
      )}
      <Suspense fallback={<PageLoader />}>
        {currentView === ViewState.DASHBOARD && (
          userRole === UserRole.EMPLOYEE ? (
            <EmployeeDashboard
              sales={scopedSales}
              products={products}
              dailyStats={MOCK_DAILY_STATS}
              locationLabel={locationLabel}
            />
          ) : (
            <Dashboard
              sales={scopedSales}
              products={products}
              dailyStats={MOCK_DAILY_STATS}
              locationLabel={locationLabel}
              branchSummaries={branchSummaries}
            />
          )
        )}
        {currentView === ViewState.BILLING && canAccessBilling(userRole ?? UserRole.EMPLOYEE) && (
          <Billing
            products={products}
            customers={customers}
            categories={categories}
            salesTodayTotal={salesTodayTotal}
            shop={shopIdentity}
            onCompleteSales={handleCompleteSales}
          />
        )}
        {currentView === ViewState.BILLS && (
          <BillsHistory
            sales={scopedSales}
            customers={customers}
            userRole={userRole ?? UserRole.SUPER_ADMIN}
            shop={shopIdentity}
            onUpdateSale={handleUpdateSale}
            onVoidSale={handleVoidSale}
          />
        )}
        {currentView === ViewState.CUSTOMERS && (
          <Customers
            customers={customers}
            sales={scopedSales}
            onAddCustomer={handleAddCustomer}
            onDeleteCustomer={handleDeleteCustomer}
          />
        )}
        {currentView === ViewState.USERS && userRole && canManageUsers(userRole) && (
          <Users
            actorRole={userRole}
            assignedCityId={assignedCityId}
            assignedBranchId={assignedBranchId}
            cities={cities}
            branches={branches}
          />
        )}
        {currentView === ViewState.INVENTORY && (
          <Inventory
              products={products}
              categories={categories}
              ingredients={ingredients}
              inventoryAdjustments={inventoryAdjustments}
              stockLocationLabel={selectedBranch?.name ?? null}
              canEditProductStock={Boolean(selectedBranchId)}
              onAddProduct={handleAddProduct}
              onAddCategory={handleAddCategory}
              onAddIngredient={handleAddIngredient}
              onUpdateIngredient={handleUpdateIngredient}
              onDeleteIngredient={handleDeleteIngredient}
              onUpdateProduct={handleUpdateProduct}
              onDeleteProduct={handleDeleteProduct}
              onAdjustProductStock={handleAdjustProductStock}
              onAdjustIngredientStock={handleAdjustIngredientStock}
              onFetchDeletedItems={handleFetchDeletedItems}
              onRestoreProduct={handleRestoreProduct}
              onRestoreIngredient={handleRestoreIngredient}
              canEdit={canEditInventory(userRole ?? UserRole.EMPLOYEE)}
            />
        )}
        {currentView === ViewState.CATEGORIES && userRole && canEditCategories(userRole) && (
          <Categories
            categories={categories}
            onAddCategory={handleAddCategory}
            onUpdateCategory={async (id, name, file) => { try { await updateCategory(id, name, file as any); const latest = await getCategories(); setCategories(latest); } catch (err) { console.error(err); alert('Failed to update category'); } }}
            onDeleteCategory={async (id) => { try { await deleteCategory(id); const latest = await getCategories(); setCategories(latest); } catch (err) { console.error(err); alert('Failed to delete category'); } }}
            canEdit={canEditCategories(userRole)}
          />
        )}
        {currentView === ViewState.LOCATIONS && userRole && canManageLocations(userRole) && (
          <Locations
            cities={cities}
            branches={branches}
            onAddCity={handleAddCity}
            onUpdateCity={handleUpdateCity}
            onDeleteCity={handleDeleteCity}
            onAddBranch={handleAddBranch}
            onUpdateBranch={handleUpdateBranch}
            onDeleteBranch={handleDeleteBranch}
          />
        )}
      </Suspense>
    </Layout>
  );
};

export default App;
