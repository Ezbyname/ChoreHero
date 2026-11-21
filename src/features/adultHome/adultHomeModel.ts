// Slice 6A: Adult Home / Family Control Center (Board 06 "Adult Home Final",
// Board 14 adult tokens). Pure and Node-test safe: no React, no
// react-native.
//
// The Home is an ENTRY POINT. It never decides anything itself:
//   - Needs attention lists the items the adult can review right now, from
//     the same sources and permission selectors the old Home review
//     sections used:
//       - Mission review:       buildTodaySections(...).reviewTasks
//                               (tasks.status = 'needs_attention'),
//                               only with tasks.approve_completion.
//       - Reward request:       reward_redemptions.status = 'pending',
//                               only with rewards.approve_redemption.
//                               Archived rewards stay reviewable (Decision 7).
//       - Helpful contribution: contribution_claims.status = 'pending',
//                               never the viewer's own claim, only with
//                               contributions.approve_claim.
//     Every row's action is the one word "Review" (Board 06). The row
//     says what kind of item it is; the existing review flow then shows
//     the real decision buttons. The count is items.length, never a
//     constant.
//   - Quick actions: exactly New mission (tasks.create) and New reward
//     (rewards.create). Each opens the existing create form.
//   - Kids today: one row per child member. The progress is D1
//     (selectDailyProgress, unchanged); the waiting count is that child's
//     missions waiting for an adult's review. No Points, balances,
//     rankings or percentages, and no family-wide metric.
//
// Ordering: no product rule orders review items across kinds, so the
// rows follow Board 06's kind order (Mission review, Reward request,
// Helpful contribution). Within a kind, and for Kids today, the store's
// existing order is kept as is. Nothing is sorted by progress, so no row
// order can read as a ranking.
//
// Not here on purpose (owner decision D3 and Board 06): no Recent
// activity feed (there is no real activity source), no family progress
// metric, no XP, levels, streaks or badges.

import { copy } from '@/content/copy';
import { formatCopy } from '@/content/formatCopy';
import { selectDailyProgress } from '@/features/tasks/dailyProgress';
import { buildTodaySections, pendingPhotoCountByTask } from '@/features/tasks/taskListSections';
import type {
  ContributionClaim,
  HouseholdMember,
  Reward,
  RewardRedemption,
  Task,
  TaskSubmissionSummary,
} from '@/types';

export type AttentionKind = 'mission_review' | 'reward_request' | 'helpful_contribution';

// Board 06 kind order.
export const ATTENTION_KIND_ORDER: readonly AttentionKind[] = ['mission_review', 'reward_request', 'helpful_contribution'];

export type AttentionItem = {
  kind:      AttentionKind;
  // The id of the task, redemption or claim. The review route uses it.
  id:        string;
  childId:   string | null;
  childName: string;
  title:     string;
  // "Maya · Math homework"
  heading:   string;
  // "Mission review", "Reward request", "Helpful contribution"
  typeLabel: string;
  // Real metadata only: the pending submission's photo count, or the
  // requested reward's Points. Null when there is nothing real to say.
  meta:      string | null;
  // Always copy.adultHome.review ("Review").
  cta:       string;
  a11yLabel: string;
  ctaA11yLabel: string;
  ctaA11yHint:  string;
};

export type QuickActionKey = 'new_mission' | 'new_reward';
export type QuickAction = { key: QuickActionKey; label: string; a11yHint: string };

export type KidToday = {
  member:        HouseholdMember;
  completed:     number;
  total:         number;
  // Missions waiting for an adult's review. Mission submissions only;
  // reward requests are not counted here.
  waiting:       number;
  progressLabel: string;
  // Null when nothing is waiting: no "0 waiting" badge.
  waitingLabel:  string | null;
  a11yLabel:     string;
};

export type AdultHomePermissions = {
  canReviewMissions:      boolean; // tasks.approve_completion
  canReviewRewards:       boolean; // rewards.approve_redemption
  canReviewContributions: boolean; // contributions.approve_claim
  canCreateMissions:      boolean; // tasks.create
  canCreateRewards:       boolean; // rewards.create
};

export type AdultHomeInput = {
  tasks:           readonly Task[];
  taskSubmissions: readonly TaskSubmissionSummary[];
  rewards:         readonly Reward[];
  redemptions:     readonly RewardRedemption[];
  claims:          readonly ContributionClaim[];
  members:         readonly HouseholdMember[];
  viewerId:        string | null;
  permissions:     AdultHomePermissions;
  now:             Date;
  timeZone:        string;
};

export type AdultHomeModel = {
  attention: {
    items: AttentionItem[];
    // Always items.length.
    count: number;
  };
  quickActions: QuickAction[];
  kids:         KidToday[];
};

function nameOf(members: readonly HouseholdMember[], profileId: string | null | undefined): string {
  if (!profileId) return copy.adultHome.someone;
  return members.find((m) => m.userId === profileId)?.name ?? copy.adultHome.someone;
}

function attentionItem(
  kind: AttentionKind,
  id: string,
  childId: string | null,
  childName: string,
  title: string,
  meta: string | null,
): AttentionItem {
  const typeLabel = copy.adultHome.types[kind];
  const heading = formatCopy(copy.adultHome.rowHeading, { name: childName, title });
  return {
    kind,
    id,
    childId,
    childName,
    title,
    heading,
    typeLabel,
    meta,
    cta:          copy.adultHome.review,
    a11yLabel:    [heading, typeLabel, meta].filter(Boolean).join('. '),
    ctaA11yLabel: formatCopy(copy.adultHome.reviewA11y, { name: childName, title }),
    ctaA11yHint:  formatCopy(copy.adultHome.reviewHint, { type: typeLabel.toLowerCase() }),
  };
}

