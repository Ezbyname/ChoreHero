// Slice 5D: Child Rewards (Board 04). Wallet (free / held), Suggested next
// reward, the four reward states, the reused request / cancel flow, child
// privacy, gold semantics, layout, and the banned fake systems.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  buildChildRewardsModel,
  MIN_TWO_COLUMN_WIDTH,
  rewardGridColumns,
  rewardProgress,
  walletDisplay,
  type ChildRewardsInput,
} from '@/features/childRewards/childRewardsModel';
import { isRedemptionRequestAvailable } from '@/features/rewards/rewardRequestUx';
import { formatCopy } from '@/content/formatCopy';
import { copy } from '@/content/copy';
import type { Reward, RewardRedemption } from '@/types';

const SRC = new URL('../../', import.meta.url);
const code = (rel: string) => readFileSync(new URL(rel, SRC), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const SCREEN = 'screens/ChildRewardsScreen.tsx';
const MODEL  = 'features/childRewards/childRewardsModel.ts';
const FLOW   = 'features/rewards/useRewardRequestFlow.ts';
const COPY   = readFileSync(new URL('content/copy.ts', SRC), 'utf8');
const REWARDS_COPY = COPY.slice(COPY.indexOf('// Slice 5D: Child Rewards'), COPY.indexOf('// Slice 4 role-based navigation.'));
// The block's strings only (its header comment names the banned words).
const REWARDS_STRINGS = REWARDS_COPY.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

const KID = 'kid-1';
const SIB = 'kid-2';

const reward = (id: string, requiredPoints: number, over: Partial<Reward> = {}): Reward =>
  ({ id, householdId: 'h1', title: `Reward ${id}`, requiredPoints, isActive: true, ...over });
const red = (id: string, rewardId: string, over: Partial<RewardRedemption> = {}): RewardRedemption => ({
  id, householdId: 'h1', rewardId, requestedByProfileId: KID, clientRequestId: `c-${id}`,
  pointsRequiredSnapshot: 50, status: 'pending', reservationModel: 'reserved',
  requestedAt: '2026-11-10T10:00:00Z', createdAt: '2026-11-10T10:00:00Z', updatedAt: '2026-11-10T10:00:00Z', ...over,
});
const input = (over: Partial<ChildRewardsInput> = {}): ChildRewardsInput =>
  ({ rewards: [], redemptions: [], viewerId: KID, grossBalance: 0, ...over });
const ids = (rows: readonly { reward: Reward }[]) => rows.map((r) => r.reward.id);

// ── Wallet ──────────────────────────────────────────────────────────────────

test('wallet: no hold, every Point is free', () => {
  const m = buildChildRewardsModel(input({ grossBalance: 340 }));
  assert.deepEqual(m.wallet, { total: 340, held: 0, free: 340 });
});

test('wallet: a reserved pending request holds its snapshot; free = total - held', () => {
  const m = buildChildRewardsModel(input({
    grossBalance: 340,
    rewards: [reward('game', 60)],
    redemptions: [red('r1', 'game', { pointsRequiredSnapshot: 60 })],
  }));
  assert.deepEqual(m.wallet, { total: 340, held: 60, free: 280 });
});

test('wallet: a legacy pending request holds nothing (the server never reserved it)', () => {
  const m = buildChildRewardsModel(input({
    grossBalance: 100,
    rewards: [reward('a', 40)],
    redemptions: [red('r1', 'a', { pointsRequiredSnapshot: 40, reservationModel: 'legacy' })],
  }));
  assert.deepEqual(m.wallet, { total: 100, held: 0, free: 100 });
  assert.equal(m.asked[0].held, 0);
});

test('wallet: resolved requests (approved, rejected, cancelled) hold nothing', () => {
  const m = buildChildRewardsModel(input({
    grossBalance: 100,
    rewards: [reward('a', 40)],
    redemptions: [
      red('r1', 'a', { status: 'approved' }),
      red('r2', 'a', { status: 'rejected' }),
      red('r3', 'a', { status: 'cancelled' }),
    ],
  }));
  assert.equal(m.wallet.held, 0);
  assert.equal(m.wallet.free, 100);
});

test('wallet: no balance row reads as 0, never a made-up number', () => {
  assert.deepEqual(buildChildRewardsModel(input()).wallet, { total: 0, held: 0, free: 0 });
});

test('wallet card: the big number is the TOTAL; held > 0 shows "{held} on hold · {free} free"', () => {
  const m = buildChildRewardsModel(input({
    grossBalance: 340,
    rewards: [reward('game', 60)],
    redemptions: [red('r1', 'game', { pointsRequiredSnapshot: 60 })],
  }));
  const d = walletDisplay(m.wallet);
  assert.equal(d.big, 340);
  assert.equal(d.line, '60 on hold · 280 free');
  assert.match(d.a11y, /340 points in all\. 60 on hold .* 280 free to use\./);
});

test('wallet card: nothing on hold still states the real free figure, total stays big', () => {
  const d = walletDisplay({ total: 120, held: 0, free: 120 });
  assert.equal(d.big, 120);
  assert.equal(d.line, 'None on hold · 120 free');
  assert.match(d.a11y, /120 points in all\. All 120 free to use\./);
});

test('wallet card: zero Points shows 0 and no breakdown, never "all yours"', () => {
  const d = walletDisplay({ total: 0, held: 0, free: 0 });
  assert.equal(d.big, 0);
  assert.equal(d.line, null);
  assert.equal(d.a11y, '0 points in all.');
  assert.ok(!/all yours/i.test(REWARDS_STRINGS));
});

test('wallet card: asking keeps the total, raises held and lowers free; cancelling restores', () => {
  const rewards = [reward('game', 60)];
  const before = buildChildRewardsModel(input({ grossBalance: 340, rewards }));
  const asked  = buildChildRewardsModel(input({ grossBalance: 340, rewards, redemptions: [red('r1', 'game', { pointsRequiredSnapshot: 60 })] }));
  const back   = buildChildRewardsModel(input({ grossBalance: 340, rewards, redemptions: [red('r1', 'game', { pointsRequiredSnapshot: 60, status: 'cancelled' })] }));
  assert.equal(walletDisplay(asked.wallet).big, walletDisplay(before.wallet).big);
  assert.equal(asked.wallet.held, before.wallet.held + 60);
  assert.equal(asked.wallet.free, before.wallet.free - 60);
  assert.deepEqual(back.wallet, before.wallet);
});

test('wallet card: the screen renders the total as the big number, the header coin stays free', () => {
  const src = code(SCREEN);
  assert.match(src, /walletNumber\]\}>\{d\.big\}/);
  assert.ok(!/walletNumber\]\}>\{wallet\.free\}/.test(src));
  assert.match(src, /onGoldText\]\}>\{wallet\.free\}/);
});

