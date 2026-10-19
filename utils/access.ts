import { UserRole, ViewState } from '../types';
import { resolveBranchId, resolveCityId } from './locations';

export const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.EMPLOYEE]: 'Employee',
  [UserRole.BRANCH_ADMIN]: 'Branch Admin',
  [UserRole.CITY_MANAGER]: 'City Manager',
  [UserRole.SUPER_ADMIN]: 'Super Admin',
};

export const ROLE_INITIALS: Record<UserRole, string> = {
  [UserRole.EMPLOYEE]: 'E',
  [UserRole.BRANCH_ADMIN]: 'B',
  [UserRole.CITY_MANAGER]: 'C',
  [UserRole.SUPER_ADMIN]: 'S',
};

const ROLE_RANK: Record<UserRole, number> = {
  [UserRole.EMPLOYEE]: 1,
  [UserRole.BRANCH_ADMIN]: 2,
  [UserRole.CITY_MANAGER]: 3,
  [UserRole.SUPER_ADMIN]: 4,
};

export const normalizeUserRole = (role?: string | null): UserRole => {
  const value = String(role || '').toLowerCase().replace(/[\s-]+/g, '_');
  if (value === UserRole.EMPLOYEE) return UserRole.EMPLOYEE;
  if (value === UserRole.BRANCH_ADMIN || value === 'branchadmin') return UserRole.BRANCH_ADMIN;
  if (value === UserRole.CITY_MANAGER || value === 'citymanager') return UserRole.CITY_MANAGER;
  if (value === UserRole.SUPER_ADMIN || value === 'superadmin' || value === 'admin') return UserRole.SUPER_ADMIN;
  return UserRole.EMPLOYEE;
};

export const isAtLeast = (role: UserRole, minimum: UserRole) => ROLE_RANK[role] >= ROLE_RANK[minimum];

export const canManageUsers = (role: UserRole) => isAtLeast(role, UserRole.BRANCH_ADMIN);
export const canEditInventory = (role: UserRole) => isAtLeast(role, UserRole.BRANCH_ADMIN);
export const canEditCategories = (role: UserRole) => role === UserRole.SUPER_ADMIN;
export const canManageLocations = (role: UserRole) => role === UserRole.SUPER_ADMIN;
export const canEditBills = (role: UserRole) => isAtLeast(role, UserRole.BRANCH_ADMIN);
export const canSwitchLocation = (role: UserRole) => role === UserRole.SUPER_ADMIN;
export const canSwitchWorkspaceBranch = (role: UserRole) => role === UserRole.CITY_MANAGER;
export const canAccessBilling = (_role: UserRole) => true;
export const canChooseBillingBranch = (role: UserRole) =>
  role === UserRole.SUPER_ADMIN || role === UserRole.CITY_MANAGER;

export const scopeWorkspaceLocations = <
  C extends { id: string },
  B extends { id: string; cityId: string }
>(
  role: UserRole,
  cities: C[],
  branches: B[],
  assignedCityId?: string | null,
  assignedBranchId?: string | null,
): { cities: C[]; branches: B[] } => {
  if (role === UserRole.SUPER_ADMIN) {
    return { cities, branches };
  }

  const scopedCities = assignedCityId
    ? cities.filter((city) => city.id === assignedCityId)
    : [];

  if (role === UserRole.CITY_MANAGER) {
    return {
      cities: scopedCities,
      branches: assignedCityId
        ? branches.filter((branch) => branch.cityId === assignedCityId)
        : [],
    };
  }

  return {
    cities: scopedCities,
    branches: assignedBranchId
      ? branches.filter((branch) => branch.id === assignedBranchId)
      : assignedCityId
        ? branches.filter((branch) => branch.cityId === assignedCityId)
        : [],
  };
};

export const defaultLandingView = (role: UserRole): ViewState => (
  role === UserRole.EMPLOYEE ? ViewState.BILLING : ViewState.DASHBOARD
);

export const creatableRoles = (actor: UserRole): UserRole[] => {
  if (actor === UserRole.SUPER_ADMIN) {
    return [UserRole.EMPLOYEE, UserRole.BRANCH_ADMIN, UserRole.CITY_MANAGER, UserRole.SUPER_ADMIN];
  }
  if (actor === UserRole.CITY_MANAGER) return [UserRole.EMPLOYEE, UserRole.BRANCH_ADMIN];
  if (actor === UserRole.BRANCH_ADMIN) return [UserRole.EMPLOYEE];
  return [];
};

export type StaffScope = {
  id?: string | null;
  role: UserRole;
  cityId?: string | null;
  branchId?: string | null;
};

export const canViewStaffUser = (actor: StaffScope, target: StaffScope) => {
  if (target.id && actor.id && target.id === actor.id) return true;
  const targetRole = normalizeUserRole(target.role);
  if (actor.role === UserRole.SUPER_ADMIN) return true;
  if (actor.role === UserRole.CITY_MANAGER) {
    return Boolean(actor.cityId) && target.cityId === actor.cityId && targetRole !== UserRole.SUPER_ADMIN;
  }
  if (actor.role === UserRole.BRANCH_ADMIN) {
    return targetRole === UserRole.EMPLOYEE && Boolean(actor.branchId) && target.branchId === actor.branchId;
  }
  return false;
};

