// Settings section order — pure, Node-test safe. Sign Out lives in its own
// 'session' section, which is ALWAYS the last thing on the screen, visually
// separated from ordinary settings.
// 'syncDiagnostics' exists only in QA-variant builds (see
// isSyncDiagnosticsVisible) — never in Production.
export const SETTINGS_SECTION_ORDER = ['profile', 'household', 'invites', 'about', 'syncDiagnostics', 'session'] as const;

export type SettingsSection = (typeof SETTINGS_SECTION_ORDER)[number];

export function visibleSettingsSections(input: {
  isAuthenticated:    boolean;
  hasActiveHousehold: boolean;
  canInviteMembers:   boolean;
  showSyncDiagnostics?: boolean;
  // 'child' (the Me tab) never shows invites. Omitted means 'household',
  // which is the unchanged adult Settings.
  audience?: 'household' | 'child';
}): SettingsSection[] {
  return SETTINGS_SECTION_ORDER.filter((s) => {
    switch (s) {
      case 'profile':   return input.isAuthenticated;
      case 'household': return input.hasActiveHousehold;
      case 'invites':   return input.canInviteMembers && input.audience !== 'child';
      case 'about':     return true;
      case 'syncDiagnostics': return input.showSyncDiagnostics === true;
      case 'session':   return input.isAuthenticated;
    }
  });
}

// Adult Family tab (Slice 4). It only uses data and sections that already
// exist. 'settingsLink' opens the full Settings, which is not duplicated.
export const FAMILY_SECTION_ORDER = ['profile', 'household', 'members', 'invites', 'settingsLink'] as const;

export type FamilySection = (typeof FAMILY_SECTION_ORDER)[number];

export function visibleFamilySections(input: {
  isAuthenticated:    boolean;
  hasActiveHousehold: boolean;
  canInviteMembers:   boolean;
}): FamilySection[] {
  return FAMILY_SECTION_ORDER.filter((s) => {
    switch (s) {
      case 'profile':      return input.isAuthenticated;
      case 'household':    return input.hasActiveHousehold;
      case 'members':      return input.hasActiveHousehold;
      case 'invites':      return input.canInviteMembers;
      case 'settingsLink': return true;
    }
  });
}
