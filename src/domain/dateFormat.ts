// due_at write/read conventions — Phase 2 (P2-D03/P2-D04/P2-D06).
//
// due_at is a single timestamptz with no separate date/time-precision
// column; due_at_has_time (see the 20260815000000 migration) is the
// explicit, always-written discriminator between DATE_ONLY and
// DATE_WITH_TIME. This module is the single place that convention lives —
// nothing else in the app should construct a due_at ISO string or decide
// how to display one.
//
// DATE_ONLY values are deliberately timezone-agnostic: written as UTC
// midnight of the selected calendar date, and always read back via UTC
// date components. Constructing them via local midnight + toISOString()
// causes real calendar-date drift for positive UTC offsets (demonstrated
// during Phase 2 planning validation) — never do that.
//
// DATE_WITH_TIME values use ordinary local-to-UTC conversion, matching
// P2-D04 (timezone interpretation applies only when a time is supplied).

const RELATIVE_WINDOW_DAYS = 7;

export function toDateOnlyISOString(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0)).toISOString();
}

export function toTimedISOString(localDate: Date): string {
  return localDate.toISOString();
}

function daysBetweenUTC(from: Date, to: Date): number {
  const fromUTC = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const toUTC   = Date.UTC(to.getUTCFullYear(),   to.getUTCMonth(),   to.getUTCDate());
  return Math.round((toUTC - fromUTC) / 86400000);
}

function daysBetweenLocal(from: Date, to: Date): number {
  const fromLocal = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const toLocal   = new Date(to.getFullYear(),   to.getMonth(),   to.getDate());
  return Math.round((toLocal.getTime() - fromLocal.getTime()) / 86400000);
}

function relativeLabel(daysFromNow: number): string | null {
  if (daysFromNow === 0) return 'Today';
  if (daysFromNow === 1) return 'Tomorrow';
  if (daysFromNow === -1) return 'Yesterday';
  if (daysFromNow > 1 && daysFromNow <= RELATIVE_WINDOW_DAYS) return `In ${daysFromNow} days`;
  if (daysFromNow < -1 && daysFromNow >= -RELATIVE_WINDOW_DAYS) return `${-daysFromNow} days ago`;
  return null;
}

function absoluteDateLabel(year: number, month: number, day: number): string {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

function timeLabel(hours: number, minutes: number): string {
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export interface FormattedDueDate {
  dateLabel: string;
  timeLabel: string | null;
  isPast:    boolean;
}

// hasTime === undefined is treated as false (date-only) rather than
// throwing — a legacy row with due_at set but no discriminator (see the
// V6 evidence note in the migration) must not crash the card; it falls
// back to the date-only, timezone-agnostic rendering, which is the safer
// of the two interpretations (never shows a possibly-wrong time).
export function formatDueDate(isoString: string, hasTime: boolean | undefined, now: Date = new Date()): FormattedDueDate {
  const due = new Date(isoString);

  if (hasTime) {
    const days = daysBetweenLocal(now, due);
    const relative = relativeLabel(days);
    const dateLabel = relative ?? absoluteDateLabel(due.getFullYear(), due.getMonth() + 1, due.getDate());
    return {
      dateLabel,
      timeLabel: timeLabel(due.getHours(), due.getMinutes()),
      isPast:    due.getTime() < now.getTime(),
    };
  }

  const days = daysBetweenUTC(now, due);
  const relative = relativeLabel(days);
  const dateLabel = relative ?? absoluteDateLabel(due.getUTCFullYear(), due.getUTCMonth() + 1, due.getUTCDate());
  return {
    dateLabel,
    timeLabel: null,
    isPast:    days < 0,
  };
}
