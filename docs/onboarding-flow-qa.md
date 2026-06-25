# Onboarding Flow QA — T1.5.6

Verification artifact for the T1.5.2–T1.5.5 onboarding flow.
This document maps the implemented routing logic to testable scenarios.

---

## Discrepancy handling

T1.5.6 is a documentation-only verification artifact.
Any discrepancy discovered during these QA scenarios must be documented here and fixed in a separate T1.5.x follow-up ticket.

This QA document must not introduce runtime behavior, selectors, screens, store changes, repository changes, migrations, or RLS changes.

---

## Routing architecture overview

```
AppBootstrap
└── AuthBootstrap           (Supabase onAuthStateChange listener)
└── AppDataBootstrap        (hydration pipeline — three phases)
    └── AuthGate            (sole routing authority at auth boundary)
        ├── mock/dev mode   → RootNavigator (bypass auth)
        ├── auth loading    → loading screen
        ├── authenticated   → AuthenticatedAppGate
        │   ├── loading             → loading screen
        │   ├── error/missing_profile → ProfileSetupScreen
        │   ├── error (generic)     → error screen
        │   ├── partial             → HouseholdSetupScreen
        │   └── hydrated            → RootNavigator
        └── unauthenticated → AuthStack
```

**Ownership rule:** AuthGate owns the auth boundary only.
AuthenticatedAppGate owns all authenticated-user routing.
No other component performs auth-conditional routing.

---

## Hydration state machine

| State     | Meaning                                      | AuthenticatedAppGate renders |
|-----------|----------------------------------------------|------------------------------|
| `idle`    | Not yet started (initial or post-retry)      | loading screen               |
| `loading` | Pipeline in progress                         | loading screen               |
| `error`   | Profile missing or domain load failure       | ProfileSetupScreen or error  |
| `partial` | Profile exists; no household membership      | HouseholdSetupScreen         |
| `hydrated`| Profile + household + domain data committed  | RootNavigator                |

**`partial` is a terminal valid state.** It is not an error.
`appDataErrorCode` is only set in `error` state.

---

## QA Scenarios

---

### Scenario 1 — Auth loading (initial app open)

**Precondition:** App just launched; Supabase INITIAL_SESSION not yet received.

**Expected routing:**
- `isAuthResolved = false` → AuthGate renders loading screen ("Getting ChoreHero ready…")

**Key invariants:**
- No hydration pipeline starts before auth is resolved
- User sees a calm loading message, not a blank screen or crash

---

### Scenario 2 — Unauthenticated user

**Precondition:** Auth resolved; no active session.

**Expected routing:**
- `isAuthenticated = false` → AuthGate renders AuthStack (sign-in / sign-up screens)

**Key invariants:**
- Zustand `authUser` is null
- AuthenticatedAppGate is never mounted
- No hydration attempt

---

### Scenario 3 — First-time signup: no profile exists

**Precondition:**
- User signs up via AuthStack → Supabase creates an auth user
- No row exists in `profiles` table for this auth user id

**Expected routing sequence:**
1. `isAuthenticated = true` → AuthGate → AuthenticatedAppGate
2. AppDataBootstrap runs hydration; Phase 1 (`getProfileById`) returns `data: null, error: null`
3. `appHydrationState = 'error'`, `appDataErrorCode = 'missing_profile'`
4. AuthenticatedAppGate: `needsProfileSetup = true` → **ProfileSetupScreen**

**Key invariants:**
- `missing_profile` is treated as recovery UX, not a generic error
- Generic error screen is NOT shown
- `selectNeedsProfileSetup` reads `appHydrationState === 'error' && appDataErrorCode === 'missing_profile'`

---

### Scenario 4 — Profile setup: display name submission

**Precondition:** ProfileSetupScreen is visible; user enters a display name.

**Expected submit flow:**
1. `isSubmitting` guard fires: if already submitting, `handleCreate` returns immediately
2. Validation: empty display name → inline validation error, no network call
3. `ensureProfileExists({ authUserId, displayName })` called (upsert on `profiles.id`)
4. On success: `requestAppDataHydrationRetry()` called — resets hydration to `idle`
5. AppDataBootstrap re-runs; Phase 1 now returns the newly created profile
6. If profile has no household → `appHydrationState = 'partial'` → HouseholdSetupScreen
7. If profile somehow already has a household → `appHydrationState = 'hydrated'` → RootNavigator

