import assert from 'node:assert/strict';
import test from 'node:test';

import { materializeEvidencePhoto } from '@/features/tasks/materializeEvidencePhoto';

function okResponse(bytes: ArrayBuffer) {
  return { ok: true, arrayBuffer: async () => bytes };
}

test('materializeEvidencePhoto: camera file URI -> ok with the exact bytes and the picker mimeType', async () => {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer;
  let requested: string | undefined;
  const result = await materializeEvidencePhoto(
    'file:///data/user/0/app/cache/ImagePicker/camera-1.jpg',
    'image/jpeg',
    async (url) => { requested = url; return okResponse(bytes); },
  );
  assert.equal(requested, 'file:///data/user/0/app/cache/ImagePicker/camera-1.jpg');
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.photo.bytes, bytes);
    assert.equal(result.photo.mimeType, 'image/jpeg');
  }
});

test('materializeEvidencePhoto: never calls blob() — RN Blob cannot be built from bytes', async () => {
  let blobCalls = 0;
  const response = {
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(3),
    blob: async () => { blobCalls += 1; throw new Error("Creating blobs from 'ArrayBuffer' and 'ArrayBufferView' are not supported"); },
  };
  const result = await materializeEvidencePhoto('file:///x.png', 'image/png', async () => response);
  assert.equal(result.ok, true);
  assert.equal(blobCalls, 0);
});

test('materializeEvidencePhoto: fetch throws (URI no longer readable) -> read_failed, no throw', async () => {
  const result = await materializeEvidencePhoto('file:///gone.jpg', 'image/jpeg', async () => {
    throw new TypeError('Network request failed');
  });
  assert.deepEqual(result, { ok: false, reason: 'read_failed' });
});

test('materializeEvidencePhoto: non-OK local response (expo/fetch 404 for a missing file) -> read_failed, body never read', async () => {
  let read = 0;
  const result = await materializeEvidencePhoto('file:///missing.jpg', 'image/jpeg', async () => ({
    ok: false,
    arrayBuffer: async () => { read += 1; return new TextEncoder().encode('File not found').buffer as ArrayBuffer; },
  }));
  assert.deepEqual(result, { ok: false, reason: 'read_failed' });
  assert.equal(read, 0);
});

test('materializeEvidencePhoto: arrayBuffer() rejects -> read_failed', async () => {
  const result = await materializeEvidencePhoto('file:///x.jpg', 'image/jpeg', async () => ({
    ok: true,
    arrayBuffer: async () => { throw new Error('read error'); },
  }));
  assert.deepEqual(result, { ok: false, reason: 'read_failed' });
});

test('materializeEvidencePhoto: zero bytes -> empty (never uploaded as evidence)', async () => {
  const result = await materializeEvidencePhoto('file:///empty.jpg', 'image/jpeg', async () => okResponse(new ArrayBuffer(0)));
  assert.deepEqual(result, { ok: false, reason: 'empty' });
});
