import React, { useMemo, useState } from 'react';
import { MapPin, Plus, Pencil, Trash2, X } from 'lucide-react';
import { Branch, City } from '../types';

interface LocationsProps {
  cities: City[];
  branches: Branch[];
  onAddCity: (name: string) => Promise<void>;
  onUpdateCity: (id: string, name: string) => Promise<void>;
  onDeleteCity: (id: string) => Promise<void>;
  onAddBranch: (payload: { cityId: string; name: string; address?: string; phone?: string }) => Promise<void>;
  onUpdateBranch: (branch: Branch) => Promise<void>;
  onDeleteBranch: (id: string) => Promise<void>;
}

type CityModal = { mode: 'add' } | { mode: 'edit'; city: City };
type BranchModal = { mode: 'add'; cityId: string } | { mode: 'edit'; branch: Branch };

const Locations: React.FC<LocationsProps> = ({
  cities,
  branches,
  onAddCity,
  onUpdateCity,
  onDeleteCity,
  onAddBranch,
  onUpdateBranch,
  onDeleteBranch,
}) => {
  const [selectedCityId, setSelectedCityId] = useState<string>(cities[0]?.id ?? '');
  const [cityModal, setCityModal] = useState<CityModal | null>(null);
  const [branchModal, setBranchModal] = useState<BranchModal | null>(null);
  const [cityName, setCityName] = useState('');
  const [branchForm, setBranchForm] = useState({ name: '', address: '', phone: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const activeCityId = cities.some((city) => city.id === selectedCityId)
    ? selectedCityId
    : (cities[0]?.id ?? '');

  const cityBranches = useMemo(
    () => branches.filter((branch) => branch.cityId === activeCityId),
    [branches, activeCityId]
  );

  const openAddCity = () => {
    setError('');
    setCityName('');
    setCityModal({ mode: 'add' });
  };

  const openEditCity = (city: City) => {
    setError('');
    setCityName(city.name);
    setCityModal({ mode: 'edit', city });
  };

  const openAddBranch = (cityId: string) => {
    setError('');
    setBranchForm({ name: '', address: '', phone: '' });
    setBranchModal({ mode: 'add', cityId });
  };

  const openEditBranch = (branch: Branch) => {
    setError('');
    setBranchForm({ name: branch.name, address: branch.address || '', phone: branch.phone || '' });
    setBranchModal({ mode: 'edit', branch });
  };

  const saveCity = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!cityModal) return;
    setIsSaving(true);
    setError('');
    try {
      if (cityModal.mode === 'add') {
        await onAddCity(cityName);
      } else {
        await onUpdateCity(cityModal.city.id, cityName);
      }
      setCityModal(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to save city.');
    } finally {
      setIsSaving(false);
    }
  };

  const saveBranch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!branchModal) return;
    setIsSaving(true);
    setError('');
    try {
      if (branchModal.mode === 'add') {
        await onAddBranch({
          cityId: branchModal.cityId,
          name: branchForm.name,
          address: branchForm.address,
          phone: branchForm.phone,
        });
      } else {
        await onUpdateBranch({
          ...branchModal.branch,
          name: branchForm.name,
          address: branchForm.address,
          phone: branchForm.phone,
        });
      }
      setBranchModal(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to save branch.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCity = async (city: City) => {
    const outletCount = branches.filter((branch) => branch.cityId === city.id).length;
    const confirmed = window.confirm(
      outletCount
        ? `Delete ${city.name} and its ${outletCount} branch${outletCount === 1 ? '' : 'es'}?`
        : `Delete city ${city.name}?`
    );
    if (!confirmed) return;
    try {
      await onDeleteCity(city.id);
    } catch (err: any) {
      alert(err?.message || 'Failed to delete city.');
    }
  };

  const handleDeleteBranch = async (branch: Branch) => {
    if (!window.confirm(`Delete branch ${branch.name}?`)) return;
    try {
      await onDeleteBranch(branch.id);
    } catch (err: any) {
      alert(err?.message || 'Failed to delete branch.');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-[var(--brand-surface)] p-4 rounded-2xl border border-[var(--brand-border)]">
        <div>
          <h3 className="text-lg font-bold text-[var(--brand-dark)]">Locations</h3>
          <p className="text-sm text-[var(--brand-border)] mt-1">
            Add cities first, then add bakery outlets under each city. Staff login uses these locations.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddCity}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[var(--brand-dark)] text-[var(--brand-text-light)] rounded-xl font-medium"
        >
          <Plus size={16} /> Add City
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="bg-[var(--brand-surface)] rounded-2xl border border-[var(--brand-border)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--brand-border)]">
            <h4 className="font-semibold text-[var(--brand-dark)]">Cities</h4>
          </div>
          {cities.length === 0 ? (
            <p className="p-6 text-sm text-[var(--brand-border)]">No cities yet. Add Chennai, Coimbatore, or any new city.</p>
          ) : (
            <div className="divide-y divide-[var(--brand-border)]">
              {cities.map((city) => {
                const count = branches.filter((branch) => branch.cityId === city.id).length;
                const isActive = city.id === activeCityId;
                return (
                  <div
                    key={city.id}
                    className={`flex items-center gap-3 px-4 py-3 ${isActive ? 'bg-[var(--brand-muted)]' : ''}`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedCityId(city.id)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <p className="font-medium text-[var(--brand-dark)] truncate">{city.name}</p>
                      <p className="text-xs text-[var(--brand-border)]">{count === 1 ? '1 branch' : `${count} branches`}</p>
                    </button>
                    <button type="button" onClick={() => openEditCity(city)} className="p-2 rounded-lg hover:bg-white" aria-label={`Edit ${city.name}`}>
                      <Pencil size={16} />
                    </button>
                    <button type="button" onClick={() => handleDeleteCity(city)} className="p-2 rounded-lg hover:bg-white text-red-600" aria-label={`Delete ${city.name}`}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="xl:col-span-2 bg-[var(--brand-surface)] rounded-2xl border border-[var(--brand-border)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--brand-border)] flex items-center justify-between gap-3">
            <div>
              <h4 className="font-semibold text-[var(--brand-dark)]">Branches</h4>
              <p className="text-xs text-[var(--brand-border)]">
                {activeCityId ? cities.find((city) => city.id === activeCityId)?.name : 'Select a city'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => activeCityId && openAddBranch(activeCityId)}
              disabled={!activeCityId}
              className="inline-flex items-center gap-2 px-3 py-2 bg-[var(--brand-dark)] text-[var(--brand-text-light)] rounded-xl text-sm font-medium disabled:opacity-50"
            >
              <Plus size={16} /> Add Branch
            </button>
          </div>
          {!activeCityId ? (
            <p className="p-6 text-sm text-[var(--brand-border)]">Add a city to create branches.</p>
          ) : cityBranches.length === 0 ? (
            <p className="p-6 text-sm text-[var(--brand-border)]">No outlets in this city yet.</p>
          ) : (
            <div className="divide-y divide-[var(--brand-border)]">
              {cityBranches.map((branch) => (
                <div key={branch.id} className="flex items-start gap-3 px-4 py-4">
                  <div className="mt-0.5 p-2 rounded-lg bg-[var(--brand-muted)]">
                    <MapPin size={16} className="text-[var(--brand-dark)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-[var(--brand-dark)]">{branch.name}</p>
                    {branch.address && <p className="text-sm text-[var(--brand-border)] mt-0.5">{branch.address}</p>}
                    {branch.phone && <p className="text-sm text-[var(--brand-border)]">{branch.phone}</p>}
                  </div>
                  <button type="button" onClick={() => openEditBranch(branch)} className="p-2 rounded-lg hover:bg-[var(--brand-muted)]" aria-label={`Edit ${branch.name}`}>
                    <Pencil size={16} />
                  </button>
                  <button type="button" onClick={() => handleDeleteBranch(branch)} className="p-2 rounded-lg hover:bg-[var(--brand-muted)] text-red-600" aria-label={`Delete ${branch.name}`}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {cityModal && (
        <div className="fixed inset-0 bg-[var(--brand-dark)]/20 flex items-center justify-center p-4 z-50">
          <form onSubmit={saveCity} className="bg-[var(--brand-surface)] rounded-2xl shadow-xl max-w-md w-full p-6 border border-[var(--brand-border)]">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-[var(--brand-dark)]">
                {cityModal.mode === 'add' ? 'Add City' : 'Edit City'}
              </h2>
              <button type="button" onClick={() => setCityModal(null)} className="p-2 rounded-lg hover:bg-[var(--brand-muted)]">
                <X size={18} />
              </button>
            </div>
            <label className="block text-sm font-medium text-[var(--brand-dark)] mb-2">City name</label>
            <input
              value={cityName}
              onChange={(event) => setCityName(event.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-[var(--brand-border)]"
              placeholder="Chennai"
              required
            />
            {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
            <div className="flex gap-3 mt-5">
              <button type="button" onClick={() => setCityModal(null)} className="flex-1 py-2.5 rounded-xl border border-[var(--brand-border)]">Cancel</button>
              <button type="submit" disabled={isSaving} className="flex-1 py-2.5 rounded-xl bg-[var(--brand-dark)] text-white disabled:opacity-60">
                {isSaving ? 'Saving...' : 'Save City'}
              </button>
            </div>
          </form>
        </div>
      )}

      {branchModal && (
        <div className="fixed inset-0 bg-[var(--brand-dark)]/20 flex items-center justify-center p-4 z-50">
          <form onSubmit={saveBranch} className="bg-[var(--brand-surface)] rounded-2xl shadow-xl max-w-md w-full p-6 border border-[var(--brand-border)]">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-[var(--brand-dark)]">
                {branchModal.mode === 'add' ? 'Add Branch' : 'Edit Branch'}
              </h2>
              <button type="button" onClick={() => setBranchModal(null)} className="p-2 rounded-lg hover:bg-[var(--brand-muted)]">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--brand-dark)] mb-2">Branch name</label>
                <input
                  value={branchForm.name}
                  onChange={(event) => setBranchForm({ ...branchForm, name: event.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-[var(--brand-border)]"
                  placeholder="T. Nagar"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--brand-dark)] mb-2">Address (optional)</label>
                <input
                  value={branchForm.address}
                  onChange={(event) => setBranchForm({ ...branchForm, address: event.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-[var(--brand-border)]"
                  placeholder="Street, area"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--brand-dark)] mb-2">Phone (optional)</label>
                <input
                  value={branchForm.phone}
                  onChange={(event) => setBranchForm({ ...branchForm, phone: event.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-[var(--brand-border)]"
                  placeholder="+91 ..."
                />
              </div>
            </div>
            {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
            <div className="flex gap-3 mt-5">
              <button type="button" onClick={() => setBranchModal(null)} className="flex-1 py-2.5 rounded-xl border border-[var(--brand-border)]">Cancel</button>
              <button type="submit" disabled={isSaving} className="flex-1 py-2.5 rounded-xl bg-[var(--brand-dark)] text-white disabled:opacity-60">
                {isSaving ? 'Saving...' : 'Save Branch'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default Locations;
