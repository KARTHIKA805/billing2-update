import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sql = readFileSync(resolve(root, 'scripts/fix_user_management.sql'), 'utf8');
const url = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;
const restUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;

if (url) {
  const { default: postgres } = await import('postgres').catch(() => ({ default: null }));
  if (!postgres) {
    console.error('DATABASE_URL is set but the postgres package is not installed.');
    process.exit(1);
  }
  const client = postgres(url, { max: 1, ssl: 'require' });
  await client.unsafe(sql);
  await client.end();
  console.log('Applied scripts/fix_user_management.sql via DATABASE_URL.');
  process.exit(0);
}

if (restUrl && serviceKey) {
  const admin = createClient(restUrl, serviceKey, { auth: { persistSession: false } });
  const { error } = await admin.rpc('delete_staff_user', {
    target_id: '00000000-0000-0000-0000-000000000000',
  });
  if (error && /could not find the function|does not exist/i.test(error.message || '')) {
    console.error('Service role is present, but SQL cannot be applied through PostgREST. Run scripts/fix_user_management.sql in the Supabase SQL editor.');
    process.exit(1);
  }
  console.log('delete_staff_user is already installed.');
  process.exit(0);
}

console.error(
  [
    'Could not auto-apply the database migration (no DATABASE_URL or SUPABASE_SERVICE_ROLE_KEY).',
    'Open the NEW Suvai project in Supabase → SQL Editor and run scripts/fix_user_management.sql.',
  ].join('\n')
);
process.exit(2);
