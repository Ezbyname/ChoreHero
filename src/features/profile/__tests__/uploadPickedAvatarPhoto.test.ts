import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extensionFromMimeType,
  uploadPickedAvatarPhoto,
} from '@/features/profile/uploadPickedAvatarPhoto';
import { readLocalFileBytes } from '@/lib/readLocalFileBytes';
import { uploadProfileAvatarImage } from '@/lib/repositories';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]).buffer;

type UploadInput = Parameters<typeof uploadProfileAvatarImage>[0];

function recordingUpload(result: Awaited<ReturnType<typeof uploadProfileAvatarImage>>) {
  const calls: UploadInput[] = [];
  const upload: typeof uploadProfileAvatarImage = async (input) => { calls.push(input); return result; };
  return { calls, upload };
}

const okUpload = () => recordingUpload({ data: 'https://example.test/avatars/u1/1.jpg', error: null });

test('picked photo: uploads the exact raw bytes with the picker MIME and matching extension', async () => {
  const { calls, upload } = okUpload();
  const result = await uploadPickedAvatarPhoto(
    { authUserId: 'u1', uri: 'file:///cache/ImagePicker/a.png', mimeType: 'image/png' },
    { readBytes: async () => ({ ok: true, bytes: JPEG }), upload },
  );
  assert.deepEqual(result, { ok: true, publicUrl: 'https://example.test/avatars/u1/1.jpg' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].bytes, JPEG);
  assert.equal(calls[0].contentType, 'image/png');
  assert.equal(calls[0].fileExtension, 'png');
  assert.equal(calls[0].authUserId, 'u1');
  assert.ok(!('blob' in calls[0]));
});

test('missing picker MIME falls back to image/jpeg + jpg (same fallback as before)', async () => {
  const { calls, upload } = okUpload();
  await uploadPickedAvatarPhoto(
    { authUserId: 'u1', uri: 'file:///a', mimeType: undefined },
    { readBytes: async () => ({ ok: true, bytes: JPEG }), upload },
  );
  assert.equal(calls[0].contentType, 'image/jpeg');
  assert.equal(calls[0].fileExtension, 'jpg');
});

test('read failure -> read_failed, nothing uploaded', async () => {
  const { calls, upload } = okUpload();
  const result = await uploadPickedAvatarPhoto(
    { authUserId: 'u1', uri: 'file:///gone', mimeType: 'image/jpeg' },
    { readBytes: async () => ({ ok: false, reason: 'read_failed' }), upload },
  );
  assert.deepEqual(result, { ok: false, reason: 'read_failed' });
  assert.equal(calls.length, 0);
});

test('zero-byte file -> empty, nothing uploaded (through the real reader)', async () => {
  const { calls, upload } = okUpload();
  const result = await uploadPickedAvatarPhoto(
    { authUserId: 'u1', uri: 'file:///empty.jpg', mimeType: 'image/jpeg' },
    {
      readBytes: (uri) => readLocalFileBytes(uri, async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) })),
      upload,
    },
  );
  assert.deepEqual(result, { ok: false, reason: 'empty' });
  assert.equal(calls.length, 0);
});

test('upload error -> upload_failed (screen shows its existing upload error copy)', async () => {
  const { upload } = recordingUpload({ data: null, error: { code: 'x', message: 'm', details: '', hint: '' } as never });
  const result = await uploadPickedAvatarPhoto(
    { authUserId: 'u1', uri: 'file:///a', mimeType: 'image/jpeg' },
    { readBytes: async () => ({ ok: true, bytes: JPEG }), upload },
  );
  assert.deepEqual(result, { ok: false, reason: 'upload_failed' });
});

test('extensionFromMimeType keeps its previous mapping', () => {
  assert.equal(extensionFromMimeType('image/jpeg'), 'jpg');
  assert.equal(extensionFromMimeType('image/png'), 'png');
  assert.equal(extensionFromMimeType('image/webp'), 'webp');
  assert.equal(extensionFromMimeType(undefined), 'jpg');
  assert.equal(extensionFromMimeType(null), 'jpg');
});

test('uploadProfileAvatarImage (repository) stays not-configured-safe with the bytes signature', async () => {
  const result = await uploadProfileAvatarImage({
    authUserId: 'u1', bytes: JPEG, contentType: 'image/jpeg', fileExtension: 'jpg',
  });
  assert.equal(result.data, null);
  assert.equal(result.error?.code, 'PGRST_NOT_CONFIGURED');
});

// ── readLocalFileBytes (shared by evidence + avatar) ──────────────────────

test('readLocalFileBytes: reads bytes via arrayBuffer(), never blob()', async () => {
  let blobCalls = 0;
  const result = await readLocalFileBytes('file:///x.jpg', async () => ({
    ok: true,
    arrayBuffer: async () => JPEG,
    blob: async () => { blobCalls += 1; throw new Error('RN cannot build this Blob'); },
  } as never));
  assert.deepEqual(result, { ok: true, bytes: JPEG });
  assert.equal(blobCalls, 0);
});

test('readLocalFileBytes: fetch throws / non-OK / arrayBuffer rejects / empty', async () => {
  assert.deepEqual(await readLocalFileBytes('a', async () => { throw new TypeError('x'); }), { ok: false, reason: 'read_failed' });
  assert.deepEqual(await readLocalFileBytes('a', async () => ({ ok: false, arrayBuffer: async () => JPEG })), { ok: false, reason: 'read_failed' });
  assert.deepEqual(await readLocalFileBytes('a', async () => ({ ok: true, arrayBuffer: async () => { throw new Error('x'); } })), { ok: false, reason: 'read_failed' });
  assert.deepEqual(await readLocalFileBytes('a', async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) })), { ok: false, reason: 'empty' });
});
