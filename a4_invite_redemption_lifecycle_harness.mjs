// A4 Invite Lifecycle — live QA redemption behavior harness.
//
// Scope:
//   - Child invite is multi-use for distinct NEW members.
//   - Same-user retry is idempotent and does not increment redemption_count.
//   - Adult invite is single-use for NEW members.
//   - Already-member retry succeeds even after Adult invite is exhausted.
//   - Admin invite is single-use under concurrent redemption.
//   - Concurrent NEW redeemers produce at most one new membership.
//
// Authenticated product behavior is exercised through anon-key clients,
// exactly like the application. SERVICE ROLE is used ONLY for temporary
// QA fixture creation, state verification, and cleanup.
//
// Required process environment:
//   QA_SUPABASE_URL
//   QA_SUPABASE_ANON_KEY
//   QA_TEST_PASSWORD
//   QA_OWNER_EMAIL
//   QA_HOUSEHOLD_A_ID
//
// Required .env.local:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// Never run against anything except the approved QA project.

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const APPROVED_QA_HOSTNAME = 'umzfyedxnvtmfnwldwtq.supabase.co';

let passCount = 0;
let failCount = 0;
let cleanupFailures = 0;

function sanitize(message) {
  if (!message) return '';
  return String(message)
    .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, '[redacted-jwt]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

function assertApprovedQaTarget(rawUrl, label) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    console.error(`${label} is not a valid URL. Refusing to make any request.`);
    process.exit(1);
  }

  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== APPROVED_QA_HOSTNAME
  ) {
    console.error(
      `${label} does not point at the approved QA project ` +
      `(expected hostname "${APPROVED_QA_HOSTNAME}"). Refusing to run.`,
    );
    process.exit(1);
  }
}

function loadEnvLocal() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.resolve(__dirname, '.env.local');

  let raw;
  try {
    raw = readFileSync(envPath, 'utf8');
  } catch {
    console.error('Could not read .env.local. Refusing to run.');
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

function pass(name) {
  passCount++;
  console.log(`PASS  ${name}`);
}

function fail(name, detail = '') {
  failCount++;
  console.log(
    `FAIL  ${name}${detail ? ` — ${sanitize(detail)}` : ''}`,
  );
}

function assertTrue(name, condition, detail = '') {
  if (condition) {
    pass(name);
    return true;
  }

  fail(name, detail);
  return false;
}

function failClosed(message) {
  console.error(`PRE-FLIGHT FAILED — ${sanitize(message)}`);
  process.exit(1);
}

// ------------------------------------------------------------------
// Configuration + hard QA guards BEFORE any Supabase client/network.
// ------------------------------------------------------------------

const SUPABASE_URL = requireEnv('QA_SUPABASE_URL');
assertApprovedQaTarget(SUPABASE_URL, 'QA_SUPABASE_URL');

const SUPABASE_ANON_KEY = requireEnv('QA_SUPABASE_ANON_KEY');
const TEST_PASSWORD = requireEnv('QA_TEST_PASSWORD');
const OWNER_EMAIL = requireEnv('QA_OWNER_EMAIL');
const HOUSEHOLD_A_ID = requireEnv('QA_HOUSEHOLD_A_ID');

const localEnv = loadEnvLocal();

const SERVICE_URL = localEnv.SUPABASE_URL;
const SERVICE_ROLE_KEY = localEnv.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.',
  );
  process.exit(1);
}

assertApprovedQaTarget(SERVICE_URL, 'SUPABASE_URL from .env.local');

if (new URL(SERVICE_URL).hostname !== new URL(SUPABASE_URL).hostname) {
  console.error(
    'QA_SUPABASE_URL and .env.local SUPABASE_URL do not target the same project. Refusing to run.',
  );
  process.exit(1);
}

// Clients are constructed only AFTER both URL guards pass.
const service = createClient(SERVICE_URL, SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

// ------------------------------------------------------------------
// Real product invite-code contract.
// ------------------------------------------------------------------

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

function generateInviteCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[
      Math.floor(Math.random() * CODE_ALPHABET.length)
    ];
  }
  return code;
}

// ------------------------------------------------------------------
// Auth helpers.
// ------------------------------------------------------------------

async function signInAs(email) {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });

  if (error || !data.session || !data.user) {
    throw new Error(
      `Sign-in failed for configured identity: ${
        sanitize(error?.message) || 'no session'
      }`,
    );
  }

  return {
    client,
    userId: data.user.id,
    email,
  };
}

