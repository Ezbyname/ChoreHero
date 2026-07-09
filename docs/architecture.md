# ChoreHero — Architecture & Developer Onboarding Guide

> This document supersedes the narrower "Architecture Invariants" note that
> previously lived at this path — that content is preserved in full under
> §17 (Architectural Rules), not deleted. Everything else is new.
>
> Audience: an experienced React Native / TypeScript / Supabase engineer who
> has never seen this repository. Goal: after reading this, you should
> understand not just what exists, but why, well enough to extend the app
> without breaking its boundaries.

---

## 1. Product Overview

**ChoreHero** is a family chore-management app, built around one core idea:
turn household chores into a lightweight, fair *game* rather than a nagging
list. Its own tagline in the UI is "a calmer way to share family tasks."

**Users**: parents and children within a single household. A household can
have several adults and several children.

**Roles** (hierarchical — each level includes everything below it):
```
owner  ⊇  admin  ⊇  adult  ⊇  child
```
- `owner` — created the household, full control (rename/delete the household).
- `admin` — trusted adult with management rights (invite members, manage
  members, create rewards, approve requests).
- `adult` — standard adult member (create/assign tasks, approve/reject
  contribution claims).
- `child` — limited (complete assigned tasks, redeem rewards, submit
  contribution claims — but never self-approve them).

**Two distinct ways work gets logged — this distinction matters a lot and
recurs throughout the codebase:**

```
Task          = planned, top-down. An adult creates it and assigns it.
Contribution  = self-reported, bottom-up. A member reports something they
                did that wasn't a formal task, and a household adult
                approves or rejects it before any points are awarded.
```
A child can never award themselves points by submitting a contribution
claim — approval by an adult/admin/owner is mandatory. This is enforced at
three independent layers: the permission vocabulary (§10), the RLS policies
(§9), and a DB-level unique constraint preventing more than one pending
claim per member at a time.

**Reward model**: tasks and approved contribution claims earn points;
points are spent against household-defined rewards. This is the core game
loop — plan → complete → earn → spend.

**Household model**: a household is the data boundary for almost
everything (tasks, rewards, points, contribution claims). A profile can
belong to more than one household (the schema supports it, though the UI's
"active household" resolution currently picks one at a time — see §7).

---

## 2. Technology Stack

| Technology | Responsibility | Why it's here |
|---|---|---|
| **Expo (SDK 56)** | Cross-platform React Native runtime + tooling | Single codebase targets iOS/Android/Web; this project is currently deployed as a **web export** (`expo export -p web`) to Vercel — there is no published native build yet. |
| **React Native** | UI primitives (`View`, `Text`, `TouchableOpacity`, ...) | Same components render on web via `react-native-web`; no separate web-only component tree. |
| **TypeScript** | Static typing throughout | Every file is `.ts`/`.tsx`; `strict: true` in `tsconfig.json`. |
| **Zustand** | Global client state | One flat store (`useAppStore`), no slices/middleware — see §5. Chosen over Redux/Context for minimal boilerplate at this app's scale. |
| **React Navigation (v7)** | Screen navigation | Classic React Navigation (`@react-navigation/native-stack` + `@react-navigation/bottom-tabs`) — **not** Expo Router. No file-based routing, no deep-linking config currently wired up. |
| **Supabase** | Auth + Postgres + Row Level Security + Storage | Auth (email/password), the app database, and (as of the avatar-upload feature) Storage for profile photos. |
| **PostgreSQL (via Supabase)** | Source of truth | Every domain table has RLS enabled — see §9. |
| **Row Level Security** | The *real* authorization boundary | Not optional, not a nice-to-have — see §9 for why the TypeScript permission layer is explicitly **not** a substitute for it. |
| **Edge Functions** | **Not used.** | This project has no `api/` or `functions/` directory and no serverless backend of any kind. All privileged logic that would normally live in an Edge Function instead lives in Postgres `SECURITY DEFINER` RPCs (see §8, §9) or is deliberately deferred. If you're looking for a backend service to add server-side logic to, it doesn't exist yet — the pattern to follow is a Postgres function, not a new service. |
| **Expo Router** | **Not used.** | Navigation is classic React Navigation, not file-based routing. Don't add `app/` directory conventions expecting Expo Router semantics. |
| **AsyncStorage** | **Not used.** | No explicit session-persistence library is wired up. On web, Supabase's client defaults to `localStorage` for session persistence; native session persistence has not been configured. |
| `@expo/vector-icons` | Bottom tab bar icons | Bundled with Expo but wasn't an explicit dependency until the tab bar got icons (previously text-only labels). |
| `expo-image-picker` | Profile photo picking | Pinned to the exact version Expo's own `bundledNativeModules.json` declares for SDK 56 (`~56.0.18`), not "latest" — SDK-version drift between Expo and its native modules is a real source of breakage. |
| `@playwright/test` | E2E testing | See §19. |

---

