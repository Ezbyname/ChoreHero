// expo-file-system adapter for reviewer evidence cache files (see
// src/features/tasks/evidenceCacheFile.ts). App cache directory only —
// never a shared or persistent location.

import { File, Paths } from 'expo-file-system';
import type { EvidenceCacheFs } from '@/features/tasks/evidenceCacheFile';

export const expoEvidenceCacheFs: EvidenceCacheFs = {
  write(name, bytes) {
    const file = new File(Paths.cache, name);
    // Typed-array write: handed to native as a direct buffer, no base64.
    file.write(bytes);
    return file.uri;
  },
  remove(uri) {
    const file = new File(uri);
    if (file.exists) file.delete();
  },
  list(prefix) {
    return Paths.cache
      .list()
      .filter((entry) => entry instanceof File && entry.name.startsWith(prefix))
      .map((entry) => entry.uri);
  },
};
