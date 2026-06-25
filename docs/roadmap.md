# ChoreHero — Architecture Roadmap

Epic ordering reflects dependency direction.
Each epic must be stable before the next begins.
Do not extend an epic's scope to cover items assigned to a later epic.

---

## T1 — Foundation

### T1.1–T1.4 — Core Infrastructure ✓
Auth, Supabase client, data schema, hydration pipeline, repository layer.

### T1.5 — Onboarding Foundation ✓
Profile setup, household creation, household join, active household UX, onboarding QA.

### T1.6 — Household Roles & Permissions Foundation
Scoped to: role model, permission vocabulary, permission mapping, permission selectors,
UI affordance boundaries.

**T1.6.1** ✓ — Role enum, permission vocabulary, mapping, deny-by-default helpers, selectors
**T1.6.2** — Permission-aware UI affordances (show/hide actions based on selectCan*)
**T1.6.3** — Invite & membership management permissions
**T1.6.4** — Task permission enforcement
**T1.6.5** — Reward permission enforcement

T1.6 does NOT include: history, event systems, contribution flows, or ledger architecture.

---

### T1.7 — Tasks & Contributions Core Domain

Scoped to: task CRUD, task assignment, task completion, contribution claim lifecycle,
point award on approval.

**T1.7.1** — Task creation & assignment
**T1.7.2** — Task completion flow
**T1.7.3** — Contribution claim foundation (claim → review → approve/reject → points awarded)
**T1.7.4** — Points balance projection

Contribution rules (enforced in T1.7, not before):
- Contribution ≠ Task (see `docs/household-roles-and-permissions.md`)
- Claim ≠ Completion
- Children cannot self-approve contribution claims
- Points are awarded only on approved claims, not on submission

T1.7 does NOT include: history UI, ledger queries, analytics, or event ingestion.

---

### T1.8 — Activity Ledger Foundation

**System primitive. Not a feature. Not UI-driven.**

Establishes the append-only activity event ledger as the authoritative source
of historical truth. Must be placed after T1.6 (permissions stable) and
after T1.7 (domain events defined).

Core invariants this epic enforces:
> Activity history must be event-based and must not be derived only from current task state.
> State represents current truth. Activity ledger represents historical truth.

---

#### T1.8.1 — Activity Event Schema + Ingestion Rules

Scope — define only:
- Event schema (`activity_events` table or equivalent)
- Event type vocabulary (high-level):
  - `task.created`, `task.completed`, `task.approved`
  - `contribution.claimed`, `contribution.approved`, `contribution.rejected`
  - `points.awarded`, `points.adjusted`
  - `reward.redeemed`
- Immutability rules (append-only; no UPDATE or DELETE on event rows)
- Ingestion ownership (who writes events: client RPC, server trigger, or both)
- Correlation fields: `task_id`, `user_id`, `household_id`, `timestamp`
- Minimal payload structure per event type

Out of scope for T1.8.1:
- UI of any kind
- Filters or queries beyond schema definition
- Analytics or dashboards
- History screens
- Derived query layer (that is T1.8.2)

---

#### T1.8.2 — Activity Event Query / Projection Layer

Scope:
- Read-only query functions over `activity_events`
- Projection helpers (e.g. "all events for household X in date range Y")
- Role-based filtering rules (what events each role can query)
- Repository functions for event reads

Out of scope: UI, dashboards, history screens.

---

#### T1.8.3 — Activity History UI

Scope:
- History screen(s) driven by T1.8.2 projections
- Role-based views (what history each role sees)
- Filters (by date, member, event type)

This is the first UI ticket in T1.8.
No history UI may be built before T1.8.2 is stable.

---

## T2 — App Screens

Visible, data-driven screens. Depends on T1.5 (onboarding), T1.6 (permissions), T1.7 (tasks).

**T2.1** — Tab navigation + screen shells (Today, My Tasks, Assigned, Rewards)
**T2.2** — Today screen with real task data
**T2.3** — Task creation UI
**T2.4** — Task completion UI
**T2.5** — Rewards screen with real data
**T2.6** — Assigned screen (tasks you created for others)

---

## Conflict flags

If any T1.6 or T1.7 implementation is discovered to derive history from task state
(e.g. using `tasks.completed_at` as a history source), this must be flagged as an
architecture conflict with T1.8 and resolved before T1.8.1 begins —
not silently patched within T1.8.
