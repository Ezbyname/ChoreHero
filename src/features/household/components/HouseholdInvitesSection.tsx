import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '@/components/ui/AppButton';
import { Banner } from '@/components/ui/Banner';
import { Card } from '@/components/ui/Card';
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
      <Text style={styles.sectionTitle} accessibilityRole="header">{copy.householdInvites.title}</Text>
      <Card style={styles.card}>
        <Text style={styles.body}>{copy.householdInvites.body}</Text>

        <View style={styles.roleRow}>
          {INVITABLE_ROLES.map((r) => (
            <Pressable
              key={r}
              style={[styles.roleChip, selectedRole === r && styles.roleChipActive]}
              onPress={() => setSelectedRole(r)}
              accessibilityRole="radio"
              accessibilityState={{ selected: selectedRole === r }}
            >
              <Text style={[styles.roleChipText, selectedRole === r && styles.roleChipTextActive]}>
                {copy.householdInvites.roleLabels[r]}
              </Text>
            </Pressable>
          ))}
        </View>

        <AppButton
          label={copy.householdInvites.createButton}
          icon="person-add-outline"
          onPress={() => { void handleCreate(); }}
          busy={isCreating}
        />

        {error ? <Banner tone="danger" text={error} /> : null}

        {isLoadingInvites ? null : invites.length === 0 ? (
          <Text style={styles.emptyText}>{copy.householdInvites.empty}</Text>
        ) : (
          invites.map((invite) => (
            <View key={invite.id} style={styles.inviteRow}>
              <View style={styles.inviteInfo}>
                <Text style={styles.inviteCode} selectable>{invite.code}</Text>
                <Text style={styles.inviteMeta}>{copy.householdInvites.roleLabels[invite.role]}</Text>
              </View>
              <AppButton
                label={copy.householdInvites.revokeButton}
                variant="dangerOutline"
                compact
                busy={pendingRevokeId === invite.id}
                disabled={pendingRevokeId !== null && pendingRevokeId !== invite.id}
                onPress={() => { void handleRevoke(invite.id); }}
              />
            </View>
          ))
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop:         spacing.lg,
    paddingHorizontal: spacing.xl,
    gap:               spacing.sm,
  },
  sectionTitle: {
    ...typography.label,
    color:         colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  card: {
    gap: spacing.md,
  },
  body: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  roleRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           spacing.sm,
  },
  roleChip: {
    minHeight:         40,
    justifyContent:    'center',
    borderRadius:      radius.pill,
    borderWidth:       1,
    borderColor:       colors.border,
    paddingHorizontal: spacing.md,
  },
  roleChipActive: {
    borderColor:     colors.primary,
    backgroundColor: colors.primarySoft,
  },
  roleChipText: {
    ...typography.label,
    color: colors.textSecondary,
  },
  roleChipTextActive: {
    color: colors.primary,
  },
  emptyText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  inviteRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    gap:            spacing.md,
    paddingTop:     spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  inviteInfo: {
    flex: 1,
    gap:  2,
  },
  inviteCode: {
    ...typography.bodyStrong,
    color:         colors.textPrimary,
    letterSpacing: 2,
  },
  inviteMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
