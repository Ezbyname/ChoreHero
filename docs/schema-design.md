# ChoreHero — Schema Design Draft

> Design document only. No migrations have been created.
> This document guides T1.4.3 (RLS Strategy), T1.4.4 (Migrations), T1.4.5 (Types Generation),
> T1.4.6 (Repository Layer), and T1.4.7 (App Hydration).
>
> Domain decisions are fixed per T1.4.1. Schema blockers are captured as Open Schema Questions
> rather than silently reopening domain decisions.

---

## Schema Conventions

| Convention | Rule |
|---|---|
| Primary keys | `uuid` on all tables |
| PK column name | `id uuid primary key` (except `profiles`, which uses `id uuid primary key references auth.users(id)`) |
| Foreign key naming | `<table_singular>_id` suffix (e.g. `household_id`, `profile_id`, `task_id`) |
| Profile references | Always `profile_id` pointing to `profiles(id)` — never `user_id` pointing to `auth.users` |
| Timestamp type | `timestamptz` for all date/time fields |
| Default timestamps | `created_at timestamptz not null default now()` and `updated_at timestamptz not null default now()` |
| Enum types | Postgres native `CREATE TYPE ... AS ENUM (...)` — not check constraints. Reason: type safety, easier RLS targeting, IDE tooling support |
| Soft delete | Avoided unless clearly needed. Use status columns instead (e.g. `reward_status = 'archived'`) |
| Nullable fields | Documented per column with explicit reason |
| Household scoping | Most tables include `household_id` for RLS and query performance |
| Auth identity vs profile | `profiles.id = auth.users.id`. Auth user is identity only; profile is the application entity |

---

## Enums / Status Types

> Task statuses represent observable workflow states, not user intentions.
> The `accepted` status is explicitly excluded from MVP.

### `household_member_role`
```sql
CREATE TYPE household_member_role AS ENUM (
  'owner',   -- created the household; full control
  'admin',   -- trusted adult with management rights
  'adult',   -- adult member, can approve requests
  'child'    -- limited permissions; cannot create tasks for adults directly
);
```

### `task_status`
```sql
CREATE TYPE task_status AS ENUM (
  'open',             -- created, not started
  'in_progress',      -- someone has started working on it
  'needs_attention',  -- blocked, help requested, or stalled
  'completed'         -- done
  -- NOTE: 'accepted' is intentionally excluded. It is a user intention, not an observable state.
);
```

### `reward_status`
```sql
CREATE TYPE reward_status AS ENUM (
  'active',   -- available for redemption
  'archived'  -- no longer offered; soft-hide
);
```

### `point_transaction_type`
```sql
CREATE TYPE point_transaction_type AS ENUM (
  'task_completed',    -- points awarded when task is completed
  'manual_adjustment', -- adult manually adjusts balance
  'reward_redemption', -- points spent redeeming a reward
  'correction'         -- error correction; requires note
);
```

### `service_request_status`
```sql
CREATE TYPE service_request_status AS ENUM (
  'pending_review',    -- awaiting adult review
  'approved',          -- adult approved but not yet converted
  'declined',          -- adult declined (use gentle copy: "not right now")
  'converted_to_task', -- a task was created from this request
  'cancelled'          -- requester cancelled
);
```

### `service_request_type`
```sql
CREATE TYPE service_request_type AS ENUM (
  'task',       -- asking an adult to do something
  'purchase',   -- asking for something to be bought
  'ride',       -- asking for transportation
  'permission', -- asking permission to do something
  'other'
);
```

### `task_help_request_status`
```sql
CREATE TYPE task_help_request_status AS ENUM (
  'open',         -- submitted, awaiting response
  'acknowledged', -- helper has seen it
  'resolved',     -- help was given
  'cancelled'     -- requester cancelled
);
```

### `task_help_reason`
```sql
CREATE TYPE task_help_reason AS ENUM (
  'not_sure_what_to_do',
  'need_more_time',
  'need_adult_help',
  'missing_something',
  'cant_reach',
  'not_feeling_well',
  'other'
);
```

---

## Tables

---

### `profiles`

**Purpose:** Application-level profile, mapped 1:1 to a Supabase Auth user.
Permissions and roles are not stored here — they come from `household_members`.

