// Direct-fetch coverage for fetchTaskCompletionEvidence — the public
// repository function with no caller-controlled fields. This test file
// runs in its own child process (node --test default isolation = process
// per file), so setting EXPO_PUBLIC_SUPABASE_* here cannot leak into other
// test files or the main repo test file. The dynamic imports below trigger
// first-eval of @/lib/supabaseConfig and @/lib/supabase inside this
// process with the configured-env values in place, so `supabase` becomes
// non-null and the public function's real algorithm (session resolution
// → access_token ?? supabaseKey → direct POST to the Edge Function
// endpoint derived from supabaseUrl → response.blob() on success) is
// what the tests actually drive.
//
// No code is modified. The production function remains exactly:
//   fetchTaskCompletionEvidence(submissionId: string): Promise<EdgeFunctionResult<Blob>>
// — no caller-substitutable endpoint/apikey/bearer/fetch. The tests
// control the environment, not the API surface.

import test, { after, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js';

// Deterministic test-only values. Not real credentials, not the QA
// project, not the Production project. Only exist so supabaseConfig
// resolves `isSupabaseConfigured === true` and the module-level supabase
// client instantiates inside this isolated test process.
const TEST_SUPABASE_URL = 'https://test.example.supabase.co';
const TEST_SUPABASE_ANON_KEY = 'local-test-anon-key-not-a-real-credential';
process.env.EXPO_PUBLIC_SUPABASE_URL = TEST_SUPABASE_URL;
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = TEST_SUPABASE_ANON_KEY;

// Dynamic imports AFTER env setup. Static @/ imports would be ESM-hoisted
// above the env assignments and defeat the setup — this file deliberately
// has no static @/ imports.
const { fetchTaskCompletionEvidence } = await import('@/lib/repositories/taskCompletionV2');
const { supabase } = await import('@/lib/supabase');
if (!supabase) {
  throw new Error('test setup failed: expected supabase to be non-null in configured mode');
}

const EXPECTED_URL = `${TEST_SUPABASE_URL}/functions/v1/task-completion-evidence`;
const SUBMISSION_ID = '6b30ca5e-80c1-42db-a7ef-b891af524dba';

// Deterministic 1x1 red PNG. Same formula as QA-02/QA-03/QA-05 harnesses.
const PNG_HEX =
  '89504e470d0a1a0a0000000d49484452000000010000000108020000' +
  '00907753de0000000c4944415408d7636820000000020001e221bc' +
  '330000000049454e44ae426082';
const PNG_BYTES = new Uint8Array(Buffer.from(PNG_HEX, 'hex'));
const PNG_SHA256 = createHash('sha256').update(PNG_BYTES).digest('hex');

type FetchCall = { url: string; init: RequestInit | undefined };

// Shared mutable state controlled per-test by beforeEach/afterEach. The
// globalThis.fetch replacement below is installed ONCE at module load
// and dispatches through this variable; a test that forgets to set it
// hits the hard guard and fails.
let currentFetchStub: ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) | null = null;
const observedFetchCalls: FetchCall[] = [];

const originalFetch = globalThis.fetch;
const guardedFetch: typeof fetch = async (input, init) => {
  if (!currentFetchStub) {
    throw new Error(
      'TEST GUARD: unexpected real fetch call — no stub installed. ' +
      'Every test in this file must set currentFetchStub via beforeEach ' +
      'to a controlled response. Real network requests are forbidden.',
    );
  }
  const url = typeof input === 'string' ? input : (input as URL | Request).toString?.() ?? '';
  observedFetchCalls.push({ url, init });
  return currentFetchStub(input, init);
};
globalThis.fetch = guardedFetch;

// Narrow replacement of supabase.auth.getSession on the instantiated client.
// Confirmed replaceable: SupabaseAuthClient's getSession is a prototype
// method, so an own-property assignment shadows it for this test file only;
// restoreGetSession() puts the prototype method back after each test.
type GetSessionReturn = Awaited<ReturnType<typeof supabase.auth.getSession>>;
const originalGetSession = supabase.auth.getSession.bind(supabase.auth);
function stubGetSession(result: GetSessionReturn): void {
  supabase.auth.getSession = (async () => result) as typeof supabase.auth.getSession;
}
function restoreGetSession(): void {
  supabase.auth.getSession = originalGetSession as typeof supabase.auth.getSession;
}

beforeEach(() => {
  currentFetchStub = null;
  observedFetchCalls.length = 0;
});
afterEach(() => {
  restoreGetSession();
});
after(() => {
  globalThis.fetch = originalFetch;
});

// ── 1. Binary-safe image success ─────────────────────────────────────────
test('fetchTaskCompletionEvidence returns a byte-identical Blob for a 200 image/png response', async () => {
  stubGetSession({
    data: { session: { access_token: 'test-access-token' } as never },
    error: null,
  } as GetSessionReturn);
  currentFetchStub = async () =>
    new Response(PNG_BYTES, { status: 200, headers: { 'Content-Type': 'image/png' } });

  const result = await fetchTaskCompletionEvidence(SUBMISSION_ID);

  assert.equal(result.error, null);
  assert.ok(result.data instanceof Blob);
  assert.equal(result.data!.type, 'image/png');

  const bytes = Buffer.from(await result.data!.arrayBuffer());
  assert.equal(bytes.length, PNG_BYTES.length);
  assert.equal(bytes[0], 0x89);
  assert.equal(bytes[1], 0x50);
  assert.equal(bytes[2], 0x4e);
  assert.equal(bytes[3], 0x47);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), PNG_SHA256);
});

