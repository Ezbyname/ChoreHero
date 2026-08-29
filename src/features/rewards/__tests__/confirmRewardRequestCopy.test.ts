import assert from 'node:assert/strict';
import test from 'node:test';
import { formatConfirmRewardRequestBody } from '@/features/rewards/confirmRewardRequestCopy';
import { copy } from '@/content/copy';

// A3 — Confirm Before Redeem. Proves the two placeholders in
// copy.rewardRedemptionConfirm.bodyTemplate are filled in correctly, and
// that the locked wording itself (approval required, no immediate
// deduction) is present verbatim — this is the "final confirmation copy
// is correct" / "title and points interpolate correctly" acceptance
// evidence called for in the A3 authorization.

test('interpolates reward title and required points into the body template', () => {
  const body = formatConfirmRewardRequestBody('Movie Night', 50);

  assert.equal(
    body,
    'Movie Night costs 50 points. An adult needs to approve your request. Your points won\'t be deducted until it\'s approved.',
  );
});

test('does not mutate the shared copy template between calls', () => {
  formatConfirmRewardRequestBody('Ice Cream', 20);
  const second = formatConfirmRewardRequestBody('Book', 20);

  assert.equal(second, 'Book costs 20 points. An adult needs to approve your request. Your points won\'t be deducted until it\'s approved.');
  assert.ok(copy.rewardRedemptionConfirm.bodyTemplate.includes('{title}'));
  assert.ok(copy.rewardRedemptionConfirm.bodyTemplate.includes('{n}'));
});

test('locked wording is present verbatim: approval required, no immediate deduction', () => {
  const body = formatConfirmRewardRequestBody('New Game', 100);

  assert.ok(body.includes('An adult needs to approve your request'));
  assert.ok(body.includes('won\'t be deducted until it\'s approved'));
  assert.ok(!body.toLowerCase().includes('redeem'));
  assert.ok(!body.toLowerCase().includes('purchase'));
});

test('request CTA copy is "Request this reward", not "Redeem"', () => {
  assert.equal(copy.rewardRedemption.requestButton, 'Request this reward');
});

test('confirmation dialog copy contract: title, confirm CTA, cancel CTA', () => {
  assert.equal(copy.rewardRedemptionConfirm.title, 'Request this reward?');
  assert.equal(copy.rewardRedemptionConfirm.confirmCta, 'Send request');
  assert.equal(copy.rewardRedemptionConfirm.cancelCta, 'Cancel');
});