async function createTemporaryUser(label, runId) {
  const email =
    `qa-a4-${runId}-${label}@chorehero.test`.toLowerCase();

  const { data, error } = await service.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });

  if (error || !data.user) {
    throw new Error(
      `Could not create temporary QA auth user "${label}": ${
        sanitize(error?.message) || 'no user returned'
      }`,
    );
  }

  return {
    label,
    email,
    userId: data.user.id,
  };
}

// ------------------------------------------------------------------
// Database helpers.
// ------------------------------------------------------------------

async function verifyOwnerMembership(owner) {
  const { data, error } = await owner.client
    .from('household_members')
    .select('role')
    .eq('household_id', HOUSEHOLD_A_ID)
    .eq('profile_id', owner.userId)
    .maybeSingle();

  if (error) {
    failClosed(
      `Owner membership lookup failed: ${sanitize(error.message)}`,
    );
  }

  if (!data || !['owner', 'admin'].includes(data.role)) {
    failClosed(
      'QA_OWNER_EMAIL is not Owner/Admin of QA_HOUSEHOLD_A_ID.',
    );
  }
}

async function createInvite(owner, role) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await owner.client
      .from('household_invites')
      .insert({
        household_id: HOUSEHOLD_A_ID,
        code: generateInviteCode(),
        role,
        created_by_profile_id: owner.userId,
      })
      .select('*')
      .single();

    if (!error && data) return data;

    if (error?.code !== '23505') {
      throw new Error(
        `Could not create ${role} invite: ${sanitize(error?.message)}`,
      );
    }
  }

  throw new Error(
    `Could not create ${role} invite after code-collision retry.`,
  );
}

async function redeemAs(identity, invite, displayName) {
  return identity.client.rpc('redeem_household_invite', {
    p_code: invite.code,
    p_display_name: displayName,
    p_avatar_emoji: null,
  });
}

async function readInvite(owner, inviteId) {
  const { data, error } = await owner.client
    .from('household_invites')
    .select('id, role, redemption_count, revoked_at')
    .eq('id', inviteId)
    .single();

  if (error || !data) {
    throw new Error(
      `Could not read invite state: ${
        sanitize(error?.message) || 'no row returned'
      }`,
    );
  }

  return data;
}

