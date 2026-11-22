// Browser (web) implementation of EvidenceCacheFs: evidence bytes become an
// in-memory Blob rendered by <Image> through a blob: object URL.
// expo-file-system has no web implementation, so on web the session cache
// (evidenceSessionCache.ts) keeps all its rules — keying, LRU bounds,
// clear() on sign-out — and only the storage underneath changes: "write"
// creates an object URL, "remove" revokes it, "list" enumerates the URLs
// this tab created. Nothing is ever written to disk or persistent storage.
//
// Pure — the URL/Blob functions are injectable so Node tests can drive it.
// src/lib/evidenceCacheFs.web.ts wires the browser globals.

import type { EvidenceCacheFs } from '@/features/tasks/evidenceCacheFile';

// File extension (chosen by writeEvidenceCacheFile from the response
// Content-Type) -> the Blob type, so the browser decodes it correctly.
const MIME_BY_EXTENSION: Record<string, string> = {
  jpg:  'image/jpeg',
  png:  'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  gif:  'image/gif',
};

export function evidenceBlobType(name: string): string {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  return MIME_BY_EXTENSION[ext] ?? 'application/octet-stream';
}

export type BlobUrlApi = {
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
  makeBlob:        (bytes: Uint8Array, type: string) => Blob;
};

const browserBlobUrlApi = (): BlobUrlApi => ({
  createObjectURL: (blob) => URL.createObjectURL(blob),
  revokeObjectURL: (url) => URL.revokeObjectURL(url),
  makeBlob:        (bytes, type) => new Blob([bytes as BlobPart], { type }),
});

export function createBlobEvidenceCacheFs(api: BlobUrlApi = browserBlobUrlApi()): EvidenceCacheFs {
  // object URL -> the cache file name it stands for (for list(prefix)).
  const names = new Map<string, string>();
  return {
    write(name, bytes) {
      const url = api.createObjectURL(api.makeBlob(bytes, evidenceBlobType(name)));
      names.set(url, name);
      return url;
    },
    remove(uri) {
      if (!names.delete(uri)) throw new Error('evidence object URL does not exist');
      api.revokeObjectURL(uri);
    },
    list(prefix) {
      const out: string[] = [];
      for (const [url, name] of names) if (name.startsWith(prefix)) out.push(url);
      return out;
    },
  };
}
