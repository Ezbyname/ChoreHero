# ChoreHero — Product Roadmap

> Living document. Updated as planning evolves.
> This roadmap reflects architecture decisions, domain model intent, and UX principles.
> Implementation tickets are tracked separately.

---

## Product Principles

- ChoreHero should feel like a calm household helper, not a strict productivity system.
- Reduce mental load. Do not create pressure.
- Use warm, non-judgmental language at all times.
- Preserve clear separation between domain entities (tasks, requests, rewards).
- Supabase = source of truth. Zustand = UI projection. Bootstrap = the only bridge.

---

## Epics & Tickets

---

### ✅ Epic T1.1 — App Foundation

| Ticket | Status | Description |
|--------|--------|-------------|
| T1.1.1 | ✅ Done | Expo TypeScript init |
| T1.1.2 | ✅ Done | React Navigation + placeholder screens |
| T1.1.3 | ✅ Done | App theme foundation |
| T1.1.4 | ✅ Done | Absolute imports / path aliases |
| T1.1.5 | ✅ Done | Global state with Zustand |
| T1.1.6 | ✅ Done | Domain models (`src/types/`) |

---

### ✅ Epic T1.2 — Mock Data & Screen MVPs

| Ticket | Status | Description |
|--------|--------|-------------|
| T1.2.1 | ✅ Done | Mock data foundation (`src/mock/`) |
| T1.2.2 | ✅ Done | Today Screen MVP with mock tasks |
| T1.2.3 | ✅ Done | My Tasks Screen + task filter helpers |
| T1.2.4 | ✅ Done | Rewards Screen MVP |
| T1.2.5 | ✅ Done | Zustand hydration from mock seed |
| T1.2.6 | ✅ Done | Basic store selectors |

---

### 🔄 Epic T1.3 — Auth Foundation

**Pipeline:** Supabase Auth → AuthBootstrap listener → Zustand auth projection → selectors → AuthGate/UI

**Architecture rule:** `supabase` holds truth. `useAppStore` holds the UI projection.
`AuthBootstrap` is the only component allowed to translate Supabase auth events into store state.

| Ticket | Status | Description |
|--------|--------|-------------|
| T1.3.1 | ✅ Done | Supabase client foundation (`src/lib/supabase.ts`, `supabaseConfig.ts`) |
| T1.3.2 | ⬜ Next | Auth Synchronization Layer |
| T1.3.3 | ⬜ | AuthGate |
| T1.3.4 | ⬜ | Login Screen MVP |
| T1.3.5 | ⬜ | Signup Screen MVP |
| T1.3.6 | ⬜ | Logout Flow |

#### T1.3.2 — Auth Synchronization Layer (planned)

**Store additions:**
```ts
authSession:    Session | null;   // Supabase session object
authUser:       User | null;      // Supabase auth user
isAuthResolved: boolean;          // true once first INITIAL_SESSION fires
isAuthLoading:  boolean;
authError:      string | null;
```

**Note:** `authUser` (Supabase identity) is intentionally separate from `user: AppUser | null`
(ChoreHero profile). They will be joined when Supabase DB integration is ready.

**Actions:**
```ts
applyAuthSession(session: Session | null)
clearAuthSession()
setAuthLoading(isLoading: boolean)
setAuthError(error: string | null)
markAuthResolved()
```

**Auth event map:**
```
INITIAL_SESSION   → applyAuthSession(session), markAuthResolved()
SIGNED_IN         → applyAuthSession(session), markAuthResolved()
SIGNED_OUT        → clearAuthSession(), markAuthResolved()
TOKEN_REFRESHED   → applyAuthSession(session)
USER_UPDATED      → applyAuthSession(session)
PASSWORD_RECOVERY → applyAuthSession(session)  [no UI flow yet]
```

**Supabase config status (already implemented in T1.3.1):**
```ts
type SupabaseConfigStatus = 'missing' | 'partial' | 'ready';
```

**Rule:** `hydrateFromMockSeed` remains in place until Supabase DB integration is ready.
Auth hydration (`authSession`, `authUser`) does not replace mock task/household data yet.

---

### ⬜ Epic T1.4 — Supabase Schema & Database Integration

> Planned. Schema will cover: `profiles`, `households`, `household_members`, `tasks`,
> `service_requests`, `task_help_requests`, `rewards`, `reward_redemptions`, `points_balances`.
> RLS rules must be finalized before any write operations.

---

### ⬜ Epic T1.5 — Requests & Help Flows

> **Planning captured below. Implementation begins after Auth + Schema are stable.**

---

## Domain Area: Requests & Help Flows

ChoreHero is not only a task list. It manages responsibilities, commitments, help, and
coordination between family members. Two related but distinct request flows are needed.

---

### Concept 1 — Child-to-Adult Service / Help Requests

**Problem:**
A child should not be able to directly assign a task to an adult as if the adult is obligated.
Instead, when a child wants an adult to do something, it should be a *request* — not a task.

**User-facing language:**
- "Ask for help"
- "Send a request"
- "Waiting for grown-up review"
- "This request is waiting for approval"
- "Not right now" (never "Declined", "Rejected", or "Denied")

**Flow:**
```
Child creates a request
        ↓
Adult receives the request (in Assigned or Requests tab)
        ↓
Adult reviews it (can edit title/details)
        ↓
Adult approves, edits, or declines
        ↓
Only if approved → a real Task is created
```