async function readMembership(profileId) {
  const { data, error } = await service
    .from('household_members')
    .select('household_id, profile_id, role')
    .eq('household_id', HOUSEHOLD_A_ID)
    .eq('profile_id', profileId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Could not read membership state: ${sanitize(error.message)}`,
    );
  }

  return data;
}

async function assertMembership(
  name,
  profileId,
  expectedRole,
) {
  const row = await readMembership(profileId);

  assertTrue(
    name,
    !!row && row.role === expectedRole,
    row
      ? `expected role "${expectedRole}", found "${row.role}"`
      : 'membership row missing',
  );
}

async function assertNoMembership(name, profileId) {
  const row = await readMembership(profileId);

  assertTrue(
    name,
    row === null,
    row
      ? `unexpected membership exists with role "${row.role}"`
      : '',
  );
}

async function assertRedemptionCount(
  owner,
  invite,
  expected,
  name,
) {
  const row = await readInvite(owner, invite.id);

  assertTrue(
    name,
    row.redemption_count === expected,
    `expected redemption_count=${expected}, actual=${row.redemption_count}`,
  );
}

async function revokeInvite(owner, invite) {
  if (!invite) return;

  const { error } = await owner.client.rpc(
    'revoke_household_invite',
    { p_invite_id: invite.id },
  );

  if (error) {
    cleanupFailures++;
    console.log(
      `CLEANUP FAIL  could not revoke ${invite.role} invite — ${sanitize(error.message)}`,
    );
  } else {
    console.log(
      `CLEANUP PASS  revoked ${invite.role} invite`,
    );
  }
}

// ------------------------------------------------------------------
// Cleanup — SERVICE ROLE only, restricted to users created by THIS run.
// ------------------------------------------------------------------

async function cleanupTemporaryUser(tempUser) {
  if (!tempUser?.userId) return;

  try {
    const { error } = await service
      .from('household_members')
      .delete()
      .eq('profile_id', tempUser.userId);

    if (error) {
      cleanupFailures++;
      console.log(
        `CLEANUP FAIL  membership cleanup for ${tempUser.label} — ${sanitize(error.message)}`,
      );
    }
  } catch (error) {
    cleanupFailures++;
    console.log(
      `CLEANUP FAIL  membership cleanup for ${tempUser.label} — ${sanitize(error.message)}`,
    );
  }

  try {
    const { error } = await service
      .from('profiles')
      .delete()
      .eq('id', tempUser.userId);

    if (error) {
      cleanupFailures++;
      console.log(
        `CLEANUP FAIL  profile cleanup for ${tempUser.label} — ${sanitize(error.message)}`,
      );
    }
  } catch (error) {
    cleanupFailures++;
    console.log(
      `CLEANUP FAIL  profile cleanup for ${tempUser.label} — ${sanitize(error.message)}`,
    );
  }

  try {
    const { error } =
      await service.auth.admin.deleteUser(tempUser.userId);

    if (error) {
      cleanupFailures++;
      console.log(
        `CLEANUP FAIL  auth cleanup for ${tempUser.label} — ${sanitize(error.message)}`,
      );
    }
  } catch (error) {
    cleanupFailures++;
    console.log(
      `CLEANUP FAIL  auth cleanup for ${tempUser.label} — ${sanitize(error.message)}`,
    );
  }
}

// ------------------------------------------------------------------
// Main lifecycle tests.
// ------------------------------------------------------------------

async function main() {
  const runId =
    `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;

  const temporaryUsers = [];
  const createdInvites = [];
  let owner = null;

  try {
    console.log(
      '=== A4 Invite Redemption Lifecycle — QA pre-flight ===\n',
    );

    owner = await signInAs(OWNER_EMAIL);
    await verifyOwnerMembership(owner);

    console.log(
      'Pre-flight passed — approved QA target and Owner A membership verified.\n',
    );

    const labels = [
      'child-one',
      'child-two',
      'adult-one',
      'adult-two',
      'admin-one',
      'admin-two',
    ];

    for (const label of labels) {
      temporaryUsers.push(
        await createTemporaryUser(label, runId),
      );
    }

    const signed = {};
    for (const temp of temporaryUsers) {
      signed[temp.label] = {
        ...(await signInAs(temp.email)),
        label: temp.label,
      };
    }

    console.log(
      'Temporary redeemer identities created and authenticated (credentials not printed).\n',
    );

    // ==========================================================
    // CHILD — multi-use + same-user idempotent retry.
    // ==========================================================

    console.log(
      '=== Child invite — multi-use + retry idempotency ===\n',
    );

    const childInvite = await createInvite(owner, 'child');
    createdInvites.push(childInvite);

    assertTrue(
      'Child invite starts with redemption_count=0',
      childInvite.redemption_count === 0,
      `actual=${childInvite.redemption_count}`,
    );

    {
      const { data, error } = await redeemAs(
        signed['child-one'],
        childInvite,
        'Lifecycle Child One',
      );

      assertTrue(
        'first NEW user redeems Child invite',
        !error && data === HOUSEHOLD_A_ID,
        error?.message || `unexpected return value: ${data}`,
      );
    }

    await assertMembership(
      'first Child redeemer receives Child membership',
      signed['child-one'].userId,
      'child',
    );

    await assertRedemptionCount(
      owner,
      childInvite,
      1,
      'Child redemption_count becomes 1 after first NEW membership',
    );

    {
      const { data, error } = await redeemAs(
        signed['child-one'],
        childInvite,
        'Lifecycle Child One',
      );

      assertTrue(
        'same Child user can retry redeem successfully',
        !error && data === HOUSEHOLD_A_ID,
        error?.message || `unexpected return value: ${data}`,
      );
    }

    await assertRedemptionCount(
      owner,
      childInvite,
      1,
      'same-user Child retry does NOT increment redemption_count',
    );

    {
      const { data, error } = await redeemAs(
        signed['child-two'],
        childInvite,
        'Lifecycle Child Two',
      );

      assertTrue(
        'second distinct NEW user redeems same Child invite',
        !error && data === HOUSEHOLD_A_ID,
        error?.message || `unexpected return value: ${data}`,
      );
    }

    await assertMembership(
      'second Child redeemer receives Child membership',
      signed['child-two'].userId,
      'child',
    );

    await assertRedemptionCount(
      owner,
      childInvite,
      2,
      'Child redemption_count becomes 2 after two NEW memberships',
    );

    // ==========================================================
    // ADULT — single-use + already-member retry before exhaustion.
    // ==========================================================

    console.log(
      '\n=== Adult invite — single-use + already-member retry ===\n',
    );

    const adultInvite = await createInvite(owner, 'adult');
    createdInvites.push(adultInvite);

    {
      const { data, error } = await redeemAs(
        signed['adult-one'],
        adultInvite,
        'Lifecycle Adult One',
      );

      assertTrue(
        'first NEW user redeems Adult invite',
        !error && data === HOUSEHOLD_A_ID,
        error?.message || `unexpected return value: ${data}`,
      );
    }

    await assertMembership(
      'first Adult redeemer receives Adult membership',
      signed['adult-one'].userId,
      'adult',
    );

    await assertRedemptionCount(
      owner,
      adultInvite,
      1,
      'Adult redemption_count becomes 1 after first NEW membership',
    );

    {
      const { data, error } = await redeemAs(
        signed['adult-one'],
        adultInvite,
        'Lifecycle Adult One',
      );

      assertTrue(
        'already-member Adult retry succeeds even though invite is exhausted for NEW users',
        !error && data === HOUSEHOLD_A_ID,
        error?.message || `unexpected return value: ${data}`,
      );
    }

    await assertRedemptionCount(
      owner,
      adultInvite,
      1,
      'already-member Adult retry does NOT increment redemption_count',
    );

    {
      const { error } = await redeemAs(
        signed['adult-two'],
        adultInvite,
        'Lifecycle Adult Two',
      );

      assertTrue(
        'second distinct NEW user is rejected specifically as exhausted',
        error?.code === '28000' &&
          error?.message === 'Invite has already been used',
        `unexpected error: code=${error?.code ?? 'none'} message=${
          sanitize(error?.message) || 'none'
        }`,
      );
    }

    await assertNoMembership(
      'rejected second Adult user receives no Household A membership',
      signed['adult-two'].userId,
    );

    await assertRedemptionCount(
      owner,
      adultInvite,
      1,
      'failed second Adult redemption leaves redemption_count at 1',
    );

    // ==========================================================
    // ADMIN — concurrent single-use serialization.
    // ==========================================================

    console.log(
      '\n=== Admin invite — concurrent single-use serialization ===\n',
    );

    const adminInvite = await createInvite(owner, 'admin');
    createdInvites.push(adminInvite);

    const concurrentResults = await Promise.all([
      redeemAs(
        signed['admin-one'],
        adminInvite,
        'Lifecycle Admin One',
      ),
      redeemAs(
        signed['admin-two'],
        adminInvite,
        'Lifecycle Admin Two',
      ),
    ]);

    const successfulIndexes = concurrentResults
      .map((result, index) => ({ result, index }))
      .filter(({ result }) => !result.error)
      .map(({ index }) => index);

    const failedIndexes = concurrentResults
      .map((result, index) => ({ result, index }))
      .filter(({ result }) => !!result.error)
      .map(({ index }) => index);

    assertTrue(
      'concurrent Admin redemption produces exactly one successful RPC',
      successfulIndexes.length === 1,
      `successful RPC count=${successfulIndexes.length}`,
    );

    assertTrue(
      'concurrent Admin redemption produces exactly one rejected RPC',
      failedIndexes.length === 1,
      `rejected RPC count=${failedIndexes.length}`,
    );

    const rejectedAdminResult =
      failedIndexes.length === 1
        ? concurrentResults[failedIndexes[0]]
        : null;

    assertTrue(
      'concurrent Admin loser is rejected specifically as exhausted',
      rejectedAdminResult?.error?.code === '28000' &&
        rejectedAdminResult.error.message === 'Invite has already been used',
      `unexpected error: code=${
        rejectedAdminResult?.error?.code ?? 'none'
      } message=${
        sanitize(rejectedAdminResult?.error?.message) || 'none'
      }`,
    );

    const adminOneMembership = await readMembership(
      signed['admin-one'].userId,
    );

    const adminTwoMembership = await readMembership(
      signed['admin-two'].userId,
    );

    const adminMemberships = [
      adminOneMembership,
      adminTwoMembership,
    ].filter(
      (row) => row && row.role === 'admin',
    );

    assertTrue(
      'concurrent Admin redemption creates exactly one NEW Admin membership',
      adminMemberships.length === 1,
      `admin membership count=${adminMemberships.length}`,
    );

    await assertRedemptionCount(
      owner,
      adminInvite,
      1,
      'concurrent Admin redemption increments redemption_count exactly once',
    );

    console.log(
      `\n=== Test summary ===\n\n${passCount} passed, ${failCount} failed\n`,
    );
  } finally {
    console.log('=== Cleanup ===\n');

    if (owner) {
      for (const invite of createdInvites) {
        await revokeInvite(owner, invite);
      }
    }

    for (const temp of temporaryUsers.reverse()) {
      await cleanupTemporaryUser(temp);
    }

    console.log(
      `\nCleanup failures: ${cleanupFailures}\n`,
    );
  }

  process.exit(
    failCount > 0 || cleanupFailures > 0 ? 1 : 0,
  );
}

main().catch((error) => {
  console.error(
    'Harness error:',
    sanitize(error?.message || String(error)),
  );
  process.exit(1);
});