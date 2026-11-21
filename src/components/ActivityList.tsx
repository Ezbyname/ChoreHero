import React from 'react';
import { ActivityCard, type ActivityCardDecorations } from '@/components/ActivityCard';
import { copy } from '@/content/copy';
import { getMemberByUserId, getMemberNameByUserId } from '@/features/household/householdUtils';
import type { ActivityAction, FamilyActivity } from '@/domain/familyActivity';
import type { HouseholdMember } from '@/types';

interface ActivityListProps {
  activities:         FamilyActivity[];
  members:            HouseholdMember[];
  onAction?:          (activity: FamilyActivity, action: ActivityAction) => void;
  pendingActivityId?: string | null;
  // Per-card extras (status pill, evidence photo count).
  decorate?:          (activity: FamilyActivity) => ActivityCardDecorations | undefined;
}

// Renders any FamilyActivity through the same card regardless of which table
// (tasks vs contribution_claims, via TaskAdapter / ContributionClaimAdapter)
// it was built from — screens must not branch on activity source here.
// key = activity id: one card per domain record, never per title.
export function ActivityList({ activities, members, onAction, pendingActivityId, decorate }: ActivityListProps) {
  return (
    <>
      {activities.map((activity) => {
        const isUnassignedTask = activity.kind === 'task' && !activity.targetProfileId;
        const personId          = activity.targetProfileId ?? activity.createdByProfileId;
        const personName         = isUnassignedTask
          ? copy.taskCard.unassigned
          : getMemberNameByUserId(members, personId);
        const person = getMemberByUserId(members, personId);

        return (
          <ActivityCard
            key={activity.id}
            activity={activity}
            personName={personName}
            personAvatarUrl={person?.avatarUrl}
            personAvatarEmoji={person?.avatarEmoji}
            isPersonUnassigned={isUnassignedTask}
            onAction={onAction ? (action) => onAction(activity, action) : undefined}
            isActionPending={pendingActivityId === activity.id}
            decorations={decorate?.(activity)}
          />
        );
      })}
    </>
  );
}
