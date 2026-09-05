#!/usr/bin/env node
// Local/QA-only fixture for Rewards Redemption live-gate behavioral
// verification — NOT for production use. Mirrors seed-qa-data.mjs's exact
// pattern (same .env.local convention, same SUPABASE_URL/
// SUPABASE_SERVICE_ROLE_KEY names, same auth.admin.createUser + profiles
// upsert + idempotent household/member inserts, same --reset mode) rather
// than inventing a new fixture mechanism. Kept as its own file instead of
// extending seed-qa-data.mjs so the existing, already-reviewed script
// stays untouched.
//
// Creates two households so Decision 11 (self-or-adult+ visibility) can be
// exercised for real:
//   Household A: owner, admin, adult, child A, child B
//   Household B: owner, child C
// plus points balances for the three children and four rewards (two
// active in household A, one more active-at-creation reward in household A
// meant to be archived mid-test by the operator, one active in household B).
//
// Usage:
//   node scripts/seed-rewards-redemption-qa-data.mjs          # create/update
//   node scripts/seed-rewards-redemption-qa-data.mjs --reset  # delete

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { validateQaTarget } from './lib/qaTargetGuard.mjs';

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
// Deliberately NOT reusing seed-qa-data.mjs's own convention of a literal
// hardcoded password in source — that script predates this review pass.
// Sourced from .env.local via the same loader as the two vars above, so it
// never touches process arguments/history and is never written to any
// generated file or log line.
const TEST_PASSWORD = env.REWARDS_REDEMPTION_QA_TEST_PASSWORD;
// Explicit confirmation gate — this repo's existing seed script has no
// environment guard at all (checked: it proceeds straight from reading
// .env.local to mutating whatever project that file points at).
const ALLOW_SEED = env.ALLOW_REWARDS_REDEMPTION_QA_SEED;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.');
  process.exit(1);
}

if (!TEST_PASSWORD) {
  console.error('Missing REWARDS_REDEMPTION_QA_TEST_PASSWORD in .env.local.');
  console.error('Add a line to .env.local, e.g.:');
  console.error('  REWARDS_REDEMPTION_QA_TEST_PASSWORD=<pick-any-qa-only-password>');
  process.exit(1);
}

// Fail-closed target guard (scripts/lib/qaTargetGuard.mjs): the ALLOW flag
// alone is necessary but not sufficient — it would happily be 'true' while
// SUPABASE_URL points at a completely different project (Production
// included) if .env.local were ever edited incorrectly. This independently
// requires the URL's own project ref to equal the one approved QA ref,
// checked before the Supabase client is even constructed, so no
// auth.admin.* call or table operation can be reached on a mismatch.
// Bounded, network-free proof of every case (right ref/wrong ref/flag
// variants/malformed/missing) lives in validate-qa-target-guard.mjs.
const targetCheck = validateQaTarget(SUPABASE_URL, ALLOW_SEED);
if (!targetCheck.ok) {
  console.error(`Refusing to run: ${targetCheck.reason}`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Fixed identifiers — deliberately hardcoded so the script is idempotent ──
// UUID space: 77777777-... prefix, distinct from seed-qa-data.mjs's own
// 99999999-... fixture (never collides with the existing QA dataset).
// Every literal below is validated by validate-uuids.mjs in this same
// directory before being trusted — see that script's own output, not
// visual inspection, for proof these parse as real UUIDs.

const USERS = {
  ownerA: { email: 'rr-qa-owner-a@chorehero.test', displayName: 'RR QA Owner A', role: 'owner',  household: 'A' },
  adminA: { email: 'rr-qa-admin-a@chorehero.test', displayName: 'RR QA Admin A', role: 'admin',  household: 'A' },
  adultA: { email: 'rr-qa-adult-a@chorehero.test', displayName: 'RR QA Adult A', role: 'adult',  household: 'A' },
  childA: { email: 'rr-qa-child-a@chorehero.test', displayName: 'RR QA Child A', role: 'child',  household: 'A' },
  childB: { email: 'rr-qa-child-b@chorehero.test', displayName: 'RR QA Child B', role: 'child',  household: 'A' },
  ownerB: { email: 'rr-qa-owner-b@chorehero.test', displayName: 'RR QA Owner B', role: 'owner',  household: 'B' },
  childC: { email: 'rr-qa-child-c@chorehero.test', displayName: 'RR QA Child C', role: 'child',  household: 'B' },
};

const HOUSEHOLD_A_ID   = '77777777-0000-0000-0000-0000000000a1';
const HOUSEHOLD_A_NAME = 'RR QA Household A';
const HOUSEHOLD_B_ID   = '77777777-0000-0000-0000-0000000000b1';
const HOUSEHOLD_B_NAME = 'RR QA Household B';

const REWARD_IDS = {
  activeOne:      '77777777-0000-1000-0000-0000000000c1', // household A, active, cheap enough for both children to afford
  activeTwo:      '77777777-0000-1000-0000-0000000000c2', // household A, active
  archiveTarget:  '77777777-0000-1000-0000-0000000000c3', // household A, active at creation — archive this one mid-test
  householdBOnly: '77777777-0000-1000-0000-0000000000c4', // household B, active — for cross-household denial checks
};

const isReset = process.argv.includes('--reset');

// ── Helpers ──────────────────────────────────────────────────────────────

async function findUserByEmail(email) {
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
      email_confirm: true,
    });
    if (error) throw error;
    console.log(`  user created: ${email} (${data.user.id})`);
    userId = data.user.id;
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({ id: userId, display_name: displayName }, { onConflict: 'id' });
  if (profileError) throw profileError;

  return userId;
}

