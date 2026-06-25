# ChoreHero — Architecture Invariants

Core system-level constraints. These are non-negotiable and must not be violated by any ticket.
Violations discovered during implementation must be flagged as architecture conflicts
and resolved before merging — not silently patched.

---

## State vs Activity Ledger separation

```
State     = current truth   (tasks, rewards, points, profiles, households)
Ledger    = historical truth (activity events — append-only)
Query     = read models projected over ledger events
UI        = views over the query layer
```

### Invariants

> State represents current truth.
> Activity Ledger represents historical truth.

> History is not derived from task state.
> History is event-based and append-only.

> Current state may change (tasks are updated, completed, archived).
> Activity events preserve what happened — they are never mutated or deleted.

> Corrections are represented as new events, not by mutating or deleting previous events.

### Consequences

- Task tables (`tasks`, `rewards`, etc.) store the **current state** of entities only.
- `updated_at` / `completed_at` columns on task rows are **not** a substitute for history.
- History screens, analytics, and audit views must be driven by the Activity Ledger,
  not by querying task state.
- Deleting or archiving a task must not erase historical credit for completions.
- If a contribution claim is rejected after being approved, the correction is a new event —
  the original approval event is preserved.

### This is a future architecture direction

The Activity Ledger does not yet exist in the codebase.
T1.8 is the first epic where history infrastructure is introduced.
T1.6 and T1.7 do not implement Activity Ledger behavior.

---

## Activity Ledger definition

> Activity Ledger is an append-oriented event system that captures
> meaningful household actions over time.

It is not a UI feature. It is a system primitive.

### What the ledger answers

```
Task state answers:     what is true now?
Activity Ledger answers: what happened over time?
```

### Conceptual event categories (examples only — not implementation)

```
task.created
task.assigned
task.completed
task.approved
task.needs_attention

contribution.claimed
contribution.approved
contribution.rejected

request.submitted
request.approved

points.awarded
points.adjusted

reward.redeemed
```

These are examples for roadmap clarity only.
Do not implement event types in TypeScript.
Do not create database schema, enums, or migrations based on this list.
T1.8.1 owns all implementation decisions for event schema and ingestion.

### The correct model

```
Tasks / rewards / requests / points  =  current state
Activity Ledger                      =  event stream of what happened
Activity History UI                  =  read/query layer over ledger events
```

### The incorrect model — do not build

```
History screen over tasks               ✗
Task query-based history                ✗
Analytics derived from current state    ✗
UI-defined event schema                 ✗
```

---

## Concept distinctions

```
Task         = planned or assigned work (top-down)
Contribution = self-reported initiative (bottom-up, requires approval)
Activity Event = immutable record of what happened
```

These are distinct concepts. Do not conflate them in implementation or UI design.
See `docs/household-roles-and-permissions.md` for the full Contribution ≠ Task distinction.

---

## Epic boundary rules for history

```
T1.6 — Permissions Foundation
  does NOT include history logic.
  does NOT include Activity Ledger schema.

T1.7 — Tasks & Contributions Core Domain
  does NOT implement Activity Ledger.
  may create current-state task/contribution behavior (CRUD, status transitions).
  T1.8 decides how those behaviors emit or record events.

T1.8 — Activity Ledger Foundation
  is the FIRST epic where history infrastructure is introduced.
  T1.8.1 decides ingestion mechanism (client, RPC, DB trigger, or combination).
  UI must never define event schema.
  Domain events must exist before query layer.
  Query layer must exist before UI.
```

---

## Permission ownership

```
Hydration owns membership data
Store owns hydrated membership state
Domain owns permission mapping        (src/domain/permissions.ts)
Selectors consume permission mapping  (src/store/selectors.ts)
UI consumes selectors
```

**Invariant:**
> Screens and components must never compare roles directly.
> All permission decisions must flow through domain helpers or permission selectors.

See `docs/household-roles-and-permissions.md` for the full role model.

---

## Hydration ownership

```
AppDataBootstrap is the sole owner of the hydration pipeline.
commitHydrationSnapshot is the sole atomic commit path for app data.
hydrationSequence is monotonically increasing and never reset.
```

**Invariant:**
> No screen, component, or selector may write app data directly into the store.
> Screens trigger retry via `requestAppDataHydrationRetry()` only.

See `docs/onboarding-flow-qa.md` for the full hydration state machine.

---

## No structural scaffolding for deferred decisions

> If a design decision is missing, it must remain explicitly undefined.
> It is not allowed to compensate for missing decisions with structure,
> placeholders, abstractions, or partial designs.

When a system (such as Activity Ledger) is on the roadmap but not yet in scope,
the correct output is documentation only — roadmap placement and boundary rules.

**Not allowed** as a substitute for a missing design decision:

- Folders: `activity/`, `ledger/`, `events/`, `history/`
- Files: `activityEvents.ts`, `eventTypes.ts`, `ledger.ts`, `activityLedgerService.ts`
- TypeScript interfaces, types, or enums for future systems
- Constants, domain modules, repository modules, service modules, selector modules
- Placeholder functions, placeholder classes, placeholder screens
- "Future-ready" abstractions, "temporary" abstractions, "minimal" scaffolding
- TODO files, empty modules, stubbed APIs
- Comments inside code files that reserve future structure
- Exported placeholders of any kind

**Also not allowed:**

- "I did not implement it, but I prepared the structure."
- "I added placeholders for future event types."
- "I added a minimal interface for later."
- "I created an empty module to reserve the domain."

**The correct output when a decision is deferred:**
State that the decision is deferred and that a specific future ticket (e.g. T1.8.1) will decide it.
Do not produce any artifact as a bridge.

---

## App permissions vs RLS

App permissions (TypeScript domain layer) control UI affordances only.
Row Level Security (Supabase/PostgreSQL) is the real security boundary.

**Invariant:**
> App permission checks are never a substitute for RLS.
> Both layers must be present and independent.