**Rules:**
- A pending request is NOT a task.
- A child-created request does not appear in task lists until an adult approves it.
- The adult may edit the request before converting it to a task.
- The adult may decline with an optional friendly note.
- Only adult approval can produce a real task from a child request.
- This preserves adult control over household commitments.

**Domain model (future):**
```ts
type ServiceRequestStatus =
  | 'pending'
  | 'approved'
  | 'declined'
  | 'converted_to_task';

interface ServiceRequest {
  id:                   string;
  householdId:          string;
  requestedByUserId:    string;
  requestedForUserId:   string;
  title:                string;
  description?:         string;
  status:               ServiceRequestStatus;
  createdAt:            string;
  reviewedAt?:          string;
  reviewedByUserId?:    string;
  convertedTaskId?:     string;
}
```

**Future Supabase table:** `service_requests`

---

### Concept 2 — Task Help Requests

**Problem:**
A user may already have a task assigned to them but may need help completing it.
This applies to: a child needing parent help, a parent needing partner help,
or any assignee who is blocked, unsure, or missing something.

**User-facing language:**
- "I need help"
- "Need help with this task"
- "Ask for help on this task"
- "Help requested" (task status label)
- "Needs a little help" (gentle framing for `needs_attention`)

**Important distinction:**
```
ServiceRequest:      No task exists yet. Someone asks an adult to create/accept a task.
TaskHelpRequest:     A task already exists. The assignee needs help completing it.
```

**Flow:**
```
User has an assigned task
        ↓
User taps "I need help"
        ↓
User chooses a reason and/or writes a note
        ↓
A TaskHelpRequest is created for that task
        ↓
Task may be marked as needs_attention
        ↓
Parent / partner / helper reviews and responds
        ↓
Help request acknowledged or resolved
```

**Predefined reasons:**
```ts
type TaskHelpReason =
  | 'not_sure_what_to_do'
  | 'need_more_time'
  | 'need_adult_help'
  | 'missing_something'
  | 'cant_reach'
  | 'not_feeling_well'
  | 'other';
```

**User-facing reason copy:**
- "I'm not sure what to do"
- "I need more time"
- "I need help from an adult"
- "Something is missing"
- "I can't reach it"
- "I don't feel well"
- "Other"

**Free text prompts:**
- "What would help?"
- "Add a note"

**Domain model (future):**
```ts
type TaskHelpRequestStatus =
  | 'open'
  | 'acknowledged'
  | 'resolved'
  | 'cancelled';

interface TaskHelpRequest {
  id:                      string;
  taskId:                  string;
  householdId:             string;
  requestedByUserId:       string;
  requestedToUserId?:      string;
  reason:                  TaskHelpReason;
  note?:                   string;
  status:                  TaskHelpRequestStatus;
  createdAt:               string;
  acknowledgedAt?:         string;
  acknowledgedByUserId?:   string;
  resolvedAt?:             string;
  resolvedByUserId?:       string;
}
```

**Task behavior:**
- A task with an open help request should surface as `needs_attention`.
- Display language: "Needs a little help" or "Help requested" — never "Blocked" or "Failed".
- Do not treat it as failure. It is a normal part of family coordination.

**Future Supabase table:** `task_help_requests`

---

### Epic T1.5 — Requests & Help Flows (Planned Tickets)

| Ticket | Status | Description |
|--------|--------|-------------|
| T1.5.1 | ⬜ | Requests domain model addendum (`src/types/requests.ts`) |
| T1.5.2 | ⬜ | Service requests mock data |
| T1.5.3 | ⬜ | Task help requests mock data |
| T1.5.4 | ⬜ | Adult requests review screen MVP |
| T1.5.5 | ⬜ | "I need help" task flow MVP |
| T1.5.6 | ⬜ | Requests store integration |
| T1.5.7 | ⬜ | Supabase schema for service_requests + task_help_requests |

> **Scheduling note:** If Supabase schema design begins during T1.4, include `service_requests`
> and `task_help_requests` tables before finalizing the schema — to avoid modeling
> child-to-adult requests incorrectly as regular tasks.

---

## Architectural Rules

1. **Do not overload `Task`** with request behavior. Use separate domain entities:
   `ServiceRequest` and `TaskHelpRequest`.
2. A **pending request is not a task**.
3. A **TaskHelpRequest belongs to an existing task** (via `taskId`).
4. Only **adult approval** can convert a child-created request into a real task.
5. **Supabase = source of truth. Zustand = projection. Bootstrap = the only bridge.**
6. Keep copy **calm, friendly, and non-judgmental** throughout.
7. Avoid making ChoreHero feel like a command/permission system. It is a household helper.
8. Maintain clear mapping to future Supabase tables:
   - `tasks`
   - `service_requests`
   - `task_help_requests`

---

## Feature Placement by Tab (Current)

| Tab | Current | Planned additions |
|-----|---------|-------------------|
| Today | Tasks due today, unassigned, needs_attention | Help requests needing parent review |
| My Tasks | Tasks assigned to current user | Help request status on assigned tasks |
| Assigned | Placeholder | Tasks assigned by current user + pending service requests |
| Rewards | Points + reward cards | Redemption flow, child selector |
| Settings | Placeholder | Household, profile, preferences |

---

*Last updated: T1.3.1 complete. T1.3.2 (Auth Synchronization Layer) next.*