```sql
CREATE TABLE profiles (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name    text NOT NULL,
  avatar_url      text NULL,          -- nullable: optional, set later
  default_household_id uuid NULL,     -- nullable: see open question; set after household is created
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
```

**Indexes:**
- Primary key on `id` (implicit)

**Notes:**
- `profiles.id` equals `auth.users.id`. There is no separate `user_id` FK.
- Profile is created at signup time (future onboarding ticket).
- `default_household_id` is nullable intentionally: a new user has no household yet. See open questions.
- `avatar_url` is nullable: optional profile picture.
- Role/permissions are always derived from `household_members`, not from this table.

---

### `households`

**Purpose:** Family workspace boundary. All tasks, rewards, and member data are scoped here.

```sql
CREATE TABLE households (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  created_by_profile_id uuid NOT NULL REFERENCES profiles(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
```

**Indexes:**
```sql
CREATE INDEX idx_households_created_by ON households(created_by_profile_id);
```

**Notes:**
- No `on delete cascade` on `created_by_profile_id` — a household should survive a profile deletion (handle via soft delete or reassignment in future).
- Household name is required; can be changed later.

---

### `household_members`

**Purpose:** Membership and role assignment within a household. Controls all permissions.
A profile may belong to multiple households with different roles.

```sql
CREATE TABLE household_members (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id          uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  profile_id            uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role                  household_member_role NOT NULL,
  display_name_override text NULL,      -- nullable: optional per-household display name (e.g. "Dad")
  joined_at             timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_household_members_household_profile UNIQUE (household_id, profile_id)
);
```

**Indexes:**
```sql
CREATE INDEX idx_household_members_household ON household_members(household_id);
CREATE INDEX idx_household_members_profile   ON household_members(profile_id);
CREATE INDEX idx_household_members_role      ON household_members(household_id, role);
```

**Notes:**
- `display_name_override` allows a profile to appear as "Dad" or "Maya" within a specific household.
- `(household_id, profile_id)` unique constraint prevents duplicate membership.
- RLS will use this table as the membership gate for all household-scoped data.

---

### `tasks`

**Purpose:** Actual household commitments. A task only exists once an adult creates or approves it.
Pending service requests are **not** tasks.

```sql
CREATE TABLE tasks (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id               uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  title                      text NOT NULL,
  description                text NULL,          -- nullable: optional details
  status                     task_status NOT NULL DEFAULT 'open',
  created_by_profile_id      uuid NOT NULL REFERENCES profiles(id),
  assigned_by_profile_id     uuid NULL REFERENCES profiles(id),    -- nullable: may be self-assigned
  assignee_profile_id        uuid NULL REFERENCES profiles(id),    -- nullable: unassigned tasks allowed in MVP
  due_at                     timestamptz NULL,   -- nullable: not all tasks have deadlines
  points                     integer NOT NULL DEFAULT 0,
  source_service_request_id  uuid NULL,          -- nullable: FK added after service_requests exists (see migration notes)
  completed_at               timestamptz NULL,   -- nullable: set when status = 'completed'
  completed_by_profile_id    uuid NULL REFERENCES profiles(id),    -- nullable: who marked it done
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_tasks_points_non_negative CHECK (points >= 0)
);
```

**Indexes:**
```sql
CREATE INDEX idx_tasks_household              ON tasks(household_id);
CREATE INDEX idx_tasks_assignee               ON tasks(assignee_profile_id);
CREATE INDEX idx_tasks_created_by             ON tasks(created_by_profile_id);
CREATE INDEX idx_tasks_status                 ON tasks(status);
CREATE INDEX idx_tasks_due_at                 ON tasks(due_at);
CREATE INDEX idx_tasks_household_status       ON tasks(household_id, status);
CREATE INDEX idx_tasks_household_assignee     ON tasks(household_id, assignee_profile_id);
```

**Notes:**
- `assignee_profile_id` is nullable: unassigned tasks appear in "Today" view for anyone to pick up.
- "Overdue" is derived at query time from `due_at < now()` — not a stored status.
- `needs_attention` is not failure; it means someone needs help or the task is stalled.
- `source_service_request_id` references `service_requests(id)` but creates a circular FK dependency with `service_requests.converted_task_id`. See migration sequencing notes.
- MVP does **not** use a `task_assignments` table. Single `assignee_profile_id` is sufficient.
- `accepted` is not a valid task status.

