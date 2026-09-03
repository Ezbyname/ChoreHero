// A4 Invite Lifecycle — authenticated-client security QA harness.
//
// Matches the REAL ChoreHero auth mechanism confirmed by direct
// repository inspection: email+password via
// supabase.auth.signInWithPassword() against the anon-key client
// (src/services/supabase/auth.ts, src/lib/supabase.ts). Anonymous auth
// is NOT used anywhere in the current app.
//
// This script signs in as real QA test identities exactly the way the
// app itself does, then exercises household_invites/the two invite RPCs
// through the same supabase-js client the app uses — i.e. genuine
// PostgREST requests running as the `authenticated` Postgres role, with
// RLS fully enforced. This is NOT run through the Supabase SQL Editor,
// which would bypass RLS entirely.
//
// Run with: node a4_invite_security_harness.mjs
//
// Required environment variables (never hardcoded, never printed):
//   QA_SUPABASE_URL       - the QA project's URL (validated below —
//                            must be exactly the approved QA project)
//   QA_SUPABASE_ANON_KEY  - the QA project's anon key
//   QA_TEST_PASSWORD      - the shared QA seed password
//   QA_OWNER_EMAIL        - an Owner/Admin of QA_HOUSEHOLD_A_ID
//   QA_CHILD_EMAIL        - a Child member of QA_HOUSEHOLD_A_ID
//   QA_OTHER_OWNER_EMAIL  - an Owner/Admin of QA_HOUSEHOLD_B_ID
//   QA_HOUSEHOLD_A_ID     - household id Owner A/Child A belong to
//   QA_HOUSEHOLD_B_ID     - household id Owner B belongs to (must not
//                           equal QA_HOUSEHOLD_A_ID)
//
// This script never logs a password, access token, anon key, or
// Authorization header — only PASS/FAIL per check, the expected/actual
// error category, and a sanitized error message (no credentials ever
// appear in a Postgres/PostgREST error message).
//
// Scope: this harness proves Creation Authority, row authorization on
// creation, the absence of general UPDATE, revoke RPC authorization,
// anon revoke rejection, and revoke terminal/idempotent timestamp
// behavior. It does NOT exercise the redemption lifecycle (Child
// multi-use, Adult/Admin single-use, already-member retry, exhaustion,
// concurrency) — that is a separate Slice 3 step, not implemented here.
//
// No DELETE path exists in the approved architecture and none is added
// here. The one invite this harness creates is revoked (the sole
// approved post-creation mutation) as part of its own test sequence —
// not a separate teardown step.

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

// ============================================================
// Hard QA project guard — MUST run before any network/auth/DB request.
// ============================================================
const APPROVED_QA_HOSTNAME = 'umzfyedxnvtmfnwldwtq.supabase.co';

