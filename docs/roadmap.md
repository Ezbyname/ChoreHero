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

---

### T1.6 — Household Roles & Permissions Foundation

Scoped to: role model, permission vocabulary, permission mapping, permission selectors,
UI affordance boundaries.

**T1.6 does NOT include:** history, event systems, Activity Ledger, or contribution flows.

| Ticket  | Status | Description |
|---------|--------|-------------|
| T1.6.1  | ✓      | Role enum, permission vocabulary, mapping, deny-by-default helpers, selectors |
| T1.6.2  |        | Permission-aware UI affordances (show/hide actions via selectCan*) |
| T1.6.3  |        | Invite & membership management permissions |
| T1.6.4  |        | Task permission enforcement |
| T1.6.5  |        | Reward permission enforcement |

---

### T1.7 — Tasks & Contributions Core Domain

Scoped to: task CRUD, task assignment, task completion, contribution claim lifecycle,
point award on approval.

**T1.7 does NOT implement Activity Ledger.**
T1.7 may create current-state task/contribution behavior (CRUD, status transitions).
T1.8 decides how those behaviors emit or record events.
Do not prematurely decide whether events are written by client, RPC, or DB trigger — that is T1.8.1.

| Ticket  | Status | Description |
|---------|--------|-------------|
| T1.7.1  |        | Task creation domain |
| T1.7.2  |        | Task completion / approval domain |
| T1.7.3  |        | Contribution claims foundation (claim → review → approve/reject → points awarded) |

Contribution rules (enforced in T1.7):
- Contribution ≠ Task (see `docs/household-roles-and-permissions.md` and `docs/architecture.md`)
- Claim ≠ Completion
- Children cannot self-approve contribution claims
- Points are awarded only on approved claims, not on submission

---

### T1.8 — Activity Ledger Foundation

**System primitive. Not a feature. Not a History screen. Not UI-driven.**

Establishes the append-only Activity Ledger as the authoritative source of historical truth.
Must be placed after T1.6 (permissions stable) and T1.7 (domain behaviors defined).

**Critical ordering rule:**
```
Domain events must exist before query layer.
Query layer must exist before UI.
UI must never define event schema.
```

**T1.8 does NOT begin until T1.7 is stable.**
This sequencing ensures T1.8.1 can observe actual mutation patterns before
deciding ingestion mechanism (client, RPC, DB trigger, or combination).

| Ticket  | Status | Description |
|---------|--------|-------------|
| T1.8.1  |        | Activity Event Schema + Ingestion Rules |
| T1.8.2  |        | Activity Query / Projection Layer |
| T1.8.3  |        | Activity History UI |

#### T1.8.1 — Activity Event Schema + Ingestion Rules

Scope — define only:
- Event schema (`activity_events` table or equivalent structure)
- Event type vocabulary (scoped to what T1.7 produced)
- Immutability rules (append-only; no UPDATE or DELETE on event rows)
- Ingestion ownership — decided here, not before:
  whether events are written by client, RPC, DB trigger, or a combination
- Correlation fields: `task_id` / `contribution_id`, `user_id`, `household_id`, `timestamp`
- Minimal payload structure per event type

**Out of scope for T1.8.1:** any UI, filters, queries beyond schema definition,
analytics, history screens, derived query layer.

#### T1.8.2 — Activity Query / Projection Layer

Scope: read-only query functions and projections over activity events.
Role-based filtering rules (what events each role can query).
No UI.

#### T1.8.3 — Activity History UI

Scope: history screen(s) driven by T1.8.2 projections.
Role-based views, filters (date, member, event type).
**No history UI may be built before T1.8.2 is stable.**

---

## T2 — Product Navigation and UX Expansion

Visible, data-driven screens. Depends on T1.5 (onboarding), T1.6 (permissions), T1.7 (tasks).

| Ticket  | Status | Description |
|---------|--------|-------------|
| T2.1    |        | Tab navigation + screen shells (Today, My Tasks, Assigned, Rewards) |
| T2.2    |        | Today screen with real task data |
| T2.3    |        | Task creation UI |
| T2.4    |        | Task completion UI |
| T2.5    |        | Rewards screen with real data |
| T2.6    |        | Assigned screen (tasks you created for others) |

---

## Conflict flags

If any T1.7 implementation is found to derive history from task state
(e.g. using `tasks.completed_at` as a history source, or building a history screen
over task queries), this must be flagged as an architecture conflict with T1.8
and resolved before T1.8.1 begins — not silently patched within T1.8.

If any T1.6 or T1.7 ticket adds event schema or ingestion logic,
stop and redirect to T1.8.1 scope.