export function photoMeta(count: number | undefined): string | null {
  if (!count || count <= 0) return null;
  return formatCopy(count === 1 ? copy.adultHome.photoOne : copy.adultHome.photoMany, { n: count });
}

export function buildNeedsAttention(input: AdultHomeInput): AttentionItem[] {
  const { tasks, taskSubmissions, rewards, redemptions, claims, members, viewerId, permissions } = input;
  const items: AttentionItem[] = [];

  if (permissions.canReviewMissions) {
    const { reviewTasks } = buildTodaySections(tasks, { canReview: true }, input.now);
    const photos = pendingPhotoCountByTask(taskSubmissions);
    for (const task of reviewTasks) {
      const childId = task.assigneeId ?? null;
      items.push(attentionItem('mission_review', task.id, childId, nameOf(members, childId), task.title, photoMeta(photos.get(task.id))));
    }
  }

  if (permissions.canReviewRewards) {
    const rewardById = new Map(rewards.map((r) => [r.id, r]));
    for (const r of redemptions) {
      if (r.status !== 'pending') continue;
      const title = rewardById.get(r.rewardId)?.title ?? copy.childRewards.unknownReward;
      const meta = formatCopy(copy.adultHome.pointsMeta, { n: r.pointsRequiredSnapshot });
      items.push(attentionItem('reward_request', r.id, r.requestedByProfileId, nameOf(members, r.requestedByProfileId), title, meta));
    }
  }

  if (permissions.canReviewContributions) {
    for (const c of claims) {
      // A claimant never reviews their own claim (also enforced by RLS).
      if (c.status !== 'pending' || c.claimedByProfileId === viewerId) continue;
      items.push(attentionItem('helpful_contribution', c.id, c.claimedByProfileId, nameOf(members, c.claimedByProfileId), c.title, null));
    }
  }

  return items;
}

export function buildQuickActions(permissions: AdultHomePermissions): QuickAction[] {
  const actions: QuickAction[] = [];
  if (permissions.canCreateMissions) actions.push({ key: 'new_mission', label: copy.adultHome.newMission, a11yHint: copy.adultHome.newMissionHint });
  if (permissions.canCreateRewards)  actions.push({ key: 'new_reward',  label: copy.adultHome.newReward,  a11yHint: copy.adultHome.newRewardHint });
  return actions;
}

// Child members, in the store's order. A household role is data here, not
// a permission check: Kids today is about who the children are.
export function childMembers(members: readonly HouseholdMember[]): HouseholdMember[] {
  return members.filter((m) => m.role === 'child');
}

export function buildKidsToday(input: Pick<AdultHomeInput, 'tasks' | 'members' | 'now' | 'timeZone'>): KidToday[] {
  const { tasks, members, now, timeZone } = input;
  return childMembers(members).map((member) => {
    const { completed, total } = selectDailyProgress(tasks, member.userId, now, timeZone);
    const waiting = tasks.filter((t) => t.status === 'needs_attention' && t.assigneeId === member.userId).length;
    const progressLabel = total > 0
      ? formatCopy(copy.adultHome.progress, { done: completed, total })
      : copy.adultHome.noneDueToday;
    const waitingLabel = waiting > 0 ? formatCopy(copy.adultHome.waiting, { n: waiting }) : null;
    const a11yLabel = [
      member.name,
      total > 0 ? formatCopy(copy.adultHome.progressA11y, { done: completed, total }) : copy.adultHome.noneDueToday,
      waiting > 0 ? formatCopy(copy.adultHome.waitingA11y, { n: waiting }) : null,
    ].filter(Boolean).join('. ');
    return { member, completed, total, waiting, progressLabel, waitingLabel, a11yLabel };
  });
}

export function buildAdultHomeModel(input: AdultHomeInput): AdultHomeModel {
  const items = buildNeedsAttention(input);
  return {
    attention:    { items, count: items.length },
    quickActions: buildQuickActions(input.permissions),
    kids:         buildKidsToday(input),
  };
}

// Finds one actionable item by kind and id, through the same rules as the
// Home list. The review route uses it, so it can never open something the
// Home would not offer (resolved, not permitted, or the viewer's own claim).
export function findAttentionItem(input: AdultHomeInput, kind: AttentionKind, id: string): AttentionItem | null {
  return buildNeedsAttention(input).find((i) => i.kind === kind && i.id === id) ?? null;
}

// ── Layout rules (Board 06 / Board 15 / Board 16) ───────────────────────────
// The effective width is the window width divided by the font scale, so a
// larger font behaves like a narrower phone.
function effectiveWidth(windowWidth: number, fontScale: number): number {
  return windowWidth / Math.max(1, fontScale);
}

// Board 16 (130% text): Review goes full width under the row text.
export const REVIEW_INLINE_MIN_WIDTH = 340;
export function reviewFullWidth(windowWidth: number, fontScale: number): boolean {
  return effectiveWidth(windowWidth, fontScale) < REVIEW_INLINE_MIN_WIDTH;
}

// Quick actions stay side by side until the space gets very narrow.
export const QUICK_ACTIONS_ROW_MIN_WIDTH = 290;
export function quickActionsStacked(windowWidth: number, fontScale: number): boolean {
  return effectiveWidth(windowWidth, fontScale) < QUICK_ACTIONS_ROW_MIN_WIDTH;
}

// Board 06 shows "Family dashboard" under the greeting on 390×844 and
// 412×915, not on 360×640.
export const DASHBOARD_SUBTITLE_MIN_HEIGHT = 700;
export function showDashboardSubtitle(windowHeight: number): boolean {
  return windowHeight >= DASHBOARD_SUBTITLE_MIN_HEIGHT;
}
