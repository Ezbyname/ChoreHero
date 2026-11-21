// Reads a picker asset's local file URI into raw bytes for evidence upload.
// The byte-reading rules (why ArrayBuffer and never a React Native Blob,
// non-OK local responses, zero bytes) live in @/lib/readLocalFileBytes,
// shared with the profile-photo upload.

import { readLocalFileBytes, type LocalFetchLike } from '@/lib/readLocalFileBytes';

export type MaterializedEvidencePhoto = {
  bytes:    ArrayBuffer;
  mimeType: string;
};

export type MaterializeEvidencePhotoResult =
  | { ok: true;  photo: MaterializedEvidencePhoto }
  | { ok: false; reason: 'read_failed' | 'empty' };

export async function materializeEvidencePhoto(
  uri:      string,
  mimeType: string,
  fetchFn?: LocalFetchLike,
): Promise<MaterializeEvidencePhotoResult> {
  // A zero-byte upload would succeed and then be permanently bound to this
  // attempt's photoObjectId (upsert is never allowed) — readLocalFileBytes
  // refuses it as 'empty' before any upload.
  const read = await readLocalFileBytes(uri, fetchFn);
  if (!read.ok) return { ok: false, reason: read.reason };
  return { ok: true, photo: { bytes: read.bytes, mimeType } };
}
