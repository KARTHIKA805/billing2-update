import { createClient } from '@supabase/supabase-js';

const OLD_URL = process.env.OLD_SUPABASE_URL;
const OLD_KEY = process.env.OLD_SUPABASE_ANON;
const NEW_URL = process.env.NEW_SUPABASE_URL;
const NEW_KEY = process.env.NEW_SUPABASE_ANON;
const SAMPLE_PASSWORD = process.env.SAMPLE_PASSWORD || 'Suvai123';

const CHENNAI = '11111111-1111-1111-1111-111111111111';
const COIMBATORE = '22222222-2222-2222-2222-222222222222';
const T_NAGAR = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
const ANNA_NAGAR = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2';
const RS_PURAM = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3';

if (!OLD_URL || !OLD_KEY || !NEW_URL || !NEW_KEY) {
  throw new Error('Missing OLD/NEW Supabase env vars');
}

const oldDb = createClient(OLD_URL, OLD_KEY, { auth: { persistSession: false } });
const newDb = createClient(NEW_URL, NEW_KEY, { auth: { persistSession: false } });

const sampleQty = (value, fallback = 50) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  if (n > 10_000) return fallback;
  return Math.round(n);
};

const chunk = (rows, size = 80) => {
  const out = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
};

const insertRows = async (table, rows) => {
  if (!rows.length) return { count: 0 };
  let count = 0;
  for (const part of chunk(rows)) {
    const { error } = await newDb.from(table).upsert(part, { onConflict: 'id' });
    if (error) throw new Error(`${table}: ${error.message}`);
    count += part.length;
  }
  return { count };
};

const copyTable = async (table, mapRow, { filter } = {}) => {
  let query = oldDb.from(table).select('*');
  if (filter) query = filter(query);
  const { data, error } = await query;
  if (error) {
    console.log(`skip ${table}: ${error.message}`);
    return [];
  }
  const rows = (data || []).map(mapRow).filter(Boolean);
  await insertRows(table, rows);
  console.log(`copied ${table}: ${rows.length}`);
  return rows;
};

const ensureUser = async ({ email, password, role, cityId, branchId }) => {
  const isolated = createClient(NEW_URL, NEW_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await isolated.auth.signUp({
    email,
    password,
    options: { data: { role, city_id: cityId, branch_id: branchId } },
  });
  if (error && !/already/i.test(error.message)) {
    console.log(`signup ${email}: ${error.message}`);
  }

  let userId = data?.user?.id || null;
  if (!userId || data?.user?.identities?.length === 0) {
    const { data: profile } = await newDb.from('user_profiles').select('id').eq('email', email).maybeSingle();
    userId = profile?.id || userId;
  }

  if (!userId) {
    return { email, role, ok: false, reason: 'no auth id' };
  }

  const { error: profileError } = await newDb.from('user_profiles').upsert({
    id: userId,
    email,
    role,
    city_id: cityId,
    branch_id: branchId,
  });
  if (profileError) return { email, role, ok: false, reason: profileError.message };

  const { error: loginError } = await isolated.auth.signInWithPassword({ email, password });
  return {
    email,
    role,
    ok: !loginError,
    userId,
    login: loginError ? loginError.message : 'ok',
  };
};

const settings = await fetch(`${NEW_URL}/auth/v1/settings`, { headers: { apikey: NEW_KEY } }).then((r) => r.json());
console.log('mailer_autoconfirm', settings.mailer_autoconfirm);

await copyTable('categories', (row) => ({
  id: row.id,
  name: row.name,
  image_url: row.image_url ?? null,
  created_at: row.created_at,
}));

const products = await copyTable('products', (row) => {
  if (row.deleted_at) return null;
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    price: Number(row.price) || 0,
    cost: Number(row.cost) || 0,
    stock: sampleQty(row.stock, 50),
    min_stock: sampleQty(row.min_stock, 5) > 1000 ? 5 : sampleQty(row.min_stock, 5),
    unit: row.unit || 'unit',
    created_at: row.created_at,
    deleted_at: null,
  };
}, { filter: (q) => q.is('deleted_at', null) });