async function reset() {
  console.log('Resetting Rewards Redemption QA dataset...\n');

  // Ledger rows referencing a redemption block that redemption's own
  // delete via ON DELETE RESTRICT — but deleting the household cascades
  // through reward_redemptions/point_transactions/points_balances/rewards
  // the same way it already does for every other household-scoped table
  // in this schema, so no direct reward_redemptions/point_transactions
  // delete is needed here.
  for (const id of [HOUSEHOLD_A_ID, HOUSEHOLD_B_ID]) {
    const { error } = await supabase.from('households').delete().eq('id', id);
    if (error) throw error;
  }
  console.log('  households (and everything cascading from them) removed');

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
  console.log('Seeding Rewards Redemption QA dataset...\n');

  console.log('Users:');
  const userIds = {};
  for (const [key, u] of Object.entries(USERS)) {
    userIds[key] = await ensureUser(u);
  }

  console.log('\nHouseholds:');
  const { error: householdAError } = await supabase.from('households').upsert(
    { id: HOUSEHOLD_A_ID, name: HOUSEHOLD_A_NAME, created_by_profile_id: userIds.ownerA },
    { onConflict: 'id' },
  );
  if (householdAError) throw householdAError;
  console.log(`  ${HOUSEHOLD_A_NAME} (${HOUSEHOLD_A_ID})`);

  const { error: householdBError } = await supabase.from('households').upsert(
    { id: HOUSEHOLD_B_ID, name: HOUSEHOLD_B_NAME, created_by_profile_id: userIds.ownerB },
    { onConflict: 'id' },
  );
  if (householdBError) throw householdBError;
  console.log(`  ${HOUSEHOLD_B_NAME} (${HOUSEHOLD_B_ID})`);

  console.log('\nMemberships:');
  for (const [key, u] of Object.entries(USERS)) {
    const householdId = u.household === 'A' ? HOUSEHOLD_A_ID : HOUSEHOLD_B_ID;
    const { error } = await supabase.from('household_members').upsert(
      { household_id: householdId, profile_id: userIds[key], role: u.role },
      { onConflict: 'household_id,profile_id' },
    );
    if (error) throw error;
    console.log(`  ${u.email} -> household ${u.household} / ${u.role}`);
  }

  console.log('\nPoints balances:');
  const balances = [
    { household_id: HOUSEHOLD_A_ID, profile_id: userIds.childA, balance: 100 },
    { household_id: HOUSEHOLD_A_ID, profile_id: userIds.childB, balance: 10 },
    { household_id: HOUSEHOLD_B_ID, profile_id: userIds.childC, balance: 100 },
  ];
  for (const b of balances) {
    const { error } = await supabase
      .from('points_balances')
      .upsert(b, { onConflict: 'household_id,profile_id' });
    if (error) throw error;
    console.log(`  ${b.profile_id} -> ${b.balance} pts`);
  }

  console.log('\nRewards:');
  const rewards = [
    { id: REWARD_IDS.activeOne,     household_id: HOUSEHOLD_A_ID, title: 'RR QA Reward — Movie Night',    points_required: 50, status: 'active', created_by_profile_id: userIds.ownerA },
    { id: REWARD_IDS.activeTwo,     household_id: HOUSEHOLD_A_ID, title: 'RR QA Reward — Extra Screen Time', points_required: 20, status: 'active', created_by_profile_id: userIds.ownerA },
    { id: REWARD_IDS.archiveTarget, household_id: HOUSEHOLD_A_ID, title: 'RR QA Reward — Archive Me Mid-Test', points_required: 15, status: 'active', created_by_profile_id: userIds.ownerA },
    { id: REWARD_IDS.householdBOnly, household_id: HOUSEHOLD_B_ID, title: 'RR QA Reward — Household B Only', points_required: 10, status: 'active', created_by_profile_id: userIds.ownerB },
  ];
  for (const r of rewards) {
    const { error } = await supabase.from('rewards').upsert(r, { onConflict: 'id' });
    if (error) throw error;
    console.log(`  [${r.status}] ${r.title} (${r.points_required} pts, household ${r.household_id === HOUSEHOLD_A_ID ? 'A' : 'B'})`);
  }

  console.log('\nDone. Sign in with any of these emails, using the password from');
  console.log('REWARDS_REDEMPTION_QA_TEST_PASSWORD in .env.local (not printed here):');
  for (const u of Object.values(USERS)) {
    console.log(`  ${u.email}  (household ${u.household}, ${u.role})`);
  }
  console.log('\nReward ids for behavioral testing:');
  console.log(`  activeOne (household A, 50 pts):      ${REWARD_IDS.activeOne}`);
  console.log(`  activeTwo (household A, 20 pts):      ${REWARD_IDS.activeTwo}`);
  console.log(`  archiveTarget (household A, 15 pts):  ${REWARD_IDS.archiveTarget}  <- archive this one mid-test`);
  console.log(`  householdBOnly (household B, 10 pts): ${REWARD_IDS.householdBOnly}`);
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