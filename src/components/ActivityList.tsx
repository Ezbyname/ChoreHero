import React from 'react';
import { ActivityCard } from '@/components/ActivityCard';
import { copy } from '@/content/copy';
import { getMemberByUserId, getMemberNameByUserId } from '@/features/household/householdUtils';
import type { ActivityAction, FamilyActivity } from '@/domain/familyActivity';
import type { HouseholdMember } from '@/types';

interface ActivityListProps {
  activities:         FamilyActivity[];
  members:            HouseholdMember[];
  onAction?:          (activity: FamilyActivity, action: ActivityAction) => void;
  pendingActivityId?: string | null;
}

// Renders any FamilyActivity through the same card regardless of which table
// (tasks vs contribution_claims, via TaskAdapter / ContributionClaimAdapter)
// it was built from — screens must not branch on activity source here.
export function ActivityList({ activities, members, onAction, pendingActivityId }: ActivityListProps) {
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
          />
        );
      })}
    </>
  );
}
