import React, { useMemo, useState } from 'react';
import { Category, Product, Ingredient, InventoryAdjustment } from '../types';
import {
  PRODUCT_UNIT_OPTIONS,
  PIECE_UNIT,
  isPieceUnit,
  normalizeProductUnit,
  getWeightPriceBreakdown,
  getPieceBillingOptions,
  formatInventoryUnitPrice,
} from '../constants';
import { ArrowUpDown, AlertCircle, Plus, X, Pencil, Trash2, Tag, Edit3, Box, Archive, RotateCcw } from 'lucide-react';

interface InventoryProps {
  products: Product[];
  categories: Category[];
  ingredients: Ingredient[];
  inventoryAdjustments: InventoryAdjustment[];
  onAddProduct: (product: Omit<Product, 'id'>) => void;
  onAddCategory: (name: string, imageFile?: File | null) => Promise<void> | void;
  onUpdateProduct: (product: Product) => void;
  onDeleteProduct: (id: string) => void;
  onAddIngredient: (ingredient: Omit<Ingredient, 'id' | 'createdAt'>) => void;
  onUpdateIngredient: (ingredient: Ingredient) => void;
  onDeleteIngredient: (id: string) => void;
  onAdjustProductStock: (productId: string, adjustment: number, reason: string) => void;
  onAdjustIngredientStock: (ingredientId: string, adjustment: number, reason: string) => void;
  onFetchDeletedItems: () => Promise<{ products: Product[]; ingredients: Ingredient[] }>;
  onRestoreProduct: (id: string) => void;
  onRestoreIngredient: (id: string) => void;
  canEdit?: boolean;
  stockLocationLabel?: string | null;
  canEditProductStock?: boolean;
}

type ListMode = 'active' | 'deleted';

type SortField = 'name' | 'profit' | 'margin' | 'price';
const ALLOWED_UNITS = ['pcs', 'kg', 'L'];
const MENU_ITEM_UNITS = PRODUCT_UNIT_OPTIONS;