// ── Suggested next reward ───────────────────────────────────────────────────

test('suggested: the cheapest reward the child cannot afford yet', () => {
  const m = buildChildRewardsModel(input({
    grossBalance: 100,
    rewards: [reward('big', 500), reward('near', 150), reward('cheap', 50)],
  }));
  assert.equal(m.suggested?.reward.id, 'near');
  assert.equal(m.suggested?.toGo, 50);
  assert.equal(m.suggested?.progress, 100 / 150);
});

test('suggested: exact-equal cost is affordable, so it is Ready, not Suggested', () => {
  const m = buildChildRewardsModel(input({ grossBalance: 100, rewards: [reward('eq', 100), reward('more', 120)] }));
  assert.deepEqual(ids(m.ready), ['eq']);
  assert.equal(m.suggested?.reward.id, 'more');
});

test('suggested: none when every reward is affordable', () => {
  const m = buildChildRewardsModel(input({ grossBalance: 100, rewards: [reward('a', 10), reward('b', 100)] }));
  assert.equal(m.suggested, null);
  assert.deepEqual(m.keepGoing, []);
});

test('suggested: a reward the child already asked for is excluded', () => {
  const m = buildChildRewardsModel(input({
    grossBalance: 100,
    rewards: [reward('asked', 150), reward('next', 300)],
    redemptions: [red('r1', 'asked', { reservationModel: 'legacy' })],
  }));
  assert.equal(m.suggested?.reward.id, 'next');
});