---

### `rewards`

**Purpose:** Household-scoped rewards that members can redeem using points.

```sql
CREATE TABLE rewards (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id          uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  title                 text NOT NULL,
  description           text NULL,        -- nullable: optional
  points_required       integer NOT NULL,
  status                reward_status NOT NULL DEFAULT 'active',
  created_by_profile_id uuid NOT NULL REFERENCES profiles(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_rewards_points_positive CHECK (points_required > 0)
);
```

**Indexes:**
```sql
CREATE INDEX idx_rewards_household        ON rewards(household_id);
CREATE INDEX idx_rewards_status           ON rewards(status);
CREATE INDEX idx_rewards_household_status ON rewards(household_id, status);
```

**Notes:**
- `points_required > 0` enforced; free rewards do not exist.
- Use `status = 'archived'` instead of deleting — preserves history for point_transactions.
- Redemption flow (tracking who redeemed what) is a separate table; see open questions.

---

### `points_balances`

**Purpose:** Current points balance per household member. Owned by `(household_id, profile_id)`.

```sql
CREATE TABLE points_balances (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  profile_id   uuid NOT NULL REFERENCES profiles(id)  ON DELETE CASCADE,
  balance      integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_points_balances_household_profile UNIQUE (household_id, profile_id),
  CONSTRAINT chk_points_balance_non_negative CHECK (balance >= 0)
  -- NOTE: MVP recommendation is no negative balances.
  -- If future design allows overdraft, remove this constraint.
);
```

**Indexes:**
```sql
CREATE INDEX idx_points_balances_household ON points_balances(household_id);
CREATE INDEX idx_points_balances_profile   ON points_balances(profile_id);
```

**Notes:**
- Balance is always `(household_id, profile_id)` scoped — a child may have different balances across households.
- `balance >= 0` constraint enforced in MVP. See open questions.
- Updated atomically when a point_transaction is written (application layer or trigger).

---

### `point_transactions`

**Purpose:** Immutable audit trail for all point changes. Used to recompute or verify balances.

```sql
CREATE TABLE point_transactions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id          uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  profile_id            uuid NOT NULL REFERENCES profiles(id),
  type                  point_transaction_type NOT NULL,
  amount                integer NOT NULL,       -- positive = earned, negative = spent
  balance_after         integer NULL,           -- nullable: snapshot for audit; can be recomputed
  task_id               uuid NULL REFERENCES tasks(id),
  reward_id             uuid NULL REFERENCES rewards(id),
  created_by_profile_id uuid NULL REFERENCES profiles(id),
  note                  text NULL,              -- nullable: required for 'correction' type
  created_at            timestamptz NOT NULL DEFAULT now()
  -- No updated_at: transactions are immutable
);
```

**Indexes:**
```sql
CREATE INDEX idx_point_txn_household         ON point_transactions(household_id);
CREATE INDEX idx_point_txn_profile           ON point_transactions(profile_id);
CREATE INDEX idx_point_txn_task              ON point_transactions(task_id);
CREATE INDEX idx_point_txn_reward            ON point_transactions(reward_id);
CREATE INDEX idx_point_txn_created_at        ON point_transactions(created_at);
CREATE INDEX idx_point_txn_household_profile ON point_transactions(household_id, profile_id, created_at);
```

**Notes:**
- `amount` is signed: positive for earned points, negative for spent.
- `balance_after` is a denormalized snapshot. Tradeoff: easier audit/debugging vs. extra write complexity. See open questions.
- Transactions are immutable — no `updated_at`.
- `note` is nullable but should be required at application layer for `type = 'correction'`.
- `task_id` and `reward_id` are nullable context links, not required.

---

### `service_requests`

**Purpose:** Requests submitted by any member that may eventually become tasks.
A pending service request is **not** a task. Only adult approval converts one to a task.

