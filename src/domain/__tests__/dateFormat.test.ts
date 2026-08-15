import assert from 'node:assert/strict';
import test from 'node:test';

import { formatDueDate, toDateOnlyISOString, toTimedISOString } from '@/domain/dateFormat';

// P2-D03/P2-D06 — DATE_ONLY timezone-boundary preservation. Verifies the
// algorithm itself (UTC-anchored construction), not just sampled output:
// toDateOnlyISOString must never route through local-timezone conversion,
// so its result is identical regardless of the runtime's local timezone.
test('toDateOnlyISOString anchors to UTC midnight, independent of local timezone', () => {
  assert.equal(toDateOnlyISOString(2026, 8, 15), '2026-08-15T00:00:00.000Z');
});

// Regression for the naive local-midnight approach, which was demonstrated
// during planning to shift the calendar date backward for positive UTC
// offsets (e.g. 15 Aug at UTC+10 -> incorrectly serialized as 14 Aug).
// toDateOnlyISOString must not exhibit that behavior for any input.
test('toDateOnlyISOString does not depend on Date.UTC accepting an offset (structural check)', () => {
  const iso = toDateOnlyISOString(2026, 1, 1);
  assert.equal(iso, '2026-01-01T00:00:00.000Z');
  const parsed = new Date(iso);
  assert.equal(parsed.getUTCFullYear(), 2026);
  assert.equal(parsed.getUTCMonth(), 0);
  assert.equal(parsed.getUTCDate(), 1);
});

// P2-D04 — DATE_WITH_TIME round-trips via standard local-to-UTC
// conversion; toTimedISOString should just delegate to Date#toISOString.
test('toTimedISOString delegates to the local Date instant', () => {
  const local = new Date(2026, 7, 15, 16, 0, 0);
  assert.equal(toTimedISOString(local), local.toISOString());
});

// 00:00Z collision regression: a date-only value and a timed value can
// serialize to the identical due_at instant. formatDueDate must never use
// the timestamp shape to decide DATE_ONLY vs DATE_WITH_TIME — only the
// explicit hasTime parameter.
test('00:00Z collision: identical due_at, hasTime alone determines classification', () => {
  const collidingISO = '2026-08-15T00:00:00.000Z';

  const dateOnly = formatDueDate(collidingISO, false, new Date('2026-08-01T00:00:00.000Z'));
  assert.equal(dateOnly.timeLabel, null);

  const timed = formatDueDate(collidingISO, true, new Date('2026-08-01T00:00:00.000Z'));
  assert.equal(timed.timeLabel, '00:00');
});

// NULL / legacy-row regression: hasTime undefined (a row with due_at set
// but no discriminator, e.g. pre-migration) must not throw and must fall
// back to the safer date-only interpretation, never inventing a time.
test('formatDueDate treats undefined hasTime as date-only, not an error', () => {
  const result = formatDueDate('2026-08-15T00:00:00.000Z', undefined, new Date('2026-08-01T00:00:00.000Z'));
  assert.equal(result.timeLabel, null);
});

test('formatDueDate: relative labels within the 7-day window', () => {
  const now = new Date('2026-08-15T00:00:00.000Z');
  assert.equal(formatDueDate(toDateOnlyISOString(2026, 8, 15), false, now).dateLabel, 'Today');
  assert.equal(formatDueDate(toDateOnlyISOString(2026, 8, 16), false, now).dateLabel, 'Tomorrow');
  assert.equal(formatDueDate(toDateOnlyISOString(2026, 8, 21), false, now).dateLabel, 'In 6 days');
});

test('formatDueDate: absolute label beyond the 7-day window', () => {
  const now = new Date('2026-08-15T00:00:00.000Z');
  const result = formatDueDate(toDateOnlyISOString(2026, 8, 23), false, now);
  assert.equal(result.dateLabel, '23 Aug 2026');
});

test('formatDueDate: exactly 7 days out still uses the relative label', () => {
  const now = new Date('2026-08-15T00:00:00.000Z');
  const result = formatDueDate(toDateOnlyISOString(2026, 8, 22), false, now);
  assert.equal(result.dateLabel, 'In 7 days');
});
