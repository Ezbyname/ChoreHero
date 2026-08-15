import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import { createTask } from '@/features/tasks/createTask';
import { useAppStore } from '@/store/useAppStore';

afterEach(() => {
  useAppStore.getState().resetAppState();
});

test('missing tasks.create permission returns not_authorized without touching the store', async () => {
  const before = useAppStore.getState().tasks.length;

  const result = await createTask({
    householdId:        'house-1',
    title:               'Do the dishes',
    createdByProfileId:  'parent-1',
    role:                null,
  });

  assert.deepEqual(result, { ok: false, reason: 'not_authorized' });
  assert.equal(useAppStore.getState().tasks.length, before);
});

test('assigning without tasks.assign is not_authorized even with tasks.create', async () => {
  const result = await createTask({
    householdId:         'house-1',
    title:                'Do the dishes',
    createdByProfileId:   'child-1',
    assigneeProfileId:    'child-2',
    role:                 'child', // has neither tasks.create nor tasks.assign
  });

  assert.deepEqual(result, { ok: false, reason: 'not_authorized' });
});

test('empty/whitespace-only title is invalid_input', async () => {
  const result = await createTask({
    householdId:        'house-1',
    title:               '   ',
    createdByProfileId:  'parent-1',
    role:                'adult',
  });

  assert.deepEqual(result, { ok: false, reason: 'invalid_input' });
});

// P2-D10: creation without due_at remains fully allowed — no default is
// ever assigned. P2-D02: omitted description likewise stays unset.
test('creating a task without description or due_at succeeds with neither set', async () => {
  const result = await createTask({
    householdId:        'house-1',
    title:               'Take out trash',
    createdByProfileId:  'parent-1',
    role:                'adult',
  });

  assert.deepEqual(result, { ok: true });
  const task = useAppStore.getState().tasks.find((t) => t.title === 'Take out trash');
  assert.equal(task?.description, undefined);
  assert.equal(task?.dueAt, undefined);
  assert.equal(task?.dueAtHasTime, undefined);
});

// P2-D02: whitespace-only description normalizes to undefined (-> NULL on
// persist), same as an omitted one — never rejected, never stored literally.
test('whitespace-only description normalizes away, does not block creation', async () => {
  const result = await createTask({
    householdId:        'house-1',
    title:               'Water the plants',
    description:         '   ',
    createdByProfileId:  'parent-1',
    role:                'adult',
  });

  assert.deepEqual(result, { ok: true });
  const task = useAppStore.getState().tasks.find((t) => t.title === 'Water the plants');
  assert.equal(task?.description, undefined);
});

test('a real description is preserved as-is', async () => {
  const result = await createTask({
    householdId:        'house-1',
    title:               'Feed the cat',
    description:         'Twice a day, morning and evening',
    createdByProfileId:  'parent-1',
    role:                'adult',
  });

  assert.deepEqual(result, { ok: true });
  const task = useAppStore.getState().tasks.find((t) => t.title === 'Feed the cat');
  assert.equal(task?.description, 'Twice a day, morning and evening');
});

// P2-D03: date-only due_at (dueAtHasTime: false/omitted) passes through
// unchanged, distinguished from a timed one purely via dueAtHasTime — not
// inferred from the ISO string.
test('date-only due_at is stored with dueAtHasTime false', async () => {
  const result = await createTask({
    householdId:        'house-1',
    title:               'Pay rent',
    dueAt:               '2026-08-15T00:00:00.000Z',
    dueAtHasTime:        false,
    createdByProfileId:  'parent-1',
    role:                'adult',
  });

  assert.deepEqual(result, { ok: true });
  const task = useAppStore.getState().tasks.find((t) => t.title === 'Pay rent');
  assert.equal(task?.dueAt, '2026-08-15T00:00:00.000Z');
  assert.equal(task?.dueAtHasTime, false);
});

// 00:00Z collision regression at the feature-layer boundary: a timed
// due_at that happens to serialize to the same instant as a date-only one
// must still be stored with dueAtHasTime true, not silently downgraded.
test('timed due_at colliding with UTC midnight is still stored with dueAtHasTime true', async () => {
  const result = await createTask({
    householdId:        'house-1',
    title:               'Call the dentist',
    dueAt:               '2026-08-15T00:00:00.000Z', // UTC+03, 03:00 local
    dueAtHasTime:        true,
    createdByProfileId:  'parent-1',
    role:                'adult',
  });

  assert.deepEqual(result, { ok: true });
  const task = useAppStore.getState().tasks.find((t) => t.title === 'Call the dentist');
  assert.equal(task?.dueAt, '2026-08-15T00:00:00.000Z');
  assert.equal(task?.dueAtHasTime, true);
});

// P2-D01/P2-D09: length enforcement is UI-layer only (AssignedByMeScreen's
// maxLength/validation), deliberately NOT re-validated here — createTask
// must not reject on length, matching P2-D09's exclusion of a domain-layer
// enforcement requirement.
test('createTask does not itself reject an over-length description (UI-layer concern only)', async () => {
  const longDescription = 'x'.repeat(600);
  const result = await createTask({
    householdId:        'house-1',
    title:               'Organize garage',
    description:         longDescription,
    createdByProfileId:  'parent-1',
    role:                'adult',
  });

  assert.deepEqual(result, { ok: true });
});
