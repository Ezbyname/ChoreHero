# Task State Contract — EX-04

Design/documentation contract for the task lifecycle, written before EX-05
(adult completion), EX-06 (child completion request), EX-07 (parent approval
queue), and EX-10 (points integration) are implemented.

No code, RLS, migration, or UI change is proposed or made by this document.

---

## 1. Purpose

Define, once, the canonical task lifecycle — states, transitions, role
behavior, and the approval boundary — so EX-05/EX-06/EX-07/EX-10 implement
against a single agreed contract instead of each inventing its own
assumptions about what "complete" or "needs review" means.

---

## 2. Source-of-Truth States

Verified directly from schema, not assumed:

```sql
-- supabase/migrations/20260624000000_initial_schema.sql:24-29
CREATE TYPE task_status AS ENUM (
  'open',
  'in_progress',
  'needs_attention',
  'completed'
);