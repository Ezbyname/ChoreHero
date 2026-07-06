# ADR-001 — Family Member Identity Model

> Status: **Proposed (Revision 2)** — not yet implemented, not yet approved for
> implementation. This document is the canonical design record for this decision.
> No code changes should be made against this decision until it is marked
> **Accepted** below.
>
> Revision 2 incorporates an independent adversarial review of Revision 1 (see
> §10). Revision 1 was directionally correct but under-specified real failure
> modes and overclaimed the completeness of its own impact analysis — both are
> corrected below rather than silently fixed, so the record of what was wrong
> the first time isn't lost.
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
--  see §4 Migration Strategy; not a simple ALTER)

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

> **Correction (Revision 2):** Revision 1 called this list exhaustive after
> grepping only `src/`. It wasn't — `scripts/seed-qa-data.mjs` depends on the
> same anchor and is added below. `e2e/*.ts` was checked in Revision 2 and
> **does not** reference `profile_id`/`auth.uid()` directly (verified by grep,
> zero matches) — the e2e suite only drives the UI, so it inherits the risk
> transitively through the seed script, not directly. Stated precisely this
> time rather than asserted from a partial search.

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

### Scripts — `scripts/seed-qa-data.mjs` (added in Revision 2)

| File | Line(s) | Usage |
|---|---|---|
| `scripts/seed-qa-data.mjs` | 118, 132–135 | Creates the auth user first, then upserts a `profiles` row with a matching `id` |
| `scripts/seed-qa-data.mjs` | 165–166 | `--reset` teardown explicitly relies on "profiles cascade-delete automatically when the auth user is deleted" — this comment states the assumption outright |

