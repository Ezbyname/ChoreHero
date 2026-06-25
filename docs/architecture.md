# ChoreHero — Architecture Invariants

Core system-level constraints. These are non-negotiable and must not be violated by any ticket.
Violations discovered during implementation must be flagged as architecture conflicts
and resolved before merging — not silently patched.

---

## State vs Ledger separation

```
State = current truth
Ledger = historical truth
Derived Views = projections over ledger events
```

**Invariant 1:**
> Activity history must be event-based and must not be derived only from current task state.

**Invariant 2:**
> State represents current truth. Activity ledger represents historical truth.

Consequences:
- Task tables (`tasks`, `rewards`, etc.) store the **current state** of entities only.
- `updated_at` / `completed_at` columns on task rows are **not** a substitute for history.
- History screens, analytics, and audit views must be driven by the activity ledger
  (`activity_events` or equivalent), not by querying task state.
- Deleting or archiving a task must not erase historical credit for completions.

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

## App permissions vs RLS

App permissions (TypeScript domain layer) control UI affordances only.
Row Level Security (Supabase/PostgreSQL) is the real security boundary.

**Invariant:**
> App permission checks are never a substitute for RLS.
> Both layers must be present and independent.
