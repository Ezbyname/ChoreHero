import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { copy } from '@/content/copy';
import { createInvite } from '@/features/household/createInvite';
import { revokeInvite } from '@/features/household/revokeInvite';
import { getActiveHouseholdInvites } from '@/lib/repositories';
import { colors, radius, spacing, typography } from '@/theme';
import type { HouseholdInviteRow, HouseholdMemberRole } from '@/types/supabase';

type InvitableRole = Extract<HouseholdMemberRole, 'admin' | 'adult' | 'child'>;
const INVITABLE_ROLES: InvitableRole[] = ['child', 'adult', 'admin'];

interface HouseholdInvitesSectionProps {
  householdId:        string;
  createdByProfileId: string;
  role:                string | null;
}

// Owner/admin-only invite management: generate a role-assigning code,
// revoke one early. Read-heavy and management-only (not part of the
// hydration/FamilyActivity domain), so it fetches for itself on mount
// rather than going through AppDataBootstrap.
export function HouseholdInvitesSection({ householdId, createdByProfileId, role }: HouseholdInvitesSectionProps) {
  const [invites, setInvites]           = useState<HouseholdInviteRow[]>([]);
  const [isLoadingInvites, setLoading]  = useState(true);
  const [selectedRole, setSelectedRole] = useState<InvitableRole>('child');
  const [isCreating, setIsCreating]     = useState(false);
  const [pendingRevokeId, setPendingRevokeId] = useState<string | null>(null);
  const [error, setError]               = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const result = await getActiveHouseholdInvites(householdId);
      if (cancelled) return;
      if (!result.error) setInvites(result.data);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [householdId]);

  async function handleCreate() {
    if (isCreating) return;
    setIsCreating(true);
    setError(null);

    const result = await createInvite({
      householdId,
      createdByProfileId,
      role:       selectedRole,
      callerRole: role,
    });

    if (result.ok) {
      setInvites((prev) => [result.invite, ...prev]);
    } else {
      setError(copy.householdInvites.createError);
    }
    setIsCreating(false);
  }

  async function handleRevoke(inviteId: string) {
    if (pendingRevokeId) return;
    setPendingRevokeId(inviteId);
    setError(null);

    const result = await revokeInvite({ inviteId, callerRole: role });

    if (result.ok) {
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
    } else {
      setError(copy.householdInvites.revokeError);
    }
    setPendingRevokeId(null);
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{copy.householdInvites.title}</Text>
      <Text style={styles.body}>{copy.householdInvites.body}</Text>

      <View style={styles.roleRow}>
        {INVITABLE_ROLES.map((r) => (
          <TouchableOpacity
            key={r}
            style={[styles.roleChip, selectedRole === r && styles.roleChipActive]}
            onPress={() => setSelectedRole(r)}
            activeOpacity={0.7}
          >
            <Text style={[styles.roleChipText, selectedRole === r && styles.roleChipTextActive]}>
              {copy.householdInvites.roleLabels[r]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.createButton, isCreating && styles.buttonDisabled]}
        onPress={handleCreate}
        disabled={isCreating}
        activeOpacity={0.8}
      >
        {isCreating ? (
          <ActivityIndicator size="small" color={colors.surface} />
        ) : (
          <Text style={styles.createButtonText}>{copy.householdInvites.createButton}</Text>
        )}
      </TouchableOpacity>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {isLoadingInvites ? null : invites.length === 0 ? (
        <Text style={styles.emptyText}>{copy.householdInvites.empty}</Text>
      ) : (
        invites.map((invite) => (
          <View key={invite.id} style={styles.inviteRow}>
            <View style={styles.inviteInfo}>
              <Text style={styles.inviteCode}>{invite.code}</Text>
              <Text style={styles.inviteMeta}>{copy.householdInvites.roleLabels[invite.role]}</Text>
            </View>
            <TouchableOpacity
              style={styles.revokeButton}
              onPress={() => handleRevoke(invite.id)}
              disabled={pendingRevokeId === invite.id}
              activeOpacity={0.7}
            >
              {pendingRevokeId === invite.id ? (
                <ActivityIndicator size="small" color={colors.textSecondary} />
              ) : (
                <Text style={styles.revokeButtonText}>{copy.householdInvites.revokeButton}</Text>
              )}
            </TouchableOpacity>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop:         spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  sectionTitle: {
    ...typography.caption,
    color:         colors.textMuted,
    fontWeight:    '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom:  spacing.sm,
  },
  body: {
    ...typography.caption,
    color:        colors.textSecondary,
    marginBottom: spacing.sm,
  },
  roleRow: {
    flexDirection: 'row',
    gap:           spacing.xs,
    marginBottom:  spacing.sm,
  },
  roleChip: {
    borderRadius:      radius.pill,
    borderWidth:       1,
    borderColor:       colors.borderSoft,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.xs,
  },
  roleChipActive: {
    borderColor:     colors.primary,
    backgroundColor: colors.primarySoft,
  },
  roleChipText: {
    ...typography.caption,
    color:      colors.textSecondary,
    fontWeight: '600',
  },
  roleChipTextActive: {
    color: colors.primary,
  },
  createButton: {
    backgroundColor: colors.primary,
    borderRadius:    radius.md,
    paddingVertical: spacing.sm,
    alignItems:      'center',
    marginBottom:    spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  createButtonText: {
    ...typography.caption,
    color:      colors.surface,
    fontWeight: '600',
  },
  errorText: {
    ...typography.caption,
    color:        '#B91C1C',
    marginBottom: spacing.sm,
  },
  emptyText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  inviteRow: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    backgroundColor:   colors.surface,
    borderRadius:      10,
    borderWidth:       1,
    borderColor:       colors.borderSoft,
    paddingHorizontal: spacing.lg,
    paddingVertical:   spacing.sm,
    marginBottom:      spacing.xs,
  },
  inviteInfo: {
    gap: 2,
  },
  inviteCode: {
    ...typography.body,
    color:         colors.textPrimary,
    fontWeight:    '700',
    letterSpacing: 1,
  },
  inviteMeta: {
    ...typography.caption,
    color: colors.textMuted,
  },
  revokeButton: {
    borderRadius:      8,
    borderWidth:       1,
    borderColor:       colors.borderSoft,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.xs,
  },
  revokeButtonText: {
    ...typography.caption,
    color:      colors.textSecondary,
    fontWeight: '600',
  },
});
