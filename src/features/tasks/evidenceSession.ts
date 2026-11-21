// Production wiring of the session evidence cache: expo-file-system cache
// directory + expo-crypto names + the authorized Edge Function fetch, bound
// to the signed-in user. Native-only imports — never imported by Node tests
// (they use createEvidenceSessionCache with fakes).

import * as Crypto from 'expo-crypto';
import { createEvidenceSessionCache } from '@/features/tasks/evidenceSessionCache';
import { expoEvidenceCacheFs } from '@/lib/evidenceCacheFs';
import { fetchTaskCompletionEvidence } from '@/lib/repositories';
import { useAppStore } from '@/store/useAppStore';

export const evidenceSessionCache = createEvidenceSessionCache({
  fs:         expoEvidenceCacheFs,
  generateId: () => Crypto.randomUUID(),
  fetch: async (submissionId, photoIndex) => {
    const r = await fetchTaskCompletionEvidence(submissionId, photoIndex);
    return r.error || !r.data ? { ok: false } : { ok: true, data: r.data };
  },
});

let bound = false;

// Cached evidence belongs to ONE signed-in user's session: signing out, or
// any change of the authenticated user, deletes every cached file.
export function bindEvidenceCacheToSession(): void {
  if (bound) return;
  bound = true;
  let currentUserId = useAppStore.getState().authUser?.id ?? null;
  useAppStore.subscribe((state) => {
    const next = state.authUser?.id ?? null;
    if (next === currentUserId) return;
    currentUserId = next;
    evidenceSessionCache.clear();
  });
}
