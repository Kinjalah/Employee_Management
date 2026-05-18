#!/usr/bin/env node
/* Dev seeder (CommonJS): creates 3 auth users, profiles, and roles using Supabase service role key.
 * WARNING: This uses the service-role key. Only run locally. Do NOT commit keys.
 */
const { createClient } = require('@supabase/supabase-js');
try { require('dotenv').config(); } catch (e) { /* dotenv not installed globally; rely on env */ }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment. Copy from .env.example');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function run() {
  try {
    const users = [
      { email: 'admin.demo@example.com', password: 'Password123!', full_name: 'Demo Admin', roles: ['admin'] },
      { email: 'mgr.demo@example.com', password: 'Password123!', full_name: 'Demo Manager', roles: ['manager'] },
      { email: 'emp.demo@example.com', password: 'Password123!', full_name: 'Demo Employee', roles: [] },
    ];

    for (const u of users) {
      // create user
      const { data: userData, error: createErr } = await admin.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
        user_metadata: { full_name: u.full_name },
      });
      if (createErr) {
        console.error('Error creating user', u.email, createErr.message || createErr);
        continue;
      }
      const uid = userData.id;
      console.log('Created user', u.email, uid);

      // upsert profile
      const { error: pErr } = await admin.from('profiles').upsert({ id: uid, email: u.email, full_name: u.full_name }, { onConflict: 'id' });
      if (pErr) console.error('Profile upsert error', pErr.message || pErr);

      // insert roles
      for (const r of u.roles) {
        const { error: rErr } = await admin.from('user_roles').upsert({ user_id: uid, role: r }, { onConflict: ['user_id', 'role'] });
        if (rErr) console.error('Role insert error', rErr.message || rErr);
      }
    }

    console.log('Seeder finished. Demo credentials: admin.demo@example.com / Password123! (etc.)');
    console.log('Remove service role key from environment after use.');
  } catch (err) {
    console.error('Seeder failed', err);
    process.exit(2);
  }
}

run();
