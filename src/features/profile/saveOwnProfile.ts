// Everyday profile edit (Settings -> Edit profile). Updates the caller's OWN
// profiles row through the existing profiles_update_self RLS policy
// (20260707000000_core_rls_policies.sql) — no policy or grant change — then
// reflects the result in the store in place (no re-hydration, so the app
// never drops to a loading screen).

import { updateOwnProfile } from '@/lib/repositories';
import { useAppStore } from '@/store/useAppStore';

export type SaveOwnProfileResult =
  | { ok: true }
  | { ok: false; reason: 'invalid_input' | 'not_authenticated' | 'failed' };

export async function saveOwnProfile(
  input: { displayName: string; avatarUrl: string | null; avatarEmoji: string | null },
  deps:  { updateFn?: typeof updateOwnProfile } = {},
): Promise<SaveOwnProfileResult> {
  const displayName = input.displayName.trim();
  if (!displayName) return { ok: false, reason: 'invalid_input' };

  const store  = useAppStore.getState();
  const userId = store.authUser?.id ?? store.user?.id;
  if (!userId) return { ok: false, reason: 'not_authenticated' };

  const updateFn = deps.updateFn ?? updateOwnProfile;
  const result = await updateFn({
    authUserId:  userId,
    displayName,
    avatarUrl:   input.avatarUrl,
    avatarEmoji: input.avatarEmoji,
  });
  if (result.error || !result.data) return { ok: false, reason: 'failed' };

  const row = result.data;
  const s = useAppStore.getState();
  if (s.user && s.user.id === row.id) {
    s.setUser({ ...s.user, name: row.display_name, avatarUrl: row.avatar_url ?? undefined, avatarEmoji: row.avatar_emoji ?? undefined });
  }
  if (s.household) {
    s.setHousehold({
      ...s.household,
      members: s.household.members.map((m) => (m.userId === row.id
        ? { ...m, avatarUrl: row.avatar_url ?? undefined, avatarEmoji: row.avatar_emoji ?? undefined }
        : m)),
    });
  }
  return { ok: true };
}
