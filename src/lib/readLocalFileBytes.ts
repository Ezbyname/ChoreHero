// Reads a picker asset's local URI (file:// on native, blob: on web) into
// raw bytes. Pure apart from the injected fetch — Node-test safe.
//
// Why bytes (ArrayBuffer) and never a Blob: on Android in Expo SDK 56 the
// global fetch is expo/fetch, whose Response.blob() builds
// `new Blob([arrayBuffer])` — and React Native's Blob constructor rejects
// ArrayBuffer parts outright (react-native/Libraries/Blob/BlobManager.js,
// "Creating blobs from 'ArrayBuffer' and 'ArrayBufferView' are not
// supported"). RN's Blob also has no .arrayBuffer() method.
// Response.arrayBuffer() is the body reader that works for a local URI on
// expo/fetch (OkHttpFileUrlInterceptor), RN's XHR fetch, and the web.

export type ReadLocalFileBytesResult =
  | { ok: true;  bytes: ArrayBuffer }
  | { ok: false; reason: 'read_failed' | 'empty' };

export type LocalFetchLike = (url: string) => Promise<{ ok: boolean; arrayBuffer(): Promise<ArrayBuffer> }>;

export async function readLocalFileBytes(
  uri:     string,
  fetchFn: LocalFetchLike = (url) => globalThis.fetch(url),
): Promise<ReadLocalFileBytesResult> {
  let bytes: ArrayBuffer;
  try {
    const response = await fetchFn(uri);
    // expo/fetch answers a missing local file with a 404 whose body is
    // non-empty text — never treat that as the picked image.
    if (!response.ok) return { ok: false, reason: 'read_failed' };
    bytes = await response.arrayBuffer();
  } catch {
    return { ok: false, reason: 'read_failed' };
  }
  if (bytes.byteLength === 0) return { ok: false, reason: 'empty' };
  return { ok: true, bytes };
}
