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
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / QA_TEST_PASSWORD —
// deliberately NOT the EXPO_PUBLIC_* names, so this can never accidentally
// get bundled into the client app. QA_TEST_PASSWORD is never logged by
// this script — only fixture emails/roles/ids are printed.
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
    console.error('  QA_TEST_PASSWORD=<a password to assign to the QA fixture users>');
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
// The fixture users' shared sign-in password. Environment-driven, not a
// literal in source, and never logged by this script (see the module
// header comment and the final summary at the end of seed()).
const QA_TEST_PASSWORD = env.QA_TEST_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !QA_TEST_PASSWORD) {
  console.error('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or QA_TEST_PASSWORD in .env.local.');
  process.exit(1);
}

// Hard project guard — this script uses the SERVICE ROLE key, which
// bypasses RLS entirely. Refuse to run against anything but the
// approved QA project, checked by exact hostname (not a substring/
// "contains qa" check), before any Supabase client is constructed or
// any admin call is made. Mirrors the same guard in
// a4_invite_security_harness.mjs.
const APPROVED_QA_HOSTNAME = 'umzfyedxnvtmfnwldwtq.supabase.co';
{
  let parsedUrl;
  try {
    parsedUrl = new URL(SUPABASE_URL);
  } catch {
    console.error('SUPABASE_URL in .env.local is not a valid URL. Refusing to run.');
    process.exit(1);
  }
  if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== APPROVED_QA_HOSTNAME) {
    console.error(`SUPABASE_URL does not point at the approved QA project (expected hostname "${APPROVED_QA_HOSTNAME}"). Refusing to run.`);
    process.exit(1);
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Fixed identifiers — deliberately hardcoded so the script is idempotent ──
// (re-running finds the same rows instead of creating duplicates). The
// shared password itself is NOT hardcoded — see QA_TEST_PASSWORD above.

const USERS = {
  owner: { email: 'qa-owner@chorehero.test', displayName: 'QA Owner', role: 'owner' },
  adult: { email: 'qa-adult@chorehero.test', displayName: 'QA Adult', role: 'adult' },
  child: { email: 'qa-child@chorehero.test', displayName: 'QA Child', role: 'child' },
  // A4 Invite Lifecycle QA — a second household's owner, for
  // cross-household authorization tests (a4_invite_security_harness.mjs's
  // QA_OTHER_OWNER_EMAIL). Deliberately a member of ONLY Household B,
  // never Household A, so cross-household checks are unambiguous.
  otherOwner: { email: 'qa-other-owner@chorehero.test', displayName: 'QA Other Owner', role: 'owner' },
};

const HOUSEHOLD_ID = '99999999-0000-0000-0000-000000000001';
const HOUSEHOLD_NAME = 'QA Test Household';

// A4 Invite Lifecycle QA — a second, distinct household containing only
// otherOwner. Exists solely so cross-household invite-authorization
// tests have a genuinely different household to attempt against (see
// a4_invite_security_harness.mjs's QA_HOUSEHOLD_A_ID / QA_HOUSEHOLD_B_ID
// pre-flight check, which fails closed if the two ever turn out equal).
const HOUSEHOLD_B_ID = '99999999-0000-0000-0000-000000000002';
const HOUSEHOLD_B_NAME = 'QA Test Household B';

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

  // NOTE: this function is only ever called with entries from the fixed
  // USERS map above — never with an arbitrary/caller-supplied email — so
  // the password reset below is scoped to exactly the named QA fixture
  // identities, not to arbitrary users in the project.
  const existing = await findUserByEmail(email);
  if (existing) {
    console.log(`  user exists: ${email} (${existing.id})`);
    userId = existing.id;

    // Existing auth users are NOT given a password at creation time by
    // this branch, so without an explicit reset here, a fixture user
    // created in an earlier run (or whose password was since changed by
    // some other action) would silently fail signInWithPassword later —
    // the previous version of this script had exactly this gap. Reset it
    // deterministically on every run so every fixture identity is
    // guaranteed to authenticate with QA_TEST_PASSWORD afterwards,
    // regardless of prior state.
    const { error: passwordError } = await supabase.auth.admin.updateUserById(userId, {
      password: QA_TEST_PASSWORD,
    });
    if (passwordError) throw passwordError;
    console.log(`  password configured: ${email} (not printed)`);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: QA_TEST_PASSWORD,
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

  const { error: membersBError } = await supabase
    .from('household_members')
    .delete()
    .eq('household_id', HOUSEHOLD_B_ID);
  if (membersBError) throw membersBError;
  console.log('  household_members (Household B) removed');

  const { error: householdBError } = await supabase
    .from('households')
    .delete()
    .eq('id', HOUSEHOLD_B_ID);
  if (householdBError) throw householdBError;
  console.log('  household B removed');

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

  // A4 Invite Lifecycle QA — second household, owned solely by
  // otherOwner. Created here (not folded into the loop above) so it is
  // unambiguous which household each user's membership below belongs to.
  const { error: householdBError } = await supabase.from('households').upsert(
    {
      id: HOUSEHOLD_B_ID,
      name: HOUSEHOLD_B_NAME,
      created_by_profile_id: userIds.otherOwner,
    },
    { onConflict: 'id' },
  );
  if (householdBError) throw householdBError;
  console.log(`  ${HOUSEHOLD_B_NAME} (${HOUSEHOLD_B_ID})`);

  console.log('\nMemberships:');
  // Household A: owner/adult/child only. otherOwner is deliberately
  // excluded — it must be a member of Household B only, so
  // cross-household authorization tests stay unambiguous.
  for (const key of ['owner', 'adult', 'child']) {
    const u = USERS[key];
    const { error } = await supabase.from('household_members').upsert(
      {
        household_id: HOUSEHOLD_ID,
        profile_id: userIds[key],
        role: u.role,
      },
      { onConflict: 'household_id,profile_id' },
    );
    if (error) throw error;
    console.log(`  ${u.email} -> ${u.role} (Household A)`);
  }

  // Household B: otherOwner only.
  {
    const u = USERS.otherOwner;
    const { error } = await supabase.from('household_members').upsert(
      {
        household_id: HOUSEHOLD_B_ID,
        profile_id: userIds.otherOwner,
        role: u.role,
      },
      { onConflict: 'household_id,profile_id' },
    );
    if (error) throw error;
    console.log(`  ${u.email} -> ${u.role} (Household B)`);
  }

  // ── Topology enforcement ────────────────────────────────────────────
  // Cross-household authorization tests (a4_invite_security_harness.mjs)
  // only test what they claim to test if otherOwner is a member of
  // Household B ONLY, and owner/adult/child are members of Household A
  // ONLY. A prior inconsistent run (e.g. an earlier version of this
  // script, or a manually-repaired QA session) could in principle have
  // left a stray cross-household membership row behind, which the
  // upserts above would never remove on their own (upsert only touches
  // the exact (household_id, profile_id) pair it targets). These deletes
  // are scoped to exactly the specific (household_id, profile_id) pairs
  // that must NOT exist — never a broad household_members wipe — so they
  // cannot affect any other fixture or non-fixture data.
  console.log('\nTopology enforcement (removing any stray cross-household membership):');
  {
    const { error } = await supabase
      .from('household_members')
      .delete()
      .eq('household_id', HOUSEHOLD_ID)
      .eq('profile_id', userIds.otherOwner);
    if (error) throw error;
  }
  for (const key of ['owner', 'adult', 'child']) {
    const { error } = await supabase
      .from('household_members')
      .delete()
      .eq('household_id', HOUSEHOLD_B_ID)
      .eq('profile_id', userIds[key]);
    if (error) throw error;
  }

  // Verify, not assume: re-read membership rows for otherOwner and
  // confirm Household A returns none before claiming the topology is
  // correct.
  const { data: otherOwnerMemberships, error: verifyError } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('profile_id', userIds.otherOwner);
  if (verifyError) throw verifyError;
  const otherOwnerHouseholds = otherOwnerMemberships.map((m) => m.household_id);
  if (otherOwnerHouseholds.includes(HOUSEHOLD_ID)) {
    throw new Error(
      'Topology enforcement failed: otherOwner is still a member of Household A after cleanup.',
    );
  }
  if (!otherOwnerHouseholds.includes(HOUSEHOLD_B_ID)) {
    throw new Error(
      'Topology enforcement failed: otherOwner is not a member of Household B after seeding.',
    );
  }
  console.log('  confirmed: otherOwner is a member of Household B only (not Household A)');

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

  console.log('\nDone. Fixture identities (password: the QA_TEST_PASSWORD you set, not printed):');
  for (const u of Object.values(USERS)) {
    console.log(`  ${u.email}  (${u.role})`);
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
