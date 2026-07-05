#!/usr/bin/env node
// Local development QA seeding script — NOT for production use.
//
// Creates a small, fixed set of test users, a household, memberships across
// all three roles, and contribution claims in each status, so the
// ContributionClaim lifecycle can be exercised manually against a real
// Supabase project without going through email-confirmation signup flows.
//
// Uses the Supabase Service Role Key, which bypasses RLS. Never import this
// file or its credentials from application code. Reads from `.env.local`
// (already covered by this repo's .gitignore pattern `.env*.local`) using
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — deliberately NOT the
// EXPO_PUBLIC_* names, so this can never accidentally get bundled into the
// client app.
//
// Usage:
//   node scripts/seed-qa-data.mjs          # create/update the fixed QA dataset
//   node scripts/seed-qa-data.mjs --reset  # delete the fixed QA dataset

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '..', '.env.local');

function loadEnvLocal(filePath) {
  let raw;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    console.error(`Could not read ${filePath}.`);
    console.error('Create it with:');
    console.error('  SUPABASE_URL=https://<your-project>.supabase.co');
    console.error('  SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>');
    process.exit(1);
  }

  const env = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const env = loadEnvLocal(envPath);
const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Fixed identifiers — deliberately hardcoded so the script is idempotent ──
// (re-running finds the same rows instead of creating duplicates).

const TEST_PASSWORD = 'ChoreHeroQA123!';

const USERS = {
  owner: { email: 'qa-owner@chorehero.test', displayName: 'QA Owner', role: 'owner' },
  adult: { email: 'qa-adult@chorehero.test', displayName: 'QA Adult', role: 'adult' },
  child: { email: 'qa-child@chorehero.test', displayName: 'QA Child', role: 'child' },
};

const HOUSEHOLD_ID = '99999999-0000-0000-0000-000000000001';
const HOUSEHOLD_NAME = 'QA Test Household';

const CLAIM_IDS = {
  pending: '99999999-0000-0000-0000-0000000000a1',
  approved: '99999999-0000-0000-0000-0000000000a2',
  rejected: '99999999-0000-0000-0000-0000000000a3',
};

const isReset = process.argv.includes('--reset');

// ── Helpers ──────────────────────────────────────────────────────────────

async function findUserByEmail(email) {
  // supabase-js admin API has no direct getUserByEmail; page through listUsers.
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = data.users.find((u) => u.email === email);
    if (found) return found;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

async function ensureUser({ email, displayName }) {
  let userId;

  const existing = await findUserByEmail(email);
  if (existing) {
    console.log(`  user exists: ${email} (${existing.id})`);
    userId = existing.id;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true, // pre-confirms the user for the dev auth flow (does not skip a step that would otherwise run later)
    });
    if (error) throw error;
    console.log(`  user created: ${email} (${data.user.id})`);
    userId = data.user.id;
  }

  // Always upsert, even for a pre-existing auth user: an earlier run may have
  // created the auth user but failed before its profiles row was written
  // (e.g. profiles table not migrated yet at the time), leaving the two out
  // of sync. Upsert is idempotent, so this is safe to repeat every run.
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({ id: userId, display_name: displayName }, { onConflict: 'id' });
  if (profileError) throw profileError;

  return userId;
}

async function reset() {
  console.log('Resetting QA dataset...\n');

  const claimIds = Object.values(CLAIM_IDS);
  const { error: claimsError } = await supabase
    .from('contribution_claims')
    .delete()
    .in('id', claimIds);
  if (claimsError) throw claimsError;
  console.log('  contribution_claims removed');

  const { error: membersError } = await supabase
    .from('household_members')
    .delete()
    .eq('household_id', HOUSEHOLD_ID);
  if (membersError) throw membersError;
  console.log('  household_members removed');

  const { error: householdError } = await supabase
    .from('households')
    .delete()
    .eq('id', HOUSEHOLD_ID);
  if (householdError) throw householdError;
  console.log('  household removed');

  // profiles cascade-delete automatically when the auth user is deleted
  // (profiles.id -> auth.users.id ON DELETE CASCADE).
  for (const { email } of Object.values(USERS)) {
    const user = await findUserByEmail(email);
    if (!user) {
      console.log(`  user already absent: ${email}`);
      continue;
    }
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) throw error;
    console.log(`  user removed: ${email}`);
  }

  console.log('\nReset complete.');
}

async function seed() {
  console.log('Seeding QA dataset...\n');

  console.log('Users:');
  const userIds = {};
  for (const [key, u] of Object.entries(USERS)) {
    userIds[key] = await ensureUser(u);
  }

  console.log('\nHousehold:');
  const { error: householdError } = await supabase.from('households').upsert(
    {
      id: HOUSEHOLD_ID,
      name: HOUSEHOLD_NAME,
      created_by_profile_id: userIds.owner,
    },
    { onConflict: 'id' },
  );
  if (householdError) throw householdError;
  console.log(`  ${HOUSEHOLD_NAME} (${HOUSEHOLD_ID})`);

  console.log('\nMemberships:');
  for (const [key, u] of Object.entries(USERS)) {
    const { error } = await supabase.from('household_members').upsert(
      {
        household_id: HOUSEHOLD_ID,
        profile_id: userIds[key],
        role: u.role,
      },
      { onConflict: 'household_id,profile_id' },
    );
    if (error) throw error;
    console.log(`  ${u.email} -> ${u.role}`);
  }

  // Only one of these is 'pending' at a time, matching
  // uq_contribution_claims_one_pending_per_member.
  console.log('\nContribution claims:');
  const now = new Date().toISOString();
  const claims = [
    {
      id: CLAIM_IDS.pending,
      household_id: HOUSEHOLD_ID,
      title: 'Fed the dog',
      points: 5,
      status: 'pending',
      claimed_by_profile_id: userIds.child,
      reviewed_by_profile_id: null,
      reviewed_at: null,
    },
    {
      id: CLAIM_IDS.approved,
      household_id: HOUSEHOLD_ID,
      title: 'Watered the plants',
      points: 5,
      status: 'approved',
      claimed_by_profile_id: userIds.child,
      reviewed_by_profile_id: userIds.owner,
      reviewed_at: now,
    },
    {
      id: CLAIM_IDS.rejected,
      household_id: HOUSEHOLD_ID,
      title: 'Cleaned my room',
      points: 5,
      status: 'rejected',
      claimed_by_profile_id: userIds.child,
      reviewed_by_profile_id: userIds.adult,
      reviewed_at: now,
    },
  ];
  for (const claim of claims) {
    const { error } = await supabase
      .from('contribution_claims')
      .upsert(claim, { onConflict: 'id' });
    if (error) throw error;
    console.log(`  [${claim.status}] ${claim.title}`);
  }

  console.log('\nDone. Sign in with any of:');
  for (const u of Object.values(USERS)) {
    console.log(`  ${u.email} / ${TEST_PASSWORD}  (${u.role})`);
  }
}

try {
  if (isReset) {
    await reset();
  } else {
    await seed();
  }
} catch (err) {
  console.error('\nFailed:', err.message ?? err);
  process.exit(1);
}
