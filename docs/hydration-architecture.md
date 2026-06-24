# Hydration Architecture

## Pipeline

```
AuthBootstrap
  └─ auth events → Zustand auth state

AppDataBootstrap
  └─ watches auth state
  └─ runs three-phase pipeline (profile → structure → domain)
  └─ builds one complete HydrationContext snapshot
  └─ calls commitHydrationSnapshot once

Zustand store (commitHydrationSnapshot)
  └─ validates commit identity (runId + sequence)
  └─ validates context consistency (guards)
  └─ writes all app data atomically in one set() call
```

## Rules

**No mid-pipeline app data writes.**
The pipeline builds a complete snapshot. The store writes it once. No `setUser`, `setHousehold`, `setTasks`, or equivalent is called during hydration.

**Store commit is the single enforcement point.**
`commitHydrationSnapshot` is the only place where hydration snapshot validity is enforced. Bootstrap and pipeline build correct data; the store is the final boundary.

**Guards are assert-only.**
`src/guards/hydrationInvariants.ts` contains pure functions with no side effects, no React, no Zustand, no Supabase client. Guards throw on violation; they never repair data or fallback silently.

**runId protects commit identity.**
Each hydration run gets a unique `runId`. A commit with a mismatched `runId` is silently ignored.

**sequence protects ordering.**
`hydrationSequence` is monotonically increasing and never reset (even on logout). A commit with a stale sequence is silently ignored. This prevents out-of-order run completions from overwriting newer data.

**`partial` is a terminal valid state.**
`partial` means exactly: profile exists AND no household membership exists. It is not an intermediate loading state. Domain failures result in `error`, not `partial`.

**Repository ordering is a performance hint.**
Repositories use `.order(...)` for stable DB reads. The hydration layer applies `sortHouseholdCandidatesDeterministically` as the authoritative sort before active-household selection, independent of repository ordering.

**Mock/dev and Supabase hydration are mutually exclusive.**
When Supabase is not configured (`isSupabaseConfigured === false`), `AppBootstrap` runs `hydrateFromMockSeed()` and `AppDataBootstrap` skips all Supabase calls. When Supabase is configured, mock seed is not used for app data.

## States

| State | Meaning |
|---|---|
| `idle` | No hydration started (initial, or after `clearAppData`) |
| `loading` | A run is in progress |
| `hydrated` | Complete snapshot committed (profile + household + domain) |
| `partial` | Profile exists, no household membership (valid terminal state) |
| `error` | A phase failed; see `appDataError` |
