import React, { useMemo, useState } from 'react';
import { MapPin, Building2, Loader2 } from 'lucide-react';
import { Branch, City, UserRole } from '../types';
import { ROLE_LABELS, canSwitchLocation } from '../utils/access';

interface LocationPickerProps {
  role: UserRole;
  cities: City[];
  branches: Branch[];
  assignedCityId?: string | null;
  assignedBranchId?: string | null;
  initialCityId?: string | null;
  initialBranchId?: string | null;
  allowAll?: boolean;
  requireBranch?: boolean;
  title?: string;
  subtitle?: string;
  confirmLabel?: string;
  onConfirm: (selection: { cityId: string | null; branchId: string | null }) => void;
  onCancel?: () => void;
}

const ALL_VALUE = 'all';
const NONE_VALUE = '';

const LocationPicker: React.FC<LocationPickerProps> = ({
  role,
  cities,
  branches,
  assignedCityId,
  assignedBranchId,
  initialCityId,
  initialBranchId,
  allowAll = true,
  requireBranch = false,
  title,
  subtitle,
  confirmLabel = 'Continue',
  onConfirm,
  onCancel,
}) => {
  const lockedCityId = role === UserRole.SUPER_ADMIN ? null : (assignedCityId ?? null);
  const canChooseCity = role === UserRole.SUPER_ADMIN;
  const canChooseBranch = canSwitchLocation(role);
  const showAll = allowAll && !requireBranch;

  const visibleCities = useMemo(() => {
    if (lockedCityId) return cities.filter((city) => city.id === lockedCityId);
    return cities;
  }, [cities, lockedCityId]);

  const defaultCityId = initialCityId ?? lockedCityId ?? (showAll ? ALL_VALUE : (visibleCities[0]?.id ?? ALL_VALUE));
  const defaultBranchId = initialBranchId ?? assignedBranchId ?? (showAll ? ALL_VALUE : NONE_VALUE);

  const [cityId, setCityId] = useState(defaultCityId);
  const [branchId, setBranchId] = useState(defaultBranchId);

  const visibleBranches = useMemo(() => {
    const selectedCity = cityId === ALL_VALUE ? lockedCityId : cityId;
    if (!selectedCity) return branches;
    return branches.filter((branch) => branch.cityId === selectedCity);
  }, [branches, cityId, lockedCityId]);

  const resolvedBranchId = branchId === ALL_VALUE || branchId === NONE_VALUE ? null : branchId;
  const selectedBranch = branches.find((branch) => branch.id === resolvedBranchId) ?? null;
  const resolvedCityId = (
    cityId === ALL_VALUE ? null : cityId
  ) ?? selectedBranch?.cityId ?? lockedCityId ?? null;
  const missingBranch = requireBranch && !resolvedBranchId;
  const canSubmit = !missingBranch && (visibleCities.length > 0 || Boolean(assignedBranchId));

  const handleCityChange = (nextCityId: string) => {
    setCityId(nextCityId);
    if (showAll) {
      setBranchId(ALL_VALUE);
      return;
    }
    const nextBranches = nextCityId === ALL_VALUE
      ? branches
      : branches.filter((branch) => branch.cityId === nextCityId);
    setBranchId(nextBranches.length === 1 ? nextBranches[0].id : NONE_VALUE);
  };

  const handleConfirm = () => {
    if (missingBranch) return;
    if (!canChooseBranch && assignedBranchId) {
      onConfirm({ cityId: assignedCityId ?? resolvedCityId, branchId: assignedBranchId });
      return;
    }
    onConfirm({ cityId: resolvedCityId, branchId: resolvedBranchId });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--brand-muted)] p-4">
      <div className="bg-[var(--brand-surface)] p-8 rounded-2xl shadow-xl w-full max-w-md border border-[var(--brand-border)]">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-[var(--brand-accent)] rounded-xl mx-auto mb-4 flex items-center justify-center">
            <MapPin className="text-[var(--brand-dark)]" size={24} />
          </div>
          <h1 className="text-2xl font-bold text-[var(--brand-text-dark)]">
            {title || (requireBranch ? 'Choose an outlet' : 'Choose location')}
          </h1>
          <p className="text-[var(--brand-text-dark)] text-sm mt-1">
            {subtitle || (
              requireBranch
                ? 'Billing is per branch. Pick one outlet to continue.'
                : `Signed in as ${ROLE_LABELS[role]}. Open a city and branch to continue.`
            )}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--brand-text-dark)] uppercase mb-1.5 ml-1">
              City
            </label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--brand-border)]" size={18} />
              <select
                value={canChooseCity ? cityId : (lockedCityId || cityId)}
                disabled={!canChooseCity}
                onChange={(event) => handleCityChange(event.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-[var(--brand-border)] bg-white text-[var(--brand-text-dark)] outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/20"
              >
                {canChooseCity && showAll && <option value={ALL_VALUE}>All cities</option>}
                {visibleCities.map((city) => (
                  <option key={city.id} value={city.id}>{city.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--brand-text-dark)] uppercase mb-1.5 ml-1">
              Branch
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--brand-border)]" size={18} />
              <select
                value={canChooseBranch ? branchId : (assignedBranchId || branchId)}
                disabled={!canChooseBranch}
                onChange={(event) => setBranchId(event.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-[var(--brand-border)] bg-white text-[var(--brand-text-dark)] outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/20"
              >
                {canChooseBranch && showAll && <option value={ALL_VALUE}>All branches</option>}
                {canChooseBranch && !showAll && <option value={NONE_VALUE}>Select a branch</option>}
                {visibleBranches.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
            </div>
            {requireBranch && (
              <p className="text-xs text-[var(--brand-text-dark)] mt-2 ml-1">
                Stock and this bill are saved to the selected outlet.
              </p>
            )}
          </div>

          {visibleCities.length === 0 && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              No cities are available. Run add_locations.sql in Supabase, or use a demo login.
            </p>
          )}

          {missingBranch && visibleCities.length > 0 && (
            <p className="text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
              Pick one branch. All branches is only for dashboards, not checkout.
            </p>
          )}

          <div className="flex gap-3 pt-2">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 px-4 py-3 rounded-xl border border-[var(--brand-border)] text-[var(--brand-dark)] font-medium"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!canSubmit}
              className="flex-1 bg-[var(--brand-dark)] text-[var(--brand-text-light)] py-3 rounded-xl font-medium disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {visibleCities.length === 0 && !assignedBranchId ? <Loader2 className="animate-spin" size={18} /> : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LocationPicker;