function assertApprovedQaTarget(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    console.error('QA_SUPABASE_URL is not a valid URL. Refusing to make any request.');
    process.exit(1);
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== APPROVED_QA_HOSTNAME) {
    // Deliberately does not echo the rejected URL back verbatim — avoids
    // ever printing something that could itself be a credential-bearing
    // value (e.g. a URL with embedded query params).
    console.error(
      `Configured Supabase target is not the approved QA project (expected hostname "${APPROVED_QA_HOSTNAME}"). Refusing to make any request.`,
    );
    process.exit(1);
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

const SUPABASE_URL = requireEnv('QA_SUPABASE_URL');
assertApprovedQaTarget(SUPABASE_URL); // <-- before anything else touches SUPABASE_URL

const SUPABASE_ANON_KEY  = requireEnv('QA_SUPABASE_ANON_KEY');
const TEST_PASSWORD      = requireEnv('QA_TEST_PASSWORD');
const OWNER_EMAIL        = requireEnv('QA_OWNER_EMAIL');
const CHILD_EMAIL        = requireEnv('QA_CHILD_EMAIL');
const OTHER_OWNER_EMAIL  = requireEnv('QA_OTHER_OWNER_EMAIL');
const HOUSEHOLD_A_ID     = requireEnv('QA_HOUSEHOLD_A_ID');
const HOUSEHOLD_B_ID     = requireEnv('QA_HOUSEHOLD_B_ID');

// ============================================================
// Real invite-code contract — reproduced verbatim from
// src/lib/repositories/householdInvites.ts (re-verified against source
// immediately before writing this file; do not diverge from it).
// ============================================================
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const CODE_LENGTH   = 8;

function generateInviteCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

// ============================================================
// Error classification — code/category first, message only as
// supporting evidence for sub-classifying within a code. An error whose
// code doesn't match any known category is 'unknown' and must FAIL the
// test, never pass it.
// ============================================================
function classifyError(error) {
  if (!error) return 'none';
  const code = error.code;
  const msg  = (error.message || '').toLowerCase();

  // The RPCs explicitly RAISE ... USING ERRCODE = '28000' for their own
  // authorization checks (revoke_household_invite's owner/admin check;
  // redeem_household_invite's analogous checks) — a reliable,
  // code-based signal, not a message match.
  if (code === '28000') return 'rpc_authorization';

  // insufficient_privilege covers both plain GRANT-based ACL denials
  // and RLS policy violations in PostgreSQL. Message content is used
  // ONLY to sub-classify which of those it was — never to decide
  // pass/fail on its own, and an unrecognized message shape under this
  // code still counts as a genuine (if unclassified) privilege denial
  // rather than causing a false FAIL.
  if (code === '42501') {
    if (msg.includes('row-level security') || msg.includes('row level security')) {
      return 'rls_authorization';
    }
    if (msg.includes('permission denied for function') || msg.includes('permission denied for routine')) {
      return 'function_execute_denied';
    }
    if (
      msg.includes('permission denied for table') ||
      msg.includes('permission denied for column') ||
      msg.includes('permission denied for relation')
    ) {
      return 'table_or_column_privilege';
    }
    return 'privilege_denied_unclassified_message';
  }

  return 'unknown';
}

// Categories that legitimately represent "authenticated role has no
// write authority over this column/table via the ACL layer" — accepted
// for every creation/UPDATE attack test.
const PRIVILEGE_CATEGORIES = new Set(['table_or_column_privilege', 'privilege_denied_unclassified_message']);
// Categories that legitimately represent "row-level authorization
// rejected this specific row" — accepted for creator-identity/household
// authorization tests. Also accepts the unclassified-42501 bucket, since
// RLS and plain ACL denials share the same SQLSTATE in PostgreSQL and
// this harness cannot assume one exact message string without live
// verification.
const RLS_CATEGORIES = new Set(['rls_authorization', 'privilege_denied_unclassified_message']);
// Categories for anonymous/no-EXECUTE RPC rejection.
const EXECUTE_DENIED_CATEGORIES = new Set(['function_execute_denied', 'privilege_denied_unclassified_message']);

let passCount = 0;
let failCount = 0;

// Every negative-test PASS requires BOTH an error AND that error's
// category matching one of the expected categories for that test — an
// unrelated error (malformed code, duplicate code, network failure,
// missing RPC, schema-cache issue, etc.) never satisfies this, and
// falls through to FAIL with its actual (unexpected) category logged
// for diagnosis.
function reportRejection(name, error, expectedCategories) {
  if (!error) {
    failCount++;
    console.log(`FAIL  ${name} — expected a rejection but the operation unexpectedly succeeded`);
    return;
  }
  const category = classifyError(error);
  if (expectedCategories.has(category)) {
    passCount++;
    console.log(`PASS  ${name}  [category=${category}, code=${error.code ?? 'n/a'}]`);
  } else {
    failCount++;
    console.log(`FAIL  ${name} — unexpected error category "${category}" (code=${error.code ?? 'n/a'}, message="${sanitize(error.message)}")`);
  }
}

function reportSuccess(name, error, dataPresent) {
  if (!error && dataPresent) {
    passCount++;
    console.log(`PASS  ${name}`);
  } else {
    failCount++;
    console.log(`FAIL  ${name}${error ? ` — ${sanitize(error.message)}` : ' — no data returned'}`);
  }
}

// Strips anything shaped like a JWT/bearer token or an obvious
// key=value secret pattern out of a message before it's ever logged —
// defense in depth on top of the fact that Postgres/PostgREST error
// messages don't normally contain credentials at all.
function sanitize(message) {
  if (!message) return '';
  return message
    .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, '[redacted-jwt]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
}

function failClosed(message) {
  console.error(`PRE-FLIGHT FAILED — refusing to run security tests: ${message}`);
  process.exit(1);
}

// Signs in exactly the way LoginScreen -> signInWithEmail does, on a
// FRESH client per identity. Returns both the authenticated client AND
// the real signed-in user's id (auth.users.id) — never a hardcoded id.
async function signInAs(email) {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error || !data.session || !data.user) {
    throw new Error(`Sign-in failed for the configured identity: ${sanitize(error?.message) || 'no session'}`);
  }
  return { client, userId: data.user.id };
}

