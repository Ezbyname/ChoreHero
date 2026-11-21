// Session-scoped cache of decoded evidence photos (task completion), so a
// reviewer — or the child looking at what they sent — who already opened a
// photo during this signed-in session sees it again instantly instead of
// re-downloading and re-writing it.
//
// Pure core (no expo-*, no react-native): the file system and the
// authorized fetch are injected. evidenceSession.ts wires the real ones.
//
// Correctness / privacy rules:
//   * Key = (submission id, photo index). Evidence is immutable once a
//     submission exists (no client UPDATE/DELETE path, no upsert), and a
//     changed / replaced completion is always a NEW submission id — so a
//     cached file can never be stale for its key.
//   * Every miss goes through the injected fetch, i.e. the
//     task-completion-evidence Edge Function with its live, caller-scoped
//     authorization. Only bytes this user was authorized for this session
//     are ever cached; nothing is cached across sessions.
//   * File names are random (review-evidence-<uuid>.<ext>): no household,
//     task, child, submission or storage-path identifier on disk. The
//     key -> file map lives only in memory.
//   * clear() (sign-out / user switch) deletes every file and drops loads
//     still in flight; at process start leftovers are swept.
//   * Bounded: least-recently-used files are evicted beyond maxEntries /
//     maxBytes, never a file currently on screen (pinned).
//   * Concurrent loads of the same key share one fetch.

import {
  sweepEvidenceCacheFiles,
  writeEvidenceCacheFile,
  type EvidenceCacheFs,
} from '@/features/tasks/evidenceCacheFile';

export type EvidenceFetchResult =
  | { ok: true; data: { bytes: ArrayBuffer; mimeType: string } }
  | { ok: false };

export type EvidenceSessionCacheDeps = {
  fs:         EvidenceCacheFs;
  generateId: () => string;
  fetch:      (submissionId: string, photoIndex: number) => Promise<EvidenceFetchResult>;
};

export type EvidenceLoadResult = { ok: true; uri: string } | { ok: false };

export const DEFAULT_CACHE_LIMITS = {
  maxEntries: 30,
  maxBytes:   200 * 1024 * 1024,
};

type Entry = { uri: string; size: number; pins: number };

export type EvidenceSessionCache = {
  load:    (submissionId: string, photoIndex: number) => Promise<EvidenceLoadResult>;
  peek:    (submissionId: string, photoIndex: number) => string | null;
  pin:     (submissionId: string, photoIndex: number) => () => void;
  clear:   () => void;
  stats:   () => { entries: number; bytes: number };
};

const keyOf = (submissionId: string, photoIndex: number) => `${submissionId}#${photoIndex}`;

export function createEvidenceSessionCache(
  deps:   EvidenceSessionCacheDeps,
  limits: { maxEntries: number; maxBytes: number } = DEFAULT_CACHE_LIMITS,
): EvidenceSessionCache {
  // Map iteration order = LRU order (oldest first); touch() re-inserts.
  const entries  = new Map<string, Entry>();
  const inflight = new Map<string, Promise<EvidenceLoadResult>>();
  let generation = 0;
  let swept      = false;

  const remove = (uri: string) => { try { deps.fs.remove(uri); } catch { /* best effort */ } };

  function touch(key: string, entry: Entry) {
    entries.delete(key);
    entries.set(key, entry);
  }

  function totalBytes() {
    let b = 0;
    for (const e of entries.values()) b += e.size;
    return b;
  }

  function evict() {
    for (const [key, entry] of entries) {
      if (entries.size <= limits.maxEntries && totalBytes() <= limits.maxBytes) return;
      if (entry.pins > 0) continue;
      entries.delete(key);
      remove(entry.uri);
    }
  }

  async function fetchAndStore(submissionId: string, photoIndex: number, key: string): Promise<EvidenceLoadResult> {
    const myGeneration = generation;
    let fetched: EvidenceFetchResult;
    try {
      fetched = await deps.fetch(submissionId, photoIndex);
    } catch {
      return { ok: false };
    }
    if (!fetched.ok || myGeneration !== generation) return { ok: false };

    const written = writeEvidenceCacheFile(fetched.data, { fs: deps.fs, generateId: deps.generateId });
    if (!written.ok) return { ok: false };
    // Signed out (or switched user) while writing: never keep it.
    if (myGeneration !== generation) {
      remove(written.uri);
      return { ok: false };
    }
    entries.set(key, { uri: written.uri, size: fetched.data.bytes.byteLength, pins: 0 });
    evict();
    return entries.has(key) ? { ok: true, uri: written.uri } : { ok: false };
  }

  return {
    async load(submissionId, photoIndex) {
      if (!swept) {
        swept = true;
        sweepEvidenceCacheFiles(deps.fs);
      }
      const key = keyOf(submissionId, photoIndex);
      const hit = entries.get(key);
      if (hit) {
        touch(key, hit);
        return { ok: true, uri: hit.uri };
      }
      const running = inflight.get(key);
      if (running) return running;
      const p = fetchAndStore(submissionId, photoIndex, key).finally(() => inflight.delete(key));
      inflight.set(key, p);
      return p;
    },

    peek(submissionId, photoIndex) {
      return entries.get(keyOf(submissionId, photoIndex))?.uri ?? null;
    },

    pin(submissionId, photoIndex) {
      const key = keyOf(submissionId, photoIndex);
      const entry = entries.get(key);
      if (!entry) return () => {};
      entry.pins += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const current = entries.get(key);
        if (current === entry) {
          entry.pins = Math.max(0, entry.pins - 1);
          evict();
        }
      };
    },

    clear() {
      generation += 1;
      inflight.clear();
      for (const entry of entries.values()) remove(entry.uri);
      entries.clear();
      sweepEvidenceCacheFiles(deps.fs);
      swept = true;
    },

    stats() {
      return { entries: entries.size, bytes: totalBytes() };
    },
  };
}