test('suggested: inactive rewards are excluded', () => {
  const m = buildChildRewardsModel(input({
    grossBalance: 10,
    rewards: [reward('gone', 20, { isActive: false }), reward('live', 90)],
  }));
  assert.equal(m.suggested?.reward.id, 'live');
});

test('suggested: deterministic ties, by title then id', () => {
  const byTitle = buildChildRewardsModel(input({
    rewards: [reward('z', 50, { title: 'Bike ride' }), reward('a', 50, { title: 'Movie' })], grossBalance: 0,
  }));
  assert.equal(byTitle.suggested?.reward.id, 'z');
  const byId = buildChildRewardsModel(input({
    rewards: [reward('b', 50, { title: 'Same' }), reward('a', 50, { title: 'Same' })], grossBalance: 0,
  }));
  assert.equal(byId.suggested?.reward.id, 'a');
});

test('suggested: uses free Points (after holds), not the gross balance', () => {
  // 200 total, 120 held: 80 free. A 100-point reward is not affordable.
  const m = buildChildRewardsModel(input({
    grossBalance: 200,
    rewards: [reward('held', 120), reward('target', 100)],
    redemptions: [red('r1', 'held', { pointsRequiredSnapshot: 120 })],
  }));
  assert.equal(m.wallet.free, 80);
  assert.equal(m.suggested?.reward.id, 'target');
  assert.deepEqual(m.ready, []);
});

test('suggested: no rewards at all, nothing suggested and the empty state shows', () => {
  const m = buildChildRewardsModel(input({ grossBalance: 50 }));
  assert.equal(m.suggested, null);
  assert.equal(m.noRewards, true);
  assert.equal(buildChildRewardsModel(input({ rewards: [reward('x', 5, { isActive: false })] })).noRewards, true);
});

// ── Reward states ───────────────────────────────────────────────────────────

test('Ready to get: active, not asked, cost <= free; ordered by Points, title, id', () => {
  const m = buildChildRewardsModel(input({
    grossBalance: 100,
    rewards: [reward('c', 80, { title: 'B' }), reward('b', 80, { title: 'A' }), reward('a', 20), reward('x', 30, { isActive: false })],
  }));
  assert.deepEqual(ids(m.ready), ['a', 'b', 'c']);
  assert.deepEqual(m.ready.map((r) => r.cost), [20, 80, 80]);
});

test('Keep going: unaffordable rewards with Points to go and progress; the Suggested one is not repeated', () => {
  const m = buildChildRewardsModel(input({
    grossBalance: 40,
    rewards: [reward('s', 50), reward('k1', 200), reward('k2', 100)],
  }));
  assert.equal(m.suggested?.reward.id, 's');
  assert.deepEqual(ids(m.keepGoing), ['k2', 'k1']);
  assert.deepEqual(m.keepGoing.map((k) => k.toGo), [60, 160]);
  assert.deepEqual(m.keepGoing.map((k) => k.progress), [0.4, 0.2]);
});

