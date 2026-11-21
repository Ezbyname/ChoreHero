// Reviewer evidence bytes -> a temporary file in the app cache, rendered by
// <Image> as file://. Replaces the old base64 data-URI path (QA-REV-08:
// a ~19 MiB photo as a data URI peaks at several times its size).
//
// Pure — the file system is injected (EvidenceCacheFs), so this runs under
// Node tests. The expo-file-system adapter lives in
// src/lib/evidenceCacheFs.ts and is only imported by the Modal.
//
// Security: the bytes come only from fetchTaskCompletionEvidence (the
// authenticated Edge Function, keyed by submission_id). The file name is
// random and says nothing about the household, task, child or storage
// path. Files are deleted when the reviewer is done with them; anything a
// crash left behind is swept the next time the Modal opens.

import { normalizeEvidenceMimeType } from '@/features/tasks/evidenceMimeType';

export const EVIDENCE_CACHE_FILE_PREFIX = 'review-evidence-';

export interface EvidenceCacheFs {
  // Writes the bytes to a new file with this name in the cache directory
  // and returns its file:// URI. Throws on failure.
  write(name: string, bytes: Uint8Array): string;
  // Deletes the file at uri. May throw (e.g. already gone).
  remove(uri: string): void;
  // file:// URIs of files in the cache directory whose name starts with prefix.
  list(prefix: string): string[];
}

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/gif':  'gif',
};

// Content-Type -> file extension, or null when it is not an allowed
// evidence image type (the image decoder relies on the extension for
// formats such as HEIC, so it is never guessed).
export function evidenceFileExtension(contentType: string): string | null {
  const mime = normalizeEvidenceMimeType(contentType);
  return mime ? EXTENSION_BY_MIME[mime] ?? null : null;
}

export type WriteEvidenceCacheFileResult =
  | { ok: true;  uri: string }
  | { ok: false; reason: 'unsupported' | 'empty' | 'write_failed' };

export function writeEvidenceCacheFile(
  evidence: { bytes: ArrayBuffer; mimeType: string },
  deps:     { fs: EvidenceCacheFs; generateId: () => string },
): WriteEvidenceCacheFileResult {
  const ext = evidenceFileExtension(evidence.mimeType);
  if (!ext) return { ok: false, reason: 'unsupported' };
  if (evidence.bytes.byteLength === 0) return { ok: false, reason: 'empty' };

  const name = `${EVIDENCE_CACHE_FILE_PREFIX}${deps.generateId()}.${ext}`;
  try {
    // A view over the fetched buffer — no JS-side copy of the bytes.
    return { ok: true, uri: deps.fs.write(name, new Uint8Array(evidence.bytes)) };
  } catch {
    // A failed write may still have created a partial file.
    for (const uri of safeList(deps.fs, name)) safeRemove(deps.fs, uri);
    return { ok: false, reason: 'write_failed' };
  }
}

// Deletes every evidence file in the cache except `keep`. Best effort.
export function sweepEvidenceCacheFiles(fs: EvidenceCacheFs, keep: string | null = null): void {
  for (const uri of safeList(fs, EVIDENCE_CACHE_FILE_PREFIX)) {
    if (uri !== keep) safeRemove(fs, uri);
  }
}

function safeList(fs: EvidenceCacheFs, prefix: string): string[] {
  try {
    return fs.list(prefix);
  } catch {
    return [];
  }
}

function safeRemove(fs: EvidenceCacheFs, uri: string): void {
  try {
    fs.remove(uri);
  } catch {
    // Already gone or not removable; the OS may purge the cache directory.
  }
}

// Tracks the one evidence file the Modal is currently showing. Each load
// carries the run id it started under; only a load whose run is still
// current may install its file, and installing a new file deletes the old
// one. A stale load's file is deleted immediately and never touches the
// current one.
export interface EvidenceFileOwner {
  current(): string | null;
  // true = uri is now the current file (any previous one was deleted).
  // false = stale run; uri was deleted and the current file is untouched.
  adopt(uri: string, runId: number, currentRunId: number): boolean;
  // Deletes the current file, if any.
  release(): void;
}

export function createEvidenceFileOwner(fs: EvidenceCacheFs): EvidenceFileOwner {
  let currentUri: string | null = null;
  return {
    current: () => currentUri,
    adopt(uri, runId, currentRunId) {
      if (runId !== currentRunId) {
        safeRemove(fs, uri);
        return false;
      }
      const previous = currentUri;
      currentUri = uri;
      if (previous && previous !== uri) safeRemove(fs, previous);
      return true;
    },
    release() {
      if (currentUri) safeRemove(fs, currentUri);
      currentUri = null;
    },
  };
}