**Key invariants:**
- Screen does NOT manually write the profile into Zustand
- Screen does NOT navigate imperatively
- Screen does NOT call Supabase directly
- `requestAppDataHydrationRetry()` resets hydration state only; auth state is untouched
- `hydrationSequence` is NOT reset (monotonically increasing)

---

### Scenario 5 — Household setup: create mode

**Precondition:** HouseholdSetupScreen visible; mode = 'create' (default tab).

**Expected submit flow:**
1. `createSubmitting` guard: if true, `handleCreate` returns immediately
2. Validation: empty household name → inline validation error, no network call
3. `createHouseholdWithOwner({ name, ownerProfileId: authUser.id })` called
4. Repository: inserts household row, then inserts owner member row
5. On success: `requestAppDataHydrationRetry()`
6. AppDataBootstrap re-runs; Phase 2 now returns the new household
7. Phase 3 (domain) runs; `commitHydrationSnapshot` called with `hydrated` state
8. AuthenticatedAppGate: `appHydrationState === 'hydrated'` → **RootNavigator**

**Tab switching:**
- `isSubmitting = createSubmitting || joinSubmitting`
- While either submit is pending, tab buttons are disabled (`disabled={isSubmitting}`)

**Key invariants:**
- Duplicate-submit guard is screen-level (`isSubmitting` state check)
- No RPC; two sequential inserts (household → member)
- Orphan risk documented: if member insert fails, household row may remain
- This is an accepted MVP limitation; mitigation is screen-level dedup guard

---

### Scenario 6 — Household setup: join mode

**Precondition:** HouseholdSetupScreen visible; user switches to 'join' tab.

**Tab switch behavior:**
- `switchMode('join')` clears all form state from both modes (validation errors, submit errors)
- Tab buttons disabled while any submit is in flight

**Expected submit flow:**
1. `joinSubmitting` guard: if true, `handleJoin` returns immediately
2. Validation: empty code field → inline validation error, no network call
3. `joinHouseholdById({ householdId: trimmed, profileId: authUser.id })` called
4. Repository steps:
   a. Verify household exists (`SELECT id WHERE id = householdId`)
   b. Check existing membership (idempotency: if member exists, return existing row)
   c. Insert membership with `role: 'adult'` if not already a member
5. On success: `requestAppDataHydrationRetry()`
6. Hydration re-runs → `hydrated` → RootNavigator

**Join code:** `household.id` (UUID) used as the join identifier.
No `invite_code` column exists in the schema (T1.4.4).
This is intentional foundation behavior.
Copy uses neutral "Household code" label to avoid exposing this detail in the UI.

**Idempotency:** If the profile is already a member (any role), the existing row
is returned as success without overwriting the existing role.

**Key invariants:**
- `role: 'adult'` assigned on first join; existing roles preserved on retry
- Screen does NOT write household/member data into Zustand directly
- `requestAppDataHydrationRetry()` is the only store write on success

---

### Scenario 7 — Household setup: error handling

**Create mode — network or DB error:**
- `createError` state is set; friendly copy shown (`copy.householdSetup.error`)
- Raw Supabase/PostgrestError message is never shown to the user
- `isSubmitting` resets to false; user can retry

**Join mode — household not found:**
- `joinHouseholdById` returns `PGRST_NOT_FOUND` sentinel error (not a raw DB error)
- `joinError` state is set; friendly copy shown (`copy.householdJoin.error`)
- User can correct the code and retry

**Join mode — already a member (idempotency case):**
- Existing membership returned as success
- `requestAppDataHydrationRetry()` fires
- Hydration re-runs; user proceeds to the app normally

---

### Scenario 8 — Returning authenticated user (fully hydrated)

**Precondition:** User signed in previously; session persists.

**Expected routing:**
1. Auth resolves → `isAuthenticated = true` → AuthenticatedAppGate
2. AppDataBootstrap detects hydration is needed and triggers the pipeline
3. All three phases succeed → `appHydrationState = 'hydrated'` → **RootNavigator**

**Observable behavior:**
- App reaches RootNavigator without showing ProfileSetupScreen or HouseholdSetupScreen
- Hydration does NOT re-trigger on every component render once `hydrated`
- Navigating between tabs does not restart the hydration pipeline

