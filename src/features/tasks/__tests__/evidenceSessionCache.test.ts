import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { createEvidenceSessionCache, type EvidenceFetchResult } from '@/features/tasks/evidenceSessionCache';
import type { EvidenceCacheFs } from '@/features/tasks/evidenceCacheFile';

const CACHE = 'file:///data/user/0/app/cache/';

function memFs() {
  const files = new Map<string, Uint8Array>();
  const fs: EvidenceCacheFs = {
    write(name, bytes) { const uri = CACHE + name; files.set(uri, new Uint8Array(bytes)); return uri; },
    remove(uri) { files.delete(uri); },
    list(prefix) { return [...files.keys()].filter((u) => u.slice(CACHE.length).startsWith(prefix)); },
  };
  return { fs, files };
}

function setup(opts: { limits?: { maxEntries: number; maxBytes: number }; fetch?: (id: string, i: number) => Promise<EvidenceFetchResult> } = {}) {
  const m = memFs();
  const fetches: string[] = [];
  let n = 0;
  const cache = createEvidenceSessionCache({
    fs: m.fs,
    generateId: () => `uuid-${++n}`,
    fetch: opts.fetch ?? (async (id, i) => {
      fetches.push(`${id}#${i}`);
      return { ok: true, data: { bytes: new Uint8Array([1, 2, 3, i]).buffer, mimeType: 'image/jpeg' } };
    }),
  }, opts.limits);
  return { cache, fetches, ...m };
}

test('first authorized open loads + caches; reopening the same photo in the session reuses the file (no refetch, no rewrite)', async () => {
  const { cache, fetches, files } = setup();
  const a = await cache.load('sub-1', 0);
  const b = await cache.load('sub-1', 0);
  assert.ok(a.ok && b.ok);
  assert.equal(a.ok && a.uri, b.ok && b.uri);
  assert.deepEqual(fetches, ['sub-1#0']);
  assert.equal(files.size, 1);
});

test('each photo of a multi-photo submission is its own entry', async () => {
  const { cache, fetches } = setup();
  for (let i = 0; i < 5; i++) assert.ok((await cache.load('sub-1', i)).ok);
  assert.deepEqual(fetches, ['sub-1#0', 'sub-1#1', 'sub-1#2', 'sub-1#3', 'sub-1#4']);
  assert.equal(cache.stats().entries, 5);
});

test('concurrent loads of the same photo share ONE fetch', async () => {
  let release!: () => void;
  const fetches: string[] = [];
  const { cache } = setup({ fetch: (id, i) => { fetches.push(`${id}#${i}`); return new Promise((r) => { release = () => r({ ok: true, data: { bytes: new Uint8Array([9]).buffer, mimeType: 'image/png' } }); }); } });
  const p1 = cache.load('s', 0);
  const p2 = cache.load('s', 0);
  release();
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(fetches.length, 1);
  assert.deepEqual(r1, r2);
});

test('a replaced / changed completion is a NEW submission id, so it can never show the old photo', async () => {
  const { cache } = setup();
  const old = await cache.load('sub-OLD', 0);
  const neu = await cache.load('sub-NEW', 0);
  assert.ok(old.ok && neu.ok && old.uri !== neu.uri);
});

test('file names carry only a random id — no submission, task, household or path', async () => {
  const { cache, files } = setup();
  await cache.load('6b30ca5e-80c1-42db-a7ef-b891af524dba', 2);
  const [uri] = [...files.keys()];
  assert.match(uri, /^file:\/\/\/data\/user\/0\/app\/cache\/review-evidence-uuid-\d+\.jpg$/);
  assert.ok(!uri.includes('6b30ca5e'));
});

test('a failed fetch / unsupported type / empty bytes caches nothing, and a retry fetches again', async () => {
  let call = 0;
  const { cache, files } = setup({ fetch: async () => {
    call++;
    if (call === 1) return { ok: false };
    if (call === 2) return { ok: true, data: { bytes: new Uint8Array([1]).buffer, mimeType: 'application/octet-stream' } };
    if (call === 3) return { ok: true, data: { bytes: new ArrayBuffer(0), mimeType: 'image/png' } };
    return { ok: true, data: { bytes: new Uint8Array([1]).buffer, mimeType: 'image/png' } };
  } });
  assert.deepEqual(await cache.load('s', 0), { ok: false });
  assert.deepEqual(await cache.load('s', 0), { ok: false });
  assert.deepEqual(await cache.load('s', 0), { ok: false });
  assert.equal(files.size, 0);
  assert.ok((await cache.load('s', 0)).ok);
});

test('a thrown fetch is a clean failure', async () => {
  const { cache } = setup({ fetch: async () => { throw new Error('offline'); } });
  assert.deepEqual(await cache.load('s', 0), { ok: false });
});

