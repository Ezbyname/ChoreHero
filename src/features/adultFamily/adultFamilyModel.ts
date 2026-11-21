// Slice 6D: Adult Family (Board 12 "Adult Family Final", Board 14 adult
// tokens, Board 23 Settings). Pure and Node-test safe: no React, no
// react-native.
//
// Household management, not analytics. Board 12's order, nothing else:
//   Family → current profile → Members → Invite someone → Settings.
//
// Profile: the viewer's real name, avatar and role, plus the real household
//   name ("Owner · The Cohen family"). "Profile" opens the existing
//   ProfileEditModal (name, emoji, photo); no new profile fields.
// Members: hydrated household members in the store's order, which is the
//   repository's (joined_at ASC, id ASC). Identity and role only: no
//   Points, progress, task counts, rankings or streaks. The count is
//   rows.length.
// Invite someone: owner/admin only (household.invite, the same rule as
//   Settings and the household_invites RLS). Shows the newest invite the
//   server would still accept, from the existing active-invites query:
//     not revoked, expires_at in the future, and — matching
//     redeem_household_invite (A4) — a child code (multi-use) or an
//     adult/admin code with redemption_count = 0 (single-use).
//   Validity is derived from the real expires_at (invites default to
//   30 days, but a code created days ago has fewer left), never a fixed
//   "Valid 30 days". Generate, the role picker, the full list and Revoke
//   are unchanged and stay in Settings → Invites (Board 23); Family adds no
//   invite-management controls.
// Settings: one row to the existing Settings (not a tab).

import { copy } from '@/content/copy';
import { formatCopy } from '@/content/formatCopy';
import { formatAccountType } from '@/lib/formatAccountType';
import type { HouseholdMember } from '@/types';
import type { HouseholdInviteRow } from '@/types/supabase';

const DAY_MS = 24 * 60 * 60 * 1000;

export type InvitesState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; invites: readonly HouseholdInviteRow[] };

export type AdultFamilyInput = {
  viewer:        { id: string; name: string | null; avatarUrl?: string; avatarEmoji?: string } | null;
  role:          string | null;
  householdName: string | null;
  members:       readonly HouseholdMember[];
  canInvite:     boolean; // household.invite
  invites:       InvitesState;
  now:           Date;
};

export type ProfileRow = {
  name:      string;
  avatarUrl?: string;
  avatarEmoji?: string;
  roleLabel: string | null;
  // "Owner · The Cohen family", or just the role / household when one is missing.
  line:      string | null;
  a11yLabel: string;
};

export type MemberRow = {
  member:    HouseholdMember;
  name:      string;
  roleLabel: string | null;
  a11yLabel: string;
};

export type InviteCard =
  | { kind: 'hidden' }
  | { kind: 'loading'; text: string }
  | { kind: 'error'; text: string }
  | { kind: 'none'; text: string }
  | {
      kind:          'code';
      code:          string;
      roleLabel:     string;
      forLabel:      string;
      validityLabel: string;
      moreLabel:     string | null;
      shareMessage:  string;
      codeA11y:      string;
      shareA11y:     string;
    };

export type AdultFamilyModel = {
  profile: ProfileRow | null;
  members: { rows: MemberRow[]; count: number; heading: string };
  invite:  InviteCard;
  settings: { label: string; hint: string };
};

// A code the server would still accept (A4 redemption rule).
export function isUsableInvite(invite: HouseholdInviteRow, now: Date): boolean {
  if (invite.revoked_at) return false;
  if (new Date(invite.expires_at).getTime() <= now.getTime()) return false;
  if (invite.role !== 'child' && invite.redemption_count > 0) return false;
  return true;
}

// Whole days left, rounded up: a code that expires later today still has
// "1 more day". Null once expired.
export function daysLeft(expiresAt: string, now: Date): number | null {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  if (!(ms > 0)) return null;
  return Math.ceil(ms / DAY_MS);
}

export function validityLabel(expiresAt: string, now: Date): string | null {
  const n = daysLeft(expiresAt, now);
  if (n === null) return null;
  return n === 1 ? copy.adultFamily.validOne : formatCopy(copy.adultFamily.validMany, { n });
}

function roleLabelOf(role: string | null | undefined): string | null {
  return formatAccountType(role ?? null);
}

export function buildProfileRow(input: AdultFamilyInput): ProfileRow | null {
  if (!input.viewer) return null;
  const name = input.viewer.name?.trim() || input.members.find((m) => m.userId === input.viewer?.id)?.name || '';
  const roleLabel = roleLabelOf(input.role);
  const household = input.householdName?.trim() || null;
  const line = roleLabel && household
    ? formatCopy(copy.adultFamily.profileLine, { role: roleLabel, household })
    : roleLabel ?? household;
  return {
    name,
    avatarUrl:   input.viewer.avatarUrl,
    avatarEmoji: input.viewer.avatarEmoji,
    roleLabel,
    line,
    a11yLabel: [name, line].filter(Boolean).join('. '),
  };
}

export function buildMemberRows(members: readonly HouseholdMember[]): MemberRow[] {
  return members.map((member) => {
    const roleLabel = roleLabelOf(member.role);
    return { member, name: member.name, roleLabel, a11yLabel: [member.name, roleLabel].filter(Boolean).join(', ') };
  });
}

export function buildInviteCard(input: AdultFamilyInput): InviteCard {
  if (!input.canInvite) return { kind: 'hidden' };
  if (input.invites.kind === 'loading') return { kind: 'loading', text: copy.adultFamily.inviteLoading };
  if (input.invites.kind === 'error') return { kind: 'error', text: copy.adultFamily.inviteError };
  // Newest first (the query's own order is created_at DESC; re-sorted so
  // the rule does not depend on the caller).
  const usable = input.invites.invites
    .filter((i) => isUsableInvite(i, input.now))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  const first = usable[0];
  if (!first) return { kind: 'none', text: copy.adultFamily.noInvite };
  const roleLabel = roleLabelOf(first.role) ?? first.role;
  const household = input.householdName?.trim();
  const more = usable.length - 1;
  return {
    kind:          'code',
    code:          first.code,
    roleLabel,
    forLabel:      formatCopy(copy.adultFamily.inviteFor, { role: roleLabel }),
    validityLabel: validityLabel(first.expires_at, input.now) ?? '',
    moreLabel:     more <= 0 ? null : more === 1 ? copy.adultFamily.moreOne : formatCopy(copy.adultFamily.moreMany, { n: more }),
    shareMessage:  household
      ? formatCopy(copy.adultFamily.shareMessage, { household, code: first.code })
      : formatCopy(copy.adultFamily.shareMessageNoName, { code: first.code }),
    codeA11y:      formatCopy(copy.adultFamily.inviteCodeA11y, { code: first.code.split('').join(' '), role: roleLabel.toLowerCase() }),
    shareA11y:     formatCopy(copy.adultFamily.shareA11y, { code: first.code }),
  };
}

export function buildAdultFamilyModel(input: AdultFamilyInput): AdultFamilyModel {
  const rows = buildMemberRows(input.members);
  return {
    profile: buildProfileRow(input),
    members: { rows, count: rows.length, heading: formatCopy(copy.adultFamily.membersHeading, { n: rows.length }) },
    invite:  buildInviteCard(input),
    settings: { label: copy.adultFamily.settings, hint: copy.adultFamily.settingsHint },
  };
}
