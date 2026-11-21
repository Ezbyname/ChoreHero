// Reviewer evidence cache file (QA-REV-08): bytes from the authenticated
// Edge Function -> random temporary file -> file:// for <Image>. The file
// system is a fake in-memory one; the expo-file-system adapter and the
// Modal wiring are covered by the structural checks at the bottom.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  EVIDENCE_CACHE_FILE_PREFIX,
  createEvidenceFileOwner,
  evidenceFileExtension,
  sweepEvidenceCacheFiles,
  writeEvidenceCacheFile,
  type EvidenceCacheFs,
} from '@/features/tasks/evidenceCacheFile';
import { normalizeEvidenceMimeType } from '@/features/tasks/evidenceMimeType';
import { ALLOWED_EVIDENCE_MIME_TYPES } from '@/features/tasks/taskCompletionAttempt';

const CACHE = 'file:///data/user/0/app/cache/';

function fakeFs(opts: { failWrite?: 'before' | 'partial'; failRemove?: boolean } = {}) {
  const files = new Map<string, Uint8Array>();
  const removed: string[] = [];
  const fs: EvidenceCacheFs = {
    write(name, bytes) {
      if (opts.failWrite === 'before') throw new Error('disk full');
      const uri = CACHE + name;
      if (opts.failWrite === 'partial') {
        files.set(uri, bytes.slice(0, 1));
        throw new Error('disk full mid-write');
      }
      files.set(uri, bytes.slice());
      return uri;
    },
    remove(uri) {
      if (opts.failRemove) throw new Error('cannot delete');
      if (!files.delete(uri)) throw new Error('does not exist');
      removed.push(uri);
    },
    list(prefix) {
      return [...files.keys()].filter((uri) => uri.slice(CACHE.length).startsWith(prefix));
    },
  };
  return { fs, files, removed };
}

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const buf = (bytes: Uint8Array) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

// ── creation + bytes ──────────────────────────────────────────────────────

test('success: random prefixed name in the cache dir, file:// URI, exact bytes written', () => {
  const { fs, files } = fakeFs();
  const payload = new Uint8Array(randomBytes(256 * 1024 + 7));
  const r = writeEvidenceCacheFile({ bytes: buf(payload), mimeType: 'image/jpeg' }, { fs, generateId: () => 'rnd-1' });
  assert.deepEqual(r, { ok: true, uri: `${CACHE}${EVIDENCE_CACHE_FILE_PREFIX}rnd-1.jpg` });
  assert.equal(files.size, 1);
  assert.equal(sha(files.get(CACHE + 'review-evidence-rnd-1.jpg')!), sha(payload));
});

test('the file name carries only the random id — no submission, task, household or storage path', () => {
  const { fs } = fakeFs();
  const r = writeEvidenceCacheFile({ bytes: new Uint8Array([1, 2, 3]).buffer, mimeType: 'image/png' }, { fs, generateId: () => 'f3c1' });
  assert.equal(r.ok && r.uri.slice(CACHE.length), 'review-evidence-f3c1.png');
});

test('a 20 MiB payload is written byte-for-byte', () => {
  const { fs, files } = fakeFs();
  const payload = new Uint8Array(20 * 1024 * 1024);
  for (let i = 0; i < payload.length; i += 4093) payload[i] = i & 0xff;
  const r = writeEvidenceCacheFile({ bytes: payload.buffer, mimeType: 'image/heic' }, { fs, generateId: () => 'big' });
  assert.equal(r.ok, true);
  assert.equal(sha(files.get(CACHE + 'review-evidence-big.heic')!), sha(payload));
});

// ── MIME / extension ─────────────────────────────────────────────────────

test('every allowed evidence MIME maps to its extension; params and case are ignored', () => {
  const expected: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
    'image/heic': 'heic', 'image/heif': 'heif', 'image/gif': 'gif',
  };
  for (const mime of ALLOWED_EVIDENCE_MIME_TYPES) assert.equal(evidenceFileExtension(mime), expected[mime], mime);
  assert.equal(evidenceFileExtension('IMAGE/JPEG; charset=binary'), 'jpg');
  assert.equal(normalizeEvidenceMimeType(' image/PNG ;q=1'), 'image/png');
});