const Inventory: React.FC<InventoryProps> = ({ products, categories, ingredients, inventoryAdjustments, onAddProduct, onAddCategory, onUpdateProduct, onDeleteProduct, onAddIngredient, onUpdateIngredient, onDeleteIngredient, onAdjustProductStock, onAdjustIngredientStock, onFetchDeletedItems, onRestoreProduct, onRestoreIngredient, canEdit = true, stockLocationLabel = null, canEditProductStock = true }) => {
  const [listMode, setListMode] = useState<ListMode>('active');
  const [deletedProducts, setDeletedProducts] = useState<Product[]>([]);
  const [deletedIngredients, setDeletedIngredients] = useState<Ingredient[]>([]);
  const [isLoadingDeleted, setIsLoadingDeleted] = useState(false);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [selectedProductForQuickUpdate, setSelectedProductForQuickUpdate] = useState<Product | null>(null);
  const [quickAdjustAmount, setQuickAdjustAmount] = useState('0');
  const [quickAdjustReason, setQuickAdjustReason] = useState('Stock correction');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [newCategoryImage, setNewCategoryImage] = useState<File | null>(null);
  const [selectedProductForAdjust, setSelectedProductForAdjust] = useState<Product | null>(null);
  const [selectedIngredientForAdjust, setSelectedIngredientForAdjust] = useState<Ingredient | null>(null);
  const [selectedIngredientForEdit, setSelectedIngredientForEdit] = useState<Ingredient | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('0');
  const [adjustReason, setAdjustReason] = useState('Stock correction');
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [isIngredientAddMode, setIsIngredientAddMode] = useState(false);
  const [isIngredientEditMode, setIsIngredientEditMode] = useState(false);
  const [ingredientForm, setIngredientForm] = useState({ name: '', unit: 'pcs', currentStock: '0', minStock: '0' });

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    price: '',
    cost: '',
    stock: '',
    minStock: '',
    unit: '100 gms'
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const categoryOptions = useMemo(() => {
    const categoryNames = [
      ...categories.map(category => category.name.trim()).filter(Boolean)
    ];

    if (formData.category.trim()) {
      categoryNames.push(formData.category.trim());
    }

    const uniqueCategories: string[] = [];
    const seen = new Set<string>();
    for (const name of categoryNames) {
      const lower = name.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        uniqueCategories.push(name);
      }
    }

    return uniqueCategories.sort((a, b) => a.localeCompare(b));
  }, [categories, formData.category]);

  const resetForm = () => {
    setFormData({ name: '', category: '', price: '', cost: '', stock: '', minStock: '', unit: '100 gms' });
    setEditingId(null);
    setIsAddingCategory(false);
    setNewCategory('');
  };

  const openAddModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEditModal = (product: Product) => {
    setIsAddingCategory(false);
    setNewCategory('');
    setEditingId(product.id);
    setFormData({
      name: product.name,
      category: product.category,
      price: product.price.toString(),
      cost: product.cost.toString(),
      stock: product.stock.toString(),
      minStock: product.minStock.toString(),
      unit: isPieceUnit(product.unit)
        ? PIECE_UNIT
        : MENU_ITEM_UNITS.includes(product.unit)
          ? product.unit
          : product.unit || '100 gms'
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
  };

  const handleDeleteClick = (id: string, name: string) => {
    if (window.confirm(`Move "${name}" to deleted items? You can restore it later from the Deleted Items view.`)) {
      onDeleteProduct(id);
    }
  };

  const loadDeletedItems = async () => {
    setIsLoadingDeleted(true);
    try {
      const { products: deletedProds, ingredients: deletedIngs } = await onFetchDeletedItems();
      setDeletedProducts(deletedProds);
      setDeletedIngredients(deletedIngs);
    } catch (error) {
      console.error('Failed to load deleted items:', error);
      alert('Failed to load deleted items.');
    } finally {
      setIsLoadingDeleted(false);
    }
  };

  const switchListMode = async (mode: ListMode) => {
    setListMode(mode);
    if (mode === 'deleted') {
      await loadDeletedItems();
    }
  };

  const handleRestoreProduct = async (id: string) => {
    try {
      await onRestoreProduct(id);
      setDeletedProducts((prev) => prev.filter((product) => product.id !== id));
    } catch (error) {
      console.error('Failed to restore product:', error);
      alert('Failed to restore product.');
    }
  };

  const handleRestoreIngredient = async (id: string) => {
    try {
      await onRestoreIngredient(id);
      setDeletedIngredients((prev) => prev.filter((ingredient) => ingredient.id !== id));
    } catch (error) {
      console.error('Failed to restore ingredient:', error);
      alert('Failed to restore ingredient.');
    }
  };

  const openProductAdjustment = (product: Product) => {
    setSelectedProductForAdjust(product);
    setSelectedIngredientForAdjust(null);
    setAdjustAmount('0');
    setAdjustReason('Stock correction');
    setShowAdjustmentModal(true);
  };

  const openIngredientAdjustment = (ingredient: Ingredient) => {
    setIsIngredientAddMode(false);
    setIsIngredientEditMode(false);
    setSelectedIngredientForAdjust(ingredient);
    setSelectedIngredientForEdit(null);
    setSelectedProductForAdjust(null);
    setAdjustAmount('0');
    setAdjustReason('Stock correction');
    setShowAdjustmentModal(true);
  };

  const openEditIngredient = (ingredient: Ingredient) => {
    setIsIngredientAddMode(false);
    setIsIngredientEditMode(true);
    setSelectedIngredientForAdjust(null);
    setSelectedIngredientForEdit(ingredient);
    setIngredientForm({
      name: ingredient.name,
      unit: ingredient.unit,
      currentStock: ingredient.currentStock.toString(),
      minStock: ingredient.minStock.toString()
    });
    setShowAdjustmentModal(true);
  };

  const openAddIngredient = () => {
    setIsIngredientAddMode(true);
    setSelectedIngredientForAdjust(null);
    setSelectedProductForAdjust(null);
    setAdjustAmount('0');
    setAdjustReason('New ingredient');
    setIngredientForm({ name: '', unit: 'pcs', currentStock: '0', minStock: '0' });
    setShowAdjustmentModal(true);
  };

  const closeAdjustmentModal = () => {
    setShowAdjustmentModal(false);
    setSelectedProductForAdjust(null);
    setSelectedIngredientForAdjust(null);
    setSelectedIngredientForEdit(null);
    setAdjustAmount('0');
    setAdjustReason('Stock correction');
    setIsIngredientAddMode(false);
    setIsIngredientEditMode(false);
  };

  const submitAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (isIngredientAddMode) {
      if (!ingredientForm.name.trim()) return;
      onAddIngredient({
        name: ingredientForm.name.trim(),
        unit: ingredientForm.unit,
        currentStock: Number(ingredientForm.currentStock),
        minStock: Number(ingredientForm.minStock)
      });
      closeAdjustmentModal();
      return;
    }

    if (isIngredientEditMode && selectedIngredientForEdit) {
      onUpdateIngredient({
        id: selectedIngredientForEdit.id,
        name: ingredientForm.name.trim(),
        unit: ingredientForm.unit,
        currentStock: Number(ingredientForm.currentStock),
        minStock: Number(ingredientForm.minStock),
        createdAt: selectedIngredientForEdit.createdAt
      });
      closeAdjustmentModal();
      return;
    }

    const amount = Number(adjustAmount);
    if (!amount || !adjustReason.trim()) return;

    if (selectedProductForAdjust) {
      if (!canEditProductStock) {
        alert('Select a branch before changing product stock.');
        return;
      }
      onAdjustProductStock(selectedProductForAdjust.id, amount, adjustReason.trim());
    }
    if (selectedIngredientForAdjust) {
      onAdjustIngredientStock(selectedIngredientForAdjust.id, amount, adjustReason.trim());
    }
    closeAdjustmentModal();
  };

  const handleAddCategory = async () => {
    const trimmedCategory = newCategory.trim();
    if (!trimmedCategory) return;

    setFormData({ ...formData, category: trimmedCategory });
    setNewCategory('');
    setIsAddingCategory(false);
    try {
      await onAddCategory(trimmedCategory, newCategoryImage);
    } finally {
      setNewCategoryImage(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const productData = {
      name: formData.name.trim(),
      category: formData.category.trim(),
      price: formData.price.trim() ? parseFloat(formData.price) : 0,
      cost: formData.cost.trim() ? parseFloat(formData.cost) : 0,
      stock: formData.stock.trim() ? parseInt(formData.stock) || 0 : 0,
      minStock: formData.minStock.trim() ? parseInt(formData.minStock) || 0 : 0,
      unit: normalizeProductUnit(formData.unit || '100 gms')
    };

    if (editingId) {
      onUpdateProduct({ ...productData, id: editingId });
    } else {
      onAddProduct(productData);
    }

    setIsModalOpen(false);
    resetForm();
  };

  const menuItemUnitOptions = useMemo(() => {
    if (formData.unit && !MENU_ITEM_UNITS.includes(formData.unit)) {
      return [formData.unit, ...MENU_ITEM_UNITS];
    }
    return MENU_ITEM_UNITS;
  }, [formData.unit]);

  const isPieceProduct = isPieceUnit(formData.unit);

  const billingPricePreview = useMemo(() => {
    const price = formData.price.trim() ? parseFloat(formData.price) : 0;
    const cost = formData.cost.trim() ? parseFloat(formData.cost) : 0;
    if (!price || !formData.unit) return [];
    if (isPieceUnit(formData.unit)) {
      return getPieceBillingOptions(price);
    }
    return getWeightPriceBreakdown(price, formData.unit, cost);
  }, [formData.price, formData.cost, formData.unit]);

  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) => {
      const profitA = a.price - a.cost;
      const profitB = b.price - b.cost;
      
      let valA: number | string = 0;
      let valB: number | string = 0;

      switch (sortField) {
        case 'name':
          return sortDir === 'asc'
            ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
            : b.name.localeCompare(a.name, undefined, { sensitivity: 'base' });
        case 'price': valA = a.price; valB = b.price; break;
        case 'profit': valA = profitA; valB = profitB; break;
        case 'margin': valA = a.price > 0 ? (profitA / a.price) * 100 : 0; valB = b.price > 0 ? (profitB / b.price) * 100 : 0; break;
      }

      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [products, sortField, sortDir]);

  const filteredProducts = useMemo(() => {
    return sortedProducts.filter(product => categoryFilter === 'All' || product.category === categoryFilter);
  }, [sortedProducts, categoryFilter]);

  const sortedIngredients = useMemo(() => {
    return [...ingredients].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [ingredients]);

  const TableHeader = ({ field, label }: { field: SortField, label: string }) => (
    <th 
      className="px-6 py-4 text-left text-xs font-semibold text-[var(--brand-border)] uppercase tracking-wider cursor-pointer hover:bg-[var(--brand-muted)] transition-colors"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown size={12} className={sortField === field ? 'text-[var(--brand-accent)]' : 'text-[var(--brand-border)]'} />
      </div>
    </th>
  );

  return (
    <div className="space-y-6 animate-fade-in pb-20 md:pb-0">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h3 className="text-lg font-bold text-[var(--brand-dark)]">Menu & Stock List</h3>
          <p className="text-sm text-[var(--brand-border)]">
            {listMode === 'active'
              ? 'Manage your product offerings and inventory levels.'
              : 'View and restore items that were removed from the menu.'}
          </p>
          {listMode === 'active' && (
            <p className={`mt-2 text-sm ${stockLocationLabel ? 'text-[var(--brand-dark)]' : 'text-amber-700'}`}>
              {stockLocationLabel
                ? `Stock shown is for ${stockLocationLabel}. The menu is shared across outlets.`
                : 'Showing catalog stock. Select a branch to view or edit outlet stock.'}
            </p>
          )}
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
          <div className="inline-flex rounded-xl border border-[var(--brand-border)] bg-white p-1">
            <button
              type="button"
              onClick={() => switchListMode('active')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${listMode === 'active' ? 'bg-[var(--brand-dark)] text-[var(--brand-text-light)]' : 'text-[var(--brand-border)] hover:text-[var(--brand-dark)]'}`}
            >
              Active Items
            </button>
            <button
              type="button"
              onClick={() => switchListMode('deleted')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2 ${listMode === 'deleted' ? 'bg-[var(--brand-dark)] text-[var(--brand-text-light)]' : 'text-[var(--brand-border)] hover:text-[var(--brand-dark)]'}`}
            >
              <Archive size={14} />
              Deleted Items
            </button>
          </div>
          {canEdit && listMode === 'active' ? (
            <button 
              onClick={openAddModal}
              className="w-full sm:w-auto bg-[var(--brand-dark)] text-[var(--brand-text-light)] px-5 py-3 rounded-xl font-medium hover:bg-[var(--brand-bg)] transition-colors shadow-lg shadow-[var(--brand-border)] flex items-center justify-center gap-2"
            >
              <Plus size={18} />
              Add Item
            </button>
          ) : listMode === 'active' ? (
            <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-muted)] px-4 py-3 text-sm text-[var(--brand-border)]">
              Employee access: view only
            </div>
          ) : null}
        </div>
      </div>

      {listMode === 'active' ? (
      <div className="bg-[var(--brand-surface)] rounded-2xl border border-[var(--brand-border)] shadow-sm overflow-hidden">
        <div className="category-strip-toolbar">
          <span className="category-strip-toolbar__label">Browse by category</span>
          <div className="category-strip-wrapper">
            <div className="category-strip category-strip--compact">
              <button
                type="button"
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
              {categories.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryFilter(cat.name)}
                  className={`category-chip ${categoryFilter === cat.name ? 'category-chip--active' : ''}`}
                >
                  <div className="category-chip__img-wrap">
                    {cat.imageUrl ? (
                      <img src={cat.imageUrl} alt={cat.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[var(--brand-dark)] text-lg font-semibold">
                        {cat.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <span className="category-chip__label">{cat.name}</span>
                  <span className="category-chip__bar" />
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead className="bg-[var(--brand-muted)] border-b border-[var(--brand-border)]">
              <tr>
                <TableHeader field="name" label="Product" />
                <TableHeader field="price" label="Price" />
                <th className="px-6 py-4 text-left text-xs font-semibold text-[var(--brand-border)] uppercase tracking-wider">Cost</th>
                <TableHeader field="profit" label="Profit / Unit" />
                <TableHeader field="margin" label="Margin" />
                <th className="px-6 py-4 text-left text-xs font-semibold text-[var(--brand-border)] uppercase tracking-wider">Stock</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-[var(--brand-border)] uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-[var(--brand-border)] uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-[var(--brand-border)]">
                    No products found for this category.
                  </td>
                </tr>
              ) : filteredProducts.map((product) => {
                const profit = product.price - product.cost;
                const marginValue = product.price > 0 ? ((profit / product.price) * 100) : 0;
                const margin = marginValue.toFixed(0);
                const isLowStock = product.stock <= product.minStock;

                return (
                  <tr key={product.id} className="hover:bg-[var(--brand-muted)]/80 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-medium text-[var(--brand-dark)]">{product.name}</span>
                        <span className="text-xs text-[var(--brand-border)]">{product.category}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-[var(--brand-text-dark)]">₹{product.price.toFixed(2)}</td>
                    <td className="px-6 py-4 text-sm text-[var(--brand-border)]">₹{product.cost.toFixed(2)}</td>
                    <td className="px-6 py-4 text-sm text-[var(--brand-dark)]">+₹{profit.toFixed(2)}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center justify-center rounded-full px-2 py-1 text-xs font-semibold ${marginValue >= 30 ? 'bg-emerald-100 text-emerald-700' : marginValue >= 15 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                        {margin}%
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-[var(--brand-dark)]">
                      {product.stock} {product.unit}
                    </td>
                    <td className="px-6 py-4">
                      {isLowStock ? (
                        <div className="flex items-center gap-1.5 text-[var(--brand-dark)] bg-[var(--brand-accent)]/20 px-2 py-1 rounded-full w-fit">
                          <AlertCircle size={14} />
                          <span className="text-xs font-medium">Low Stock</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-[var(--brand-border)]">
                          <div className="w-2 h-2 rounded-full bg-[var(--brand-accent)]"></div>
                          <span className="text-xs">OK</span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {canEdit ? (
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => {
                              if (!canEditProductStock) {
                                alert('Select a branch before changing product stock.');
                                return;
                              }
                              openProductAdjustment(product);
                            }}
                            className="p-2 text-[var(--brand-border)] hover:text-[var(--brand-dark)] hover:bg-[var(--brand-muted)] rounded-lg transition-colors"
                            title={canEditProductStock ? 'Adjust stock' : 'Select a branch to adjust stock'}
                          >
                            <Edit3 size={16} />
                          </button>
                          <button 
                            onClick={() => openEditModal(product)}
                            className="p-2 text-[var(--brand-border)] hover:text-[var(--brand-dark)] hover:bg-[var(--brand-muted)] rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Pencil size={16} />
                          </button>
                          <button 
                            onClick={() => handleDeleteClick(product.id, product.name)}
                            className="p-2 text-[var(--brand-border)] hover:text-[var(--brand-dark)] hover:bg-[var(--brand-muted)] rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ) : (
                        <span className="text-sm text-[var(--brand-border)]">View only</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      ) : (
      <div className="bg-[var(--brand-surface)] rounded-2xl border border-[var(--brand-border)] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--brand-border)] bg-[var(--brand-muted)]">
          <h3 className="text-lg font-bold text-[var(--brand-dark)]">Deleted Items</h3>
          <p className="text-sm text-[var(--brand-border)]">Restore products or ingredients removed from the menu.</p>
        </div>
        {isLoadingDeleted ? (
          <div className="px-6 py-12 text-center text-[var(--brand-border)]">Loading deleted items...</div>
        ) : (
          <div className="divide-y divide-[var(--brand-border)]">
            <div className="data-table-wrap">
              <table className="data-table">
                <thead className="bg-[var(--brand-muted)] border-b border-[var(--brand-border)]">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-[var(--brand-border)] uppercase tracking-wider">Deleted Product</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-[var(--brand-border)] uppercase tracking-wider">Category</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-[var(--brand-border)] uppercase tracking-wider">Price</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-[var(--brand-border)] uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--brand-border)]">
                  {deletedProducts.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-[var(--brand-border)]">No deleted products.</td>
                    </tr>
                  ) : deletedProducts.map((product) => (
                    <tr key={product.id} className="hover:bg-[var(--brand-muted)]/60">
                      <td className="px-6 py-4 font-medium text-[var(--brand-dark)]">{product.name}</td>
                      <td className="px-6 py-4 text-sm text-[var(--brand-border)]">{product.category || '—'}</td>
                      <td className="px-6 py-4 text-sm text-[var(--brand-text-dark)]">₹{product.price.toFixed(2)}</td>
                      <td className="px-6 py-4 text-right">
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={() => handleRestoreProduct(product.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--brand-border)] text-sm font-medium text-[var(--brand-dark)] hover:bg-[var(--brand-muted)]"
                          >
                            <RotateCcw size={14} />
                            Restore
                          </button>
                        ) : (
                          <span className="text-sm text-[var(--brand-border)]">View only</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="data-table-wrap">
              <table className="data-table">
                <thead className="bg-[var(--brand-muted)] border-b border-[var(--brand-border)]">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-[var(--brand-border)] uppercase tracking-wider">Deleted Ingredient</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-[var(--brand-border)] uppercase tracking-wider">Unit</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-[var(--brand-border)] uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--brand-border)]">
                  {deletedIngredients.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-6 py-8 text-center text-[var(--brand-border)]">No deleted ingredients.</td>
                    </tr>
                  ) : deletedIngredients.map((ingredient) => (
                    <tr key={ingredient.id} className="hover:bg-[var(--brand-muted)]/60">
                      <td className="px-6 py-4 font-medium text-[var(--brand-dark)]">{ingredient.name}</td>
                      <td className="px-6 py-4 text-sm text-[var(--brand-border)]">{ingredient.unit}</td>
                      <td className="px-6 py-4 text-right">
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={() => handleRestoreIngredient(ingredient.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--brand-border)] text-sm font-medium text-[var(--brand-dark)] hover:bg-[var(--brand-muted)]"
                          >
                            <RotateCcw size={14} />
                            Restore
                          </button>
                        ) : (
                          <span className="text-sm text-[var(--brand-border)]">View only</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      )}

      {listMode === 'active' && (
      <>
      {/* Ingredient Inventory + Adjustment History */}
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="bg-[var(--brand-surface)] rounded-2xl border border-[var(--brand-border)] shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--brand-border)] bg-[var(--brand-muted)] flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-[var(--brand-dark)]">Ingredient Inventory</h3>
              <p className="text-sm text-[var(--brand-border)]">Track ingredients used for bakery products.</p>
            </div>
            <button
              type="button"
              onClick={openAddIngredient}
              className="inline-flex items-center gap-2 bg-[var(--brand-dark)] text-[var(--brand-text-light)] px-4 py-2 rounded-xl text-sm font-medium hover:bg-[var(--brand-bg)] transition-colors"
            >
              <Plus size={16} /> Add Ingredient
            </button>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead className="bg-[var(--brand-muted)] border-b border-[var(--brand-border)]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[var(--brand-border)] uppercase tracking-wider">Ingredient</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[var(--brand-border)] uppercase tracking-wider">Alert</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-[var(--brand-border)] uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--brand-border)]">
                {sortedIngredients.map(ingredient => {
                  const isLow = ingredient.currentStock <= ingredient.minStock;
                  return (
                    <tr key={ingredient.id} className="hover:bg-[var(--brand-muted)]/80 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-[var(--brand-dark)]">{ingredient.name}</div>
                        <div className="text-xs text-[var(--brand-border)]">{ingredient.unit}</div>
                      </td>
                      <td className="px-6 py-4">
                        {isLow ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--brand-accent)]/20 text-[var(--brand-dark)] px-2 py-1 text-xs font-semibold">
                            <AlertCircle size={12} /> Low stock
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--brand-muted)] text-[var(--brand-text-dark)] px-2 py-1 text-xs font-semibold">
                            In stock
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => openIngredientAdjustment(ingredient)}
                          className="inline-flex items-center justify-center rounded-full border border-[var(--brand-border)] bg-[var(--brand-surface)] text-[var(--brand-text-dark)] hover:bg-[var(--brand-muted)] p-2 transition-colors"
                          title="Adjust ingredient stock"
                        >
                          <Box size={16} />
                        </button>
                        <button
                          onClick={() => openEditIngredient(ingredient)}
                          className="inline-flex items-center justify-center rounded-full border border-[var(--brand-border)] bg-[var(--brand-surface)] text-[var(--brand-text-dark)] hover:bg-[var(--brand-muted)] p-2 transition-colors"
                          title="Edit ingredient"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(`Delete ingredient '${ingredient.name}'? This cannot be undone.`)) {
                              onDeleteIngredient(ingredient.id);
                            }
                          }}
                          className="inline-flex items-center justify-center rounded-full border border-[var(--brand-border)] bg-[var(--brand-surface)] text-[var(--brand-text-dark)] hover:bg-[var(--brand-muted)] p-2 transition-colors"
                          title="Delete ingredient"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {ingredients.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-6 py-8 text-center text-[var(--brand-border)]">
                      No ingredients configured yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-[var(--brand-surface)] rounded-2xl border border-[var(--brand-border)] shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--brand-border)] bg-[var(--brand-muted)]">
            <h3 className="text-lg font-bold text-[var(--brand-dark)]">Stock Adjustment History</h3>
            <p className="text-sm text-[var(--brand-border)]">Recent manual stock changes.</p>
          </div>
          <div className="overflow-y-auto max-h-[440px]">
            <div className="divide-y divide-[var(--brand-border)]">
              {inventoryAdjustments.length === 0 ? (
                <div className="p-6 text-center text-[var(--brand-border)]">No inventory adjustments recorded yet.</div>
              ) : inventoryAdjustments.map(adj => (
                <div key={adj.id} className="px-6 py-4 hover:bg-[var(--brand-muted)] transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-[var(--brand-dark)]">{adj.adjustment >= 0 ? 'Added' : 'Removed'} {Math.abs(adj.adjustment)}</p>
                      <p className="text-xs text-[var(--brand-border)]">{adj.reason}</p>
                    </div>
                    <span className="text-xs text-[var(--brand-border)]">{adj.createdAt.toLocaleString()}</span>
                  </div>
                  <div className="mt-2 text-xs text-[var(--brand-border)]">
                    {adj.productId ? `Product ID: ${adj.productId}` : adj.ingredientId ? `Ingredient ID: ${adj.ingredientId}` : 'System'} • By {adj.createdBy}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      </>
      )}

      {/* Add/Edit Product Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-[var(--brand-dark)]/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--brand-surface)] rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-scale-up max-h-[90vh] flex flex-col border border-[var(--brand-border)]">
            <div className="p-5 border-b border-[var(--brand-border)] flex justify-between items-center bg-[var(--brand-muted)] shrink-0">
              <h3 className="text-lg font-bold text-[var(--brand-dark)]">
                {editingId ? 'Edit Menu Item' : 'Add New Menu Item'}
              </h3>
              <button onClick={closeModal} className="text-[var(--brand-border)] hover:text-[var(--brand-dark)] p-1">
                <X size={20} />
              </button>
            </div>
            
            <div className="overflow-y-auto p-6">
              <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-5">
                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-[var(--brand-dark)] mb-1.5">Product Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Masala Chai"
                    className="w-full px-4 py-3 rounded-xl border border-[var(--brand-border)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/20 focus:border-[var(--brand-accent)] text-[var(--brand-text-dark)] bg-white"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                  />
                </div>
                <div className="col-span-1">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <label className="block text-sm font-semibold text-[var(--brand-dark)]">Category</label>
                    <button
                      type="button"
                      onClick={() => setIsAddingCategory(true)}
                      className="text-xs font-semibold text-[var(--brand-accent)] hover:text-[var(--brand-dark)] flex items-center gap-1"
                    >
                      <Tag size={12} />
                      Add
                    </button>
                  </div>
                  <select
                    className="w-full px-4 py-3 rounded-xl border border-[var(--brand-border)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/20 focus:border-[var(--brand-accent)] bg-white text-[var(--brand-text-dark)]"
                    value={formData.category}
                    onChange={e => setFormData({...formData, category: e.target.value})}
                  >
                    <option value="">Select category</option>
                    {categoryOptions.map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                  {isAddingCategory && (
                    <div className="mt-2 flex gap-2">
                      <input
                        type="text"
                        placeholder="New category"
                        className="min-w-0 flex-1 px-3 py-2 rounded-lg border border-[var(--brand-border)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/20 focus:border-[var(--brand-accent)] text-sm text-[var(--brand-text-dark)] bg-white"
                        value={newCategory}
                        onChange={e => setNewCategory(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCategory();
                          }
                        }}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={handleAddCategory}
                        className="shrink-0 px-3 py-2 rounded-lg bg-[var(--brand-accent)] text-[var(--brand-text-light)] text-sm font-semibold hover:bg-[#d09f48] transition-colors"
                      >
                        Save
                      </button>
                    </div>
                  )}
                </div>
                <div className="col-span-1">
                  <label className="block text-sm font-semibold text-[var(--brand-dark)] mb-1.5">Unit</label>
                  <select 
                    className="w-full px-4 py-3 rounded-xl border border-[var(--brand-border)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/20 focus:border-[var(--brand-accent)] bg-white text-[var(--brand-text-dark)]"
                    value={formData.unit}
                    onChange={e => setFormData({...formData, unit: e.target.value})}
                  >
                    {menuItemUnitOptions.map(unit => (
                      <option key={unit} value={unit}>{unit}</option>
                    ))}
                  </select>
                </div>
                
                <div className="col-span-1">
                  <label className="block text-sm font-semibold text-[var(--brand-dark)] mb-1.5">
                    {isPieceProduct ? 'Price Per Piece (₹)' : 'Selling Price (₹) for unit'}
                  </label>
                  <input 
                    type="number" 
                    step="0.01"
                    min="0"
                    className="w-full px-4 py-3 rounded-xl border border-[var(--brand-border)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/20 focus:border-[var(--brand-accent)] text-[var(--brand-text-dark)] bg-white"
                    value={formData.price}
                    onChange={e => setFormData({...formData, price: e.target.value})}
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-sm font-semibold text-[var(--brand-dark)] mb-1.5">
                    {isPieceProduct ? 'Cost Per Piece (₹)' : 'Cost Price (₹) for unit'}
                  </label>
                  <input 
                    type="number" 
                    step="0.01"
                    min="0"
                    className="w-full px-4 py-3 rounded-xl border border-[var(--brand-border)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/20 focus:border-[var(--brand-accent)] text-[var(--brand-text-dark)] bg-white"
                    value={formData.cost}
                    onChange={e => setFormData({...formData, cost: e.target.value})}
                  />
                </div>

                <div className="col-span-1">
                  <label className="block text-sm font-semibold text-[var(--brand-dark)] mb-1.5">
                    {stockLocationLabel ? `Stock (${stockLocationLabel})` : 'Catalog stock'}
                  </label>
                  <input 
                    type="number" 
                    min="0"
                    disabled={!canEditProductStock && Boolean(stockLocationLabel === null)}
                    className="w-full px-4 py-3 rounded-xl border border-[var(--brand-border)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/20 focus:border-[var(--brand-accent)] text-[var(--brand-text-dark)] bg-white disabled:opacity-60"
                    value={formData.stock}
                    onChange={e => setFormData({...formData, stock: e.target.value})}
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-sm font-semibold text-[var(--brand-dark)] mb-1.5">Alert Level</label>
                  <input 
                    type="number" 
                    min="0"
                    className="w-full px-4 py-3 rounded-xl border border-[var(--brand-border)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/20 focus:border-[var(--brand-accent)] text-[var(--brand-text-dark)] bg-white"
                    value={formData.minStock}
                    onChange={e => setFormData({...formData, minStock: e.target.value})}
                  />
                </div>

                {billingPricePreview.length > 0 && (
                  <div className="col-span-2 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-muted)] p-4">
                    {isPieceProduct ? (
                      <>
                        <p className="text-sm font-semibold text-[var(--brand-dark)] mb-1">
                          Billing quick-select from {formatInventoryUnitPrice(parseFloat(formData.price || '0'), PIECE_UNIT)}
                        </p>
                        <p className="text-xs text-[var(--brand-border)] mb-3">
                          Cashiers can tap 1–15 pieces during billing. Price per piece cannot be changed at checkout.
                        </p>
                        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                          {billingPricePreview.map(({ count, amount, label }) => (
                            <div
                              key={count}
                              className="rounded-lg border border-[var(--brand-border)] bg-white/80 px-3 py-2 text-center"
                            >
                              <div className="text-xs font-semibold text-[var(--brand-dark)]">{label}</div>
                              <div className="text-xs text-[var(--brand-border)] mt-1">₹{amount.toFixed(2)}</div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-[var(--brand-dark)] mb-1">
                          Billing auto-prices from {formatInventoryUnitPrice(parseFloat(formData.price || '0'), formData.unit)}
                        </p>
                        <p className="text-xs text-[var(--brand-border)] mb-3">
                          These prices will appear automatically when billing this product.
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {billingPricePreview.map(({ unit, price, isInventoryUnit }) => (
                            <div
                              key={unit}
                              className={`rounded-lg border px-3 py-2 text-center ${
                                isInventoryUnit ? 'border-[var(--brand-dark)] bg-white' : 'border-[var(--brand-border)] bg-white/80'
                              }`}
                            >
                              <div className="text-xs font-semibold text-[var(--brand-dark)]">{unit}</div>
                              <div className="text-xs text-[var(--brand-border)] mt-1">₹{price.toFixed(2)}</div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                <div className="col-span-2 pt-4">
                  <button type="submit" className="w-full bg-[var(--brand-dark)] text-[var(--brand-text-light)] py-3.5 rounded-xl font-medium hover:bg-[var(--brand-bg)] transition-colors shadow-md shadow-[var(--brand-border)]">
                    {editingId ? 'Update Item' : 'Add Item to Menu'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Stock Adjustment / Ingredient Add Modal */}
      {showAdjustmentModal && (
        <div className="fixed inset-0 bg-[var(--brand-dark)]/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--brand-surface)] rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-scale-up max-h-[90vh] flex flex-col border border-[var(--brand-border)]">
            <div className="p-5 border-b border-[var(--brand-border)] flex justify-between items-center bg-[var(--brand-muted)]">
              <h3 className="text-lg font-bold text-[var(--brand-dark)]">
                {isIngredientAddMode ? 'Add New Ingredient' : selectedProductForAdjust ? `Adjust ${selectedProductForAdjust.name}` : selectedIngredientForAdjust ? `Adjust ${selectedIngredientForAdjust.name}` : 'Inventory Adjustment'}
              </h3>
              <button onClick={closeAdjustmentModal} className="text-[var(--brand-border)] hover:text-[var(--brand-dark)] p-1">
                <X size={20} />
              </button>
            </div>
            <div className="overflow-y-auto p-6">
              <form onSubmit={submitAdjustment} className="space-y-5">
                {isIngredientAddMode || isIngredientEditMode ? (
                  <>
                    <div>
                      <label className="block text-sm font-semibold text-[var(--brand-dark)] mb-1.5">Ingredient Name</label>
                      <input
                        type="text"
                        required
                        className="w-full px-4 py-3 rounded-xl border border-[var(--brand-border)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/20 focus:border-[var(--brand-accent)] text-[var(--brand-text-dark)] bg-white"
                        placeholder="e.g. All-purpose flour"
                        value={ingredientForm.name}
                        onChange={e => setIngredientForm({ ...ingredientForm, name: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[var(--brand-dark)] mb-1.5">Unit</label>
                      <select
                        className="w-full px-4 py-3 rounded-xl border border-[var(--brand-border)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/20 focus:border-[var(--brand-accent)] bg-white text-[var(--brand-text-dark)]"
                        value={ingredientForm.unit}
                        onChange={e => setIngredientForm({ ...ingredientForm, unit: e.target.value })}
                      >
                        {ALLOWED_UNITS.map(unit => (
                          <option key={unit} value={unit}>{unit}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[var(--brand-dark)] mb-1.5">Minimum Stock Alert</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        className="w-full px-4 py-3 rounded-xl border border-[var(--brand-border)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/20 focus:border-[var(--brand-accent)] text-[var(--brand-text-dark)] bg-white"
                        value={ingredientForm.minStock}
                        onChange={e => setIngredientForm({ ...ingredientForm, minStock: e.target.value })}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-semibold text-[var(--brand-dark)] mb-1.5">Adjustment Amount</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        className="w-full px-4 py-3 rounded-xl border border-[var(--brand-border)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/20 focus:border-[var(--brand-accent)] text-[var(--brand-text-dark)] bg-white"
                        value={adjustAmount}
                        onChange={e => setAdjustAmount(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[var(--brand-dark)] mb-1.5">Reason</label>
                      <input
                        type="text"
                        required
                        className="w-full px-4 py-3 rounded-xl border border-[var(--brand-border)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/20 focus:border-[var(--brand-accent)] text-[var(--brand-text-dark)] bg-white"
                        value={adjustReason}
                        onChange={e => setAdjustReason(e.target.value)}
                      />
                    </div>
                  </>
                )}

                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={closeAdjustmentModal} className="px-4 py-3 rounded-xl border border-[var(--brand-border)] text-[var(--brand-border)] hover:bg-[var(--brand-muted)] transition-colors">
                    Cancel
                  </button>
                  <button type="submit" className="px-5 py-3 rounded-xl bg-[var(--brand-dark)] text-[var(--brand-text-light)] font-semibold hover:bg-[var(--brand-bg)] transition-colors">
                    {isIngredientAddMode ? 'Create Ingredient' : 'Save Adjustment'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