// Pre-flight: confirms each identity's actual role in its expected
// household by having EACH identity query its own membership row.
async function verifyMembership(client, householdId, profileId, expectedRoles, label) {
  const { data, error } = await client
    .from('household_members')
    .select('role')
    .eq('household_id', householdId)
    .eq('profile_id', profileId)
    .maybeSingle();

  if (error) failClosed(`${label}: membership lookup failed — ${sanitize(error.message)}`);
  if (!data) failClosed(`${label}: no household_members row found for this identity/household pair`);
  if (!expectedRoles.includes(data.role)) {
    failClosed(`${label}: expected role in [${expectedRoles.join(', ')}], found "${data.role}"`);
  }
}

async function main() {
  const ownerA = await signInAs(OWNER_EMAIL);
  const childA = await signInAs(CHILD_EMAIL);
  const ownerB = await signInAs(OTHER_OWNER_EMAIL);

  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log('=== Pre-flight identity/household verification (fail closed) ===\n');

  if (HOUSEHOLD_A_ID === HOUSEHOLD_B_ID) {
    failClosed('QA_HOUSEHOLD_A_ID and QA_HOUSEHOLD_B_ID must not be the same household');
  }
  await verifyMembership(ownerA.client, HOUSEHOLD_A_ID, ownerA.userId, ['owner', 'admin'], 'Owner A / Household A');
  await verifyMembership(childA.client, HOUSEHOLD_A_ID, childA.userId, ['child'],          'Child A / Household A');
  await verifyMembership(ownerB.client, HOUSEHOLD_B_ID, ownerB.userId, ['owner', 'admin'], 'Owner B / Household B');

  console.log('Pre-flight checks passed — Owner A is owner/admin of Household A, Child A is a child of Household A, Owner B is owner/admin of the DIFFERENT Household B.\n');

  console.log('=== Baseline invite creation ===\n');

  let targetInvite = null;
  {
    const { data, error } = await ownerA.client
      .from('household_invites')
      .insert({
        household_id:          HOUSEHOLD_A_ID,
        code:                  generateInviteCode(),
        role:                  'child',
        created_by_profile_id: ownerA.userId,
      })
      .select('*')
      .single();
    reportSuccess('baseline: Owner A can create a normal Child invite', error, !!data);
    if (data) targetInvite = data;
  }

  if (!targetInvite) {
    console.error('\nBaseline invite creation failed — cannot continue with downstream mutation/revoke tests that depend on it.');
    console.log(`\n${passCount} passed, ${failCount} failed\n`);
    process.exit(1);
  }
  console.log(`(baseline invite captured: id/code/household_id/initial revoked_at recorded internally, not printed)\n`);

  console.log('=== Creation authority — server-owned column attacks (each otherwise-valid) ===\n');

  async function attemptInsertWithOverride(name, overrides) {
    const { error } = await ownerA.client
      .from('household_invites')
      .insert({
        household_id:          HOUSEHOLD_A_ID,
        code:                  generateInviteCode(),
        role:                  'child',
        created_by_profile_id: ownerA.userId,
        ...overrides,
      });
    reportRejection(name, error, PRIVILEGE_CATEGORIES);
  }

  await attemptInsertWithOverride('attack: explicit id is rejected', { id: randomUUID() });
  await attemptInsertWithOverride('attack: explicit redemption_count is rejected', { redemption_count: 50 });
  await attemptInsertWithOverride('attack: explicit revoked_at is rejected', { revoked_at: new Date().toISOString() });
  await attemptInsertWithOverride('attack: explicit expires_at is rejected', { expires_at: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString() });
  await attemptInsertWithOverride('attack: explicit created_at is rejected', { created_at: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString() });

  console.log('\n=== Creation authority — row authorization (RLS) attacks ===\n');

  {
    const { error } = await ownerA.client
      .from('household_invites')
      .insert({ household_id: HOUSEHOLD_A_ID, code: generateInviteCode(), role: 'child', created_by_profile_id: childA.userId });
    reportRejection('attack: forged created_by_profile_id is rejected', error, RLS_CATEGORIES);
  }
  {
    const { error } = await childA.client
      .from('household_invites')
      .insert({ household_id: HOUSEHOLD_A_ID, code: generateInviteCode(), role: 'child', created_by_profile_id: childA.userId });
    reportRejection('attack: Child cannot create an invite', error, RLS_CATEGORIES);
  }
  {
    const { error } = await ownerA.client
      .from('household_invites')
      .insert({ household_id: HOUSEHOLD_B_ID, code: generateInviteCode(), role: 'child', created_by_profile_id: ownerA.userId });
    reportRejection('attack: Owner A cannot create an invite for Household B', error, RLS_CATEGORIES);
  }

  console.log('\n=== Post-creation mutation authority — general UPDATE must not exist ===\n');

  async function attemptUpdate(name, patch) {
    const { error } = await ownerA.client
      .from('household_invites')
      .update(patch)
      .eq('id', targetInvite.id);
    reportRejection(name, error, PRIVILEGE_CATEGORIES);
  }

  await attemptUpdate('attack: direct UPDATE role', { role: 'admin' });
  await attemptUpdate('attack: direct UPDATE redemption_count', { redemption_count: 0 });
  await attemptUpdate('attack: direct UPDATE household_id', { household_id: HOUSEHOLD_B_ID });
  await attemptUpdate('attack: direct UPDATE code', { code: generateInviteCode() });
  await attemptUpdate('attack: direct UPDATE expires_at', { expires_at: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString() });
  await attemptUpdate('attack: direct UPDATE created_by_profile_id', { created_by_profile_id: childA.userId });
  await attemptUpdate('attack: direct UPDATE created_at', { created_at: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString() });
  await attemptUpdate('attack: direct UPDATE revoked_at to NULL', { revoked_at: null });
  await attemptUpdate('attack: direct UPDATE id', { id: randomUUID() });

  console.log('\n=== Revoke RPC authorization ===\n');

  {
    const { error } = await ownerB.client.rpc('revoke_household_invite', { p_invite_id: targetInvite.id });
    reportRejection('cross-household revoke (Owner B on Household A invite) is rejected', error, new Set(['rpc_authorization']));
  }
  {
    const { error } = await childA.client.rpc('revoke_household_invite', { p_invite_id: targetInvite.id });
    reportRejection('non-owner/admin (Child A) revoke is rejected', error, new Set(['rpc_authorization']));
  }
  {
    const { error } = await anon.rpc('revoke_household_invite', { p_invite_id: targetInvite.id });
    reportRejection('anonymous revoke is rejected', error, EXECUTE_DENIED_CATEGORIES);
  }

  console.log('\n=== Revoke terminal / idempotent timestamp behavior ===\n');

  let firstRevokedAt = null;
  let secondRevokedAt = null;

  {
    const { data, error } = await ownerA.client.rpc('revoke_household_invite', { p_invite_id: targetInvite.id });
    reportSuccess('Owner A can revoke their own household\'s invite', error, !!data);
  }
  {
    const { data, error } = await ownerA.client
      .from('household_invites')
      .select('revoked_at')
      .eq('id', targetInvite.id)
      .single();
    if (error || !data?.revoked_at) {
      failCount++;
      console.log(`FAIL  read persisted revoked_at after first revoke — ${sanitize(error?.message) ?? 'no revoked_at value'}`);
    } else {
      passCount++;
      firstRevokedAt = data.revoked_at;
      console.log('PASS  read persisted revoked_at after first revoke');
    }
  }
  {
    const { data, error } = await ownerA.client.rpc('revoke_household_invite', { p_invite_id: targetInvite.id });
    reportSuccess('repeat revoke does not error (idempotent call)', error, !!data);
  }
  {
    const { data, error } = await ownerA.client
      .from('household_invites')
      .select('revoked_at')
      .eq('id', targetInvite.id)
      .single();
    if (error || !data?.revoked_at) {
      failCount++;
      console.log(`FAIL  read persisted revoked_at after second revoke — ${sanitize(error?.message) ?? 'no revoked_at value'}`);
    } else {
      secondRevokedAt = data.revoked_at;
      if (firstRevokedAt && secondRevokedAt === firstRevokedAt) {
        passCount++;
        console.log('PASS  persisted revoked_at is byte-identical before and after the repeat revoke — original timestamp was never rewritten');
      } else {
        failCount++;
        console.log('FAIL  persisted revoked_at CHANGED on repeat revoke — this is a real defect (revocation must be terminal)');
      }
    }
  }

  console.log(`\n${passCount} passed, ${failCount} failed\n`);
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Harness error:', sanitize(err.message));
  process.exit(1);
});