**Fix under Model B:** the seed script must create the auth user, then insert the
profile with a **generated** `id` (not the auth user's id) and set
`auth_user_id` to the auth user's id explicitly. Teardown can no longer rely on
cascade-from-`auth.users` — it must delete `profiles` rows directly (matched by
`auth_user_id` or by the script's own fixed household id), then the auth users.

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
   - **Must be `SECURITY DEFINER`** (Revision 2), for the identical reason
     `internal.is_household_member` is: a policy defined on `profiles` itself
     will call this function (e.g. "read own profile" → `id =
     internal.current_profile_id()`). Without `SECURITY DEFINER`, the
     function's internal `SELECT ... FROM profiles` would be subject to
     `profiles`' own RLS — i.e. the exact recursive-policy hazard
     `docs/rls-strategy.md` already warns about for a different table
     (`is_task_assignee`). With `SECURITY DEFINER`, the internal lookup
     bypasses RLS (runs as the function owner), so no recursion occurs — same
     pattern already proven safe by `is_household_member`, just not previously
     written down for this new function.
   - **The `profiles` UPDATE policy is not a simple self-only rule under Model
     B** (Revision 2). It needs: *self* (`id = internal.current_profile_id()`)
     **OR** *owner/admin of a household this profile belongs to, while the
     profile is still unclaimed* (`auth_user_id IS NULL AND
     internal.is_household_member(<profile's household>, internal.current_profile_id(),
     ARRAY['owner','admin'])`). This is real, inherent complexity of Model B,
     not a detail to defer — Revision 1 left it as an open question when it
     should have been owned as a design requirement.
4. **RPCs**: retire `redeem_household_invite` (anonymous-auth based). Retiring
   means **dropping** the RPC and the `household_invites` table in the same
   migration that introduces the Model B schema — not leaving it as dead
   schema (Revision 2: Revision 1 said "retire" without specifying this).
   Replace with two RPCs:
   - `create_family_member` — parent-side, ordinary authenticated INSERT under
     RLS (owner/admin only), no anonymous auth involved. Generates a fresh
     `profiles.id`, `auth_user_id` left `NULL`.
   - `claim_family_member_profile` (public/UI name: **"Join Family"**) — sets
     `auth_user_id` on a pre-existing, unclaimed profile once the member has a
     real login of their own. See §5 for the failure modes this RPC must
     explicitly handle — it is not a copy of `redeem_household_invite`'s shape.
5. **Client**: hydration resolves the current user's `profile.id` via
   `auth_user_id = authUser.id` lookup, not equality-by-assumption. Every call
   site in §3's TypeScript table is updated to pass the resolved `profile.id`,
   not `authUser.id`, wherever a `profile_id` is expected.
6. **Validate against real Postgres** — same discipline as `contribution_claims`
   and `household_invites`: a full authorization test matrix before anything
   touches production, specifically including a case where `auth_user_id IS
   NULL` (an unclaimed member) to confirm RLS still denies appropriately.
7. **Deployment sequencing** (Revision 2 — not addressed in Revision 1):
   schema, RLS, and application code must land as a single deploy, not
   staggered. If the *old* `ensureProfileExists` (inserts `id = authUserId`,
   never sets `auth_user_id`) runs even once against the *new* schema before
   the client is updated, the resulting row is permanently orphaned: it has a
   real `id` but `auth_user_id` stays `NULL` forever, so
   `internal.current_profile_id()` can never resolve it, and that user is
   silently locked out of their own data on their very first sign-up. There is
   no code-level guard against this — it must be enforced by deploy ordering
   (migration + new client code released together, old client code never
   allowed to run against the new schema).
8. **Update seed script and QA tooling**: `scripts/seed-qa-data.mjs` must be
   updated in the same change (see §3, "Scripts" subsection) — its current
   `--reset` teardown silently stops working once the cascade path it depends
   on is removed.

## 5. Claiming Failure Modes & Performance Implications (Revision 2 — new)

Revision 1 did not specify failure handling for `claim_family_member_profile` at
all. These are real, not hypothetical — they follow directly from the shape of
the RPC:

- **Race**: two people click the same claim link (e.g. forwarded by mistake),
  both complete a real sign-up, both call claim on the same unclaimed profile.
  The RPC must guard with `WHERE auth_user_id IS NULL` and treat "no rows
  updated" as an explicit, distinct error (`already_claimed`), not a silent
  no-op — the second caller needs to be told clearly, not left thinking they
  succeeded.
- **Partial failure**: the member completes a real sign-up (a normal, durable
  `auth.users` row now exists) but the claim RPC call itself fails — network
  drop, app killed mid-request. They now have a real login with no linked
  profile. On next app open, hydration (per §3) finds no `profiles` row via
  `auth_user_id`, and today's `ProfileSetupScreen` would **create a brand-new
  profile from scratch** — losing the connection to the pre-existing unclaimed
  profile waiting for them. **This RPC needs its own recovery path**: the claim
  code (or a re-derivable equivalent) must survive a page reload / app restart
  so the client can retry `claim_family_member_profile` instead of falling
  through to generic profile creation.
- **Wrong-person / code scope**: the `household_invites` design (one
  household-wide, multi-use, role-assigned code) does not map onto "claim
  *this specific* pre-created profile." Model B needs a **per-member** claim
  code — generated when `create_family_member` runs, tied to exactly one
  `profiles.id`, single-use once claimed. This is a real design change from
  what was built for T1.9.1, not a renaming of the same mechanism.

**Performance** (Revision 2 — not mentioned in Revision 1): `auth.uid()` today
is a free JWT-claim read with no table access. `internal.current_profile_id()`
is a real lookup against `profiles` on every RLS-guarded query, on every table.
Mitigated by `STABLE` (Postgres caches the result per-statement, not per-row)
and the `UNIQUE` index on `auth_user_id` (index lookup, not a scan) — almost
certainly negligible at this app's scale (a handful of members per household),
but that is an assumption to verify after implementation, not a fact to assert
without measurement.

## 6. Rollback Strategy

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

## 7. Backwards Compatibility

- All existing profiles (today, 100% auth-backed) continue to work unchanged —
  `auth_user_id` backfills to their existing `id`, so nothing about a currently
  logged-in user's data access changes on day one.
- `docs/schema-design.md` and `docs/rls-strategy.md` need an explicit
  superseded-by-ADR-001 note added once this is accepted, so future readers
  aren't misled by the older documented anchor.
- **Account-deletion behavior changes (Revision 2 — not identified in Revision
  1).** Today, `profiles.id → auth.users.id ON DELETE CASCADE` means deleting a
  member's auth account fully erases their profile and, transitively, their
  household memberships. Model B replaces this with `auth_user_id ON DELETE SET
  NULL`: deleting a **claimed** member's auth account no longer deletes
  anything — it just unclaims them, and their profile, tasks, and history
  persist indefinitely. For an unclaimed profile that's exactly the desired
  behavior. For an adult who explicitly deletes their own account (e.g. a
  household member who wants their data gone, or a spouse who has left the
  household), this is a real, undiscussed behavior change — Revision 1
  incorrectly asserted "nothing changes for existing users." **Open question,
  not resolved by this ADR:** should "delete my account" become an explicit
  `delete_family_member` action (parent- or self-initiated) that removes the
  profile outright, separate from and in addition to Supabase's own auth-user
  deletion?

## 8. Future Scalability Check

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

This section held up under adversarial review (§10) without a real counter-argument surfacing — it remains the strongest part of the case for Model B.

## 9. Alternatives Considered (Revision 2 — new)

Three alternatives were evaluated as part of the adversarial review, specifically
to answer "is there a simpler design that achieves the same product goal?" —
not to immediately defend Model B.

**C — Real (non-anonymous) admin-provisioned auth user, created synchronously by
the parent's action; `profiles.id = auth.users.id` stays untouched.** This is
the approach originally proposed before pivoting to anonymous sign-in for
T1.9.1. It looks simpler on paper — no schema change at all — but
`auth.admin.createUser()` requires the service-role key, which means a real
backend endpoint (Edge Function or API route). This project currently has
**zero** server-side functions of any kind. The only alternative — inserting
directly into `auth.users` from a Postgres function — means relying on
Supabase's undocumented internal auth schema, which can change across platform
upgrades without notice. **Rejected**: Model B's cost is fully contained within
Postgres/RLS using the exact `SECURITY DEFINER` pattern already proven in this
codebase; C's cost is new infrastructure or fragile reliance on internals.

**D — The parent's own client silently calls `signInAnonymously()` "as" the new
member to provision them, from the parent's own device.** Does not work:
`signInAnonymously()` replaces the *current* session — it would sign the parent
out of their own account to sign them in as the new member. **Rejected.**

**E — A separate `pending_members` placeholder table instead of a nullable
`auth_user_id` column on `profiles`.** Relocates the identical complexity into
an extra table and an extra join, with no reduction in the RLS/RPC rewrite
scope. **Rejected** — strictly more moving parts for the same outcome.

## 10. Revision 2 — Adversarial Review Summary

Performed as an independent, self-critical pass rather than a defense of
Revision 1. Corrections made as a direct result:

- Impact analysis was not exhaustive as claimed — `scripts/seed-qa-data.mjs`
  was missing; added in §3, with a concrete `--reset`/cascade dependency found
  and cited by file and line.
- `internal.current_profile_id()` must be `SECURITY DEFINER` for recursion
  safety — stated explicitly in §4, previously assumed rather than written down.
- The `profiles` UPDATE policy is materially more complex than "self only" —
  owned as a design requirement in §4, previously left as an open question.
- Account-deletion/cascade behavior changes for **claimed** members — a real,
  previously unstated behavior change, now in §7 with an explicit open question.
- Deployment-sequencing hazard (stale client code writing rows the new schema
  can't resolve) — new, in §4.
- Claiming failure modes (race, partial failure, wrong-code-scope) and the
  resulting need for **per-member**, not per-household, claim codes — new, §5.
- Performance cost of `internal.current_profile_id()` — previously unmentioned,
  now named explicitly as an assumption to verify rather than a fact, §5.
- Three simpler alternatives evaluated on their real (not superficial)
  implementation cost — §9. None found preferable.

**Conclusion unchanged**: Model B is still the recommended architecture. It
remains the only option that achieves "parent adds Sam alone" without new
backend infrastructure or reliance on undocumented Supabase internals, and it
is structurally correct for every future feature in §8. What changed is the
completeness of the plan, not the decision.

## 11. Open Questions (explicitly not decided by this ADR)

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
5. (Revision 2) Should "delete my account" for a **claimed** member become an
   explicit `delete_family_member` action distinct from Supabase auth-user
   deletion, given `ON DELETE SET NULL` no longer removes their data? (§7)
6. (Revision 2) What is the exact lifetime/expiry policy for a per-member claim
   code, and can a parent regenerate/revoke one if it's shared with the wrong
   person before it's used? (§5)

## 12. Recommended Sequencing

1. **Verify production RLS state first** (Supabase Dashboard → Authentication →
   Policies for `profiles` and `household_members`) — before writing or applying
   any new policy, confirm what's actually live versus what the committed
   migrations show, so no work is duplicated or contradicted.
2. Fix the re-hydration loop bug in `AppDataBootstrap.tsx` (pure client-code fix,
   independent of the above, safe to do in parallel).
3. Accept or revise this ADR.
4. Only after acceptance: implement the schema/RLS/RPC/client changes in §4–§5,
   validated against real Postgres before touching production — including the
   `scripts/seed-qa-data.mjs` update and the deployment-sequencing requirement
   in the same change, not as a follow-up.
5. Rebuild the invite/claim UI and the `FamilyAvatar` component on the accepted
   model.

---

*This ADR does not implement anything. No migration has been written or applied
against this decision. Awaiting explicit acceptance before any further code is
written.*
