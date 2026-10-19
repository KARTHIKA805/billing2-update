import { UserRole } from '../types';
import {
  canAccessBranchData,
  canAssignStaffLocation,
  canChangeOwnRole,
  canCreateStaffUser,
  canDeleteStaffUser,
  canViewStaffUser,
  creatableRoles,
  normalizeRoleLocation,
  validateRoleLocation,
} from '../utils/access';

const CHENNAI = '11111111-1111-1111-1111-111111111111';
const CBE = '22222222-2222-2222-2222-222222222222';
const T_NAGAR = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
const RS_PURAM = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3';

const cities = [
  { id: CHENNAI, name: 'Chennai' },
  { id: CBE, name: 'Coimbatore' },
];
const branches = [
  { id: T_NAGAR, cityId: CHENNAI, name: 'T. Nagar' },
  { id: RS_PURAM, cityId: CBE, name: 'RS Puram' },
];

const superAdmin = { id: 'sa', role: UserRole.SUPER_ADMIN, cityId: null, branchId: null };
const cbeManager = { id: 'cm', role: UserRole.CITY_MANAGER, cityId: CBE, branchId: null };
const chennaiManager = { id: 'cm2', role: UserRole.CITY_MANAGER, cityId: CHENNAI, branchId: null };
const rsPuramAdmin = { id: 'ba', role: UserRole.BRANCH_ADMIN, cityId: CBE, branchId: RS_PURAM };
const tNagarAdmin = { id: 'ba2', role: UserRole.BRANCH_ADMIN, cityId: CHENNAI, branchId: T_NAGAR };
const rsPuramEmployee = { id: 'emp', role: UserRole.EMPLOYEE, cityId: CBE, branchId: RS_PURAM };
const tNagarEmployee = { id: 'emp2', role: UserRole.EMPLOYEE, cityId: CHENNAI, branchId: T_NAGAR };
const otherSuperAdmin = { id: 'sa2', role: UserRole.SUPER_ADMIN, cityId: null, branchId: null };

let passed = 0;
let failed = 0;

const assert = (label: string, actual: unknown, expected: unknown) => {
  if (actual === expected) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`FAIL ${label}: expected ${String(expected)}, got ${String(actual)}`);
};

assert('SA can delete employee', canDeleteStaffUser(superAdmin, rsPuramEmployee), true);
assert('SA can delete branch admin', canDeleteStaffUser(superAdmin, rsPuramAdmin), true);
assert('SA can delete city manager', canDeleteStaffUser(superAdmin, cbeManager), true);
assert('SA cannot delete another SA', canDeleteStaffUser(superAdmin, otherSuperAdmin), false);
assert('SA cannot delete self', canDeleteStaffUser(superAdmin, superAdmin), false);

assert('CM can delete city employee', canDeleteStaffUser(cbeManager, rsPuramEmployee), true);
assert('CM can delete city branch admin', canDeleteStaffUser(cbeManager, rsPuramAdmin), true);
assert('CM cannot delete other-city employee', canDeleteStaffUser(cbeManager, tNagarEmployee), false);
assert('CM cannot delete SA', canDeleteStaffUser(cbeManager, superAdmin), false);
assert('CM cannot delete other CM', canDeleteStaffUser(cbeManager, chennaiManager), false);
assert('CM cannot delete self', canDeleteStaffUser(cbeManager, cbeManager), false);

assert('BA can delete own-branch employee', canDeleteStaffUser(rsPuramAdmin, rsPuramEmployee), true);
assert('BA cannot delete other-branch employee', canDeleteStaffUser(rsPuramAdmin, tNagarEmployee), false);
assert('BA cannot delete other BA', canDeleteStaffUser(rsPuramAdmin, tNagarAdmin), false);
assert('BA cannot delete CM', canDeleteStaffUser(rsPuramAdmin, cbeManager), false);
assert('BA cannot delete SA', canDeleteStaffUser(rsPuramAdmin, superAdmin), false);
assert('BA cannot delete self', canDeleteStaffUser(rsPuramAdmin, rsPuramAdmin), false);

