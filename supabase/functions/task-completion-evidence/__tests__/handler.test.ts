import assert from 'node:assert/strict';
import test from 'node:test';

import type { SupabaseClient } from '@supabase/supabase-js';
import { handleTaskCompletionEvidenceRequest } from '../handler.ts';

// Minimal fakes matching only the exact chain this handler calls —
// ctx.supabase.from(...).select(...).eq(...).maybeSingle() and
// ctx.supabaseAdmin.storage.from(...).download(...). Typed `as unknown as
// SupabaseClient` deliberately: a full SupabaseClient mock would be far
// larger than what this handler actually touches, and the type-only import
// in handler.ts means nothing beyond this shape is ever exercised.

interface FakeSelectResult {
  data: { id: string; photo_storage_path: string | null } | null;
  error: { message: string } | null;
}

function makeFakeCallerClient(
  result: FakeSelectResult,
  captured: { table?: string; column?: string; value?: string } = {},
): SupabaseClient {
  return {
    from(table: string) {
      captured.table = table;
      return {
        select(_columns: string) {
          return {
            eq(column: string, value: string) {
              captured.column = column;
              captured.value = value;
              return {
                async maybeSingle() {
                  return result;
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

// Admin client's .from() throws if ever called — strict enforcement of
// "no service-role query used for authorization" (§3/§7 of the spec).
function makeFakeAdminClient(
  downloadResult: { data: Blob | null; error: { message: string } | null },
  captured: { bucket?: string; path?: string } = {},
): SupabaseClient {
  return {
    from() {
      throw new Error('supabaseAdmin.from() must never be called for authorization');
    },
    storage: {
      from(bucket: string) {
        captured.bucket = bucket;
        return {
          async download(path: string) {
            captured.path = path;
            return downloadResult;
          },
        };
      },
    },
  } as unknown as SupabaseClient;
}

function makeRequest(body: unknown, { method = 'POST', rawBody }: { method?: string; rawBody?: string } = {}): Request {
  return new Request('https://example.test/task-completion-evidence', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
}

const VALID_SUBMISSION_ID = '11111111-1111-1111-1111-111111111111';
const VALID_PATH = 'H_A/T01/child-uid/OBJ1';

test('non-POST method returns 405', async () => {
  const supabase = makeFakeCallerClient({ data: null, error: null });
  const supabaseAdmin = makeFakeAdminClient({ data: null, error: null });
  const res = await handleTaskCompletionEvidenceRequest(
    new Request('https://example.test/x', { method: 'GET' }),
    { supabase, supabaseAdmin },
  );
  assert.equal(res.status, 405);
});

test('malformed JSON body returns 400', async () => {
  const supabase = makeFakeCallerClient({ data: null, error: null });
  const supabaseAdmin = makeFakeAdminClient({ data: null, error: null });
  const req = makeRequest(undefined, { rawBody: '{not valid json' });
  const res = await handleTaskCompletionEvidenceRequest(req, { supabase, supabaseAdmin });
  assert.equal(res.status, 400);
});

test('missing submission_id returns 400', async () => {
  const supabase = makeFakeCallerClient({ data: null, error: null });
  const supabaseAdmin = makeFakeAdminClient({ data: null, error: null });
  const res = await handleTaskCompletionEvidenceRequest(makeRequest({}), { supabase, supabaseAdmin });
  assert.equal(res.status, 400);
});

test('non-UUID submission_id returns 400', async () => {
  const supabase = makeFakeCallerClient({ data: null, error: null });
  const supabaseAdmin = makeFakeAdminClient({ data: null, error: null });
  const res = await handleTaskCompletionEvidenceRequest(
    makeRequest({ submission_id: 'not-a-uuid' }),
    { supabase, supabaseAdmin },
  );
  assert.equal(res.status, 400);
});

test('submission not visible under caller RLS returns 404, and admin Storage is never touched', async () => {
  const supabase = makeFakeCallerClient({ data: null, error: null });
  const adminCaptured: { bucket?: string; path?: string } = {};
  const supabaseAdmin = makeFakeAdminClient({ data: null, error: null }, adminCaptured);

  const res = await handleTaskCompletionEvidenceRequest(
    makeRequest({ submission_id: VALID_SUBMISSION_ID }),
    { supabase, supabaseAdmin },
  );

  assert.equal(res.status, 404);
  assert.equal(adminCaptured.path, undefined); // storage.download was never called
});

test('visible submission with no photo_storage_path returns 404 (same shape as not-found)', async () => {
  const supabase = makeFakeCallerClient({
    data: { id: VALID_SUBMISSION_ID, photo_storage_path: null },
    error: null,
  });
  const adminCaptured: { bucket?: string; path?: string } = {};
  const supabaseAdmin = makeFakeAdminClient({ data: null, error: null }, adminCaptured);

  const res = await handleTaskCompletionEvidenceRequest(
    makeRequest({ submission_id: VALID_SUBMISSION_ID }),
    { supabase, supabaseAdmin },
  );

  assert.equal(res.status, 404);
  assert.equal(adminCaptured.path, undefined);
});

test('visible submission with a photo returns 200 with the exact bytes, and admin Storage is called only after authorization succeeds', async () => {
  const supabase = makeFakeCallerClient({
    data: { id: VALID_SUBMISSION_ID, photo_storage_path: VALID_PATH },
    error: null,
  });
  const imageBytes = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/jpeg' });
  const adminCaptured: { bucket?: string; path?: string } = {};
  const supabaseAdmin = makeFakeAdminClient({ data: imageBytes, error: null }, adminCaptured);

  const res = await handleTaskCompletionEvidenceRequest(
    makeRequest({ submission_id: VALID_SUBMISSION_ID }),
    { supabase, supabaseAdmin },
  );

  assert.equal(res.status, 200);
  assert.equal(adminCaptured.bucket, 'task-completion-evidence');
  assert.equal(adminCaptured.path, VALID_PATH); // path came from the DB row
  const received = await res.arrayBuffer();
  assert.deepEqual(Array.from(new Uint8Array(received)), [1, 2, 3, 4]);
});

test('an additional top-level field (e.g. a rogue photo_storage_path) is rejected outright — 400, never reaching authorization or Storage', async () => {
  const callerCaptured: { table?: string } = {};
  const supabase = makeFakeCallerClient(
    { data: { id: VALID_SUBMISSION_ID, photo_storage_path: VALID_PATH }, error: null },
    callerCaptured,
  );
  const adminCaptured: { bucket?: string; path?: string } = {};
  const supabaseAdmin = makeFakeAdminClient(
    { data: new Blob([new Uint8Array([9])], { type: 'image/png' }), error: null },
    adminCaptured,
  );

  const res = await handleTaskCompletionEvidenceRequest(
    makeRequest({ submission_id: VALID_SUBMISSION_ID, photo_storage_path: 'H_B/some-other-task/attacker-uid/OBJ9' }),
    { supabase, supabaseAdmin },
  );

  assert.equal(res.status, 400);
  assert.equal(callerCaptured.table, undefined); // authorization query never ran
  assert.equal(adminCaptured.path, undefined);   // admin Storage read never ran
});

test('an extra unrelated field is rejected the same way, even with no forbidden field name involved', async () => {
  const supabase = makeFakeCallerClient({ data: null, error: null });
  const supabaseAdmin = makeFakeAdminClient({ data: null, error: null });

  const res = await handleTaskCompletionEvidenceRequest(
    makeRequest({ submission_id: VALID_SUBMISSION_ID, debug: true }),
    { supabase, supabaseAdmin },
  );

  assert.equal(res.status, 400);
});

test('Storage download failure returns 500', async () => {
  const supabase = makeFakeCallerClient({
    data: { id: VALID_SUBMISSION_ID, photo_storage_path: VALID_PATH },
    error: null,
  });
  const supabaseAdmin = makeFakeAdminClient({ data: null, error: { message: 'object not found' } });

  const res = await handleTaskCompletionEvidenceRequest(
    makeRequest({ submission_id: VALID_SUBMISSION_ID }),
    { supabase, supabaseAdmin },
  );

  assert.equal(res.status, 500);
});

test('caller-scoped authorization query error returns 500 (distinct from not-found)', async () => {
  const supabase = makeFakeCallerClient({ data: null, error: { message: 'connection reset' } });
  const adminCaptured: { bucket?: string; path?: string } = {};
  const supabaseAdmin = makeFakeAdminClient({ data: null, error: null }, adminCaptured);

  const res = await handleTaskCompletionEvidenceRequest(
    makeRequest({ submission_id: VALID_SUBMISSION_ID }),
    { supabase, supabaseAdmin },
  );

  assert.equal(res.status, 500);
  assert.equal(adminCaptured.path, undefined);
});

test('Content-Type is preserved from the downloaded blob', async () => {
  const supabase = makeFakeCallerClient({
    data: { id: VALID_SUBMISSION_ID, photo_storage_path: VALID_PATH },
    error: null,
  });
  const imageBytes = new Blob([new Uint8Array([1])], { type: 'image/webp' });
  const supabaseAdmin = makeFakeAdminClient({ data: imageBytes, error: null });

  const res = await handleTaskCompletionEvidenceRequest(
    makeRequest({ submission_id: VALID_SUBMISSION_ID }),
    { supabase, supabaseAdmin },
  );

  assert.equal(res.headers.get('Content-Type'), 'image/webp');
});

// Shared header assertion — every handler-generated response (success or
// failure) must carry all four hardening headers identically.
function assertHardenedHeaders(res: Response): void {
  assert.equal(res.headers.get('Cache-Control'), 'private, no-store, max-age=0');
  assert.equal(res.headers.get('Pragma'), 'no-cache');
  assert.equal(res.headers.get('Vary'), 'Authorization');
  assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
}

test('200 image response carries all hardened headers', async () => {
  const supabase = makeFakeCallerClient({
    data: { id: VALID_SUBMISSION_ID, photo_storage_path: VALID_PATH },
    error: null,
  });
  const imageBytes = new Blob([new Uint8Array([1])], { type: 'image/jpeg' });
  const supabaseAdmin = makeFakeAdminClient({ data: imageBytes, error: null });

  const res = await handleTaskCompletionEvidenceRequest(
    makeRequest({ submission_id: VALID_SUBMISSION_ID }),
    { supabase, supabaseAdmin },
  );

  assert.equal(res.status, 200);
  assertHardenedHeaders(res);
});

test('404 (not-found/not-visible) response carries all hardened headers', async () => {
  const supabase = makeFakeCallerClient({ data: null, error: null });
  const supabaseAdmin = makeFakeAdminClient({ data: null, error: null });

  const res = await handleTaskCompletionEvidenceRequest(
    makeRequest({ submission_id: VALID_SUBMISSION_ID }),
    { supabase, supabaseAdmin },
  );

  assert.equal(res.status, 404);
  assertHardenedHeaders(res);
});

test('400 (validation failure) response carries all hardened headers', async () => {
  const supabase = makeFakeCallerClient({ data: null, error: null });
  const supabaseAdmin = makeFakeAdminClient({ data: null, error: null });

  const res = await handleTaskCompletionEvidenceRequest(
    makeRequest({ submission_id: 'not-a-uuid' }),
    { supabase, supabaseAdmin },
  );

  assert.equal(res.status, 400);
  assertHardenedHeaders(res);
});

test('500 (internal error) response carries all hardened headers', async () => {
  const supabase = makeFakeCallerClient({
    data: { id: VALID_SUBMISSION_ID, photo_storage_path: VALID_PATH },
    error: null,
  });
  const supabaseAdmin = makeFakeAdminClient({ data: null, error: { message: 'object not found' } });

  const res = await handleTaskCompletionEvidenceRequest(
    makeRequest({ submission_id: VALID_SUBMISSION_ID }),
    { supabase, supabaseAdmin },
  );

  assert.equal(res.status, 500);
  assertHardenedHeaders(res);
});

test('no service-role query is used for authorization — supabaseAdmin.from() throws if ever called', async () => {
  const supabase = makeFakeCallerClient({
    data: { id: VALID_SUBMISSION_ID, photo_storage_path: VALID_PATH },
    error: null,
  });
  const imageBytes = new Blob([new Uint8Array([1])], { type: 'image/jpeg' });
  const supabaseAdmin = makeFakeAdminClient({ data: imageBytes, error: null });

  // Would throw (failing the test) if the handler ever called
  // supabaseAdmin.from(...) for anything — it must only ever use
  // supabaseAdmin.storage.from(...).download(...), and only ctx.supabase
  // (the caller-scoped client) for the authorization SELECT.
  const res = await handleTaskCompletionEvidenceRequest(
    makeRequest({ submission_id: VALID_SUBMISSION_ID }),
    { supabase, supabaseAdmin },
  );

  assert.equal(res.status, 200);
});

// ── Multi-photo: photo_index (photos 2..5) ──────────────────────────────────

// Admin client that also resolves extra-photo paths. Records every call so
// tests can prove it is reached only after caller-scoped authorization.
function makeFakeAdminWithExtras(
  extras: Record<number, string>,
  calls: string[],
  { extraError = null }: { extraError?: { message: string } | null } = {},
): SupabaseClient {
  return {
    from(table: string) {
      calls.push(`from:${table}`);
      const filters: Record<string, unknown> = {};
      const chain = {
        select(_c: string) { return chain; },
        eq(col: string, val: unknown) { filters[col] = val; return chain; },
        async maybeSingle() {
          calls.push(`extra:${String(filters.submission_id)}:${String(filters.position)}`);
          if (extraError) return { data: null, error: extraError };
          const p = extras[filters.position as number];
          return { data: p ? { storage_path: p } : null, error: null };
        },
      };
      return chain;
    },
    storage: {
      from(_bucket: string) {
        return {
          async download(path: string) {
            calls.push(`download:${path}`);
            return { data: new Blob([new Uint8Array([7, 7])], { type: 'image/png' }), error: null };
          },
        };
      },
    },
  } as unknown as SupabaseClient;
}

test('photo_index omitted or 0 serves photo 1 and never queries the extras table', async () => {
  for (const body of [{ submission_id: VALID_SUBMISSION_ID }, { submission_id: VALID_SUBMISSION_ID, photo_index: 0 }]) {
    const calls: string[] = [];
    const res = await handleTaskCompletionEvidenceRequest(makeRequest(body), {
      supabase:      makeFakeCallerClient({ data: { id: VALID_SUBMISSION_ID, photo_storage_path: VALID_PATH }, error: null }),
      supabaseAdmin: makeFakeAdminWithExtras({ 1: 'x' }, calls),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(calls, [`download:${VALID_PATH}`]);
  }
});

test('photo_index 1..4 resolves that position for the AUTHORIZED submission id only, then downloads it', async () => {
  const calls: string[] = [];
  const res = await handleTaskCompletionEvidenceRequest(
    makeRequest({ submission_id: VALID_SUBMISSION_ID, photo_index: 3 }),
    {
      supabase:      makeFakeCallerClient({ data: { id: VALID_SUBMISSION_ID, photo_storage_path: VALID_PATH }, error: null }),
      supabaseAdmin: makeFakeAdminWithExtras({ 3: 'H_A/T01/child-uid/OBJ4' }, calls),
    },
  );
  assert.equal(res.status, 200);
  assert.deepEqual(calls, [
    'from:task_completion_submission_photos',
    `extra:${VALID_SUBMISSION_ID}:3`,
    'download:H_A/T01/child-uid/OBJ4',
  ]);
  assert.deepEqual(new Uint8Array(await res.arrayBuffer()), new Uint8Array([7, 7]));
});

test('photo_index on a submission the caller cannot see is 404 and never reaches the admin client', async () => {
  const calls: string[] = [];
  const res = await handleTaskCompletionEvidenceRequest(
    makeRequest({ submission_id: VALID_SUBMISSION_ID, photo_index: 1 }),
    { supabase: makeFakeCallerClient({ data: null, error: null }), supabaseAdmin: makeFakeAdminWithExtras({ 1: 'p' }, calls) },
  );
  assert.equal(res.status, 404);
  assert.deepEqual(calls, []);
});

test('photo_index beyond the photos that exist is the same 404; an extras lookup error is 500', async () => {
  const visible = () => makeFakeCallerClient({ data: { id: VALID_SUBMISSION_ID, photo_storage_path: VALID_PATH }, error: null });
  const missing = await handleTaskCompletionEvidenceRequest(
    makeRequest({ submission_id: VALID_SUBMISSION_ID, photo_index: 4 }),
    { supabase: visible(), supabaseAdmin: makeFakeAdminWithExtras({ 1: 'p' }, []) },
  );
  assert.equal(missing.status, 404);
  const broken = await handleTaskCompletionEvidenceRequest(
    makeRequest({ submission_id: VALID_SUBMISSION_ID, photo_index: 1 }),
    { supabase: visible(), supabaseAdmin: makeFakeAdminWithExtras({}, [], { extraError: { message: 'x' } }) },
  );
  assert.equal(broken.status, 500);
});

test('invalid photo_index values are 400 before any query (negative, 5, fraction, string, null)', async () => {
  for (const photo_index of [-1, 5, 1.5, '1', null, true]) {
    const calls: string[] = [];
    const captured: { table?: string } = {};
    const res = await handleTaskCompletionEvidenceRequest(
      makeRequest({ submission_id: VALID_SUBMISSION_ID, photo_index }),
      { supabase: makeFakeCallerClient({ data: null, error: null }, captured), supabaseAdmin: makeFakeAdminWithExtras({}, calls) },
    );
    assert.equal(res.status, 400, `photo_index=${JSON.stringify(photo_index)}`);
    assert.equal(captured.table, undefined);
    assert.deepEqual(calls, []);
  }
});

test('a path-like field next to photo_index is still rejected outright', async () => {
  const res = await handleTaskCompletionEvidenceRequest(
    makeRequest({ submission_id: VALID_SUBMISSION_ID, photo_index: 1, storage_path: 'H/T/U/O' }),
    { supabase: makeFakeCallerClient({ data: null, error: null }), supabaseAdmin: makeFakeAdminWithExtras({}, []) },
  );
  assert.equal(res.status, 400);
});