test('Asked for: own pending requests, oldest first, never offered again as Ready', () => {
  const m = buildChildRewardsModel(input({
    grossBalance: 500,
    rewards: [reward('a', 50), reward('b', 60)],
    redemptions: [
      red('r2', 'b', { requestedAt: '2026-11-12T10:00:00Z', pointsRequiredSnapshot: 60 }),
      red('r1', 'a', { requestedAt: '2026-11-11T10:00:00Z', pointsRequiredSnapshot: 50 }),
    ],
  }));
  assert.deepEqual(m.asked.map((a) => a.redemption.id), ['r1', 'r2']);
  assert.deepEqual(m.asked.map((a) => a.held), [50, 60]);
  assert.deepEqual(m.ready, [], 'no duplicate request can be offered');
  assert.deepEqual(m.keepGoing, []);
});

test('Asked for: a request whose reward is no longer in the store still shows (and can be cancelled)', () => {
  const m = buildChildRewardsModel(input({ grossBalance: 100, redemptions: [red('r1', 'gone')] }));
  assert.equal(m.asked.length, 1);
  assert.equal(m.asked[0].reward, null);
});

test('My collection: approved rewards only, one entry per reward with a count, most recent first', () => {
  const m = buildChildRewardsModel(input({
    rewards: [reward('ice', 20), reward('camp', 400), reward('movie', 100)],
    redemptions: [
      red('a1', 'ice',   { status: 'approved', reviewedAt: '2026-11-01T10:00:00Z' }),
      red('a2', 'ice',   { status: 'approved', reviewedAt: '2026-11-09T10:00:00Z' }),
      red('a3', 'camp',  { status: 'approved', reviewedAt: '2026-11-05T10:00:00Z' }),
      red('a4', 'movie', { status: 'rejected' }),
      red('a5', 'movie', { status: 'cancelled' }),
    ],
  }));
  assert.deepEqual(ids(m.collection), ['ice', 'camp']);
  assert.deepEqual(m.collection.map((c) => c.count), [2, 1]);
});

test('My collection: archived rewards still count; a reward missing from the store is not invented', () => {
  const m = buildChildRewardsModel(input({
    rewards: [reward('old', 20, { isActive: false })],
    redemptions: [red('a1', 'old', { status: 'approved' }), red('a2', 'unknown', { status: 'approved' })],
  }));
  assert.deepEqual(ids(m.collection), ['old']);
});

test('rewardProgress is clamped to 0..1', () => {
  assert.equal(rewardProgress(50, 100), 0.5);
  assert.equal(rewardProgress(-10, 100), 0);
  assert.equal(rewardProgress(150, 100), 1);
  assert.equal(rewardProgress(10, 0), 0);
});

// ── Privacy ─────────────────────────────────────────────────────────────────

test('privacy: a sibling’s requests, holds and collection never reach the child’s model', () => {
  const m = buildChildRewardsModel(input({
    grossBalance: 100,
    rewards: [reward('a', 50), reward('b', 300)],
    redemptions: [
      red('s1', 'a', { requestedByProfileId: SIB, pointsRequiredSnapshot: 50 }),
      red('s2', 'b', { requestedByProfileId: SIB, status: 'approved' }),
    ],
  }));
  assert.deepEqual(m.wallet, { total: 100, held: 0, free: 100 });
  assert.deepEqual(m.asked, []);
  assert.deepEqual(m.collection, []);
  assert.deepEqual(ids(m.ready), ['a'], 'a sibling’s request does not block this child');
});

test('privacy: the screen reads only the viewer’s own balance; no family Points list or ranking', () => {
  const s = code(SCREEN);
  assert.ok(s.includes('useAppStore(selectMyPointsBalance)'));
  assert.ok(!/selectPointsBalances|pointsBalances|members|getMemberNameByUserId|rank|leader/i.test(s));
});

// ── Actions: the existing request / cancel flow ─────────────────────────────

test('"Ask for it · {points}" is the Ready action', () => {
  assert.equal(formatCopy(copy.childRewards.askFor, { n: 80 }), 'Ask for it · 80');
  const s = code(SCREEN);
  assert.ok(s.includes('label={formatCopy(copy.childRewards.askFor, { n: item.cost })}'));
  assert.ok(!/\b(Buy|Claim|Redeem)\b/.test(REWARDS_STRINGS), 'the child asks; a grown-up approves');
});