test('unsupported or missing MIME and empty bytes are refused without writing anything', () => {
  for (const mimeType of ['application/octet-stream', 'image/svg+xml', 'text/html', '']) {
    const { fs, files } = fakeFs();
    const r = writeEvidenceCacheFile({ bytes: new Uint8Array([1]).buffer, mimeType }, { fs, generateId: () => 'x' });
    assert.deepEqual(r, { ok: false, reason: 'unsupported' }, mimeType);
    assert.equal(files.size, 0);
  }
  const { fs, files } = fakeFs();
  assert.deepEqual(writeEvidenceCacheFile({ bytes: new ArrayBuffer(0), mimeType: 'image/jpeg' }, { fs, generateId: () => 'x' }), { ok: false, reason: 'empty' });
  assert.equal(files.size, 0);
});

// ── write failure ─────────────────────────────────────────────────────────

test('failed write -> write_failed (Modal maps it to evidence_failed); a partial file is deleted', () => {
  for (const failWrite of ['before', 'partial'] as const) {
    const { fs, files } = fakeFs({ failWrite });
    const r = writeEvidenceCacheFile({ bytes: new Uint8Array([9, 9, 9]).buffer, mimeType: 'image/jpeg' }, { fs, generateId: () => 'p' });
    assert.deepEqual(r, { ok: false, reason: 'write_failed' });
    assert.equal(files.size, 0, failWrite);
  }
});

// ── ownership: close / unmount / replacement / failure / stale ──────────────

function written(fs: EvidenceCacheFs, id: string) {
  const r = writeEvidenceCacheFile({ bytes: new Uint8Array([1, 2]).buffer, mimeType: 'image/jpeg' }, { fs, generateId: () => id });
  assert.equal(r.ok, true);
  return (r as { uri: string }).uri;
}

test('close / unmount: release deletes the current file; releasing twice is harmless', () => {
  const { fs, files } = fakeFs();
  const owner = createEvidenceFileOwner(fs);
  const uri = written(fs, 'a');
  assert.equal(owner.adopt(uri, 1, 1), true);
  assert.equal(owner.current(), uri);
  owner.release();
  assert.equal(owner.current(), null);
  assert.equal(files.size, 0);
  owner.release();
});

test('replacement: adopting the next submission\'s file deletes the previous one', () => {
  const { fs, files } = fakeFs();
  const owner = createEvidenceFileOwner(fs);
  const first = written(fs, 'first');
  owner.adopt(first, 1, 1);
  const second = written(fs, 'second');
  assert.equal(owner.adopt(second, 2, 2), true);
  assert.deepEqual([...files.keys()], [second]);
  assert.equal(owner.current(), second);
});

test('failure after a file existed: release (Modal does this before evidence_failed) leaves nothing behind', () => {
  const opts: { failWrite?: 'partial' } = {};
  const { fs, files } = fakeFs(opts);
  const owner = createEvidenceFileOwner(fs);
  owner.adopt(written(fs, 'shown'), 1, 1);
  owner.release(); // retry starts
  opts.failWrite = 'partial'; // ...and the reload's write fails half-way
  const r = writeEvidenceCacheFile({ bytes: new Uint8Array([1, 2]).buffer, mimeType: 'image/jpeg' }, { fs, generateId: () => 'n' });
  assert.deepEqual(r, { ok: false, reason: 'write_failed' });
  assert.equal(owner.current(), null);
  assert.equal(files.size, 0);
});

test('stale async result: its file is deleted and the current file is neither replaced nor deleted', () => {
  const { fs, files } = fakeFs();
  const owner = createEvidenceFileOwner(fs);
  const current = written(fs, 'current');
  owner.adopt(current, 5, 5);
  const late = written(fs, 'late-from-run-4');
  assert.equal(owner.adopt(late, 4, 5), false);
  assert.equal(owner.current(), current);
  assert.deepEqual([...files.keys()], [current]);
});

test('stale result after close: nothing is shown and nothing is left in the cache', () => {
  const { fs, files } = fakeFs();
  const owner = createEvidenceFileOwner(fs);
  owner.release(); // modal closed while the fetch was in flight (run 1 -> 2)
  assert.equal(owner.adopt(written(fs, 'late'), 1, 2), false);
  assert.equal(owner.current(), null);
  assert.equal(files.size, 0);
});