assert('Employee cannot delete anyone', canDeleteStaffUser(rsPuramEmployee, tNagarEmployee), false);
assert('Employee cannot delete BA', canDeleteStaffUser(rsPuramEmployee, rsPuramAdmin), false);

assert('CM can view city users', canViewStaffUser(cbeManager, rsPuramEmployee), true);
assert('CM cannot view other city', canViewStaffUser(cbeManager, tNagarEmployee), false);
assert('BA can view own employee', canViewStaffUser(rsPuramAdmin, rsPuramEmployee), true);
assert('BA cannot view other branch employee', canViewStaffUser(rsPuramAdmin, tNagarEmployee), false);
assert('BA cannot view SA', canViewStaffUser(rsPuramAdmin, superAdmin), false);

assert('SA can create SA', canCreateStaffUser(superAdmin, otherSuperAdmin), true);
assert('CM cannot create SA', canCreateStaffUser(cbeManager, otherSuperAdmin), false);
assert('CM can create city employee', canCreateStaffUser(cbeManager, rsPuramEmployee), true);
assert('CM cannot create other-city employee', canCreateStaffUser(cbeManager, tNagarEmployee), false);
assert('BA can create own employee', canCreateStaffUser(rsPuramAdmin, rsPuramEmployee), true);
assert('BA cannot create other-branch employee', canCreateStaffUser(rsPuramAdmin, tNagarEmployee), false);
assert('Employee cannot create users', creatableRoles(UserRole.EMPLOYEE).length === 0, true);

assert('SA cannot assign location to SA', canAssignStaffLocation(superAdmin, otherSuperAdmin), false);
assert('SA can assign location to CM', canAssignStaffLocation(superAdmin, cbeManager), true);
assert('CM cannot assign location', canAssignStaffLocation(cbeManager, rsPuramEmployee), false);

const cmLocation = normalizeRoleLocation(UserRole.CITY_MANAGER, CBE, RS_PURAM, cities, branches);
assert('CM location keeps city', cmLocation.cityId === CBE, true);
assert('CM location clears branch', cmLocation.branchId === null, true);
assert('CM location valid', validateRoleLocation(UserRole.CITY_MANAGER, cmLocation) === null, true);

const saLocation = normalizeRoleLocation(UserRole.SUPER_ADMIN, CBE, RS_PURAM, cities, branches);
assert('SA location clears city', saLocation.cityId === null, true);
assert('SA location clears branch', saLocation.branchId === null, true);

const empFromBranch = normalizeRoleLocation(UserRole.EMPLOYEE, CHENNAI, RS_PURAM, cities, branches);
assert('Employee city inferred from branch', empFromBranch.cityId === CBE, true);
assert('Employee keeps branch', empFromBranch.branchId === RS_PURAM, true);

const missingLocation = normalizeRoleLocation(UserRole.EMPLOYEE, null, null, cities, branches);
assert('Missing location is not invented', validateRoleLocation(UserRole.EMPLOYEE, missingLocation) !== null, true);
assert('Nobody can change their own role', canChangeOwnRole(), false);

const rsPuram = { id: RS_PURAM, cityId: CBE };
const tNagar = { id: T_NAGAR, cityId: CHENNAI };
assert('SA can read any branch billing', canAccessBranchData(superAdmin, tNagar), true);
assert('CM can read own-city billing', canAccessBranchData(cbeManager, rsPuram), true);
assert('CM cannot read other-city billing', canAccessBranchData(cbeManager, tNagar), false);
assert('BA can read own-branch billing', canAccessBranchData(rsPuramAdmin, rsPuram), true);
assert('BA cannot read other-branch billing', canAccessBranchData(rsPuramAdmin, tNagar), false);
assert('Employee cannot read other-branch billing', canAccessBranchData(rsPuramEmployee, tNagar), false);
assert('Employee can read own-branch billing', canAccessBranchData(rsPuramEmployee, rsPuram), true);

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