```sql
CREATE TABLE service_requests (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id              uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  request_type              service_request_type NOT NULL DEFAULT 'task',
  status                    service_request_status NOT NULL DEFAULT 'pending_review',
  requested_by_profile_id   uuid NOT NULL REFERENCES profiles(id),
  requested_for_profile_id  uuid NULL REFERENCES profiles(id),    -- nullable: who it's for (may differ from requester)
  reviewed_by_profile_id    uuid NULL REFERENCES profiles(id),    -- nullable: set when reviewed
  title                     text NOT NULL,
  description               text NULL,          -- nullable: optional detail
  decline_reason            text NULL,          -- nullable: set if declined; use gentle copy in UI
  converted_task_id         uuid NULL,          -- nullable: FK to tasks(id) added after tasks exists (see migration notes)
  reviewed_at               timestamptz NULL,   -- nullable: set when reviewed
  converted_at              timestamptz NULL,   -- nullable: set when task is created
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);
```

**Indexes:**
```sql
CREATE INDEX idx_srequests_household            ON service_requests(household_id);
CREATE INDEX idx_srequests_status               ON service_requests(status);
CREATE INDEX idx_srequests_type                 ON service_requests(request_type);
CREATE INDEX idx_srequests_requested_by         ON service_requests(requested_by_profile_id);
CREATE INDEX idx_srequests_requested_for        ON service_requests(requested_for_profile_id);
CREATE INDEX idx_srequests_reviewed_by          ON service_requests(reviewed_by_profile_id);
CREATE INDEX idx_srequests_household_status     ON service_requests(household_id, status);
```

**Notes:**
- A pending service request must not appear in task lists.
- Adult approval is required before `converted_task_id` is set and a task is created.
- `decline_reason` is stored but UI must use gentle copy ("Not right now") — never "Rejected" or "Denied".
- `converted_task_id` and `tasks.source_service_request_id` create a circular FK pair. See migration sequencing notes.
- Service request conversion is designed as 1:1 in MVP. See open questions.

---

### `task_help_requests`

**Purpose:** Help requests for existing, already-assigned tasks.
A help request is distinct from a service request: the task already exists; the assignee needs assistance.

```sql
CREATE TABLE task_help_requests (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id                   uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  household_id              uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  requested_by_profile_id   uuid NOT NULL REFERENCES profiles(id),
  requested_to_profile_id   uuid NULL REFERENCES profiles(id),    -- nullable: optional target helper
  status                    task_help_request_status NOT NULL DEFAULT 'open',
  reason                    task_help_reason NOT NULL,
  note                      text NULL,          -- nullable: free-text from requester
  acknowledged_by_profile_id uuid NULL REFERENCES profiles(id),
  resolved_by_profile_id    uuid NULL REFERENCES profiles(id),
  acknowledged_at           timestamptz NULL,
  resolved_at               timestamptz NULL,
  cancelled_at              timestamptz NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()

  -- Future: partial unique index on (task_id) WHERE status = 'open'
  -- to enforce one open help request per task. See open questions.
);
```

**Indexes:**
```sql
CREATE INDEX idx_threquests_task              ON task_help_requests(task_id);
CREATE INDEX idx_threquests_household         ON task_help_requests(household_id);
CREATE INDEX idx_threquests_status            ON task_help_requests(status);
CREATE INDEX idx_threquests_requested_by      ON task_help_requests(requested_by_profile_id);
CREATE INDEX idx_threquests_requested_to      ON task_help_requests(requested_to_profile_id);
CREATE INDEX idx_threquests_household_status  ON task_help_requests(household_id, status);
CREATE INDEX idx_threquests_task_status       ON task_help_requests(task_id, status);
```

**Notes:**
- A `task_help_request` belongs to an **existing** task; it does not create a new task.
- An open help request may surface the parent task as `needs_attention`.
- `needs_attention` is not failure — it is a normal part of family coordination.
- UI must never use "Blocked" or "Failed" for help request state.
- `household_id` is denormalized from `tasks` for RLS efficiency. Can be derived but avoids join in policies.

---

## Relationship Map

```
auth.users
  └── 1:1  profiles

profiles
  ├── 1:N  household_members
  ├── 1:N  tasks.created_by_profile_id
  ├── 1:N  tasks.assignee_profile_id
  ├── 1:N  tasks.assigned_by_profile_id
  ├── 1:N  tasks.completed_by_profile_id
  ├── 1:1  points_balances (per household)
  ├── 1:N  point_transactions
  ├── 1:N  service_requests.requested_by_profile_id
  └── 1:N  task_help_requests.requested_by_profile_id

households
  ├── 1:N  household_members
  ├── 1:N  tasks
  ├── 1:N  rewards
  ├── 1:N  points_balances
  ├── 1:N  point_transactions
  ├── 1:N  service_requests
  └── 1:N  task_help_requests

tasks
  ├── 1:N  task_help_requests
  └── 0:1  service_requests (via source_service_request_id / converted_task_id)

rewards
  └── 1:N  point_transactions (reward_id)

service_requests
  └── 0:1  tasks (via converted_task_id; circular with tasks.source_service_request_id)
```