**Architecture context (existing T1.4.7 contract):**
AppDataBootstrap tracks which auth user it last hydrated for. Re-hydration fires only
when the auth user changes, when state is reset to `idle` (post-retry), or on a first run.
This prevents redundant network calls on re-renders.

---

### Scenario 9 — Settings screen: active household display

**Precondition:** `appHydrationState === 'hydrated'`; user navigates to Settings.

**Expected rendering:**
- `selectHasActiveHousehold` returns `true`
- Household section is visible
- `selectActiveHouseholdName` returns the household name from `s.household.name`
- Name displayed in the info row

**Selector chain:**
```
selectHasActiveHousehold  → appHydrationState === 'hydrated' && selectActiveHousehold(s) !== null
selectActiveHouseholdName → selectActiveHousehold(s)?.name ?? null
selectActiveHousehold     → selectCurrentHousehold  (alias — same field, no drift)
selectCurrentHousehold    → s.household
```

**Key invariants:**
- SettingsScreen does NOT call `.find(...)` on a households array
- SettingsScreen does NOT access `households[0]`
- SettingsScreen does NOT resolve `activeHouseholdId` manually
- Hydration owns selection; screen only renders the result

**Partial state (no household):**
- `selectHasActiveHousehold` returns `false`
- Household section is hidden
- In practice, `partial` state routes to HouseholdSetupScreen before RootNavigator,
  so SettingsScreen is only reachable when `hydrated`

---

### Scenario 10 — Sign out

**Precondition:** User is authenticated; Settings screen visible.

**Expected flow:**
1. `handleSignOut` called; `isSigningOut` guard prevents double-tap
2. `signOut()` wrapper called (Supabase `auth.signOut()`)
3. `AuthBootstrap` receives `SIGNED_OUT` event → calls `clearAuthSession`
4. Zustand auth state clears → `isAuthenticated = false`
5. AuthGate re-renders → **AuthStack**

**Key invariants:**
- SettingsScreen does NOT call Zustand store directly to clear auth state
- SettingsScreen does NOT navigate imperatively
- Sign-out error is shown via `localError` state; user can retry

---

### Scenario 11 — Dev/mock mode (Supabase not configured)

**Precondition:** `EXPO_PUBLIC_SUPABASE_URL` or `EXPO_PUBLIC_SUPABASE_ANON_KEY` missing or partial.

**Expected routing:**
- `supabaseConfigStatus === 'missing' || 'partial'` → AuthGate bypasses auth → **RootNavigator**
- No hydration runs
- App is usable with mock data

**Key invariants:**
- This path exists only for local development without credentials
- No Supabase calls are made
- Production builds always have both env vars set

---

### Scenario 12 — Generic hydration error

**Precondition:** Phase 1 (profile fetch) or Phase 3 (domain fetch) returns a PostgrestError.

**Expected routing:**
- `appHydrationState = 'error'`, `appDataErrorCode = 'load_failed'`
- `needsProfileSetup = false` (code is not `missing_profile`)
- AuthenticatedAppGate: error branch → friendly error placeholder
- `appDataError` string displayed (these are copy strings set in AppDataBootstrap, not raw Supabase messages)

---

### Scenario 13 — Stale / out-of-order hydration run

**Precondition:** Auth state changes rapidly (e.g., sign-in event received while a prior
hydration run is still in flight), causing two hydration runs to overlap.

**Observable outcome:**
- App reaches a consistent final state (hydrated or error) — no UI flicker between states
- The final rendered screen reflects only the most recent hydration result
- No crash occurs
- No stale household name or stale user data is shown from the earlier run

**Architecture context (existing T1.4.7 contract):**
AppDataBootstrap guards against out-of-order completions using a monotonically
increasing run sequence. A run that completes after a newer run has started is
discarded before any store write occurs. The sequence counter is never reset,
including by `requestAppDataHydrationRetry`. This is an existing invariant established
in T1.4.7; it is documented here as context for Scenario 13, not introduced by T1.5.6.

---

## Acceptance criteria

- [ ] All 13 scenarios documented with expected routing and key invariants
- [ ] Discrepancy handling section present with required wording
- [ ] Any discovered discrepancy documented in the Discrepancies section, not fixed
- [ ] T1.5.6 changes docs only — runtime files: 0
- [ ] No selectors, screens, store changes, repository changes, migrations, or RLS changes

---

## Discrepancies found

- none
