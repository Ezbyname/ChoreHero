# ADR-001 — Family Member Identity Model

> Status: **Proposed** — not yet implemented, not yet approved for implementation.
> This document is the canonical design record for this decision. No code changes
> should be made against this decision until it is marked **Accepted** below.
>
> Supersedes (pending acceptance): the identity-anchor decision in
> `docs/rls-strategy.md` §2 ("Supabase Auth UID is the identity anchor") and the
> schema decision in `docs/schema-design.md` ("Auth identity vs profile: `profiles.id
> = auth.users.id`"). Both are explicit, deliberate decisions made during T1.4 — this
> ADR does not treat them as oversights, and does not take overriding them lightly.

---

## 1. Context

The current schema and every RLS policy written so far (`contribution_claims`,
and the not-yet-applied `household_invites`) are built on one anchor:

```
profiles.id = auth.users.id
```

This was a deliberate T1.4.3 decision, documented in `docs/rls-strategy.md` §2 and
`docs/schema-design.md`. It means every Family Member **is**, from the moment they
exist, a Supabase Auth identity — there is no way to represent "a family member
who has not yet logged in."

Building the household-invite feature (T1.9.1, migration
`20260706120000_household_invites.sql`) surfaced a case this anchor cannot express:

> A parent wants to add "Daniel" to the household right now, alone, without
> Daniel present and without Daniel owning a device in that moment.

The implementation built for T1.9.1 works around this by having the *invitee's own
device* call `supabase.auth.signInAnonymously()` and redeem an invite — which means
profile creation is only possible when the family member is physically present
with a device. That does not match the stated product mental model ("I am adding
Sam," not "Sam is signing up"), and it introduces a durability problem: an
anonymous-auth session is bound to one device's local storage with no email,
password, or recovery path. If that device is lost before the member ever
"claims" a real login, the identity is gone.

This ADR proposes decoupling Family Member identity from Supabase Auth identity,
so that:
- Creating a Family Member is a pure data operation performed by the parent.
- Authentication is a capability a Family Member may acquire **later**, once,
  independent of who created them or how.

---

## 2. Decision

**Adopt Model B: Family Member exists independently of `auth.users`. Authentication
is attached later via an explicit linking step.**

### Schema change

```sql
-- profiles.id stops being a foreign key to auth.users and becomes an
-- ordinary generated primary key.
ALTER TABLE profiles
  ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- (dropping the auth.users FK on `id` itself requires recreating the column —
--  see §5 Migration Strategy; not a simple ALTER)

ALTER TABLE profiles
  ADD COLUMN auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;
```

- `profiles.id` becomes the **stable identity for all application data** —
  tasks, rewards, contribution_claims, points_balances, activity, everything
  that already references `profiles(id)` today is **unaffected**, because none
  of those FKs ever pointed at `auth.users.id` directly; they always pointed at
  `profiles.id`. This is the single biggest reason Model B is viable without a
  data migration of the domain tables.
- `auth_user_id` is nullable. `NULL` means "this Family Member has no login of
  their own yet — only the household's owner/admin can act on their behalf."
  Non-null means the member has an independent, self-owned login.
- `ON DELETE SET NULL`: if the linked auth user is ever deleted, the Family
  Member profile survives (unclaimed again), matching `profiles`' existing
  `ON DELETE CASCADE` philosophy of "app data survives auth changes where
  reasonable."

### Why `profile_id` becomes the stable identity

Every future feature named in the review request — notifications, chat,
activity feed, comments, mentions, achievements, an AI assistant, a family
calendar — needs one thing in common: a stable "who did/owns/is-mentioned-in
this" reference that exists **the moment the family member is created**, not
only once they have their own login. A toddler who will never independently
operate the app still needs their completed chores attributed to *them* in an
activity feed. Anchoring identity to `auth.users` cannot express that; anchoring
it to `profiles.id` can, unconditionally, from row one.

### Terminology

Internal / DB / RPC naming stays technical: `claim_profile()`,
`auth_user_id`, "linking," "claiming" — precise engineering language, unambiguous
in code review and in this document.

**User-facing copy must not use this language.** The product is for families, not
developers. Recommended UI strings:
- `"Join Family"` — for a family member activating their own login on their own device.
- `"Activate Your Family Profile"` — as a screen title / longer-form variant.

The RPC name and the button copy are allowed to diverge on purpose; `copy.ts`
should be the only place "claim" terminology ever crosses into a string a user
reads.

---

## 3. Impact Analysis — every current `profile.id == auth.uid()` assumption

This is exhaustive as of this ADR's writing (grepped, not recalled from memory).
Every site below currently relies on the anchor and must be revisited if Model B
is accepted. None of these are "hidden" in the sense of being undocumented bugs —
they are all correct **under the current, documented anchor** — but each one is a
place where Model B requires a change.

### SQL — `auth.uid()` used as if it were `profiles.id`

| File | Line(s) | Usage |
|---|---|---|
| `supabase/migrations/20260704000000_contribution_claims_rls.sql` | 92 | `internal.is_household_member(household_id, auth.uid())` |
| `supabase/migrations/20260704000000_contribution_claims_rls.sql` | 108 | `claimed_by_profile_id = auth.uid()` (INSERT policy) |
| `supabase/migrations/20260704000000_contribution_claims_rls.sql` | 112–116 | `internal.is_household_member(household_id, auth.uid(), ARRAY[...])` |
| `supabase/migrations/20260704000000_contribution_claims_rls.sql` | 134–149 | `internal.is_household_member(..., auth.uid(), ...)` (×2) and `reviewed_by_profile_id = auth.uid()` (UPDATE policy) |
| `supabase/migrations/20260706120000_household_invites.sql` | 54, 62–63, 74, 77 | `internal.is_household_member(household_id, auth.uid(), ...)` (×4) and `created_by_profile_id = auth.uid()` |
| `supabase/migrations/20260706120000_household_invites.sql` | 114 | `v_caller uuid := auth.uid();` — used directly as the profile id being inserted/joined |

**Fix under Model B:** introduce `internal.current_profile_id() returns uuid` —
`SELECT id FROM profiles WHERE auth_user_id = auth.uid()` — and replace every
`auth.uid()` above with `internal.current_profile_id()`. Mechanical, but must be
done in every one of these ~11 call sites; missing even one silently reintroduces
the old assumption in that policy only, which would be a subtle, hard-to-notice
bug (a policy that works for every OTHER table but this one).

### TypeScript — `authUser.id` used as if it were `profile_id`

| File | Line(s) | Usage |
|---|---|---|
| `src/lib/repositories/profiles.ts` | 49, 52, 55, 66 | `ensureProfileExists({ authUserId, ... })` inserts `id: input.authUserId` directly — comment explicitly states "profiles.id must equal authUserId" |
| `src/screens/ProfileSetupScreen.tsx` | 59 | `ensureProfileExists({ authUserId: authUser.id, ... })` |
| `src/screens/HouseholdSetupScreen.tsx` | 89 | `createHouseholdWithOwner({ ownerProfileId: authUser.id, ... })` |
| `src/screens/HouseholdSetupScreen.tsx` | 127 | `joinHouseholdById({ profileId: authUser.id, ... })` |
| `src/bootstrap/AppDataBootstrap.tsx` | 121, 140 | `hydrateForUser({ userId: authUser.id, ... })` → `getProfileById(userId)` queries `profiles.id = authUser.id` directly |

**Fix under Model B:** hydration must resolve `profiles` by `auth_user_id =
authUser.id` (a lookup, not an equality-by-construction), and every one of the
call sites above that currently hands `authUser.id` to something expecting a
`profile_id` must instead use the *resolved* `profile.id` from that lookup —
which may not exist yet (unclaimed) or may already exist and simply be getting
linked for the first time (claiming).

### Store — two identifiers that are only equal by construction today

`useAppStore.ts`: `authUser` (raw Supabase `session.user`, `.id` = auth UID) and
`user` (`AppUser`, `.id` = `context.profile.id`) are populated from two different
places and are **only guaranteed equal today because of the anchor**. Several
screens already read whichever one happened to be in scope, trusting they're
interchangeable (see table above). Under Model B they diverge in the unclaimed
case — this is the most important behavioral change to test for, not just a
rename.

---

## 4. Migration Strategy

1. **Schema**: add `auth_user_id` (nullable, unique, FK to `auth.users`) to
   `profiles`. Backfill `auth_user_id = id` for every existing row (today, every
   existing profile *is* auth-backed — this is a lossless backfill, not a guess).
2. **Break the `id` → `auth.users` FK** on `profiles.id` itself. In Postgres this
   means: drop the existing FK constraint on `id`; `id` keeps its default
   (`gen_random_uuid()`) but is no longer required to equal any `auth.users.id`.
   Existing rows are unaffected (their `id` values don't change, only the
   constraint is dropped).
3. **RLS**: introduce `internal.current_profile_id()`; rewrite every policy listed
   in §3 to use it instead of `auth.uid()` directly.
4. **RPCs**: retire `redeem_household_invite` (anonymous-auth based); replace with
   two RPCs — `create_family_member` (parent-side, ordinary authenticated INSERT
   under RLS, no anonymous auth involved) and `claim_family_member_profile`
   (sets `auth_user_id` on a pre-existing, unclaimed profile once the member has a
   real login of their own).
5. **Client**: hydration resolves the current user's `profile.id` via
   `auth_user_id = authUser.id` lookup, not equality-by-assumption. Every call
   site in §3's TypeScript table is updated to pass the resolved `profile.id`,
   not `authUser.id`, wherever a `profile_id` is expected.
6. **Validate against real Postgres** — same discipline as `contribution_claims`
   and `household_invites`: a full authorization test matrix before anything
   touches production, specifically including a case where `auth_user_id IS
   NULL` (an unclaimed member) to confirm RLS still denies appropriately.

## 5. Rollback Strategy

Because the FK direction being removed (`profiles.id → auth.users.id`) is the
*only* structurally destructive part, rollback is bounded:
- If discovered wrong **before** any unclaimed (auth_user_id IS NULL) profile
  exists in production: re-adding the FK constraint is a clean, lossless revert
  (every row still satisfies it, since backfill set `auth_user_id = id`
  everywhere and no unclaimed rows exist yet).
- If discovered wrong **after** unclaimed profiles exist: rollback requires a
  product decision for each unclaimed row (convert to a real auth user via
  admin-provisioned account, or delete it) before the FK can be re-added. This
  is the concrete cost of adopting Model B — it should be weighed, not glossed
  over.

## 6. Backwards Compatibility

- All existing profiles (today, 100% auth-backed) continue to work unchanged —
  `auth_user_id` backfills to their existing `id`, so nothing about a currently
  logged-in user's data access changes on day one.
- `docs/schema-design.md` and `docs/rls-strategy.md` need an explicit
  superseded-by-ADR-001 note added once this is accepted, so future readers
  aren't misled by the older documented anchor.

## 7. Future Scalability Check

| Future feature | Under Model A (current) | Under Model B (proposed) |
|---|---|---|
| Notifications | Needs a device/push token tied to an auth session that may not exist for an unclaimed member | `profile_id` stable from creation; push token attaches whenever a real login exists, independent of when the profile was created |
| Chat / comments / mentions | Actor must be an auth identity — awkward for a toddler who never logs in but is still mentioned/depicted | Actor is always `profile_id`; unclaimed members can be mentioned/depicted with zero special-casing |
| Activity feed / achievements | Same issue — attribution requires an auth identity | Attribution is `profile_id`, always available |
| Google / Apple / email login | Each provider still funnels into the same anonymous-then-upgrade dance | Each provider just produces a normal `auth.users` row, then one uniform `claim_family_member_profile` call — no per-provider special-casing |
| Child devices / replacing phones | Identity is bound to one device's anonymous session; losing the device loses the identity with no recovery | Identity (`profile_id`) is durable; only the auth *link* is device-bound, and re-linking from a new device is a normal, parent-assisted flow |
| Multiple households | Unaffected either way — `household_members` already supports N households per profile | Same, unaffected |
| Permissions | Unaffected either way — governed by `household_members.role` | Same, unaffected |
| AI assistant | Needs a stable subject to reason "about" | `profile_id` again available from creation, independent of auth |

## 8. Open Questions (explicitly not decided by this ADR)

1. Can an unclaimed profile have its `display_name`/`avatar_emoji` edited by
   anyone other than the owner/admin who created it? (Almost certainly no until
   claimed — needs an explicit RLS policy, not an assumption.)
2. What happens to household data (tasks assigned, points earned) if a parent
   deletes an unclaimed profile outright, versus if a claimed member's
   `auth_user_id` is unlinked?
3. Should there be a limit on how many unclaimed profiles a household can hold,
   to avoid abuse of the invite/claim RPCs?
4. Exact shape of the "Join Family" claim flow UI (magic link? email+password?
   OAuth-only?) is a product decision, not an architecture one — out of scope
   for this ADR.

## 9. Recommended Sequencing

1. **Verify production RLS state first** (Supabase Dashboard → Authentication →
   Policies for `profiles` and `household_members`) — before writing or applying
   any new policy, confirm what's actually live versus what the committed
   migrations show, so no work is duplicated or contradicted.
2. Fix the re-hydration loop bug in `AppDataBootstrap.tsx` (pure client-code fix,
   independent of the above, safe to do in parallel).
3. Accept or revise this ADR.
4. Only after acceptance: implement the schema/RLS/RPC/client changes in §4,
   validated against real Postgres before touching production.
5. Rebuild the invite/claim UI and the `FamilyAvatar` component on the accepted
   model.

---

*This ADR does not implement anything. No migration has been written or applied
against this decision. Awaiting explicit acceptance before any further code is
written.*