---

## Indexing Strategy

All primary app screens are **household-scoped**. The most important queries are:

| Screen / Query | Key Index |
|---|---|
| Today — tasks by household + status | `(household_id, status)` on `tasks` |
| My Tasks — tasks by household + assignee | `(household_id, assignee_profile_id)` on `tasks` |
| Tasks by due date | `due_at` on `tasks` |
| Rewards screen — active rewards | `(household_id, status)` on `rewards` |
| Points display — balance by household/profile | `(household_id, profile_id)` unique on `points_balances` |
| Requests review — pending requests | `(household_id, status)` on `service_requests` |
| Help requests — open by task | `(task_id, status)` on `task_help_requests` |
| Membership gate (RLS) | `(household_id, profile_id)` on `household_members` |
| Transaction history | `(household_id, profile_id, created_at)` on `point_transactions` |

**Principle:** Index every FK that is used in a WHERE clause or JOIN. Compound indexes on `(household_id, X)` are preferred over single-column indexes for household-scoped queries.

---

## Constraints and Data Integrity

| Constraint | Table | Type | Rule |
|---|---|---|---|
| One membership per household | `household_members` | UNIQUE | `(household_id, profile_id)` |
| One balance per household member | `points_balances` | UNIQUE | `(household_id, profile_id)` |
| Non-negative task points | `tasks` | CHECK | `points >= 0` |
| Positive reward cost | `rewards` | CHECK | `points_required > 0` |
| Non-negative balance (MVP) | `points_balances` | CHECK | `balance >= 0` |
| Profile = Auth user | `profiles` | FK | `id references auth.users(id)` |
| Cascade on household deletion | `tasks`, `rewards`, etc. | FK | `ON DELETE CASCADE` |
| `accepted` excluded from task statuses | `task_status` enum | ENUM | Not present in type definition |
| Unassigned task allowed | `tasks` | Nullable | `assignee_profile_id NULL` |
| Task without deadline allowed | `tasks` | Nullable | `due_at NULL` |
| Service request without target | `service_requests` | Nullable | `requested_for_profile_id NULL` |
| Help request without specific helper | `task_help_requests` | Nullable | `requested_to_profile_id NULL` |
| One open help request per task (future) | `task_help_requests` | Partial UNIQUE | `(task_id) WHERE status = 'open'` — deferred |
| Circular FKs between tasks and service_requests | Both tables | Deferred FK | See migration sequencing notes |

---

## RLS Considerations Preview

> Full RLS policies will be designed in T1.4.3. This section captures likely principles only.

**Membership gate:**
All household-scoped data is readable only by profiles that have a row in `household_members` for that `household_id`.

**Likely RLS principles:**

| Resource | Read | Create | Update | Delete |
|---|---|---|---|---|
| `profiles` | Own profile always; others if same household | Auth user (own) | Own profile | Not allowed in MVP |
| `households` | Members only | Any authenticated user | owner/admin | Not in MVP |
| `household_members` | Members of same household | owner/admin | owner/admin (role changes) | owner/admin |
| `tasks` | Household members | adult/admin (or converted from request) | Assignee (status); adult/admin (all fields) | owner/admin |
| `rewards` | Household members | adult/admin | adult/admin | owner/admin |
| `points_balances` | Own balance; adult can see household | System/trigger | System/trigger | Not allowed |
| `point_transactions` | Own transactions; adult can see household | System/trigger | Immutable | Not allowed |
| `service_requests` | Household members | Any member (child can request) | adult/admin (approve/decline) | Requester (cancel) |
| `task_help_requests` | Household members | Task assignee | Helper (acknowledge/resolve) | Requester (cancel) |

