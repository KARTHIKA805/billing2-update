import React, { useState, useEffect } from 'react';
import { Search, UserPlus, Trash2, Eye, EyeOff, X, AlertCircle, Check, Info, Shield, User, Pencil } from 'lucide-react';
import { getAdminUsers, createAdminUser, deleteAdminUser, updateAdminUserLocation } from '../services/supabaseService';
import { Branch, City, UserRole } from '../types';
import { ROLE_LABELS, creatableRoles, getRoleDescription, normalizeRoleLocation, normalizeUserRole, roleRequiresBranch, roleRequiresCity, validateRoleLocation } from '../utils/access';
import { resolveCityId, resolveBranchId } from '../utils/locations';

interface AdminUser {
  id: string;
  email: string;
  role: string;
  cityId?: string | null;
  branchId?: string | null;
  created_at: string;
  last_sign_in_at?: string | null;
}

interface UsersProps {
  actorRole: UserRole;
  assignedCityId?: string | null;
  assignedBranchId?: string | null;
  cities: City[];
  branches: Branch[];
}

const formatUserDateTime = (value?: string | null) => {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Never';
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

const Users: React.FC<UsersProps> = ({
  actorRole,
  assignedCityId,
  assignedBranchId,
  cities,
  branches,
}) => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [warning, setWarning] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editLocation, setEditLocation] = useState({ cityId: '', branchId: '' });

  // Form state
  const allowedRoles = creatableRoles(actorRole);
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    role: allowedRoles[0] || UserRole.EMPLOYEE,
    cityId: assignedCityId || '',
    branchId: assignedBranchId || '',
  });

  // Load users on mount
  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getAdminUsers();
      setUsers(data.map((user: any) => ({
        id: user.id,
        email: user.email,
        role: user.user_metadata?.role || user.role || 'employee',
        cityId: resolveCityId(user.user_metadata?.city_id ?? user.city_id ?? null, cities)
          ?? user.user_metadata?.city_id
          ?? user.city_id
          ?? null,
        branchId: resolveBranchId(user.user_metadata?.branch_id ?? user.branch_id ?? null, branches)
          ?? user.user_metadata?.branch_id
          ?? user.branch_id
          ?? null,
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at ?? null,
      })));
    } catch (err: any) {
      // This error is expected if using client-side auth
      console.warn('Note: User management requires admin access. For full functionality, use the admin console.');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setWarning('');

    if (!newUser.email || !newUser.password) {
      setError('Email and password are required');
      return;
    }

    if (newUser.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    const nextRole = normalizeUserRole(newUser.role);
    const location = normalizeRoleLocation(
      nextRole,
      assignedCityId || newUser.cityId || null,
      assignedBranchId || newUser.branchId || null,
      cities,
      branches,
    );
    const locationError = validateRoleLocation(nextRole, location);
    if (locationError) {
      setError(locationError);
      return;
    }

    setLoading(true);
    try {
      const res: any = await createAdminUser(newUser.email, newUser.password, {
        role: nextRole,
        cityId: location.cityId,
        branchId: location.branchId,
      });
      const signInTest = res?.signInTest;

      setSuccess(`${ROLE_LABELS[nextRole]} user ${newUser.email} created successfully.`);

      // If sign-in test failed due to email confirmation, surface a helpful warning (not an error)
      if (signInTest && signInTest.success === false) {
        const isEmailConfirmation = /confirm|email/i.test(signInTest.error || '');
        if (isEmailConfirmation) {
          setWarning(
            `User created, but email confirmation is required. The user must confirm their email before they can log in. To skip this, disable "Email Confirmations" in Supabase → Authentication → Providers → Email.`
          );
        } else {
          setWarning(
            `User created, but sign-in test failed: ${signInTest.error || 'requires email confirmation or signups disabled'}`
          );
        }
      }

      setNewUser({
        email: '',
        password: '',
        role: allowedRoles[0] || UserRole.EMPLOYEE,
        cityId: assignedCityId || '',
        branchId: assignedBranchId || '',
      });
      setShowAddModal(false);
      await loadUsers();
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to create user';
      if (/not allowed|service_role|admin/i.test(errorMsg)) {
        setError('User creation is not permitted with the current key. Ensure signups are enabled in Supabase (Authentication → Providers → Email), or create the user from the Supabase admin console.');
      } else if (/registered|already/i.test(errorMsg)) {
        setError('A user with this email already exists.');
      } else {
        setError(errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    setLoading(true);
    setError('');
    setSuccess('');
    setWarning('');
    try {
      await deleteAdminUser(userId);
      setSuccess('User deleted successfully!');
      setDeleteConfirm(null);
      await loadUsers();
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to delete user';
      if (/not allowed|permission|policy|rls/i.test(errorMsg)) {
        setError(
          'Permission denied: your Supabase RLS policy does not allow deleting from user_profiles. ' +
          'Run the fix_rls_policies.sql script in your Supabase SQL editor to grant admin delete access.'
        );
      } else {
        setError(errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSaveLocation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingUser) return;
    const nextRole = normalizeUserRole(editingUser.role);
    const location = normalizeRoleLocation(
      nextRole,
      editLocation.cityId,
      editLocation.branchId,
      cities,
      branches,
    );
    const locationError = validateRoleLocation(nextRole, location);
    if (locationError) {
      setError(locationError);
      return;
    }
    setLoading(true);
    setError('');
    try {
      await updateAdminUserLocation(editingUser.id, {
        role: nextRole,
        cityId: location.cityId,
        branchId: location.branchId,
      });
      setSuccess(`Location updated for ${editingUser.email}.`);
      setEditingUser(null);
      await loadUsers();
    } catch (err: any) {
      setError(err?.message || 'Failed to update location');
    } finally {
      setLoading(false);
    }
  };

  const locationName = (cityId?: string | null, branchId?: string | null, role?: string) => {
    const resolvedCityId = resolveCityId(cityId, cities) ?? cityId;
    const resolvedBranchId = resolveBranchId(branchId, branches) ?? branchId;
    const city = cities.find((item) => item.id === resolvedCityId)?.name;
    const branch = branches.find((item) => item.id === resolvedBranchId)?.name;
    if (city && branch) return `${city} · ${branch}`;
    if (city) {
      return normalizeUserRole(role) === UserRole.CITY_MANAGER
        ? `${city} · All branches`
        : city;
    }
    return normalizeUserRole(role) === UserRole.SUPER_ADMIN ? 'All locations' : 'No location assigned';
  };

  const selectedCityBranches = branches.filter((branch) => {
    const cityId = assignedCityId || newUser.cityId;
    return cityId && branch.cityId === cityId;
  });

  const filteredUsers = users.filter((user) => {
    if (!user.email.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (actorRole === UserRole.CITY_MANAGER && assignedCityId) {
      return user.cityId === assignedCityId;
    }
    if (actorRole === UserRole.BRANCH_ADMIN && assignedBranchId) {
      return !user.branchId || user.branchId === assignedBranchId;
    }
    return true;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Info Banner */}
      <div className="bg-[var(--brand-muted)] border border-[var(--brand-border)] p-4 rounded-xl flex items-start gap-3">
        <Info className="text-[var(--brand-dark)] flex-shrink-0 mt-0.5" size={20} />
        <div>
          <p className="font-medium text-[var(--brand-dark)]">User Management</p>
          <p className="text-sm text-[var(--brand-border)] mt-1">
            {actorRole === UserRole.CITY_MANAGER
              ? 'Staff for this city only. Branch options are limited to your city’s outlets.'
              : 'Create staff for your scope: Super Admin (all cities), City Manager (one city), Branch Admin (one outlet), Employee (counter).'}
          </p>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-[var(--brand-surface)] p-4 rounded-2xl border border-[var(--brand-border)] shadow-sm">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--brand-border)]" size={20} />
          <input
            type="text"
            placeholder="Search by email..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[var(--brand-border)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/20 focus:border-[var(--brand-accent)] text-[var(--brand-text-dark)] bg-white placeholder-[var(--brand-border)]"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[var(--brand-dark)] text-[var(--brand-text-light)] rounded-xl hover:bg-[var(--brand-bg)] font-medium transition-colors shadow-md shadow-[var(--brand-border)] whitespace-nowrap"
        >
          <UserPlus size={20} />
          Add User
        </button>
      </div>

      {/* Alert Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 p-4 rounded-xl flex items-start gap-3">
          <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
          <div>
            <p className="font-medium text-red-700">{error}</p>
          </div>
        </div>
      )}

      {warning && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start gap-3">
          <AlertCircle className="text-amber-600 flex-shrink-0 mt-0.5" size={20} />
          <div>
            <p className="font-medium text-amber-700">{warning}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 p-4 rounded-xl flex items-start gap-3">
          <Check className="text-green-600 flex-shrink-0 mt-0.5" size={20} />
          <div>
            <p className="font-medium text-green-700">{success}</p>
          </div>
        </div>
      )}

      {/* Users List */}
      <div className="bg-[var(--brand-surface)] rounded-2xl border border-[var(--brand-border)] shadow-sm overflow-hidden">
        {loading && filteredUsers.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-[var(--brand-border)]">Loading users...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-[var(--brand-border)]">No users found</p>
          </div>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead className="bg-[var(--brand-muted)] border-b border-[var(--brand-border)]">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-[var(--brand-border)] uppercase tracking-wider">Email</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-[var(--brand-border)] uppercase tracking-wider">Role</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-[var(--brand-border)] uppercase tracking-wider">Location</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-[var(--brand-border)] uppercase tracking-wider">Created</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-[var(--brand-border)] uppercase tracking-wider">Last Sign In</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-[var(--brand-border)] uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--brand-border)]">
                {filteredUsers.map(user => (
                  <tr key={user.id} className="hover:bg-[var(--brand-muted)] transition-colors">
                    <td className="px-6 py-4">
                      <span className="font-medium text-[var(--brand-dark)]">{user.email}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          normalizeUserRole(user.role) === UserRole.EMPLOYEE
                            ? 'bg-[var(--brand-muted)] text-[var(--brand-text-dark)] border border-[var(--brand-border)]'
                            : 'bg-[var(--brand-accent)]/20 text-[var(--brand-dark)] border border-[var(--brand-border)]'
                        }`}
                      >
                        {normalizeUserRole(user.role) === UserRole.EMPLOYEE ? <User size={12} /> : <Shield size={12} />}
                        {ROLE_LABELS[normalizeUserRole(user.role)]}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[var(--brand-border)] text-sm">
                        {locationName(user.cityId, user.branchId, user.role)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[var(--brand-border)] text-sm">
                        {formatUserDateTime(user.created_at)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[var(--brand-border)] text-sm">
                        {formatUserDateTime(user.last_sign_in_at)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {deleteConfirm === user.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <p className="text-sm text-[var(--brand-border)] mr-3">Delete user?</p>
                          <button
                            onClick={() => handleDeleteUser(user.id)}
                            disabled={loading}
                            className="px-3 py-1 bg-[var(--brand-dark)] text-[var(--brand-text-light)] rounded-lg text-sm hover:bg-[var(--brand-bg)] disabled:opacity-50"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            disabled={loading}
                            className="px-3 py-1 bg-[var(--brand-muted)] text-[var(--brand-dark)] rounded-lg text-sm hover:bg-[var(--brand-surface)] disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          {actorRole === UserRole.SUPER_ADMIN && normalizeUserRole(user.role) !== UserRole.SUPER_ADMIN && (
                            <button
                              onClick={() => {
                                setError('');
                                setEditingUser(user);
                                setEditLocation({
                                  cityId: user.cityId || '',
                                  branchId: user.branchId || '',
                                });
                              }}
                              className="p-2 text-[var(--brand-dark)] hover:bg-[var(--brand-muted)] rounded-lg transition-colors"
                              title="Assign city or branch"
                            >
                              <Pencil size={18} />
                            </button>
                          )}
                          <button
                            onClick={() => setDeleteConfirm(user.id)}
                            className="p-2 text-[var(--brand-dark)] hover:bg-[var(--brand-muted)] rounded-lg transition-colors"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-[var(--brand-dark)]/20 flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--brand-surface)] rounded-2xl shadow-xl max-w-md w-full p-6 border border-[var(--brand-border)] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-[var(--brand-dark)]">Create New User</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-2 hover:bg-[var(--brand-muted)] rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--brand-dark)] mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-[var(--brand-border)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/20 focus:border-[var(--brand-accent)] text-[var(--brand-text-dark)] placeholder-[var(--brand-border)]"
                  placeholder="admin@bakery.com"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--brand-dark)] mb-2">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-[var(--brand-border)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/20 focus:border-[var(--brand-accent)] text-[var(--brand-text-dark)] placeholder-[var(--brand-border)]"
                    placeholder="Minimum 6 characters"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--brand-border)] hover:text-[var(--brand-dark)]"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
                <p className="text-xs text-[var(--brand-border)] mt-1">Minimum 6 characters</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--brand-dark)] mb-2">
                  Role
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {allowedRoles.map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => {
                        const cityId = assignedCityId || newUser.cityId;
                        const cityBranches = cityId ? branches.filter((branch) => branch.cityId === cityId) : [];
                        setNewUser({
                          ...newUser,
                          role,
                          cityId,
                          branchId: roleRequiresBranch(role)
                            ? (assignedBranchId || (cityBranches.length === 1 ? cityBranches[0].id : newUser.branchId))
                            : '',
                        });
                      }}
                      className={`flex items-center gap-2 px-4 py-3 rounded-xl border transition-all text-left ${
                        newUser.role === role
                          ? 'border-[var(--brand-border)] bg-[var(--brand-muted)] text-[var(--brand-dark)] ring-2 ring-[var(--brand-accent)]/20'
                          : 'border-[var(--brand-border)] text-[var(--brand-border)] hover:bg-[var(--brand-surface)]'
                      }`}
                    >
                      {role === UserRole.EMPLOYEE ? <User size={18} /> : <Shield size={18} />}
                      <div>
                        <p className="text-sm font-medium">{ROLE_LABELS[role]}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {roleRequiresCity(normalizeUserRole(newUser.role)) && (
                <div>
                  <label className="block text-sm font-medium text-[var(--brand-dark)] mb-2">City</label>
                  <select
                    value={assignedCityId || newUser.cityId}
                    disabled={!!assignedCityId}
                    onChange={(event) => {
                      const cityId = event.target.value;
                      const cityBranches = cityId ? branches.filter((branch) => branch.cityId === cityId) : [];
                      setNewUser({
                        ...newUser,
                        cityId,
                        branchId: roleRequiresBranch(normalizeUserRole(newUser.role))
                          ? (assignedBranchId || (cityBranches.length === 1 ? cityBranches[0].id : ''))
                          : '',
                      });
                    }}
                    className="w-full px-4 py-2.5 rounded-xl border border-[var(--brand-border)] bg-white text-[var(--brand-text-dark)]"
                  >
                    <option value="">Select city</option>
                    {cities
                      .filter((city) => !assignedCityId || city.id === assignedCityId)
                      .map((city) => (
                        <option key={city.id} value={city.id}>{city.name}</option>
                      ))}
                  </select>
                  {selectedCityBranches.length > 0 && (
                    <p className="text-xs text-[var(--brand-border)] mt-2">
                      {normalizeUserRole(newUser.role) === UserRole.CITY_MANAGER
                        ? `This city manager will see: ${selectedCityBranches.map((branch) => branch.name).join(', ')}.`
                        : `Branches in this city: ${selectedCityBranches.map((branch) => branch.name).join(', ')}.`}
                    </p>
                  )}
                </div>
              )}

              {roleRequiresBranch(normalizeUserRole(newUser.role)) && (
                <div>
                  <label className="block text-sm font-medium text-[var(--brand-dark)] mb-2">Branch</label>
                  <select
                    value={assignedBranchId || newUser.branchId}
                    disabled={!!assignedBranchId}
                    onChange={(event) => {
                      const branchId = event.target.value;
                      const branch = branches.find((item) => item.id === branchId);
                      setNewUser({
                        ...newUser,
                        branchId,
                        cityId: assignedCityId || branch?.cityId || newUser.cityId,
                      });
                    }}
                    className="w-full px-4 py-2.5 rounded-xl border border-[var(--brand-border)] bg-white text-[var(--brand-text-dark)]"
                  >
                    <option value="">Select branch</option>
                    {branches
                      .filter((branch) => {
                        const cityId = assignedCityId || newUser.cityId;
                        if (assignedBranchId) return branch.id === assignedBranchId;
                        return !cityId || branch.cityId === cityId;
                      })
                      .map((branch) => (
                        <option key={branch.id} value={branch.id}>{branch.name}</option>
                      ))}
                  </select>
                </div>
              )}

              <div className="bg-[var(--brand-muted)] border border-[var(--brand-border)] p-3 rounded-lg">
                <p className="text-xs text-[var(--brand-border)]">
                  {getRoleDescription(normalizeUserRole(newUser.role))}
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2.5 border border-[var(--brand-border)] text-[var(--brand-dark)] rounded-xl hover:bg-[var(--brand-muted)] font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 bg-[var(--brand-dark)] text-[var(--brand-text-light)] rounded-xl hover:bg-[var(--brand-bg)] font-medium transition-colors disabled:opacity-50"
                >
                  {loading ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingUser && (
        <div className="fixed inset-0 bg-[var(--brand-dark)]/20 flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--brand-surface)] rounded-2xl shadow-xl max-w-md w-full p-6 border border-[var(--brand-border)]">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-[var(--brand-dark)]">Assign location</h2>
              <button
                onClick={() => setEditingUser(null)}
                className="p-2 hover:bg-[var(--brand-muted)] rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-[var(--brand-border)] mb-4">
              {editingUser.email} · {ROLE_LABELS[normalizeUserRole(editingUser.role)]}
            </p>
            <form onSubmit={handleSaveLocation} className="space-y-4">
              {roleRequiresCity(normalizeUserRole(editingUser.role)) && (
                <div>
                  <label className="block text-sm font-medium text-[var(--brand-dark)] mb-2">City</label>
                  <select
                    value={editLocation.cityId}
                    onChange={(event) => setEditLocation({ cityId: event.target.value, branchId: '' })}
                    className="w-full px-4 py-2.5 rounded-xl border border-[var(--brand-border)] bg-white text-[var(--brand-text-dark)]"
                  >
                    <option value="">Select city</option>
                    {cities.map((city) => (
                      <option key={city.id} value={city.id}>{city.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {roleRequiresBranch(normalizeUserRole(editingUser.role)) && (
                <div>
                  <label className="block text-sm font-medium text-[var(--brand-dark)] mb-2">Branch</label>
                  <select
                    value={editLocation.branchId}
                    onChange={(event) => {
                      const branchId = event.target.value;
                      const branch = branches.find((item) => item.id === branchId);
                      setEditLocation({
                        branchId,
                        cityId: branch?.cityId || editLocation.cityId,
                      });
                    }}
                    className="w-full px-4 py-2.5 rounded-xl border border-[var(--brand-border)] bg-white text-[var(--brand-text-dark)]"
                  >
                    <option value="">Select branch</option>
                    {branches
                      .filter((branch) => !editLocation.cityId || branch.cityId === editLocation.cityId)
                      .map((branch) => (
                        <option key={branch.id} value={branch.id}>{branch.name}</option>
                      ))}
                  </select>
                </div>
              )}
              {normalizeUserRole(editingUser.role) === UserRole.CITY_MANAGER && (
                <p className="text-xs text-[var(--brand-border)]">
                  {branches.filter((branch) => branch.cityId === editLocation.cityId).length > 0
                    ? `Branches in this city: ${branches.filter((branch) => branch.cityId === editLocation.cityId).map((branch) => branch.name).join(', ')}.`
                    : 'Select Coimbatore to assign RS Puram and Peelamedu.'}
                </p>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="flex-1 px-4 py-2.5 border border-[var(--brand-border)] text-[var(--brand-dark)] rounded-xl hover:bg-[var(--brand-muted)] font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 bg-[var(--brand-dark)] text-[var(--brand-text-light)] rounded-xl font-medium disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Save location'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;
