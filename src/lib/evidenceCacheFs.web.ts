// Web counterpart of evidenceCacheFs.ts (Metro picks this file for the web
// platform). expo-file-system is not supported on web, so reviewer evidence
// is held as in-memory Blobs behind blob: object URLs instead of cache
// files. Same export name so evidenceSession.ts is shared unchanged.

import type { EvidenceCacheFs } from '@/features/tasks/evidenceCacheFile';
import { createBlobEvidenceCacheFs } from '@/features/tasks/evidenceCacheBlob';

export const expoEvidenceCacheFs: EvidenceCacheFs = createBlobEvidenceCacheFs();
