// Slice 6C: Create Reward (Board 11 "Adult Create Reward Final"). Pure and
// Node-test safe. Three real fields only — Reward name (required),
// Description (optional), Points cost (required) — matching
// createReward()'s input. No illustration picker, edit, archive,
// category, stock, expiry or XP (Board 11: future, no placeholder rows).
//
// Points cost:
//   - The value is the text field (number pad), so it stays editable; the
//     − / + buttons and the quick chips only write that same text.
//   - Quick chips: 50 · 80 · 120 (Board 11; no conflicting product rule).
//   - − / + move by COST_STEP. Below 1 is never produced; above the
//     server's integer limit is never produced.
//   - Validation mirrors the server: rewards.points_required is a Postgres
//     `integer` with chk_rewards_points_positive (> 0). So: a whole number
//     from 1 to 2147483647. No new product range is invented.

export const COST_PRESETS = [50, 80, 120] as const;
export const COST_STEP = 10;
export const COST_MIN = 1;
// rewards.points_required is `integer` (int4): the server's own upper bound.
export const COST_MAX = 2147483647;

export type CostError = 'empty' | 'not_whole' | 'too_small' | 'too_large';

// Digits only, with optional surrounding spaces. "12.5", "1e3", "-4",
// "abc" and "" are not accepted as a cost.
export function parseCost(text: string): number | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : Number.MAX_SAFE_INTEGER;
}

export function costError(text: string): CostError | null {
  const t = text.trim();
  if (t === '') return 'empty';
  if (/^-\d+$/.test(t)) return 'too_small';
  const n = parseCost(t);
  if (n === null) return 'not_whole';
  if (n < COST_MIN) return 'too_small';
  if (n > COST_MAX) return 'too_large';
  return null;
}

export function canDecrement(text: string): boolean {
  const n = parseCost(text);
  return n !== null && n > COST_MIN;
}

export function canIncrement(text: string): boolean {
  const n = parseCost(text);
  return n === null || n < COST_MAX;
}

export function decrementCost(text: string): string {
  const n = parseCost(text);
  if (n === null || n <= COST_MIN) return text;
  return String(Math.max(COST_MIN, Math.min(COST_MAX, n) - COST_STEP));
}

// From empty (or unreadable) text, + starts at one step.
export function incrementCost(text: string): string {
  const n = parseCost(text);
  if (n === null) return String(COST_STEP);
  return String(Math.min(COST_MAX, n + COST_STEP));
}

export function selectedPreset(text: string): number | null {
  const n = parseCost(text);
  return n !== null && (COST_PRESETS as readonly number[]).includes(n) ? n : null;
}

export type CreateRewardValidation = {
  nameError: boolean;
  cost:      CostError | null;
  // The value to send when valid.
  points:    number | null;
};

export function validateCreateReward(name: string, costText: string): CreateRewardValidation {
  const cost = costError(costText);
  return {
    nameError: name.trim() === '',
    cost,
    points: cost === null ? parseCost(costText) : null,
  };
}