test('eviction: least-recently-used files go first beyond the entry limit; files are deleted', async () => {
  const { cache, files } = setup({ limits: { maxEntries: 2, maxBytes: 1e9 } });
  await cache.load('a', 0);
  await cache.load('b', 0);
  await cache.load('a', 0);          // touch a -> b is now least recent
  await cache.load('c', 0);
  assert.equal(cache.peek('b', 0), null);
  assert.ok(cache.peek('a', 0));
  assert.ok(cache.peek('c', 0));
  assert.equal(files.size, 2);
});

test('eviction never removes a photo that is on screen (pinned) — until it is released', async () => {
  const { cache } = setup({ limits: { maxEntries: 1, maxBytes: 1e9 } });
  await cache.load('shown', 0);
  const unpin = cache.pin('shown', 0);
  await cache.load('other', 0);
  assert.ok(cache.peek('shown', 0), 'pinned file kept');
  unpin();
  unpin(); // double release is harmless
  assert.equal(cache.stats().entries, 1);
});

test('byte budget is enforced (several large photos)', async () => {
  const big = new Uint8Array(6 * 1024 * 1024);
  const { cache } = setup({ limits: { maxEntries: 100, maxBytes: 13 * 1024 * 1024 }, fetch: async () => ({ ok: true, data: { bytes: big.buffer, mimeType: 'image/jpeg' } }) });
  for (const id of ['a', 'b', 'c']) await cache.load(id, 0);
  assert.ok(cache.stats().bytes <= 13 * 1024 * 1024);
  assert.equal(cache.stats().entries, 2);
});

test('a ~17.4 MB photo is cached byte-for-byte and reused', async () => {
  const bytes = new Uint8Array(17_380_000);
  for (let i = 0; i < bytes.length; i += 4093) bytes[i] = i % 251;
  const sha = createHash('sha256').update(bytes).digest('hex');
  let fetches = 0;
  const { cache, files } = setup({ fetch: async () => { fetches++; return { ok: true, data: { bytes: bytes.buffer, mimeType: 'image/jpeg' } }; } });
  const r = await cache.load('big', 0);
  assert.ok(r.ok);
  assert.equal(createHash('sha256').update(files.get(r.ok ? r.uri : '')!).digest('hex'), sha);
  await cache.load('big', 0);
  assert.equal(fetches, 1);
});

test('sign-out / user switch: clear() deletes every file, and a load still in flight stores nothing', async () => {
  let release!: () => void;
  let first = true;
  const { cache, files } = setup({ fetch: () => {
    if (first) { first = false; return Promise.resolve({ ok: true, data: { bytes: new Uint8Array([1]).buffer, mimeType: 'image/png' } }); }
    return new Promise((r) => { release = () => r({ ok: true, data: { bytes: new Uint8Array([2]).buffer, mimeType: 'image/png' } }); });
  } });
  await cache.load('done', 0);
  const late = cache.load('late', 0);
  cache.clear();
  release();
  assert.deepEqual(await late, { ok: false });
  assert.equal(files.size, 0);
  assert.equal(cache.stats().entries, 0);
});

test('leftover evidence files from a previous process are swept on first use', async () => {
  const { cache, files } = setup();
  files.set(CACHE + 'review-evidence-stale.jpg', new Uint8Array([1]));
  files.set(CACHE + 'ImagePicker-unrelated.jpg', new Uint8Array([1]));
  await cache.load('s', 0);
  assert.ok(!files.has(CACHE + 'review-evidence-stale.jpg'));
  assert.ok(files.has(CACHE + 'ImagePicker-unrelated.jpg'));
});

// ── structural: production wiring ───────────────────────────────────────────

const code = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
  .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

test('wiring: cache cleared on any auth-user change; evidence only through the authorized Edge Function', () => {
  const session = code('../evidenceSession.ts');
  assert.ok(session.includes('fetchTaskCompletionEvidence(submissionId, photoIndex)'));
  assert.ok(/next === currentUserId\) return;[\s\S]*evidenceSessionCache\.clear\(\)/.test(session));
  const app = code('../../../../App.tsx');
  assert.ok(app.includes('bindEvidenceCacheToSession()'));
});

test('no public / signed / direct Storage URL anywhere in the evidence read path', () => {
  for (const rel of ['../evidenceSession.ts', '../evidenceSessionCache.ts', '../components/EvidenceGallery.tsx', '../components/TaskReviewEvidenceModal.tsx', '../components/PendingCompletionModal.tsx']) {
    const src = code(rel);
    assert.ok(!/getPublicUrl|createSignedUrl|storage\.from|photo_storage_path|\.blob\(|base64|data:image|FileReader/.test(src), rel);
  }
});
