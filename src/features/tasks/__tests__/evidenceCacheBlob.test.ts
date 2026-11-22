// Web reviewer evidence (WEB-EVID-01): expo-file-system is not supported on
// web, so the web build stores evidence as in-memory Blobs behind blob:
// object URLs (src/lib/evidenceCacheFs.web.ts). The session cache and its
// rules are shared with native; only the storage adapter differs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBlobEvidenceCacheFs, evidenceBlobType, type BlobUrlApi } from '@/features/tasks/evidenceCacheBlob';
import { createEvidenceSessionCache, type EvidenceFetchResult } from '@/features/tasks/evidenceSessionCache';
import { EVIDENCE_CACHE_FILE_PREFIX, writeEvidenceCacheFile } from '@/features/tasks/evidenceCacheFile';

function fakeApi() {
  let n = 0;
  const live = new Map<string, { bytes: Uint8Array; type: string }>();
  const revoked: string[] = [];
  const api: BlobUrlApi = {
    makeBlob: (bytes, type) => ({ bytes, type }) as unknown as Blob,
    createObjectURL: (blob) => {
      const url = `blob:http://localhost/${++n}`;
      live.set(url, blob as unknown as { bytes: Uint8Array; type: string });
      return url;
    },
    revokeObjectURL: (url) => { live.delete(url); revoked.push(url); },
  };
  return { api, live, revoked };
}

const jpeg = (i = 0): EvidenceFetchResult =>
  ({ ok: true, data: { bytes: new Uint8Array([0xff, 0xd8, 0xff, i]).buffer, mimeType: 'image/jpeg' } });

test('blob type follows the extension chosen from the response Content-Type', () => {
  assert.equal(evidenceBlobType('review-evidence-x.jpg'), 'image/jpeg');
  assert.equal(evidenceBlobType('review-evidence-x.png'), 'image/png');
  assert.equal(evidenceBlobType('review-evidence-x.webp'), 'image/webp');
  assert.equal(evidenceBlobType('review-evidence-x.gif'), 'image/gif');
  assert.equal(evidenceBlobType('review-evidence-x.heic'), 'image/heic');
  assert.equal(evidenceBlobType('review-evidence-x.bin'), 'application/octet-stream');
});

test('write -> renderable blob: URL holding the exact bytes and image type; remove revokes it', () => {
  const { api, live, revoked } = fakeApi();
  const fs = createBlobEvidenceCacheFs(api);
  const w = writeEvidenceCacheFile({ bytes: new Uint8Array([1, 2, 3]).buffer, mimeType: 'image/png' }, { fs, generateId: () => 'u1' });
  assert.ok(w.ok);
  const uri = w.ok ? w.uri : '';
  assert.match(uri, /^blob:/);
  assert.deepEqual([...live.get(uri)!.bytes], [1, 2, 3]);
  assert.equal(live.get(uri)!.type, 'image/png');
  assert.deepEqual(fs.list(EVIDENCE_CACHE_FILE_PREFIX), [uri]);
  fs.remove(uri);
  assert.deepEqual(revoked, [uri]);
  assert.deepEqual(fs.list(EVIDENCE_CACHE_FILE_PREFIX), []);
  assert.throws(() => fs.remove(uri)); // already gone, like a deleted file
});

test('real browser-style globals (Node Blob + URL.createObjectURL) produce a fetchable blob: source', async () => {
  const fs = createBlobEvidenceCacheFs();
  const uri = fs.write('review-evidence-u.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0xe0]));
  assert.match(uri, /^blob:/);
  fs.remove(uri);
});

test('session cache on web: 5 photos load as blob: URLs via the authorized fetch, cached, cleared on sign-out', async () => {
  const { api, live, revoked } = fakeApi();
  const fetches: string[] = [];
  let id = 0;
  const cache = createEvidenceSessionCache({
    fs: createBlobEvidenceCacheFs(api),
    generateId: () => `g${++id}`,
    fetch: async (s, i) => { fetches.push(`${s}#${i}`); return jpeg(i); },
  });
  const uris: string[] = [];
  for (let i = 0; i < 5; i++) {
    const r = await cache.load('sub-1', i);
    assert.ok(r.ok);
    if (r.ok) uris.push(r.uri);
  }
  assert.ok(uris.every((u) => u.startsWith('blob:')));
  assert.equal(new Set(uris).size, 5);
  assert.ok(uris.every((u) => live.get(u)?.type === 'image/jpeg'));
  // Reopen: no refetch.
  const again = await cache.load('sub-1', 2);
  assert.ok(again.ok && again.uri === uris[2]);
  assert.equal(fetches.length, 5);
  // Sign-out / user switch revokes every object URL.
  cache.clear();
  assert.equal(live.size, 0);
  assert.deepEqual([...revoked].sort(), [...uris].sort());
});

test('genuine failed evidence fetch still yields the error state (no URL created)', async () => {
  const { api, live } = fakeApi();
  const cache = createEvidenceSessionCache({
    fs: createBlobEvidenceCacheFs(api), generateId: () => 'x',
    fetch: async () => ({ ok: false }),
  });
  assert.deepEqual(await cache.load('sub-1', 0), { ok: false });
  const throwing = createEvidenceSessionCache({
    fs: createBlobEvidenceCacheFs(api), generateId: () => 'y',
    fetch: async () => { throw new Error('network'); },
  });
  assert.deepEqual(await throwing.load('sub-1', 0), { ok: false });
  const unsupported = createEvidenceSessionCache({
    fs: createBlobEvidenceCacheFs(api), generateId: () => 'z',
    fetch: async () => ({ ok: true, data: { bytes: new Uint8Array([1]).buffer, mimeType: 'text/html' } }),
  });
  assert.deepEqual(await unsupported.load('sub-1', 0), { ok: false });
  assert.equal(live.size, 0);
});

// ── structural: platform split ──────────────────────────────────────────────

const code = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), 'utf8')
    .split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

test('native adapter still uses expo-file-system cache files; web adapter never imports expo-file-system', () => {
  const native = code('../../../lib/evidenceCacheFs.ts');
  const web    = code('../../../lib/evidenceCacheFs.web.ts');
  const blob   = code('../evidenceCacheBlob.ts');
  assert.ok(native.includes("from 'expo-file-system'"));
  assert.ok(native.includes('new File(Paths.cache, name)'));
  assert.ok(!/expo-file-system/.test(web) && !/expo-file-system/.test(blob));
  assert.ok(web.includes('export const expoEvidenceCacheFs'));
  assert.ok(web.includes('createBlobEvidenceCacheFs()'));
  // Shared wiring imports the platform-resolved module, not a specific file.
  const session = code('../evidenceSession.ts');
  assert.ok(session.includes("from '@/lib/evidenceCacheFs'"));
  // No base64 / data: URI fallback on web either.
  assert.ok(!/base64|btoa|readAsDataURL|data:image|FileReader/.test(blob + web));
});