**Key RLS rules for ChoreHero's calm UX:**
- Children may create `service_requests` but may not directly create tasks for adults.
- Only adult/admin can convert a `service_request` to a `task`.
- Help requests do not change task ownership.
- Points are written by trusted service logic, not directly by client.

---

## Migration Sequencing Notes

Migrations must be applied in dependency order:

```
1. Create enum types (before any table that references them)
   - household_member_role
   - task_status
   - reward_status
   - point_transaction_type
   - service_request_status
   - service_request_type
   - task_help_request_status
   - task_help_reason

2. Create profiles
   - References auth.users

3. Create households
   - References profiles (created_by_profile_id)

4. Create household_members
   - References households + profiles

5. Create tasks (without source_service_request_id FK)
   - Tasks references profiles and households
   - Omit the FK on source_service_request_id for now (circular dependency)
   - Column exists as uuid NULL with no FK constraint initially

6. Create rewards
   - References households + profiles

7. Create points_balances
   - References households + profiles

8. Create point_transactions
   - References households, profiles, tasks, rewards

9. Create service_requests (without converted_task_id FK)
   - References households, profiles
   - Omit FK on converted_task_id for now (circular dependency)
   - Column exists as uuid NULL with no FK constraint initially

10. Create task_help_requests
    - References tasks, households, profiles

11. Add circular FKs (optional, in separate migration)
    ALTER TABLE tasks
      ADD CONSTRAINT fk_tasks_source_service_request
      FOREIGN KEY (source_service_request_id)
      REFERENCES service_requests(id) ON DELETE SET NULL;

    ALTER TABLE service_requests
      ADD CONSTRAINT fk_service_requests_converted_task
      FOREIGN KEY (converted_task_id)
      REFERENCES tasks(id) ON DELETE SET NULL;

12. Create indexes (after tables)

13. Create updated_at triggers (optional but recommended)
    - A trigger function that sets updated_at = now() on every UPDATE
    - Apply to all tables with updated_at column
```

**Circular FK note:** `tasks.source_service_request_id` and `service_requests.converted_task_id` create a circular reference. The recommended approach is to create both tables without enforcing one of the FKs, then add it afterward in a separate `ALTER TABLE` step. Alternatively, enforce only one side and leave the other as an unvalidated reference at the application layer.

---

## Open Schema Questions

| # | Question | Recommendation |
|---|---|---|
| 1 | Should `tasks.source_service_request_id` be enforced as an FK immediately? | Add FK in a follow-up migration after both tables exist. Defer enforcement to avoid circular migration dependency. |
| 2 | Should `service_requests.converted_task_id` be enforced as an FK immediately? | Same as above — add after both tables exist. Enforce only one direction first if needed. |
| 3 | Is service request conversion 1:1 (one request → one task) or 1:N? | 1:1 for MVP. If 1:N is needed later, add a `task_service_request_links` join table. |
| 4 | Should only one **open** `task_help_request` per task be enforced at DB level? | Recommended: yes. Add a partial unique index `(task_id) WHERE status = 'open'` after MVP is stable. |
| 5 | Should `point_transactions.balance_after` be stored? | Yes for MVP. Simplifies audit and debugging. Tradeoff: slight write overhead and potential for drift if not maintained atomically. |
| 6 | Should reward redemptions be tracked in a separate table (e.g. `reward_redemptions`)? | Yes, future ticket. Needed for: who redeemed, when, what status (pending approval, fulfilled). Not in initial migration. |
| 7 | Should `profiles.default_household_id` be included from day one? | Include as nullable column. Set it during household creation onboarding. FK to `households(id)` should be deferrable or added after `households` is created. |
| 8 | Should tasks support recurrence (e.g. weekly chores) in the initial schema? | No. Recurrence adds significant complexity. Defer to a future epic. A `recurrence_rule` column can be added later without a breaking change. |
| 9 | Should `points_balances.balance` allow going negative? | MVP: no. `CHECK (balance >= 0)` enforced. Revisit if partial rewards or overdraft scenarios are needed. |
| 10 | Should `tasks` cascade-delete `task_help_requests` when a task is deleted? | Yes — `task_help_requests` uses `ON DELETE CASCADE` on `task_id`. If soft-delete of tasks is ever added, revisit. |

---

*Last updated: T1.4.2 — Schema Design Draft.*
*Next: T1.4.3 — RLS Strategy Draft.*