test('request reuses the existing flow: confirm first, then the idempotent request RPC', () => {
  const s = code(SCREEN);
  assert.ok(s.includes("import { useRewardRequestFlow } from '@/features/rewards/useRewardRequestFlow';"));
  assert.ok(s.includes('onPress={flow.openConfirm}'));
  assert.ok(s.includes('<ConfirmRewardRequestModal') && s.includes('onConfirm={flow.confirmRequest}'));
  assert.ok(!/requestRewardRedemption\(|cancelRewardRedemption\(|supabase|\.rpc\(/.test(s), 'no new request path in the screen');
  const f = code(FLOW);
  assert.ok(f.includes('requestRewardRedemption({') && f.includes('cancelRewardRedemption({'));
  assert.ok(f.includes('resolveClientRequestId(pendingRequestIdRef.current, generateClientRequestId)'));
  assert.ok(f.includes('pendingRequestIdRef.current = nextClientRequestId(clientRequestId, result)'));
  assert.ok(f.includes('hasPendingRedemption: pendingRedemption !== undefined'));
  // RewardCard (adult screen and older child view) uses the same hook.
  assert.ok(code('features/rewards/components/RewardCard.tsx').includes('useRewardRequestFlow({'));
});

test('duplicate protection: no request while one is in flight or already pending', () => {
  const base = { canRequestPermission: true, rewardIsActive: true, viewerBalance: 100, requiredPoints: 50, hasPendingRedemption: false, isSubmitting: false };
  assert.equal(isRedemptionRequestAvailable(base), true);
  assert.equal(isRedemptionRequestAvailable({ ...base, isSubmitting: true }), false);
  assert.equal(isRedemptionRequestAvailable({ ...base, hasPendingRedemption: true }), false);
  assert.equal(isRedemptionRequestAvailable({ ...base, viewerBalance: 49 }), false);
  assert.equal(isRedemptionRequestAvailable({ ...base, viewerBalance: 50 }), true, 'exact-equal is affordable');
  const s = code(SCREEN);
  assert.ok(s.includes('disabled={!flow.requestAvailable}') && s.includes('busy={flow.isSubmitting}'));
});

test('cancel ("Changed my mind") reuses the existing confirmation and cancel RPC', () => {
  const s = code(SCREEN);
  assert.ok(s.includes('onPress={flow.openCancel}'));
  assert.ok(s.includes('<CancelRewardRequestModal') && s.includes('onCancelRequest={flow.confirmCancel}'));
  assert.ok(s.includes('{canCancel ? ('), 'only when the existing permission allows it');
});

// ── Accessibility, state without colour ─────────────────────────────────────

test('every state is in text and an icon, never colour alone', () => {
  const s = code(SCREEN);
  assert.ok(s.includes('copy.childRewards.askFor'), 'available: the Ask for it label');
  assert.ok(s.includes('name="lock-closed-outline"') && s.includes('copy.childRewards.toGo'), 'locked: lock + Points to go');
  assert.ok(s.includes('name="time-outline"') && s.includes('copy.childRewards.askedState'), 'asked: clock + Waiting for a grown-up');
  assert.ok(s.includes('name="checkmark-circle"'), 'collected: check');
  for (const k of ['readyA11y', 'lockedA11y', 'askedA11y', 'collectionA11y', 'askForA11y', 'changedMindA11y']) {
    assert.ok(s.includes(`copy.childRewards.${k}`), k);
  }
  // The wallet's spoken label is built by walletDisplay() in the model.
  assert.ok(s.includes('accessibilityLabel={d.a11y}'), 'wallet a11y from walletDisplay');
  for (const k of ['walletA11y', 'walletHeldA11y', 'walletNoHoldA11y']) {
    assert.ok(code(MODEL).includes(`copy.childRewards.${k}`), k);
  }
});

test('48dp: every button is a child-density button (compact keeps 48dp), section titles are headers', () => {
  const s = code(SCREEN);
  const buttons = [...s.matchAll(/<AppButton[\s\S]*?\/>/g)].map((m) => m[0]);
  assert.equal(buttons.length, 2);
  for (const b of buttons) assert.ok(b.includes('density="child"'), b);
  assert.ok(s.includes("tileCta:  { alignSelf: 'stretch', minHeight: sizes.tapTarget }"));
  assert.ok(s.includes('accessibilityRole="header"'));
});

test('layout: two reward columns on wide phones, one on 360dp or with a large font', () => {
  assert.equal(MIN_TWO_COLUMN_WIDTH, 370);
  assert.equal(rewardGridColumns(360, 1), 1);
  assert.equal(rewardGridColumns(390, 1), 2);
  assert.equal(rewardGridColumns(412, 1), 2);
  assert.equal(rewardGridColumns(360, 1.3), 1);
  assert.equal(rewardGridColumns(390, 1.3), 1);
  assert.equal(rewardGridColumns(412, 1.3), 1);
});

// ── Gold, Rubik, placeholder art ────────────────────────────────────────────

test('gold only for Points and rewards: wallet, coin, reward bubbles, progress, "Ask for it"', () => {
  const s = code(SCREEN);
  const styleBlock = s.slice(s.indexOf('const styles = StyleSheet.create({'));
  const GOLD = /colors\.(gold|goldDeep|onGold)\b|depth\.goldButton/;
  const goldStyles = [...styleBlock.matchAll(/^ {2}(\w+):[^\n]*(?:\n(?! {2}\w+:)[^\n]*)*/gm)]
    .filter((m) => GOLD.test(m[0])).map((m) => m[1]);
  assert.deepEqual(goldStyles.sort(), ['barFill', 'bubble', 'coin', 'onGoldText', 'wallet', 'walletInk', 'walletNumber']);
  const goldButtons = [...s.matchAll(/<AppButton[\s\S]*?\/>/g)].map((m) => m[0]).filter((b) => b.includes('variant="gold"'));
  assert.equal(goldButtons.length, 1);
  assert.ok(goldButtons[0].includes('copy.childRewards.askFor'));
  // Asked for is amber (waiting), the collection is success: neither is gold.
  assert.ok(/asked: \{[\s\S]*?backgroundColor: colors\.waitingSoft/.test(styleBlock));
  assert.ok(/collectionTile: \{[\s\S]*?backgroundColor: colors\.successSoft/.test(styleBlock));
});

test('Rubik through the Child Home’s useT(); reward art is the shared placeholder, never guessed', () => {
  const s = code(SCREEN);
  assert.ok(s.includes("import { ILLUSTRATION_PLACEHOLDER, useT } from '@/screens/ChildHomeScreen';"));
  assert.ok(s.includes('ILLUSTRATION_PLACEHOLDER.reward'));
  assert.ok(!/reward\.title\.(toLowerCase|includes|match)|category|illustrationId/i.test(s + code(MODEL)));
});

// ── Honesty: no invented game state ─────────────────────────────────────────

test('no XP, levels, streaks, badges, achievements, Saving For or leaderboard', () => {
  const banned = /\bXP\b|\blevel|streak|badge|achievement|saving for|savingFor|leaderboard|\brank|gems?\b|coins? as/i;
  for (const f of [SCREEN, MODEL, FLOW]) assert.ok(!banned.test(code(f)), f);
  assert.ok(REWARDS_COPY.length > 200);
  assert.ok(!banned.test(REWARDS_STRINGS));
});

test('the copy block holds no fake example values', () => {
  assert.ok(!/\b(340|280|60|Movie night|Ice cream|Camping)\b/.test(REWARDS_COPY));
});
