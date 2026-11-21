// Picked profile photo -> raw bytes -> avatars bucket. Extracted from
// ProfileSetupScreen so the byte boundary is testable under Node; the
// screen keeps its own UI state and copy.

import { readLocalFileBytes, type ReadLocalFileBytesResult } from '@/lib/readLocalFileBytes';
import { uploadProfileAvatarImage } from '@/lib/repositories';

export function extensionFromMimeType(mimeType: string | undefined | null): string {
  if (!mimeType) return 'jpg';
  const subtype = mimeType.split('/')[1];
  return subtype === 'jpeg' ? 'jpg' : (subtype ?? 'jpg');
}

export type UploadPickedAvatarResult =
  | { ok: true;  publicUrl: string }
  | { ok: false; reason: 'read_failed' | 'empty' | 'upload_failed' };

export async function uploadPickedAvatarPhoto(
  input: { authUserId: string; uri: string; mimeType: string | undefined | null },
  deps: {
    readBytes?: (uri: string) => Promise<ReadLocalFileBytesResult>;
    upload?:    typeof uploadProfileAvatarImage;
  } = {},
): Promise<UploadPickedAvatarResult> {
  const readBytes = deps.readBytes ?? ((uri) => readLocalFileBytes(uri));
  const upload    = deps.upload    ?? uploadProfileAvatarImage;

  const read = await readBytes(input.uri);
  if (!read.ok) return { ok: false, reason: read.reason };

  // The picker's own MIME (the old Blob path used blob.type, which on web
  // came from the same picked file). Same jpeg fallback as the extension.
  const contentType = input.mimeType || 'image/jpeg';
  const result = await upload({
    authUserId:    input.authUserId,
    bytes:         read.bytes,
    contentType,
    fileExtension: extensionFromMimeType(input.mimeType),
  });
  if (result.error || !result.data) return { ok: false, reason: 'upload_failed' };
  return { ok: true, publicUrl: result.data };
}
