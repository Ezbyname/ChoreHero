// QA-01.2 — Pure — kept in its own .ts file (not inline in
// SettingsScreen.tsx) so it's loadable by this repo's plain Node test
// runner, matching the established convention (see resolveInitialEmail.ts).
//
// Translates the already-authoritative household role (from
// selectCurrentMemberRole — the same source every permission selector in
// this app already uses) into the exact locked display label. Does not
// derive or duplicate any permission decision — it is a presentation-only
// mapping of a value SettingsScreen already reads for other purposes.
export function formatAccountType(role: string | null): string | null {
  switch (role) {
    case 'child':      return 'Child';
    case 'adult':       return 'Adult';
    case 'admin':       return 'Admin';
    case 'owner':       return 'Owner';
    default:            return null;
  }
}
