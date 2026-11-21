import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import type { InvitesState } from '@/features/adultFamily/adultFamilyModel';
import { getActiveHouseholdInvites } from '@/lib/repositories';

// Slice 6D: the household's active invites for Adult Family, through the
// SAME repository query Settings → Invites uses (getActiveHouseholdInvites:
// not revoked, not expired, newest first). Invites are management data,
// not household hydration, so — like HouseholdInvitesSection — the screen
// reads them itself. Re-read whenever Family gains focus (e.g. after a
// code was generated or revoked in Settings) and on pull-to-refresh.
// Only runs for an owner/admin (enabled = household.invite); RLS stays the
// authority either way. Nothing here creates, changes or revokes a code.
export function useActiveInvites(householdId: string | null, enabled: boolean): { state: InvitesState; reload: () => Promise<void> } {
  const [state, setState] = useState<InvitesState>({ kind: 'loading' });
  const seq = useRef(0);

  const reload = useCallback(async () => {
    if (!enabled || !householdId) return;
    const mine = ++seq.current;
    const result = await getActiveHouseholdInvites(householdId);
    if (mine !== seq.current) return; // a newer read superseded this one
    setState(result.error || !result.data ? { kind: 'error' } : { kind: 'ready', invites: result.data });
  }, [householdId, enabled]);

  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  return { state, reload };
}