// ── 2. Authenticated request shape ───────────────────────────────────────
test('fetchTaskCompletionEvidence sends the exact approved request shape', async () => {
  stubGetSession({
    data: { session: { access_token: 'session-access-token' } as never },
    error: null,
  } as GetSessionReturn);
  currentFetchStub = async () =>
    new Response(PNG_BYTES, { status: 200, headers: { 'Content-Type': 'image/png' } });

  const result = await fetchTaskCompletionEvidence(SUBMISSION_ID);

  assert.equal(result.error, null);
  assert.equal(observedFetchCalls.length, 1);
  const [{ url, init }] = observedFetchCalls;

  assert.equal(url, EXPECTED_URL);
  assert.equal(init?.method, 'POST');

  const headers = init?.headers as Record<string, string>;
  assert.equal(headers['Content-Type'], 'application/json');
  assert.equal(headers.apikey, TEST_SUPABASE_ANON_KEY);
  assert.equal(headers.Authorization, 'Bearer session-access-token');

  // Body is exactly { submission_id } — no additional fields.
  const parsedBody = JSON.parse(init?.body as string);
  assert.deepEqual(parsedBody, { submission_id: SUBMISSION_ID });
  assert.deepEqual(Object.keys(parsedBody), ['submission_id']);

  // No Storage URL/path, no service-role key, no signed URL — proved by:
  // (a) the body being submission_id only;
  // (b) the headers list being exactly the four above (no additional
  //     service-role, no signed-url-related header);
  // (c) the URL being the Edge Function endpoint, not /storage/v1/.
  assert.ok(!/\bservice_role\b/i.test(JSON.stringify(headers)));
  assert.ok(!/signed/i.test(JSON.stringify(headers)));
  assert.ok(!/storage\/v1/.test(url));
});

// ── 3. Null-session fallback ─────────────────────────────────────────────
test('fetchTaskCompletionEvidence falls back to the configured apikey when getSession returns null', async () => {
  stubGetSession({ data: { session: null }, error: null } as GetSessionReturn);
  currentFetchStub = async () =>
    new Response(PNG_BYTES, { status: 200, headers: { 'Content-Type': 'image/png' } });

  const result = await fetchTaskCompletionEvidence(SUBMISSION_ID);

  assert.equal(result.error, null);
  const headers = observedFetchCalls[0].init?.headers as Record<string, string>;
  assert.equal(headers.Authorization, `Bearer ${TEST_SUPABASE_ANON_KEY}`);
  // This proves the real production `session?.access_token ?? supabaseKey`
  // fallback runs end-to-end inside the PUBLIC function.
});

// ── 4. HTTP error ────────────────────────────────────────────────────────
test('fetchTaskCompletionEvidence maps a non-2xx response to FunctionsHttpError with the Response as context', async () => {
  stubGetSession({
    data: { session: { access_token: 'tok' } as never },
    error: null,
  } as GetSessionReturn);
  currentFetchStub = async () =>
    new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json;charset=UTF-8' },
    });

  const result = await fetchTaskCompletionEvidence(SUBMISSION_ID);

  assert.equal(result.data, null);
  assert.ok(result.error instanceof FunctionsHttpError);
  assert.ok(result.error.context instanceof Response);
  assert.equal(result.error.context.status, 404);

  // Body remains readable from error.context — not pre-consumed.
  const body = await result.error.context.json();
  assert.deepEqual(body, { error: 'not_found' });
});

// ── 5. Relay error ───────────────────────────────────────────────────────
test('fetchTaskCompletionEvidence maps x-relay-error:true to FunctionsRelayError', async () => {
  stubGetSession({
    data: { session: { access_token: 'tok' } as never },
    error: null,
  } as GetSessionReturn);
  currentFetchStub = async () =>
    new Response('', { status: 200, headers: { 'x-relay-error': 'true', 'Content-Type': 'image/png' } });

  const result = await fetchTaskCompletionEvidence(SUBMISSION_ID);

  assert.equal(result.data, null);
  assert.ok(result.error instanceof FunctionsRelayError);
});

// ── 6. Fetch rejection ───────────────────────────────────────────────────
test('fetchTaskCompletionEvidence maps a fetch rejection to FunctionsFetchError, no throw, context preserved', async () => {
  stubGetSession({
    data: { session: { access_token: 'tok' } as never },
    error: null,
  } as GetSessionReturn);
  const thrown = new TypeError('simulated network failure');
  currentFetchStub = async () => { throw thrown; };

  let threw = false;
  let result;
  try {
    result = await fetchTaskCompletionEvidence(SUBMISSION_ID);
  } catch {
    threw = true;
  }

  assert.equal(threw, false, 'public function must not throw on fetch rejection');
  assert.equal(result!.data, null);
  assert.ok(result!.error instanceof FunctionsFetchError);
  assert.equal((result!.error as FunctionsFetchError).context, thrown);
});

// ── 7. Body-consumption rejection ────────────────────────────────────────
test('fetchTaskCompletionEvidence maps a response.blob() rejection to FunctionsFetchError, no throw, context preserved', async () => {
  stubGetSession({
    data: { session: { access_token: 'tok' } as never },
    error: null,
  } as GetSessionReturn);
  const bodyError = new Error('simulated body-consumption failure');
  const failingBody = new ReadableStream({
    start(controller) {
      controller.error(bodyError);
    },
  });
  currentFetchStub = async () =>
    new Response(failingBody, { status: 200, headers: { 'Content-Type': 'image/png' } });

  let threw = false;
  let result;
  try {
    result = await fetchTaskCompletionEvidence(SUBMISSION_ID);
  } catch {
    threw = true;
  }

  assert.equal(threw, false, 'public function must not throw on body-consumption failure');
  assert.equal(result!.data, null);
  assert.ok(result!.error instanceof FunctionsFetchError);
  assert.ok((result!.error as FunctionsFetchError).context !== undefined);
});
