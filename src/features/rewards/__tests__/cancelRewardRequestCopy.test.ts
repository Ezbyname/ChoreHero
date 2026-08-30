import assert from 'node:assert/strict';
import test from 'node:test';
import { formatCancelRewardRequestBody } from '@/features/rewards/cancelRewardRequestCopy';
import { copy } from '@/content/copy';

// Reward Reserved Points — "Changed my mind" confirmation copy. Mirrors
// confirmRewardRequestCopy.test.ts's own acceptance-evidence shape.

test('interpolates pending points into the body template', () => {
  const body = formatCancelRewardRequestBody(50);

  assert.equal(
    body,
    'Changed your mind? This reward request will be cancelled and your 50 pending points will be returned to your available balance.',
  );
});

test('does not mutate the shared copy template between calls', () => {
  formatCancelRewardRequestBody(20);
  const second = formatCancelRewardRequestBody(30);

  assert.equal(
    second,
    'Changed your mind? This reward request will be cancelled and your 30 pending points will be returned to your available balance.',
  );
  assert.ok(copy.rewardCancelConfirm.bodyTemplate.includes('{n}'));
});

test('locked wording is present verbatim: cancelled and returned to available balance', () => {
  const body = formatCancelRewardRequestBody(75);

  assert.ok(body.includes('will be cancelled'));
  assert.ok(body.includes('returned to your available balance'));
});

test('confirmation dialog copy contract: title, keep CTA, cancel CTA', () => {
  assert.equal(copy.rewardCancelConfirm.title, 'Cancel this reward request?');
  assert.equal(copy.rewardCancelConfirm.keepCta, 'Keep request');
  assert.equal(copy.rewardCancelConfirm.cancelCta, 'Cancel request');
});

test('"Changed my mind" button copy is exact', () => {
  assert.equal(copy.rewardRedemption.changedMyMindButton, 'Changed my mind');
});
