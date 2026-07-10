// FamilyActivity is a UI-facing projection, not a persistence model — see
// src/domain/adapters/. tasks and contribution_claims stay separate tables
// with their own RLS policies; this type only unifies how the app *displays*
// and *acts on* them, per docs/architecture.md's activity-unification note.

export type ActivityKind = 'task' | 'request' | 'event' | 'reminder';

export type ActivityStatus =
  | 'open'
  | 'pending'
  | 'accepted'
  | 'in_progress'
  | 'needs_attention'
  | 'completed'
  | 'declined';

// Only actions with a real, shipped mutation behind them. 'skip' (mentioned
// for chores in early design discussion) has no corresponding status/feature
// yet, so it is deliberately not modeled — matches the "don't add unused
// scaffolding" precedent already set by the RLS migrations.
// 'complete' has no wired mutation yet either (see TaskAdapter) — it stays
// in the union because the shape is correct, but no screen supplies an
// onAction handler for it, so ActivityCard renders no button for it today.
export type ActivityAction = 'claim' | 'complete' | 'approve' | 'decline';

// createdByProfileId / targetProfileId are raw ids, not embedded user
// objects — display-name/avatar resolution stays a render-time concern via
// householdUtils, exactly as it already works for Task and ContributionClaim.
// Keeping adapters pure (no household-member dependency) avoids coupling the
// domain layer to store state.
export interface FamilyActivity {
  id:                  string;
  kind:                ActivityKind;
  title:               string;
  description?:        string;
  householdId?:        string;
  createdByProfileId?: string;
  targetProfileId?:    string;
  status:              ActivityStatus;
  dueAt?:              string;
  points?:             number;
  requiresApproval:    boolean;
  availableActions:    readonly ActivityAction[];
}