## 3. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Screens            (src/screens/)                           │
│   — compose components, own local UI state (form inputs,    │
│     submit/loading flags), call feature functions/repos     │
├─────────────────────────────────────────────────────────────┤
│ Components         (src/components/)                        │
│   — presentational; receive data + callbacks via props only │
├─────────────────────────────────────────────────────────────┤
│ Feature functions   (src/features/*/…)                      │
│   — permission-gated execution: "can this role do this      │
│     action right now?" then calls the repository            │
├─────────────────────────────────────────────────────────────┤
│ Selectors          (src/store/selectors.ts)                 │
│   — the ONLY sanctioned way to read derived/computed state  │
├─────────────────────────────────────────────────────────────┤
│ Store              (src/store/useAppStore.ts, Zustand)      │
│   — single source of client-side app state                  │
├─────────────────────────────────────────────────────────────┤
│ Repositories       (src/lib/repositories/)                  │
│   — the ONLY layer allowed to call the Supabase client       │
├─────────────────────────────────────────────────────────────┤
│ Supabase           (Postgres + RLS + Storage + Auth)         │
│   — the real authorization boundary                          │
└─────────────────────────────────────────────────────────────┘
```

**Dependency direction is strictly downward.** A screen may import a
component, a feature function, a selector, or a repository. A repository
must never import a screen or a component. A component must never call a
repository directly — it receives data as props from a screen. This isn't
enforced by a linter today; it's enforced by convention and code review.
Breaking it (e.g. a component calling Supabase directly) is the single
most common way to accidentally bypass permission checks or hydration
guarantees.

**Two more cross-cutting pieces sit outside this stack, wrapping the whole
app:**
- `src/bootstrap/AuthBootstrap.tsx` — the *only* place that translates raw
  Supabase auth events into store state.
- `src/bootstrap/AppDataBootstrap.tsx` — the *only* place that runs the
  hydration pipeline (§7) and writes hydrated data into the store.

Nothing else is allowed to write authentication or hydration state
directly — see §17 for the explicit invariant.

---

## 4. Folder Structure

```
src/
  bootstrap/     Root-level effects: AuthBootstrap, AppDataBootstrap,
                 AppBootstrap (composes the two + AuthGate). Nothing else
                 belongs here — this is not a general "utils" dumping ground.
  components/    Presentational, reusable components (FamilyAvatar, TaskCard,
                 ContributionClaimCard, EmptyState, ErrorState, Screen,
                 ScreenHeader). No business logic, no direct Supabase calls.
  content/       copy.ts — every user-facing string lives here, grouped by
                 screen/feature. Never inline a UI string in a component.
  domain/        Pure business-rule modules with no React, no Supabase, no
                 store dependency. Currently just permissions.ts (§10).
  features/      One-off, permission-gated action functions, organized by
                 feature (contributions/, household/, tasks/, rewards/).
                 This is where "claim a contribution," "approve a claim,"
                 "get a member's name by id" live — logic that's more than
                 a pure selector but isn't a whole screen.
  guards/        Pure validation functions with no side effects — currently
                 hydrationInvariants.ts (§7). "Guard" = "throws or returns
                 boolean, never mutates, never calls anything external."
  lib/           Cross-cutting library code: the Supabase client itself
                 (supabase.ts, supabaseConfig.ts), the repository layer
                 (lib/repositories/*), and small platform-detection helpers
                 (authRedirectDetection.ts).
  mock/          Mock/seed data used only when Supabase isn't configured
                 (local dev without credentials). Never imported by
                 anything that talks to real Supabase.
  navigation/    React Navigation setup: AuthGate (auth vs unauthenticated
                 routing), AuthenticatedAppGate (hydration-state routing),
                 AuthStack, AppTabs, navigation param types.
  screens/       One file per screen. Owns local form/UI state, composes
                 components, calls features/repositories. Never calls
                 Supabase directly (goes through a repository).
  store/         useAppStore.ts (the Zustand store) + selectors.ts.
  theme/         colors, spacing, typography, radius, shadows — the only
                 place style constants are defined.
  types/         Domain types (Task, HouseholdMember, ContributionClaim...),
                 the generated-by-hand Supabase Database type, hydration
                 context types.

supabase/
  migrations/    Every schema/RLS/Storage change, in chronological order.
                 Migration history rule: never edit a file after it has
                 been applied — write a new migration instead.

scripts/
  seed-qa-data.mjs   Local-dev-only QA data seeder. Uses the Supabase
                     service role key from a gitignored .env.local — never
                     committed, never used client-side. See §19.

e2e/             Playwright end-to-end tests, run against a real deployed
                 build (not a local dev server).

docs/            This file, plus narrower supporting documents referenced
                 throughout (schema-design.md, rls-strategy.md,
                 hydration-architecture.md, household-roles-and-
                 permissions.md, onboarding-flow-qa.md, roadmap.md, and
                 ADR-001 for the pending identity-model decision).
```

---

## 5. State Management

**One flat Zustand store** (`src/store/useAppStore.ts`), no slices, no
middleware, no persistence layer. It holds three logically distinct
regions of state in a single object:

```
App data       user, household, tasks, rewards, pointsBalances,
                contributionClaims, isMockHydrated
Auth identity   authSession, authUser, isAuthResolved, isAuthLoading,
                authError                    (AuthBootstrap writes this)
Hydration       appHydrationState, isAppDataLoading, appDataError,
                appDataErrorCode, activeHouseholdId, hasNoHousehold,
                hydratedForAuthUserId, hydrationRunId, hydrationSequence
                                             (AppDataBootstrap writes this)
```

**Why selectors exist, and why components should prefer them over reading
store state directly**: a raw `useAppStore((s) => s.household)` couples
every call site to the store's exact shape. `selectCurrentHousehold`,
`selectNeedsProfileSetup`, `selectHasPendingContributionClaimsToReview`,
etc. (`src/store/selectors.ts`) centralize *derived* logic — e.g.
`selectIsAuthenticated` is `Boolean(s.authUser)`, not a raw field, and
`selectNeedsProfileSetup` combines two fields
(`appHydrationState === 'error' && appDataErrorCode === 'missing_profile'`).
If that combination logic changes, it changes in one place, not at every
call site.

**Loading/error/retry states are hydration-specific — see §7 for the full
state machine.** The short version: `appHydrationState` is one of `'idle' |
'loading' | 'hydrated' | 'partial' | 'error'`, and only `AppDataBootstrap`
is allowed to transition it.

**No caching layer, no query library** (no React Query/SWR). Hydration is
a one-shot pipeline per auth-user-session, re-triggered explicitly via
`requestAppDataHydrationRetry()` (called by `ProfileSetupScreen` and
`HouseholdSetupScreen` after a successful recovery action), not
automatically re-fetched on an interval or on window focus.

---

## 6. Authentication Flow

```
App start
  → AuthBootstrap subscribes to supabase.auth.onAuthStateChange()
  → First event (INITIAL_SESSION or SIGNED_IN) → applyAuthSession(session)
    → store: authUser, authSession, isAuthResolved = true
  → SIGNED_OUT → clearAuthSession() → authUser = null

AuthGate (src/navigation/AuthGate.tsx) — pure renderer, no side effects:
  → not isAuthResolved            → loading placeholder
  → isAuthenticated               → AuthenticatedAppGate (see §7)
  → else                          → AuthStack (Welcome/Login/Signup)
```

A few things worth knowing that aren't obvious from the code alone:

- **Signup creates only a Supabase auth identity — no profile, no
  household.** `SignupScreen.tsx`'s own doc comment is explicit: "Creates
  a Supabase Auth identity only — no profile, no household, no
  onboarding." Profile creation is a separate, later step (§7).
- **Email confirmation lands on a dedicated static screen, not the app.**
  Clicking the confirmation link in the email opens a browser tab where
  Supabase establishes a session as a side effect — but that tab was never
  meant to be where the user actually signs in day-to-day (the real
  sign-in happens on whichever device they use ChoreHero from).
  `hasAuthRedirectMarkers()` (`src/lib/authRedirectDetection.ts`) captures
  the URL's hash/query **at module-evaluation time** — imported first in
  `index.ts`, before the Supabase client is even constructed — because
  Supabase processes and strips these markers asynchronously; reading them
  later (e.g. inside a component) risks losing the race. When present,
  `AppBootstrap` renders a static "Email confirmed — you can close this
  page now" screen instead of booting the full app.
- **No password reset flow exists yet.**
- **No AsyncStorage / native session persistence has been configured** —
  see §2.

---

## 7. Hydration Flow

Hydration is the pipeline that turns "I have an authenticated Supabase
session" into "the app has your profile, household, tasks, rewards, and
contribution claims loaded." It exists as a distinct concept from
authentication because *being logged in* and *having usable app data* are
genuinely different states — a brand-new user is authenticated the instant
they confirm their email, but has no profile row yet.

**Owned entirely by `AppDataBootstrap.tsx`.** No screen, selector, or
component may write hydration state directly — see §17.

### State machine

```
idle ──(auth resolved + authenticated)──▶ loading
loading ──(success, no household)───────▶ partial   (terminal)
loading ──(success, full data)──────────▶ hydrated  (terminal)
loading ──(any phase fails)─────────────▶ error     (terminal)
error/partial ──(requestAppDataHydrationRetry())──▶ idle ──▶ loading (retry)
```

`idle`, `partial`, and `error` are all **terminal** — none of them
auto-retry. Only an explicit `requestAppDataHydrationRetry()` call (made
by `ProfileSetupScreen` after creating a profile, or `HouseholdSetupScreen`
after creating/joining a household) resets state to `idle` and lets the
pipeline run again.

> **Why this distinction is called out so explicitly**: two real,
> shipped bugs both violated it, and both produced the same visible
> symptom — an infinite "Getting your ChoreHero ready…" loading screen
> that never resolved. Root-caused with real runtime instrumentation, not
> static analysis alone, in both cases:
> 1. `appHydrationState` was *both* a dependency of the hydration
>    `useEffect` *and* treated as a retry trigger when its value was
>    `'error'` — so every failure re-triggered itself the instant it
>    committed, before the previous attempt's request even resolved.
> 2. `hydratedForAuthUserId` (used to detect "has this user's hydration
>    already been resolved") was only ever set on the *success* path — any
>    user whose hydration ended in an error left it stuck at its initial
>    `null` forever, making the retry condition unconditionally true.
>
> Both are now fixed, but the underlying lesson generalizes: **any new
> "should I re-run this effect" condition here must be evaluated on both
> the success path and every failure path, or it will eventually produce
> the exact same class of infinite loop.**

### Execution order (three phases, `AppDataBootstrap.tsx`)

```
Phase 1 — Profile
  getProfileById(authUserId)
  no row, no error → 'error' / missing_profile  (→ ProfileSetupScreen)
  error             → 'error' / load_failed
  found             → continue

Phase 2 — Structure (household)
  getHouseholdsForProfile(profile.id)
  resolveActiveHousehold(): profile.default_household_id if set and a
    member of it, else the deterministically-sorted first candidate
    (sortHouseholdCandidatesDeterministically — created_at ASC, id ASC
    tiebreak; this determinism is guaranteed by hydrationInvariants.ts,
    independent of whatever order the repository query returned in)
  no household → commit 'partial'               (→ HouseholdSetupScreen)

Phase 3 — Domain (parallel Promise.all)
  getHouseholdMembers, getTasksForHousehold, getRewardsForHousehold,
  getPointsBalancesForHousehold, getContributionClaimsForHousehold
  any error → 'error' / load_failed
  then a separate follow-up: getProfilesByIds(member profile_ids) — not
  joined into the Promise.all above because it depends on Phase 3's own
  members result. Failure here degrades gracefully to empty profiles
  (member names fall back to raw profile_id) rather than failing the
  whole hydration — member display is not critical-path.
  success → commitHydrationSnapshot() → 'hydrated'
```

`commitHydrationSnapshot` (in the store) is the **sole atomic commit
path** — it runs two guards before writing anything:
1. **Identity guard** (`isHydrationCommitAllowed`) — rejects a commit
   whose `runId`/`sequence` don't match the store's current run. This is
   what makes a *stale* completed request harmless even if it resolves
   after a newer run has superseded it (logout mid-hydration, user switch,
   duplicate effect invocation).
2. **Shape guard** (`assertValidHydrationContext` /
   `assertPartialHydrationContext`, in `src/guards/hydrationInvariants.ts`)
   — a pure function that throws if the snapshot is internally
   inconsistent (e.g. a task whose `household_id` doesn't match the active
   household). A thrown invariant becomes an `error`/`load_failed` commit,
   never a partial write.

---

## 8. Database Architecture

Full column-level detail lives in `docs/schema-design.md` and the
migration files themselves (`supabase/migrations/`, chronological, never
edited after being applied). This section is the conceptual map.

```
auth.users (Supabase-managed)
    │ 1:1 (today — see ADR-001 for a proposed change to this)
    ▼
profiles ──────────────────┐
    │ 1:N                  │ 1:N
    ▼                      ▼
household_members    (profile owns:)
    │ N:1                  tasks (as creator/assignee)
    ▼                      rewards (as creator)
households                 contribution_claims (as claimant/reviewer)
    │ 1:N                  points_balances / point_transactions
    ├─ tasks
    ├─ rewards
    ├─ points_balances
    ├─ point_transactions
    ├─ contribution_claims
    └─ household_invites   (built, currently on hold — see ADR-001)
```

**Identity anchor (current, documented, about to be revisited)**:
`profiles.id = auth.users.id`, enforced by a foreign key with `ON DELETE
CASCADE`. Every `*_profile_id` column across the schema points at
`profiles.id`, never at `auth.users.id` directly — this is why ADR-001's
proposed identity-model change (§9) is viable without touching any of
those foreign keys.

**Contribution vs Task, at the schema level**: `tasks` and
`contribution_claims` are deliberately separate tables with no shared
lineage — a `contribution_claims` row is never "promoted" into a `tasks`
row. `contribution_claims.status` (`pending` → `approved`/`rejected`) is
enforced with a partial unique index — **at most one `pending` claim per
`(household_id, claimed_by_profile_id)`** — so a member can't spam
duplicate claims while one is awaiting review.

**Points are never written directly by the client.** `points_balances`
and `point_transactions` currently have **read-only** RLS policies for
everyone, including owners — by design (see `docs/rls-strategy.md`'s
"Points Balance Mutation Strategy"). The controlled-workflow RPC that
would actually award points on task completion / claim approval **does
not exist yet** — this is real, current technical debt, not an oversight
(§20).

---

## 9. Security Model

**The load-bearing rule of this entire codebase**: Row Level Security is
the real authorization boundary. The TypeScript permission layer (§10)
controls what the UI *offers* to do; RLS controls what the database
*allows*, independent of and un-trusting of the client. See §17 for the
explicit invariant and why both layers must exist independently.

**What can be trusted vs. not**:
- `auth.uid()` inside a Postgres RLS policy — trustworthy (derived from
  the verified JWT, not client-supplied).
- Anything the client sends in a request body/payload — never trustworthy
  on its own; must always be re-checked by a policy or `WITH CHECK`
  clause, not assumed correct because the UI wouldn't normally send it.
- The `anon`/`authenticated` Supabase keys used by the client — safe to
  ship in the client bundle by design (that's what they're for); the
  `service_role` key is the opposite — **never** ships to the client,
  never appears in any repository file, only used in the local-dev-only
  seed script via a gitignored `.env.local` (§19).

**RLS policies currently exist for**: `profiles`, `households`,
`household_members`, `tasks`, `rewards`, `points_balances` (read-only),
`point_transactions` (read-only), `contribution_claims`, `household_invites`
(built, on hold), and the `avatars` Storage bucket. Every one of these was
zero-policy (RLS enabled, nothing granted, default-deny) until the RLS
work landed in this session's later commits — confirmed both by grepping
every migration file for `CREATE POLICY` and, independently, by a real
production `403 Forbidden` on a profile-creation attempt before the fix
shipped. **Scope is deliberately narrower than the full target matrix** in
`docs/rls-strategy.md` — only what shipped client code actually exercises
today. See that document (and the migration files' own header comments)
for exactly what's deferred and why.

**SECURITY DEFINER helper pattern**: two small Postgres functions,
`internal.is_household_member(household_id, profile_id, roles?)` and
`internal.shares_household_with(other_profile_id)`, live in a private
`internal` schema (not `public`), with `EXECUTE` revoked from `PUBLIC` and
granted only to `authenticated`. They exist because an *ordinary* (non-
`SECURITY DEFINER`) policy on table A that queries table B is itself
subject to table B's RLS as evaluated for the current caller — which can
silently make the policy vacuously deny everything, or in some shapes,
recurse. `SECURITY DEFINER` makes the helper's *internal* query run as the
function's owner, bypassing that table's RLS entirely for that one
narrow, audited check. This is the only sanctioned way to write a
cross-table RLS check in this codebase — don't inline an ordinary
subquery across tables inside a policy without this pattern.

**Identity model is under active reconsideration** — see
`docs/adr-001-family-member-identity-model.md` (status: Proposed, not yet
accepted). The proposal: decouple `profiles.id` from `auth.users.id` so a
parent can create a family member's profile without that member needing a
device or an account at all ("parent adds Sam" as a pure data operation),
with authentication becoming something attached *later*, optionally, via
an explicit link step. This is a real, weighty change — it touches every
RLS policy currently written as `= auth.uid()` — and is not yet
implemented. Don't build new features assuming either the current anchor
or the proposed one is permanent; check the ADR's status first.

---

## 10. Permission System

`src/domain/permissions.ts` is the single source of truth for "what can
this role do." Pure TypeScript, no React, no Supabase — a lookup table:

```ts
CHILD_PERMISSIONS  ⊂  ADULT_PERMISSIONS  ⊂  ADMIN_PERMISSIONS  ⊂  OWNER_PERMISSIONS
```
Each set is built by *spreading* the tier below and adding new
permissions — the superset relationship is structural, not maintained by
hand-duplicating lists. `hasHouseholdPermission(role, permission)` is
deny-by-default: `null`, `undefined`, and any unrecognized role string all
return `false`. An unknown role is never upgraded to a known one.

**The permission vocabulary already encodes the Task ≠ Contribution
split**: `tasks.create`/`tasks.assign` vs.
`contributions.create_completed`/`contributions.claim_completed`/
`contributions.approve_claim`/`contributions.reject_claim` are distinct
permission strings, not variations of the same one — reinforcing that
these are different domain concepts throughout the codebase, not just at
the schema level.

**Common mistake to avoid**: comparing `role === 'owner'` (or similar)
directly in a screen or component. Every permission decision must go
through `hasHouseholdPermission`/`getPermissionsForRole` or a selector
built on top of them — never a raw role string comparison. This is stated
as a hard invariant in the code's own comments, not just a style
preference (§17).

**Where UI uses this vs. where the backend enforces it**: the permission
layer decides what buttons/actions the UI *offers*. RLS (§9) independently
re-checks the same boundary at the database level. Neither is a substitute
for the other — a UI-level permission check with no matching RLS policy is
a security hole waiting to happen (this is exactly what the `403` incident
in §9 surfaced: the UI happily tried to create a profile, and only the
database correctly said no).

---

## 11. Business Flows

### User registration → first use
```
SignupScreen (email/password)
  → Supabase creates auth identity only
  → "Check your email" success state
  → user clicks email link → EmailConfirmedScreen (see §6) — NOT the app
  → user opens the app for real, on their own device, and signs in
  → AuthGate → AuthenticatedAppGate → hydration Phase 1 finds no profile
  → ProfileSetupScreen (display name + avatar: photo upload / emoji /
    initials placeholder — see FamilyAvatar, §13)
  → ensureProfileExists() upsert → requestAppDataHydrationRetry()
  → hydration Phase 2 finds no household
  → HouseholdSetupScreen (create new, or join by household ID as a
    temporary "join code" — see the note in §20 on why this is a known
    MVP simplification, not a finished invite system)
  → requestAppDataHydrationRetry() → full hydration → RootNavigator
```

### Task lifecycle
```
Adult/admin/owner creates a task (assigned or unassigned)
  → assignee marks progress (status: open → in_progress → needs_attention
    → completed)
  → RLS: assignee can update their own assigned task's row; role-gated
    fields (reassignment) are an application-layer concern, not RLS's
    (see the tasks_update_adult_plus_or_assignee policy's own comment)
  → completion is NOT yet wired to award points automatically — see §8's
    controlled-workflow gap
```

### Contribution claim lifecycle
```
Any member (including a child) submits a claim: title + optional
description/points
  → claimContribution() (src/features/contributions/) checks for an
    existing pending claim first (client-side pre-check), then inserts —
    the DB-level partial unique index is the real, race-safe guard;
    the client check is just a faster/friendlier error path
  → status: pending
  → adult/admin/owner reviews: approveContributionClaim() /
    rejectContributionClaim() — child is explicitly excluded here, both
    in the permission vocabulary and in RLS's
    contribution_claims_update_review policy
  → terminal status: approved / rejected. A claim's RLS UPDATE policy's
    USING clause only matches status = 'pending' rows — an
    already-reviewed claim can never be targeted again, at the database
    level, independent of any application-layer check.
```

### Household invite flow — built, currently paused
A full anonymous-auth-based invite flow (`household_invites` table +
`redeem_household_invite` RPC) was built and validated against real local
Postgres, but is **deliberately not wired into the UI or applied as the
long-term direction** — it's built on the *current* identity model
(anonymous Supabase auth sign-in), which ADR-001 (§9) proposes replacing.
Building more UI on top of it now would mean direct rework the moment
that decision lands. Treat this table/RPC as parked, not deprecated.

---

## 12. Repository Layer

`src/lib/repositories/` is the **only** place allowed to import and call
the Supabase client (`src/lib/supabase.ts`). Every function returns a
uniform shape:
```ts
type RepositoryResult<T> =
  | { data: T;    error: null }
  | { data: null; error: PostgrestError };
```
Even Storage errors (a different underlying error type from
`@supabase/storage-js`) are normalized into this same shape before being
returned (see `uploadProfileAvatarImage`'s `storageError()` helper) — every
caller handles `result.error` identically regardless of which Supabase
subsystem produced it.

**Why this layer exists, concretely**: it's the seam where "not
configured" (no Supabase credentials — dev/mock mode) is handled uniformly
(`notConfiguredError()`), where `select('*')` vs. a joined column-string is
a deliberate choice (a joined string literal loses TypeScript's literal
inference and makes `data` collapse to `never` — documented inline at the
top of most repository files), and where **the UI never has to know
Supabase-specific query syntax at all.** A screen calls
`getContributionClaimsForHousehold(householdId)`, not
`supabase.from('contribution_claims').select(...)`.

No response mapping/transformation happens here — repositories return raw
DB row shapes (`ProfileRow`, `TaskRow`, ...). Mapping raw rows into
app-level domain types (`AppUser`, `Task`, `HouseholdMember`, ...) is the
store's job, not the repository's — see the `mapTaskRow`/
`mapHouseholdMembers`/etc. functions in `useAppStore.ts`.

---

## 13. Component Architecture

**Presentational, not container-based.** Components in `src/components/`
receive everything via props — no `useAppStore` calls inside a leaf
component like `TaskCard` or `ContributionClaimCard`. Screens resolve
store data (via selectors) and pass the resolved values down.

**`FamilyAvatar` is the single reusable identity-rendering component** —
deliberately built once and reused everywhere a person needs to be shown
(task cards, claim cards, the profile-setup preview), rather than each
call site reimplementing "photo, or emoji, or initials" logic. Rendering
priority is fixed and documented in the component itself:
```
avatarUrl (photo)  >  avatarEmoji  >  generated initials placeholder
```
Any future feature that shows a person (activity feed, comments, chat)
should reuse this component, not reinvent avatar rendering.

**Screens own local state**: form inputs, `isSubmitting`, validation
errors — all `useState` inside the screen component, never lifted into
the global store. The global store is for *app data* (hydrated from
Supabase) and *cross-cutting* state (auth, hydration) — not ephemeral form
state.

---

## 14. Error Handling Strategy

Distinguish these explicitly — conflating them is a recurring source of
bugs in this codebase's history:

| Category | Example | Where it's handled |
|---|---|---|
| Expected terminal state | No profile yet (`missing_profile`) | Recovery UX (`ProfileSetupScreen`), not an error banner |
| Expected terminal state | No household yet (`partial`) | Recovery UX (`HouseholdSetupScreen`) |
| Unexpected failure | Network error, RLS denial, DB error | Generic `load_failed` error screen |
| Validation | Empty display name, password mismatch | Inline field error, screen-local state, never reaches the store |
| Race / staleness | A hydration run superseded by a newer one | Silently dropped via the `isStale()`/sequence guard — never surfaced to the user |

**Retry is always explicit, never automatic.** See §7 — this is the
specific lesson two real production bugs taught the hard way.

---

## 15. Navigation Architecture

```
AppBootstrap
  → (email-redirect landing?) → EmailConfirmedScreen, nothing else renders
  → AuthBootstrap → AppDataBootstrap → AuthGate
       AuthGate:
         not authenticated → AuthStack (AuthWelcome → Login / Signup)
         authenticated     → AuthenticatedAppGate:
           loading  → placeholder
           missing_profile → ProfileSetupScreen
           error (other)   → generic error screen
           partial         → HouseholdSetupScreen
           hydrated        → RootNavigator → AppTabs
                              (Today, MyTasks, Assigned, Rewards, Settings)
```
**`AuthStack`'s initial route is `AuthWelcome`, not `Login`** — a real bug
was caused by an E2E test assuming otherwise. `AuthWelcome`'s secondary
button happens to share the exact copy string "Sign in" with the actual
login form's submit button, which made the mistake easy to make and easy
to miss.

No deep-linking (`linking` prop) is configured on `NavigationContainer` —
there is no URL-based routing into a specific screen from outside the app.

---

## 16. Coding Standards

- **TypeScript**: `strict: true`. Path aliases via `babel-plugin-module-
  resolver` — always `@/lib/...`, `@/components/...`, etc., never a long
  relative `../../../` chain.
- **Naming**: camelCase for functions/variables, PascalCase for
  components/types, `snake_case` only for raw DB row fields (matching
  Postgres column names) — the moment a DB row is mapped into an app-level
  type, it becomes camelCase (`assignee_profile_id` → `assigneeId`).
- **No comments explaining *what* code does** — names should already say
  that. Comments exist for non-obvious *why* (a workaround, an invariant,
  a hidden constraint) — see nearly every repository/migration file for
  the house style.
- **Imports**: no circular dependencies between `store/` ↔ `guards/` ↔
  `types/` — `guards/hydrationInvariants.ts` is intentionally pure (no
  React, no Zustand, no Supabase) specifically to keep it importable from
  the store without a cycle.

---

## 17. Architectural Rules

*(This section preserves, in full, the content that previously lived in
this file as "Architecture Invariants." These are not suggestions.)*

### State vs. Activity Ledger separation

```
State     = current truth   (tasks, rewards, points, profiles, households)
Ledger    = historical truth (activity events — append-only)
Query     = read models projected over ledger events
UI        = views over the query layer
```
- Current state may change (tasks are updated, completed, archived).
  Activity events preserve what happened — they are **never** mutated or
  deleted.
- Corrections are represented as new events, not by mutating or deleting
  previous events (e.g. an approved claim later found wrong gets a new
  correction event, not an edited approval).
- **The Activity Ledger does not exist in the codebase yet.** It's a
  future epic (T1.8). Don't build `activity/`, `ledger/`, `events/`, or
  `history/` folders, event-type TypeScript interfaces, or "future-ready"
  scaffolding for it ahead of that epic — see "No structural scaffolding
  for deferred decisions" below. This is the single most emphasized rule
  in the codebase's own documentation.

### Permission ownership
```
Hydration owns membership data
Store owns hydrated membership state
Domain owns permission mapping        (src/domain/permissions.ts)
Selectors consume permission mapping  (src/store/selectors.ts)
UI consumes selectors
```
**Invariant**: screens and components must never compare roles directly.
All permission decisions flow through domain helpers or permission
selectors. (See §10.)

### Hydration ownership
```
AppDataBootstrap is the sole owner of the hydration pipeline.
commitHydrationSnapshot is the sole atomic commit path for app data.
hydrationSequence is monotonically increasing and never reset.
```
**Invariant**: no screen, component, or selector may write app data
directly into the store. Screens trigger retry via
`requestAppDataHydrationRetry()` only. (See §7.)

### No structural scaffolding for deferred decisions
> If a design decision is missing, it must remain explicitly undefined.
> It is not allowed to compensate for missing decisions with structure,
> placeholders, abstractions, or partial designs.

Not allowed as a substitute for a missing design decision: placeholder
folders/files/interfaces/types/enums/constants for a not-yet-decided
future system, "I prepared the structure for later," empty modules
reserving a namespace, stubbed APIs, or TODO files. **The correct output
when a decision is deferred is documentation stating so** (which future
ticket owns the decision) — never a bridging artifact.

### App permissions vs. RLS
> App permission checks (TypeScript) are never a substitute for RLS.
> Both layers must be present and independent. (See §9, §10.)

### Repository boundary
> Only `src/lib/repositories/*` may call the Supabase client. Screens and
> components go through repositories/feature functions, never direct
> Supabase calls. (See §12.)

### Concept distinctions
```
Task            = planned or assigned work (top-down)
Contribution    = self-reported initiative (bottom-up, requires approval)
Activity Event  = immutable record of what happened (not yet built)
```
Do not conflate these in implementation or UI design.

---

## 18. Development Workflow

**Adding a feature that touches the database**: write a new migration file
(never edit a past one), validate any new RLS policy against a real local
Postgres instance with an explicit authorization test matrix (this
session's pattern: a scratch mock of the `auth` schema + role-switching
via `SET request.jwt.claim.sub` / `SET ROLE authenticated`, then real
positive and negative test cases — not just "it compiles"), *then* apply
it to the live Supabase project via the Dashboard SQL Editor. Pushing a
migration file to git does **not** touch the live database — this has
caused real confusion in this project's history and is worth repeating.

**Adding a screen**: add to `src/screens/`, wire into the relevant
navigator (`AuthStack` or `AppTabs`), add any new copy to
`src/content/copy.ts` (never inline a string), and if it reads app data,
go through a selector — never a raw store field.

**Adding a repository function**: follow the existing `RepositoryResult<T>`
shape exactly, including the `if (!supabase) return notConfiguredError()`
guard every function starts with.

**Adding a permission**: add the vocabulary string to
`HouseholdPermission` in `domain/permissions.ts`, add it to the correct
role tier's array (remember the superset-spreading pattern), and add the
matching RLS check — permission strings with no RLS backing are exactly
the gap that produced the `403` incident in §9.

---

## 19. Testing Strategy

**No unit test suite exists.** Correctness is currently established by:
- **TypeScript strict mode** + `tsc --noEmit` before every commit.
- **Real local Postgres validation** for every RLS/schema change — a
  disposable local database, the migrations applied in order, and a
  written authorization test matrix (positive *and* negative cases) run
  before anything ships to production. This is the load-bearing
  verification method for the entire database layer, not an afterthought.
- **`scripts/seed-qa-data.mjs`** — a local-dev-only script that creates
  three fixed QA accounts (owner/adult/child) plus a household and sample
  contribution claims, using the Supabase **service role key** read from a
  gitignored `.env.local`. This key must never be pasted into chat, never
  committed, and never referenced from any client-side code path — it's a
  standing constraint for this project, not a one-off request.
- **Playwright E2E** (`e2e/`) — runs against a real *deployed* build (an
  `E2E_BASE_URL`), not a local dev server, with `global-setup.ts` re-running
  the seed script before the suite. Serial test ordering (claim → approve
  → duplicate-blocked → reject) against real seeded accounts.
- **Manual QA** against the live Supabase project + live Vercel
  deployment for anything that can't be exercised through the above (auth
  redirect flows, email delivery, Storage uploads).

**No unit tests, no CI-gated test run today** — this is real, current
scope, not a gap to silently work around.

---

## 20. Current Project Status

**Solid / recently stabilized**:
- Auth signup/login/logout, email confirmation landing.
- Profile creation with photo/emoji/initials avatar.
- Household creation and join-by-ID.
- Task CRUD + assignee-scoped status updates.
- Contribution claim lifecycle (claim/approve/reject) with a DB-level
  duplicate-pending guard.
- Core RLS policies for `profiles`, `households`, `household_members`,
  `tasks`, `rewards` (validated against real Postgres; applied to
  production after a real `403 Forbidden` incident proved the gap).
- Hydration state machine (two real infinite-loop bugs found and fixed via
  runtime instrumentation, not just code review).

**Known technical debt / deliberately deferred**:
- **No controlled-workflow RPC for awarding points.** `points_balances`
  and `point_transactions` are read-only by RLS design; nothing currently
  writes to them. This is the single biggest functional gap between "the
  schema supports the reward loop" and "the reward loop actually works
  end to end."
- **`household_members` has no UPDATE/DELETE policy** — no role-change or
  leave-household feature is shipped, so none was written (matching the
  "no unused scaffolding" rule).
- **The Activity Ledger doesn't exist** (§17) — planned as T1.8.
- **Household invites are built but parked**, pending the identity-model
  ADR (§9, §11).
- **No offline support, no push notifications.**

**Under active decision**: ADR-001 (identity model — `profiles.id` vs.
`auth.users.id` decoupling). Read its status before building anything
identity-adjacent.

**Future direction** (per this codebase's own docs and this session's
discussion): an activity feed, notifications, chat/comments, and possibly
an AI assistant for fair task distribution — all of which specifically
motivate the ADR-001 identity model change, since they all want a stable
`profile_id` to attribute things to, independent of whether that person
has ever logged in themselves.

---

## 21. Read This Before Writing Code

- [ ] **RLS is the real boundary.** A UI permission check with no matching
      RLS policy is not a safety net — it's a hole. Add both, always.
- [ ] **Never call Supabase directly outside `src/lib/repositories/`.**
- [ ] **Never compare roles directly** — go through
      `hasHouseholdPermission`/selectors.
- [ ] **Task ≠ Contribution.** Don't conflate top-down assigned work with
      bottom-up self-reported claims — they're separate tables, separate
      permission vocab, separate everything, on purpose.
- [ ] **`AppDataBootstrap` is the only writer of hydration state.** If you
      think you need a new automatic retry condition, re-read §7's callout
      first — this exact category of change has caused two real infinite
      loops.
- [ ] **Migrations are append-only.** Never edit a past migration file;
      write a new one. And remember: pushing a migration to git does *not*
      apply it to the live database — that's a separate manual step via
      the Supabase Dashboard SQL Editor.
- [ ] **Validate new RLS against real local Postgres** before it touches
      production — code review alone has not been treated as sufficient
      for this layer in this project's actual history.
- [ ] **Never expose the `service_role` key** to any client-side code path
      — it exists only in the local, gitignored seed script.
- [ ] **Check ADR-001's status** before writing anything that assumes
      `profiles.id = auth.users.id` is permanent.
- [ ] **No scaffolding for deferred decisions** (§17) — if something isn't
      decided yet, say so in a doc; don't build placeholder structure for
      it "to be ready later."
