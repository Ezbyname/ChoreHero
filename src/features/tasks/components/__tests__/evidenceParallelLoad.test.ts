// P1-1 (Phase 2): evidence photos load in parallel (selected first), not one
// after another. Measured in QA: 4 photos 7.3-9.9 s sequential vs 2.7-2.9 s
// parallel, because each photo is a full Edge Function round trip.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  initialGallery,
  loadOrder,
  onSlotFailed,
  onSlotReady,
  selectSlot,
  startGalleryLoads,
  type GalleryLoadResult,
  type GalleryState,
} from '@/features/tasks/components/evidenceGalleryState';
import { createEvidenceSessionCache, type EvidenceFetchResult } from '@/features/tasks/evidenceSessionCache';
import type { EvidenceCacheFs } from '@/features/tasks/evidenceCacheFile';

const code = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
  .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

function deferredLoads() {
  const started: number[] = [];
  const resolvers = new Map<number, (r: GalleryLoadResult) => void>();
  const rejecters = new Map<number, (e: unknown) => void>();
  const load = (index: number) => new Promise<GalleryLoadResult>((resolve, reject) => {
    started.push(index);
    resolvers.set(index, resolve);
    rejecters.set(index, reject);
  });
  return { started, load, resolve: (i: number, r: GalleryLoadResult) => resolvers.get(i)!(r), reject: (i: number) => rejecters.get(i)!(new Error('x')) };
}
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

function apply(state: GalleryState, index: number, r: GalleryLoadResult): GalleryState {
  return r.ok ? onSlotReady(state, index, r.uri) : onSlotFailed(state, index);
}

test('OLD: one at a time -> NEW: every photo is requested at once, the selected one first', async () => {
  const d = deferredLoads();
  const gallery = selectSlot(initialGallery(5), 2);
  void startGalleryLoads(loadOrder(gallery), d.load, () => {});
  // Nothing has resolved yet, and all five requests are already in flight.
  assert.deepEqual(d.started, [2, 0, 1, 3, 4]);
});

test('results land on their OWN slot, whatever order the network finishes in', async () => {
  const d = deferredLoads();
  let state = initialGallery(4);
  const done = startGalleryLoads(loadOrder(state), d.load, (i, r) => { state = apply(state, i, r); });
  d.resolve(3, { ok: true, uri: 'file:///c/3' });
  d.resolve(1, { ok: true, uri: 'file:///c/1' });
  await flush();
  assert.deepEqual(state.slots.map((s) => s.status), ['loading', 'ready', 'loading', 'ready']);
  d.reject(0);                                   // a thrown load = failed, only for that slot
  d.resolve(2, { ok: false });
  await done;
  assert.deepEqual(state.slots, [
    { status: 'failed' },
    { status: 'ready', uri: 'file:///c/1' },
    { status: 'failed' },
    { status: 'ready', uri: 'file:///c/3' },
  ]);
});

test('wall-clock: 4 photos with equal latency finish in about ONE latency, not four', async () => {
  const LATENCY = 80;
  const t0 = Date.now();
  await startGalleryLoads([0, 1, 2, 3], (i) => new Promise((r) => setTimeout(() => r({ ok: true, uri: `u${i}` }), LATENCY)), () => {});
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < LATENCY * 2.5, `took ${elapsed} ms (sequential would be >= ${LATENCY * 4} ms)`);
});

test('with the real session cache: parallel fetches, one fetch per photo, cache hits on reopen, identical requests deduped', async () => {
  const files = new Map<string, Uint8Array>();
  const fs: EvidenceCacheFs = {
    write(name, bytes) { const uri = `file:///cache/${name}`; files.set(uri, new Uint8Array(bytes)); return uri; },
    remove(uri) { files.delete(uri); },
    list(prefix) { return [...files.keys()].filter((u) => u.slice('file:///cache/'.length).startsWith(prefix)); },
  };
  let inFlight = 0;
  let maxInFlight = 0;
  const fetched: string[] = [];
  let n = 0;
  const cache = createEvidenceSessionCache({
    fs,
    generateId: () => `uuid-${++n}`,
    fetch: async (id, i): Promise<EvidenceFetchResult> => {
      fetched.push(`${id}#${i}`);
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 20));
      inFlight--;
      return { ok: true, data: { bytes: new Uint8Array([9, 9, i]).buffer, mimeType: 'image/jpeg' } };
    },
  });

  let state = initialGallery(4);
  await startGalleryLoads(loadOrder(state), (i) => cache.load('sub-1', i), (i, r) => { state = apply(state, i, r); });
  assert.equal(maxInFlight, 4, 'all four fetched concurrently');
  assert.deepEqual(fetched.sort(), ['sub-1#0', 'sub-1#1', 'sub-1#2', 'sub-1#3']);
  assert.ok(state.slots.every((s) => s.status === 'ready'));
  // Every slot points at its own photo's bytes.
  for (const [i, s] of state.slots.entries()) {
    assert.equal(s.status, 'ready');
    if (s.status === 'ready') assert.deepEqual([...files.get(s.uri)!], [9, 9, i]);
  }
  // File names stay random — no submission id / index in them.
  assert.ok([...files.keys()].every((u) => !u.includes('sub-1')));

  // Reopening the same submission: all four are cache hits, no network.
  let reopened = initialGallery(4);
  await startGalleryLoads(loadOrder(reopened), (i) => cache.load('sub-1', i), (i, r) => { reopened = apply(reopened, i, r); });
  assert.equal(fetched.length, 4);

  // Two galleries asking for the same uncached photo at the same time share one fetch.
  await Promise.all([cache.load('sub-2', 0), cache.load('sub-2', 0)]);
  assert.equal(fetched.filter((f) => f === 'sub-2#0').length, 1);
});

test('EvidenceGallery uses the parallel loader; no sequential await-per-photo loop remains', () => {
  const src = code('../EvidenceGallery.tsx');
  assert.ok(src.includes('await startGalleryLoads('));
  assert.ok(src.includes('(index) => evidenceSessionCache.load(submissionId, index)'));
  assert.ok(!/for \(const index of loadOrder\(from\)\)/.test(src));
  // Late results from a previous submission / closed gallery are still dropped.
  assert.ok(/\(index, result\) => \{\s*if \(run !== runRef\.current\) return;/.test(src));
  // Still only the authorized Edge Function path — no Storage URLs.
  assert.ok(!/getPublicUrl|createSignedUrl|storage\.from|photo_storage_path/.test(src));
});