const ingredients = await copyTable('ingredients', (row) => {
  if (row.deleted_at) return null;
  return {
    id: row.id,
    name: row.name,
    unit: row.unit || 'kg',
    current_stock: sampleQty(row.current_stock, 20),
    min_stock: sampleQty(row.min_stock, 5) > 1000 ? 5 : sampleQty(row.min_stock, 5),
    created_at: row.created_at,
    deleted_at: null,
  };
}, { filter: (q) => q.is('deleted_at', null) });

const { data: links, error: linkError } = await oldDb.from('product_ingredients').select('*');
if (!linkError && links?.length) {
  const productIds = new Set(products.map((p) => p.id));
  const ingredientIds = new Set(ingredients.map((i) => i.id));
  const rows = links.filter((row) => productIds.has(row.product_id) && ingredientIds.has(row.ingredient_id));
  for (const part of chunk(rows)) {
    const { error } = await newDb.from('product_ingredients').upsert(part, { onConflict: 'product_id,ingredient_id' });
    if (error) {
      const retry = await newDb.from('product_ingredients').insert(part);
      if (retry.error) console.log('product_ingredients:', retry.error.message);
    }
  }
  console.log(`copied product_ingredients: ${rows.length}`);
}

const { data: customers } = await oldDb.from('customers').select('*').limit(25);
if (customers?.length) {
  const rows = customers.map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone ?? null,
    email: row.email ?? null,
    notes: row.notes ?? null,
    loyalty_points: Number(row.loyalty_points) || 0,
    total_spent: 0,
    join_date: row.join_date,
    created_at: row.created_at,
  }));
  await insertRows('customers', rows);
  console.log(`copied customers sample: ${rows.length}`);
}

const { data: branches } = await newDb.from('branches').select('id');
const inventory = [];
for (const branch of branches || []) {
  for (const product of products) {
    inventory.push({
      branch_id: branch.id,
      product_id: product.id,
      stock: product.stock,
      min_stock: product.min_stock,
      updated_at: new Date().toISOString(),
    });
  }
}
for (const part of chunk(inventory, 120)) {
  const { error } = await newDb.from('branch_inventory').upsert(part, { onConflict: 'branch_id,product_id' });
  if (error) throw new Error(`branch_inventory: ${error.message}`);
}
console.log(`seeded branch_inventory: ${inventory.length}`);

const { error: annaError } = await newDb.from('user_profiles').update({
  role: 'employee',
  city_id: CHENNAI,
  branch_id: ANNA_NAGAR,
}).eq('email', 'chennai_anna_nagar@gmail.com');
console.log('fixed anna nagar employee', annaError ? annaError.message : 'ok');

const users = [
  { email: 'chennai_city_manager@gmail.com', role: 'city_manager', cityId: CHENNAI, branchId: null },
  { email: 'chennai_tnagar_admin@gmail.com', role: 'branch_admin', cityId: CHENNAI, branchId: T_NAGAR },
  { email: 'chennai_tnagar_staff@gmail.com', role: 'employee', cityId: CHENNAI, branchId: T_NAGAR },
  { email: 'cbe_rspuram_admin@gmail.com', role: 'branch_admin', cityId: COIMBATORE, branchId: RS_PURAM },
];

const results = [];
for (const user of users) {
  results.push(await ensureUser({ ...user, password: SAMPLE_PASSWORD }));
}

const { data: profiles } = await newDb.from('user_profiles').select('email, role, city_id, branch_id').order('email');
const { count: productCount } = await newDb.from('products').select('id', { count: 'exact', head: true });
const { count: stockCount } = await newDb.from('branch_inventory').select('product_id', { count: 'exact', head: true });

console.log(JSON.stringify({
  password: SAMPLE_PASSWORD,
  users: results,
  profiles,
  productCount,
  stockCount,
  autoconfirm: settings.mailer_autoconfirm,
}, null, 2));
