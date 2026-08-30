import assert from 'node:assert/strict';
import test from 'node:test';
import { formatConfirmRewardRequestBody } from '@/features/rewards/confirmRewardRequestCopy';
import { copy } from '@/content/copy';

// A3 — Confirm Before Redeem. Proves the placeholders in
// copy.rewardRedemptionConfirm.bodyTemplate are filled in correctly, and
// that the locked wording itself is present verbatim — this is the "final
// confirmation copy is correct" / "title and points interpolate correctly"
// acceptance evidence called for in the A3 authorization.
//
// Reward Reserved Points — bodyTemplate rewritten to be reservation-aware:
// the old "points won't be deducted until it's approved" wording is no
// longer accurate now that a request reserves points immediately. {n}
// appears twice in the template, so this also proves replaceAll covers
// both occurrences (see confirmRewardRequestCopy.ts's own comment).

test('interpolates reward title and required points into the body template', () => {
  const body = formatConfirmRewardRequestBody('Movie Night', 50);

  assert.equal(
    body,
    'Movie Night costs 50 points. 50 points will move to Pending while an adult reviews your request. If the request is declined or you change your mind, those points will return to your available balance.',
  );
});

test('does not mutate the shared copy template between calls', () => {
  formatConfirmRewardRequestBody('Ice Cream', 20);
  const second = formatConfirmRewardRequestBody('Book', 20);

  assert.equal(
    second,
    'Book costs 20 points. 20 points will move to Pending while an adult reviews your request. If the request is declined or you change your mind, those points will return to your available balance.',
  );
  assert.ok(copy.rewardRedemptionConfirm.bodyTemplate.includes('{title}'));
  assert.ok(copy.rewardRedemptionConfirm.bodyTemplate.includes('{n}'));
});

// Both occurrences of {n} must be replaced — a plain .replace() would
// leave the second one as the literal string "{n}".
test('both occurrences of the points placeholder are replaced', () => {
  const body = formatConfirmRewardRequestBody('New Game', 100);

  assert.ok(!body.includes('{n}'));
  assert.equal(body.match(/100 points/g)?.length, 2);
});

test('locked wording is present verbatim: reservation-aware, not immediate-deduction wording', () => {
  const body = formatConfirmRewardRequestBody('New Game', 100);

  assert.ok(body.includes('will move to Pending while an adult reviews your request'));
  assert.ok(body.includes('those points will return to your available balance'));
  assert.ok(!body.toLowerCase().includes('redeem'));
  assert.ok(!body.toLowerCase().includes('purchase'));
  assert.ok(!body.includes('won\'t be deducted until'));
});

test('request CTA copy is "Request this reward", not "Redeem"', () => {
  assert.equal(copy.rewardRedemption.requestButton, 'Request this reward');
});

test('confirmation dialog copy contract: title, confirm CTA, cancel CTA', () => {
  assert.equal(copy.rewardRedemptionConfirm.title, 'Request this reward?');
  assert.equal(copy.rewardRedemptionConfirm.confirmCta, 'Send request');
  assert.equal(copy.rewardRedemptionConfirm.cancelCta, 'Cancel');
});
