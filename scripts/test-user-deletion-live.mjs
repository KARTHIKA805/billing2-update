import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envText = readFileSync(resolve(root, '.env'), 'utf8');
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const idx = line.indexOf('=');
      return [line.slice(0, idx), line.slice(idx + 1)];
    })
);

const url = env.VITE_SUPABASE_URL;
const anon = env.VITE_SUPABASE_ANON_KEY;
if (!url || !anon) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const password = process.env.SAMPLE_PASSWORD || 'Suvai123';
const employeeEmail = process.env.EMPLOYEE_EMAIL || 'chennai_anna_nagar@gmail.com';
const branchAdminEmail = process.env.BRANCH_ADMIN_EMAIL || 'cbe_rspuram_admin@gmail.com';
const cityManagerEmail = process.env.CITY_MANAGER_EMAIL || 'chennai_city_manager@gmail.com';
const throwawayEmail = `delete-test-${Date.now()}@suvai.test`;

const client = (auth = {}) => createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false, ...auth },
});

let failed = 0;
const assert = (label, ok, detail = '') => {
  if (ok) {
    console.log(`PASS ${label}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${label}${detail ? `: ${detail}` : ''}`);
};

const signIn = async (email) => {
  const supabase = client();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { supabase, session: data?.session || null, user: data?.user || null, error };
};

const { data: anonProbe, error: anonError } = await client().rpc('delete_staff_user', {
  target_id: '00000000-0000-0000-0000-000000000000',
});
const rpcMissing = /could not find the function|does not exist/i.test(anonError?.message || '');
assert('delete_staff_user RPC is installed', !rpcMissing, anonError?.message);
if (rpcMissing) {
  console.error('Run scripts/fix_user_management.sql in the Supabase SQL editor, then rerun this test.');
  process.exit(1);
}
assert('anonymous delete is rejected', Boolean(anonError), anonError ? '' : 'anonymous delete succeeded');

const employee = await signIn(employeeEmail);
assert('employee can sign in for denial test', !employee.error && Boolean(employee.user), employee.error?.message);
if (employee.user) {
  const { error } = await employee.supabase.rpc('get_admin_users');
  assert('employee cannot list users', Boolean(error), error ? '' : 'employee listed users');
  const { error: deleteError } = await employee.supabase.rpc('delete_staff_user', { target_id: employee.user.id });
  assert('employee cannot delete users', Boolean(deleteError), deleteError ? '' : 'employee deleted a user');
}

const branchAdmin = await signIn(branchAdminEmail);
if (branchAdmin.user) {
  const { data: users, error } = await branchAdmin.supabase.rpc('get_admin_users');
  assert('branch admin can list scoped users', !error, error?.message);
  const otherCity = (users || []).find((user) => user.email === employeeEmail && user.branch_id && user.branch_id !== (users || []).find((row) => row.id === branchAdmin.user.id)?.branch_id);
  if (otherCity) {
    const { error: deleteError } = await branchAdmin.supabase.rpc('delete_staff_user', { target_id: otherCity.id });
    assert('branch admin cannot delete other-branch employee', Boolean(deleteError), deleteError ? '' : 'cross-branch delete succeeded');
  }
  const superAdmin = (users || []).find((user) => ['super_admin', 'admin'].includes(String(user.role || '').toLowerCase()));
  if (superAdmin) {
    const { error: deleteError } = await branchAdmin.supabase.rpc('delete_staff_user', { target_id: superAdmin.id });
    assert('nobody can delete Super Admin via branch admin', Boolean(deleteError), deleteError ? '' : 'super admin deleted');
  }
}

const cityManager = await signIn(cityManagerEmail);
if (cityManager.user) {
  const { data: users, error } = await cityManager.supabase.rpc('get_admin_users');
  assert('city manager can list scoped users', !error, error?.message);
  const otherCity = (users || []).find((user) => user.email === branchAdminEmail);
  assert('city manager list hides other-city branch admin', !otherCity, otherCity ? otherCity.email : '');
}

if (employee.user) {
  const { data: profile, error: profileError } = await employee.supabase
    .from('user_profiles')
    .select('city_id, branch_id, role')
    .eq('id', employee.user.id)
    .maybeSingle();
  assert('employee can read own profile', !profileError && Boolean(profile?.branch_id), profileError?.message || 'missing branch');
  const { data: ownBranches, error: branchError } = await employee.supabase.from('branches').select('id, city_id');
  assert('employee branch list loads', !branchError, branchError?.message);
  const { data: cities, error: cityError } = await employee.supabase.from('cities').select('id, name');
  assert('employee cannot list every city', !cityError && (cities || []).length <= 1, cityError?.message || `cities=${(cities || []).length}`);
  if (profile?.branch_id) {
    const { data: ownSales, error: ownSalesError } = await employee.supabase.from('sales').select('id, branch_id').limit(20);
    assert('employee can read own billing history', !ownSalesError, ownSalesError?.message);
    const leaked = (ownSales || []).filter((sale) => sale.branch_id && sale.branch_id !== profile.branch_id);
    assert('employee sales stay inside assigned branch', leaked.length === 0, leaked.map((sale) => sale.branch_id).join(','));
    const { error: escalateError } = await employee.supabase
      .from('user_profiles')
      .update({ role: 'super_admin', city_id: null, branch_id: null })
      .eq('id', employee.user.id);
    const { data: after } = await employee.supabase.from('user_profiles').select('role').eq('id', employee.user.id).maybeSingle();
    assert(
      'employee cannot escalate their own role',
      Boolean(escalateError) || String(after?.role || '').toLowerCase() === 'employee',
      escalateError?.message || after?.role || 'role changed',
    );
  }
}

if (cityManager.user) {
  const { data: branches, error: branchError } = await cityManager.supabase.from('branches').select('id, city_id');
  assert('city manager branch list loads', !branchError, branchError?.message);
  const managerRow = (await cityManager.supabase.rpc('get_admin_users')).data?.find((user) => user.id === cityManager.user.id);
  const foreign = (branches || []).filter((branch) => managerRow?.city_id && branch.city_id !== managerRow.city_id);
  assert('city manager cannot read other-city branches', foreign.length === 0, foreign.map((branch) => branch.id).join(','));
  const { data: sales, error: salesError } = await cityManager.supabase.from('sales').select('id, branch_id').limit(50);
  assert('city manager can read city billing history', !salesError, salesError?.message);
  const allowed = new Set((branches || []).map((branch) => branch.id));
  const leakedSales = (sales || []).filter((sale) => sale.branch_id && !allowed.has(sale.branch_id));
  assert('city manager sales stay inside assigned city', leakedSales.length === 0, leakedSales.map((sale) => sale.branch_id).join(','));
}

const anonSales = await client().from('sales').select('id').limit(1);
assert('anonymous billing read is denied', Boolean(anonSales.error) || (anonSales.data || []).length === 0, anonSales.error?.message || 'anonymous client read sales');

const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || 'ammukarthi8056@gmail.com';
const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || 'demo2';
const superAdminClient = client();
const superAdminSignIn = await superAdminClient.auth.signInWithPassword({
  email: superAdminEmail,
  password: superAdminPassword,
});
const superAdmin = {
  supabase: superAdminClient,
  session: superAdminSignIn.data?.session || null,
  user: superAdminSignIn.data?.user || null,
  error: superAdminSignIn.error,
};
assert('super admin can sign in for deletion test', !superAdmin.error && Boolean(superAdmin.user), superAdmin.error?.message);

if (superAdmin.user) {
  const { data: users } = await superAdmin.supabase.rpc('get_admin_users');
  const protectedAdmin = (users || []).find((user) => ['super_admin', 'admin'].includes(String(user.role || '').toLowerCase()) && user.id !== superAdmin.user.id)
    || (users || []).find((user) => user.id === superAdmin.user.id);
  if (protectedAdmin) {
    const { error: deleteAdminError } = await superAdmin.supabase.rpc('delete_staff_user', { target_id: protectedAdmin.id });
    assert('super admin cannot delete a Super Admin', Boolean(deleteAdminError), deleteAdminError ? '' : 'super admin delete succeeded');
  }

  const { data: cities } = await superAdmin.supabase.from('cities').select('id').limit(1);
  const { data: branches } = await superAdmin.supabase.from('branches').select('id, city_id').limit(1);
  const cityId = branches?.[0]?.city_id || cities?.[0]?.id;
  const branchId = branches?.[0]?.id;
  const isolated = client();
  const created = await isolated.auth.signUp({
    email: throwawayEmail,
    password,
    options: { data: { role: 'employee', city_id: cityId, branch_id: branchId } },
  });
  const createdId = created.data?.user?.id;
  const createdSession = created.data?.session || null;
  if (!createdId) {
    assert('throwaway employee can be created', false, created.error?.message || 'no user id');
  } else {
    const { error: profileError } = await superAdmin.supabase.from('user_profiles').upsert({
      id: createdId,
      email: throwawayEmail,
      role: 'employee',
      city_id: cityId,
      branch_id: branchId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    assert('throwaway profile saved', !profileError, profileError?.message);
    const removed = await superAdmin.supabase.rpc('delete_staff_user', { target_id: createdId });
    assert('super admin can delete an eligible employee', !removed.error && removed.data?.success === true, removed.error?.message || JSON.stringify(removed.data));
    const { data: leftover } = await superAdmin.supabase.from('user_profiles').select('id').eq('id', createdId).maybeSingle();
    assert('deleted employee profile is gone', !leftover, leftover?.id || '');
    const loginAgain = await client().auth.signInWithPassword({ email: throwawayEmail, password });
    assert('deleted employee cannot log in', Boolean(loginAgain.error) || !loginAgain.data?.session, loginAgain.error?.message || 'session issued');
    if (createdSession?.access_token) {
      const stale = client();
      const reused = await stale.auth.setSession({
        access_token: createdSession.access_token,
        refresh_token: createdSession.refresh_token,
      });
      const { data: staleSales, error: staleError } = await stale.from('sales').select('id').limit(1);
      assert(
        'deleted employee cannot reuse the old session',
        Boolean(reused.error) || Boolean(staleError) || (staleSales || []).length === 0,
        reused.error?.message || staleError?.message || 'old token still read sales',
      );
    }
    const { count: salesCount, error: salesCountError } = await superAdmin.supabase
      .from('sales')
      .select('id', { count: 'exact', head: true });
    assert('deleting a user did not remove sales', !salesCountError, salesCountError?.message || `count=${salesCount}`);
  }
}

console.log(failed === 0 ? 'Live checks passed' : `${failed} live checks failed`);
process.exit(failed === 0 ? 0 : 1);