export const canDeleteStaffUser = (actor: StaffScope, target: StaffScope) => {
  if (!target.id || (actor.id && target.id === actor.id)) return false;
  const targetRole = normalizeUserRole(target.role);
  if (targetRole === UserRole.SUPER_ADMIN) return false;
  if (actor.role === UserRole.SUPER_ADMIN) return true;
  if (actor.role === UserRole.CITY_MANAGER) {
    return Boolean(actor.cityId)
      && target.cityId === actor.cityId
      && (targetRole === UserRole.EMPLOYEE || targetRole === UserRole.BRANCH_ADMIN);
  }
  if (actor.role === UserRole.BRANCH_ADMIN) {
    return targetRole === UserRole.EMPLOYEE && Boolean(actor.branchId) && target.branchId === actor.branchId;
  }
  return false;
};

export const canCreateStaffUser = (actor: StaffScope, target: StaffScope) => {
  const targetRole = normalizeUserRole(target.role);
  if (!creatableRoles(actor.role).includes(targetRole)) return false;
  if (targetRole === UserRole.SUPER_ADMIN) return actor.role === UserRole.SUPER_ADMIN;
  if (actor.role === UserRole.SUPER_ADMIN) return true;
  if (actor.role === UserRole.CITY_MANAGER) {
    return Boolean(actor.cityId) && target.cityId === actor.cityId;
  }
  if (actor.role === UserRole.BRANCH_ADMIN) {
    return targetRole === UserRole.EMPLOYEE
      && Boolean(actor.branchId)
      && target.branchId === actor.branchId;
  }
  return false;
};

export const canAssignStaffLocation = (actor: StaffScope, target: StaffScope) => (
  actor.role === UserRole.SUPER_ADMIN && normalizeUserRole(target.role) !== UserRole.SUPER_ADMIN
);

export const canChangeOwnRole = () => false;

export const canAccessBranchData = (
  actor: StaffScope,
  branch: { id: string; cityId: string } | null | undefined,
) => {
  if (!branch?.id) return actor.role === UserRole.SUPER_ADMIN;
  if (actor.role === UserRole.SUPER_ADMIN) return true;
  if (actor.role === UserRole.CITY_MANAGER) {
    return Boolean(actor.cityId) && branch.cityId === actor.cityId;
  }
  if (actor.role === UserRole.BRANCH_ADMIN || actor.role === UserRole.EMPLOYEE) {
    return Boolean(actor.branchId) && branch.id === actor.branchId;
  }
  return false;
};

export const roleRequiresCity = (role: UserRole) => role !== UserRole.SUPER_ADMIN;
export const roleRequiresBranch = (role: UserRole) => (
  role === UserRole.BRANCH_ADMIN || role === UserRole.EMPLOYEE
);

type LocationCity = { id: string; name?: string };
type LocationBranch = { id: string; name?: string; cityId: string };

export const normalizeRoleLocation = (
  role: UserRole,
  cityId?: string | null,
  branchId?: string | null,
  cities: LocationCity[] = [],
  branches: LocationBranch[] = [],
): { cityId: string | null; branchId: string | null } => {
  if (role === UserRole.SUPER_ADMIN) {
    return { cityId: null, branchId: null };
  }

  const resolvedBranchId = resolveBranchId(branchId, branches) ?? (branchId || null);
  const branch = resolvedBranchId
    ? branches.find((item) => item.id === resolvedBranchId) ?? null
    : null;
  const resolvedCityId = resolveCityId(cityId, cities)
    ?? branch?.cityId
    ?? cityId
    ?? null;

  if (role === UserRole.CITY_MANAGER) {
    return { cityId: resolvedCityId || null, branchId: null };
  }

  if (branch) {
    return { cityId: branch.cityId, branchId: branch.id };
  }

  return { cityId: resolvedCityId || null, branchId: null };
};

export const validateRoleLocation = (
  role: UserRole,
  location: { cityId: string | null; branchId: string | null },
): string | null => {
  if (roleRequiresCity(role) && !location.cityId) return 'Select a city for this role.';
  if (roleRequiresBranch(role) && !location.branchId) return 'Select a branch for this role.';
  return null;
};

export const getRoleDescription = (role: UserRole) => {
  if (role === UserRole.SUPER_ADMIN) {
    return 'All cities and branches: dashboards, billing, users, locations, and categories.';
  }
  if (role === UserRole.CITY_MANAGER) {
    return 'One city only: that city’s branches, dashboard, and billing.';
  }
  if (role === UserRole.BRANCH_ADMIN) {
    return 'One branch: full dashboard, billing, inventory edits, and employee accounts.';
  }
  return 'One branch: billing, today’s dashboard, bills, and read-only stock.';
};
