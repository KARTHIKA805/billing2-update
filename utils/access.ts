import { UserRole, ViewState } from '../types';

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
export const canSwitchLocation = (role: UserRole) => isAtLeast(role, UserRole.CITY_MANAGER);
export const canAccessBilling = (role: UserRole) => role !== UserRole.SUPER_ADMIN;

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

export const roleRequiresCity = (role: UserRole) => role !== UserRole.SUPER_ADMIN;
export const roleRequiresBranch = (role: UserRole) => (
  role === UserRole.BRANCH_ADMIN || role === UserRole.EMPLOYEE
);

export const getRoleDescription = (role: UserRole) => {
  if (role === UserRole.SUPER_ADMIN) {
    return 'All cities and branches: dashboards, users, locations, and categories. No billing.';
  }
  if (role === UserRole.CITY_MANAGER) {
    return 'One city: compare branches, open any outlet in that city, and manage its staff.';
  }
  if (role === UserRole.BRANCH_ADMIN) {
    return 'One branch: full dashboard, billing, inventory edits, and employee accounts.';
  }
  return 'One branch: billing, today’s dashboard, bills, and read-only stock.';
};