test('a delete that throws (file already purged) never breaks release or replacement', () => {
  const { fs } = fakeFs({ failRemove: true });
  const owner = createEvidenceFileOwner(fs);
  owner.adopt('file:///gone-1.jpg', 1, 1);
  assert.equal(owner.adopt('file:///gone-2.jpg', 2, 2), true);
  owner.release();
  assert.equal(owner.current(), null);
});

test('sweep removes leftover evidence files (crash) and keeps unrelated cache files and `keep`', () => {
  const { fs, files } = fakeFs();
  const a = written(fs, 'old-a');
  written(fs, 'old-b');
  files.set(CACHE + 'ImagePicker-photo.jpg', new Uint8Array([7]));
  sweepEvidenceCacheFiles(fs, a);
  assert.deepEqual([...files.keys()].sort(), [a, CACHE + 'ImagePicker-photo.jpg'].sort());
  sweepEvidenceCacheFiles(fs);
  assert.deepEqual([...files.keys()], [CACHE + 'ImagePicker-photo.jpg']);
  sweepEvidenceCacheFiles({ ...fs, list: () => { throw new Error('no cache dir'); } });
});

// ── structural: Modal wiring, adapter, no Blob/FileReader/base64 path ───────

const code = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), 'utf8')
    .split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

const modal   = code('../components/TaskReviewEvidenceModal.tsx');
const adapter = code('../../../lib/evidenceCacheFs.ts');
const repo    = code('../../../lib/repositories/taskCompletionV2.ts');
const uiState = code('../components/taskReviewEvidenceUiState.ts');

test('no Blob / FileReader / base64 / data: URI path remains for reviewer evidence', () => {
  for (const [name, src] of [['modal', modal], ['adapter', adapter], ['uiState', uiState]] as const) {
    assert.ok(!/\.blob\(|new Blob|FileReader|readAsDataURL|createObjectURL|base64|btoa|data:image|evidenceImageSource/i.test(src), name);
  }
  const fetchFn = repo.slice(repo.indexOf('export async function fetchTaskCompletionEvidence'));
  assert.ok(!/\.blob\(/.test(fetchFn.slice(0, fetchFn.indexOf('\n}'))));
});

// The per-modal file owner (createEvidenceFileOwner) was replaced by the
// session cache (evidenceSessionCache.ts — its own test file covers
// lifecycle, eviction, sign-out cleanup and stale loads). The writer and
// sweep in evidenceCacheFile.ts above remain its building blocks.
test('Modal + gallery: evidence comes only from the session cache (Edge Function), files pinned while shown', () => {
  const gallery = code('../components/EvidenceGallery.tsx');
  const cache   = code('../evidenceSessionCache.ts');
  assert.ok(cache.includes('writeEvidenceCacheFile('));
  assert.ok(cache.includes('sweepEvidenceCacheFiles('));
  assert.ok(gallery.includes('evidenceSessionCache.load(submissionId, index)'));
  assert.ok(gallery.includes('evidenceSessionCache.pin(submissionId, index)'));
  // Unmount / submission switch: stale loads dropped, pins released.
  assert.ok(/return \(\) => \{\s*runRef\.current \+= 1;\s*for \(const unpin of unpinRef\.current\) unpin\(\);/.test(gallery));
  assert.ok(/if \(run !== runRef\.current\) return;/.test(gallery));
  // The modal itself no longer writes or deletes files.
  assert.ok(!/writeEvidenceCacheFile|evidenceCacheFs|\.remove\(/.test(modal));
  assert.ok(modal.includes('<EvidenceGallery'));
});

test('adapter: app cache directory, raw typed-array write, no persistent or shared location', () => {
  assert.ok(adapter.includes("from 'expo-file-system'"));
  assert.ok(!adapter.includes('expo/node_modules'));
  assert.ok(adapter.includes('new File(Paths.cache, name)'));
  assert.ok(/file\.write\(bytes\);/.test(adapter));
  assert.ok(!/Paths\.document|encoding|legacy/.test(adapter));
});
