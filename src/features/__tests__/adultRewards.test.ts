// Slice 6C: Adult Rewards (Board 10) + Create Reward (Board 11). Requests
// (pending only, permission-filtered, count = rows, CTA "Review", routed to
// the existing AdultReview), the rewards list (active set, locked order,
// name / description / cost / state, pending indicator), privacy (no child
// wallet, ranking or shop UI), Create Reward (fields, cost control, presets,
// validation aligned with the server, permission, success, duplicate
// guard), navigation and the banned future features.
import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { readFileSync } from 'node:fs';

import {
  buildAdultRewardsModel,
  pendingLabel,
  requestActionFullWidth,
  type AdultRewardsInput,
} from '@/features/adultRewards/adultRewardsModel';
import {
  COST_MAX,
  COST_PRESETS,
  COST_STEP,
  canDecrement,
  canIncrement,
  costError,
  decrementCost,
  incrementCost,
  parseCost,
  selectedPreset,
  validateCreateReward,
} from '@/features/adultRewards/createRewardForm';
import { keyboardOverlap, keyboardTopFromSignal, overlapForKeyboardTop, type KeyboardSignal } from '@/features/adultRewards/keyboardOverlap';
import { buildAdultHomeModel, findAttentionItem, type AdultHomeInput } from '@/features/adultHome/adultHomeModel';
import { createReward } from '@/features/rewards/createReward';
import { sortRewardsForDisplay } from '@/features/rewards/sortRewards';
import { createSingleFlight } from '@/features/tasks/createTaskFormState';
import { hasHouseholdPermission } from '@/domain/permissions';
import { ADULT_TABS, STACK_ROUTES, isRouteAvailable } from '@/navigation/roleShell';
import { copy } from '@/content/copy';
import { useAppStore } from '@/store/useAppStore';
import type { HouseholdMember, Reward, RewardRedemption } from '@/types';

const SRC = new URL('../../', import.meta.url);
const raw  = (rel: string) => readFileSync(new URL(rel, SRC), 'utf8');
const code = (rel: string) => raw(rel).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const SCREEN = 'screens/AdultRewardsScreen.tsx';
const NEWR   = 'screens/NewRewardScreen.tsx';
const MODEL  = 'features/adultRewards/adultRewardsModel.ts';
const FORM   = 'features/adultRewards/createRewardForm.ts';
const SHELL  = 'navigation/AppTabs.tsx';
const COPY   = raw('content/copy.ts');
const RW_COPY = COPY.slice(COPY.indexOf('  adultRewards: {'), COPY.indexOf('// Slice 4 role-based navigation.'));
const RW_STRINGS = RW_COPY.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

const ME = 'adult-1', MAYA = 'kid-maya', NOAM = 'kid-noam';
const MEMBERS: HouseholdMember[] = [
  { id: 'm1', userId: ME, name: 'Dana', role: 'owner' },
  { id: 'm2', userId: MAYA, name: 'Maya', role: 'child' },
  { id: 'm3', userId: NOAM, name: 'Noam', role: 'child' },
];
const reward = (id: string, title: string, requiredPoints: number, over: Partial<Reward> = {}): Reward =>
  ({ id, householdId: 'h1', title, requiredPoints, isActive: true, ...over });
const redemption = (id: string, rewardId: string, by: string, status: RewardRedemption['status'], pts: number): RewardRedemption => ({
  id, householdId: 'h1', rewardId, requestedByProfileId: by, clientRequestId: `c-${id}`, pointsRequiredSnapshot: pts,
  status, reservationModel: 'reserved', requestedAt: '2026-11-18T08:00:00Z', createdAt: '2026-11-18T08:00:00Z', updatedAt: '2026-11-18T08:00:00Z',
} as RewardRedemption);

const REWARDS: Reward[] = [
  reward('movie', 'Movie night', 450),
  reward('ice', 'Ice cream trip', 80, { description: 'A scoop at the corner shop' }),
  reward('game', 'Game time 30 min', 60),
  reward('camp', 'Camping trip', 800),
  reward('old', 'Old prize', 20, { isActive: false }),
];
const REDEMPTIONS: RewardRedemption[] = [
  redemption('r1', 'game', NOAM, 'pending', 60),
  redemption('r2', 'ice', MAYA, 'approved', 80),
  redemption('r3', 'game', MAYA, 'rejected', 60),
  redemption('r4', 'movie', MAYA, 'cancelled', 450),
  redemption('r5', 'old', MAYA, 'pending', 20),
];
const input = (over: Partial<AdultRewardsInput> = {}): AdultRewardsInput => ({
  rewards: REWARDS, redemptions: REDEMPTIONS, members: MEMBERS, viewerId: ME,
  permissions: { canReviewRewards: true, canCreateRewards: true }, ...over,
});
const homeInput = (i: AdultRewardsInput): AdultHomeInput => ({
  tasks: [], taskSubmissions: [], claims: [], rewards: i.rewards, redemptions: i.redemptions, members: i.members, viewerId: i.viewerId,
  permissions: { canReviewMissions: false, canReviewRewards: i.permissions.canReviewRewards, canReviewContributions: false, canCreateMissions: false, canCreateRewards: false },
  now: new Date('2026-11-18T10:00:00Z'), timeZone: 'UTC',
});

// ── Requests ────────────────────────────────────────────────────────────────

test('requests: only pending requests, resolved ones excluded, in store order', () => {
  const m = buildAdultRewardsModel(input());
  assert.deepEqual(m.requests.rows.map((r) => r.id), ['r1', 'r5']);
  for (const id of ['r2', 'r3', 'r4']) assert.ok(!m.requests.rows.some((r) => r.id === id), `${id} resolved`);
});

test('requests: the row names the reward, the child and the cost; the archived reward stays reviewable', () => {
  const [r1, r5] = buildAdultRewardsModel(input()).requests.rows;
  assert.equal(r1.rewardTitle, 'Game time 30 min');
  assert.equal(r1.subtitle, 'Reward request · Noam · 60 pts');
  assert.equal(r1.childName, 'Noam');
  assert.equal(r1.points, 60);
  assert.equal(r5.rewardTitle, 'Old prize', 'Decision 7: a request for an archived reward is still reviewable');
});

test('requests: count always equals the visible rows; never a constant', () => {
  for (const reds of [REDEMPTIONS, [], [redemption('a', 'game', NOAM, 'pending', 60), redemption('b', 'ice', MAYA, 'pending', 80), redemption('c', 'camp', NOAM, 'pending', 800)]]) {
    const m = buildAdultRewardsModel(input({ redemptions: reds }));
    assert.equal(m.requests.count, m.requests.rows.length);
    assert.equal(m.requests.a11yLabel, `Requests · ${m.requests.rows.length}`);
  }
  assert.ok(!/Requests · 1'/.test(code(SCREEN)) && !/count:\s*1\b/.test(code(MODEL)));
});

test('requests: without rewards.approve_redemption there are no rows and no section', () => {
  const m = buildAdultRewardsModel(input({ permissions: { canReviewRewards: false, canCreateRewards: true } }));
  assert.deepEqual(m.requests.rows, []);
  assert.equal(m.requests.visible, false);
  // No hidden indicator either: the count matches what this adult can review.
  assert.ok(m.rewards.rows.every((r) => r.pendingCount === 0 && r.state === 'active'));
});

test('requests: the CTA is exactly "Review"; never Approve / Reject / Accept / Decline / Open / Check', () => {
  const m = buildAdultRewardsModel(input());
  for (const r of m.requests.rows) {
    assert.equal(r.cta, 'Review');
    assert.equal(r.ctaA11yLabel, `Review: ${r.rewardTitle}, ${r.childName}`);
  }
  const s = code(SCREEN);
  assert.ok(!/approveRewardRedemption|rejectRewardRedemption|cancelRewardRedemption|requestRewardRedemption/.test(s + code(MODEL)), 'no decision on the list');
  assert.ok(!/'(Approve|Reject|Accept|Decline|Open|Check)'/.test(RW_STRINGS));
});

test('requests: every row opens in AdultReview (same rule as Home), so a stale or resolved request cannot', () => {
  const i = input();
  const m = buildAdultRewardsModel(i);
  for (const r of m.requests.rows) assert.ok(findAttentionItem(homeInput(i), 'reward_request', r.id), r.id);
  // The same set as Home's reward requests.
  assert.deepEqual(m.requests.rows.map((r) => r.id), buildAdultHomeModel(homeInput(i)).attention.items.map((x) => x.id));
  // Resolved elsewhere → gone from the list AND not openable by an old route.
  const resolved = input({ redemptions: REDEMPTIONS.map((r) => (r.id === 'r1' ? { ...r, status: 'approved' as const } : r)) });
  assert.ok(!buildAdultRewardsModel(resolved).requests.rows.some((r) => r.id === 'r1'));
  assert.equal(findAttentionItem(homeInput(resolved), 'reward_request', 'r1'), null);
  // The shell routes Review to AdultReview with kind reward_request.
  assert.ok(/onReview=\{\(redemptionId\) => navigation\.navigate\('AdultReview', \{ kind: 'reward_request', id: redemptionId \}\)\}/.test(code(SHELL)));
  // AdultReview hosts the existing section, with the existing stale copy and refresh.
  assert.ok(/kind === 'reward_request'[\s\S]*?<RedemptionReviewSection/.test(code('screens/AdultReviewScreen.tsx')));
  const today = code('screens/TodayScreen.tsx');
  assert.ok(today.includes("outcome.reason === 'not_pending' || outcome.reason === 'not_found') requestHouseholdRefresh('stale')"));
  assert.ok(today.includes('copy.rewardReview.notPending'));
});

test('requests: the adult list never creates a request (no duplicate requests through Adult UI)', () => {
  // Requesting stays child-only at the selector (exact-role narrowing).
  assert.ok(/selectCanRequestRedemption = \(s: AppStore\): boolean =>[\s\S]*?selectCurrentMemberRole\(s\) === 'child';/.test(code('store/selectors.ts')));
  for (const f of [SCREEN, MODEL, NEWR]) assert.ok(!/requestRewardRedemption|useRewardRequestFlow|ConfirmRewardRequestModal/.test(code(f)), f);
});

// ── Rewards list ────────────────────────────────────────────────────────────

test('rewards: the active set only, in the locked A2 order (Points → title → id)', () => {
  const m = buildAdultRewardsModel(input());
  assert.deepEqual(m.rewards.rows.map((r) => r.reward.id), ['game', 'ice', 'movie', 'camp']);
  assert.deepEqual(m.rewards.rows.map((r) => r.reward.id), sortRewardsForDisplay(REWARDS.filter((r) => r.isActive)).map((r) => r.id));
  assert.equal(m.rewards.count, 4);
  assert.equal(m.rewards.a11yLabel, 'Rewards · 4');
});

test('rewards: name, optional description, cost as a bare number, state word', () => {
  const rows = buildAdultRewardsModel(input()).rewards.rows;
  const ice = rows.find((r) => r.reward.id === 'ice')!;
  assert.equal(ice.title, 'Ice cream trip');
  assert.equal(ice.description, 'A scoop at the corner shop');
  assert.equal(ice.pointsLabel, '80');
  assert.equal(ice.state, 'active');
  assert.equal(ice.stateLabel, 'Active');
  assert.equal(rows.find((r) => r.reward.id === 'camp')!.description, null);
  assert.equal(buildAdultRewardsModel(input({ rewards: [reward('w', 'W', 5, { description: '   ' })] })).rewards.rows[0].description, null);
  assert.ok(ice.a11yLabel.includes('80 points') && ice.a11yLabel.includes('Active'));
});

test('rewards: a pending request shows the real count and the Request state; plural is not hard-coded', () => {
  const rows = buildAdultRewardsModel(input()).rewards.rows;
  const game = rows.find((r) => r.reward.id === 'game')!;
  assert.equal(game.pendingCount, 1);
  assert.equal(game.pendingLabel, '1 request waiting');
  assert.equal(game.state, 'request');
  assert.equal(game.stateLabel, 'Request');
  const two = buildAdultRewardsModel(input({ redemptions: [redemption('a', 'game', NOAM, 'pending', 60), redemption('b', 'game', MAYA, 'pending', 60)] }));
  assert.equal(two.rewards.rows.find((r) => r.reward.id === 'game')!.pendingLabel, '2 requests waiting');
  assert.equal(pendingLabel(0), null);
  // The indicator sums to the Requests count for active rewards.
  const m = buildAdultRewardsModel(input());
  const activeIds = new Set(m.rewards.rows.map((r) => r.reward.id));
  assert.equal(m.rewards.rows.reduce((a, r) => a + r.pendingCount, 0), m.requests.rows.filter((r) => activeIds.has(r.rewardId)).length);
});

test('rewards: every state is a word plus an icon; Gold only on the cost pill', () => {
  const s = code(SCREEN);
  assert.ok(/active:\s+'checkmark-circle-outline'/.test(s) && /request:\s+'time-outline'/.test(s));
  assert.ok(/<Ionicons name=\{STATE_ICON\[state\]\}[\s\S]{0,120}\{label\}/.test(s));
  const tone = s.slice(s.indexOf('const STATE_TONE'), s.indexOf('function useAdultRewardsInput'));
  assert.ok(!/gold/i.test(tone), 'state never gold');
  assert.equal((s.match(/colors\.gold\b/g) ?? []).length, 1);
  assert.ok(/pointsPill: \{[\s\S]*?backgroundColor:\s+colors\.gold,/.test(s));
  assert.ok(!/variant="gold"|goldDeep|colors\.gold/.test(code(NEWR)), 'Create Reward: no gold buttons or chips');
  assert.ok(!/newButton: \{[^}]*gold/.test(s) && !/reviewButton: \{[^}]*gold/.test(s));
});

// ── Privacy / not a shop ────────────────────────────────────────────────────

test('privacy: no child wallet balances, held / free Points, rankings or shop UI', () => {
  for (const f of [SCREEN, MODEL, NEWR]) {
    const s = code(f);
    assert.ok(!/pointsBalances|selectPointsBalances|selectMyPointsBalance|computeMyPointsSummary|selectReservedPendingSnapshots|balance/i.test(s), `${f}: no balances`);
    assert.ok(!/suggestedReward|Suggested|Keep going|ProgressBar|progress|rank|wallet|coin|RewardCard|Illustration|illustration|<Image/.test(s), `${f}: no shop UI`);
  }
  assert.ok(!/familyPoints|Suggested|Keep going|wallet|held|available balance/i.test(RW_STRINGS));
  const m = buildAdultRewardsModel(input());
  const json = JSON.stringify(m);
  assert.ok(!/balance|available|reserved/i.test(json));
});

// ── Create Reward ───────────────────────────────────────────────────────────

test('create: exactly name (required), description (optional), points cost (required)', () => {
  assert.deepEqual(validateCreateReward('', '50'), { nameError: true, cost: null, points: 50 });
  assert.deepEqual(validateCreateReward('   ', '50').nameError, true);
  assert.deepEqual(validateCreateReward('Ice cream', '80'), { nameError: false, cost: null, points: 80 });
  const s = code(NEWR);
  assert.equal((s.match(/<TextField\b/g) ?? []).length, 2, 'name + description');
  assert.ok(s.includes('copy.adultRewards.create.nameLabel') && s.includes('copy.adultRewards.create.descriptionLabel') && s.includes('copy.adultRewards.create.costLabel'));
  assert.equal(copy.adultRewards.create.descriptionLabel, 'Description (optional)');
  assert.ok(/description:\s+description\.trim\(\) \|\| undefined/.test(s));
});

test('create: cost validation mirrors the server (integer, > 0, ≤ int4 max)', () => {
  assert.equal(costError(''), 'empty');
  assert.equal(costError('   '), 'empty');
  assert.equal(costError('0'), 'too_small');
  assert.equal(costError('-5'), 'too_small');
  assert.equal(costError('abc'), 'not_whole');
  assert.equal(costError('12.5'), 'not_whole');
  assert.equal(costError('1e3'), 'not_whole');
  assert.equal(costError('2147483648'), 'too_large');
  assert.equal(costError('99999999999999999999'), 'too_large');
  assert.equal(costError('2147483647'), null);
  assert.equal(costError('1'), null);
  assert.equal(costError(' 60 '), null);
  assert.equal(parseCost('60'), 60);
  assert.equal(COST_MAX, 2147483647);
  // The server constraint this mirrors.
  assert.ok(raw('../supabase/migrations/20260624000000_initial_schema.sql').includes('CONSTRAINT chk_rewards_points_positive CHECK (points_required > 0)'));
  for (const k of ['empty', 'not_whole', 'too_small', 'too_large'] as const) assert.ok(copy.adultRewards.create.costErrors[k]);
});

test('create: − / + step the editable value and never leave 1..max', () => {
  assert.equal(COST_STEP, 10);
  assert.equal(incrementCost(''), '10');
  assert.equal(incrementCost('80'), '90');
  assert.equal(incrementCost(String(COST_MAX - 3)), String(COST_MAX));
  assert.equal(decrementCost('80'), '70');
  assert.equal(decrementCost('5'), '1');
  assert.equal(decrementCost('1'), '1');
  assert.equal(canDecrement(''), false);
  assert.equal(canDecrement('1'), false);
  assert.equal(canDecrement('2'), true);
  assert.equal(canIncrement(String(COST_MAX)), false);
  assert.equal(canIncrement(''), true);
  // The value stays a real number-pad field.
  assert.ok(/<TextInput[\s\S]*?keyboardType="number-pad"/.test(code(NEWR)));
  // vc22: multiline so the centred value never makes the Android field
  // horizontally scrollable (that swallowed form drags with the keyboard
  // open and hid the centred placeholder); vertically centred in the stepper.
  assert.ok(/<TextInput\s+value=\{costText\}\s+onChangeText=\{setCost\}\s+multiline\s+textAlignVertical="center"\s+keyboardType="number-pad"/.test(code(NEWR)));
  // A pasted line break is never a cost.
  assert.equal(parseCost('1\n2'), null);
});

test('create: quick chips are 50 · 80 · 120 and mark the matching value as selected', () => {
  assert.deepEqual([...COST_PRESETS], [50, 80, 120]);
  assert.equal(selectedPreset('80'), 80);
  assert.equal(selectedPreset('81'), null);
  assert.equal(selectedPreset(''), null);
  const s = code(NEWR);
  assert.ok(/accessibilityState=\{\{ selected: on, disabled: busy \}\}/.test(s));
  assert.ok(/chip: \{[\s\S]*?minHeight:\s+sizes\.tapTarget/.test(s), 'chips have a 48dp target');
});

test('create: permission-gated (rewards.create) for owner / admin / adult, never child', () => {
  for (const r of ['owner', 'admin', 'adult'] as const) assert.equal(hasHouseholdPermission(r, 'rewards.create'), true, r);
  assert.equal(hasHouseholdPermission('child', 'rewards.create'), false);
  assert.ok(/if \(!canCreate \|\| !household \|\| !user\)/.test(code(NEWR)));
  assert.ok(/\{model\.canCreate \? \(\s*<Pressable\s+onPress=\{onNewReward\}/.test(code(SCREEN)));
  assert.equal(buildAdultRewardsModel(input({ permissions: { canReviewRewards: true, canCreateRewards: false } })).canCreate, false);
});

afterEach(() => { useAppStore.getState().resetAppState(); });

test('create: success adds the reward once with the right cost and active state', async () => {
  useAppStore.getState().setRewards([]);
  const result = await createReward({ householdId: 'h1', title: '  Ice cream  ', description: '  ', requiredPoints: 80, createdByProfileId: ME, role: 'adult' });
  assert.deepEqual(result, { ok: true });
  const rewards = useAppStore.getState().rewards;
  assert.equal(rewards.length, 1);
  assert.equal(rewards[0].title, 'Ice cream');
  assert.equal(rewards[0].requiredPoints, 80);
  assert.equal(rewards[0].isActive, true);
  assert.equal(rewards[0].description, undefined);
  const rows = buildAdultRewardsModel(input({ rewards, redemptions: [] })).rewards.rows;
  assert.equal(rows.filter((r) => r.title === 'Ice cream').length, 1);
  assert.deepEqual(await createReward({ householdId: 'h1', title: 'X', requiredPoints: 5, createdByProfileId: MAYA, role: 'child' }), { ok: false, reason: 'not_authorized' });
});

test('create: a double tap creates one reward (single-flight guard + busy button)', async () => {
  useAppStore.getState().setRewards([]);
  const guard = createSingleFlight();
  let calls = 0;
  const create = async () => { calls++; await new Promise((r) => setTimeout(r, 20)); return createReward({ householdId: 'h1', title: 'Once', requiredPoints: 50, createdByProfileId: ME, role: 'adult' }); };
  await Promise.all([guard(create), guard(create), guard(create)]);
  assert.equal(calls, 1);
  assert.equal(useAppStore.getState().rewards.filter((r) => r.title === 'Once').length, 1);
  const s = code(NEWR);
  assert.ok(s.includes('onPress={() => { void singleFlight(() => doCreate()); }}'));
  assert.ok(/if \(busy \|\| !household \|\| !user\) return;/.test(s));
  assert.ok(/busy=\{busy\}/.test(s));
  // Closes only after createReward resolved ok; a failure keeps the input.
  assert.ok(/if \(ok\) onDone\(\);\s*else setFailed\(true\);/.test(s));
});

test('create: the primary action is pinned outside the scroll and above the keyboard', () => {
  const s = code(NEWR);
  assert.ok(/<View ref=\{frameRef\} style=\{\[styles\.flex, \{ paddingBottom: keyboardOverlap \}\]\}>[\s\S]*?<\/ScrollView>\s*<View style=\{styles\.bar\}>\s*<AppButton[\s\S]*?label=\{copy\.adultRewards\.create\.button\}/.test(s));
  // Android gate vc19: KeyboardAvoidingView under-shrank by the native-stack
  // header height. vc20: measureInWindow (origin below the status bar) was
  // compared with the keyboard's screen-space screenY. vc21: measure()'s
  // pageY, the same screen space as screenY.
  assert.ok(!s.includes('KeyboardAvoidingView'));
  assert.ok(!s.includes('measureInWindow('), 'no window-space measurement against screen-space screenY');
  // vc21 coordinate fix kept; vc23: driven by every keyboard geometry change.
  assert.ok(/subscribeKeyboardTop\(\(keyboardTop\) => \{\s*if \(keyboardTop === null\) \{ setOverlap\(0\); return; \}\s*frame\.current\?\.measure\(\(_x, _y, _w, h, _pageX, pageY\) => \{\s*if \(alive\) setOverlap\(overlapForKeyboardTop\(\{ frameTop: pageY, frameHeight: h \}, keyboardTop\)\);/.test(s));
  assert.ok(!s.includes('Keyboard.addListener('), 'no direct dependence on open/close-only events');
  assert.equal(copy.adultRewards.create.button, 'Create reward');
  assert.ok(s.includes('density="adult"') && !s.includes('density="child"'));
});

test('keyboard overlap: same-space inputs cover the vc20 device case exactly; bad input is 0', () => {
  // vc20, 360x640 @ 2.5x (px / 2.5 = dp): frame 210–1554 px, keyboard top 862 px,
  // status bar 63 px. Needed padding 692 px = 276.8 dp.
  const D = 2.5;
  const needed = keyboardOverlap({ frameTop: 210 / D, frameHeight: (1554 - 210) / D, keyboardTop: 862 / D });
  assert.equal(needed, Math.round(692 / D));
  // The vc20 bug: a window-space top (status bar already subtracted) against the
  // same screen-space keyboard top is short by exactly the status bar.
  const vc20 = keyboardOverlap({ frameTop: (210 - 63) / D, frameHeight: (1554 - 210) / D, keyboardTop: 862 / D });
  assert.equal(needed - vc20, Math.round(63 / D));
  // Keyboard below the frame (OS already resized): nothing to add.
  assert.equal(keyboardOverlap({ frameTop: 80, frameHeight: 200, keyboardTop: 400 }), 0);
  assert.equal(keyboardOverlap({ frameTop: Number.NaN, frameHeight: 200, keyboardTop: 100 }), 0);
});

// ── vc23: keyboard type / height transitions ────────────────────────────────
// Device geometry measured on vc22 (CH_QA_34, 360x640 @ 2.5x, px / 2.5 = dp):
// form frame 200–1480 px; text keyboard top 821 px; number pad top 921 px.
// On Android, React Native emits keyboardDidShow / keyboardDidHide only when
// the keyboard's visibility flips (ReactRootView.checkForKeyboardEvents), so
// a focus move between a text field and the Points field (number pad) sends
// NO React Native event; only the KeyboardFrame module reports it ('frame').
const KD = 2.5;
const KFRAME = { frameTop: 200 / KD, frameHeight: (1480 - 200) / KD };
const TEXT_TOP = 821 / KD;
const PAD_TOP = 921 / KD;
type Step = { field: string; signals: KeyboardSignal[] };
// What Android delivers when the user focuses each field in turn.
function deviceSteps(fields: ('name' | 'points' | 'description')[]): Step[] {
  let up = false;
  return fields.map((field) => {
    const top = field === 'points' ? PAD_TOP : TEXT_TOP;
    const signals: KeyboardSignal[] = [{ kind: 'frame', visible: true, screenY: top }];
    if (!up) signals.unshift({ kind: 'show', screenY: top });   // RN: only the first open
    up = true;
    return { field, signals };
  });
}
// Replays a step list through a consumer that listens to `kinds`; returns, per
// step, the gap between the button bar's bottom and the keyboard top in dp
// (negative = the keyboard covers the button) .
function gaps(steps: Step[], kinds: KeyboardSignal['kind'][]): number[] {
  let top: number | null = null;
  return steps.map((st) => {
    for (const sig of st.signals) if (kinds.includes(sig.kind)) top = keyboardTopFromSignal(sig);
    const real = st.field === 'points' ? PAD_TOP : TEXT_TOP;
    const barBottom = KFRAME.frameTop + KFRAME.frameHeight - overlapForKeyboardTop(KFRAME, top);
    return Math.round((real - barBottom) * 10) / 10;
  });
}
const VC22_KINDS: KeyboardSignal['kind'][] = ['show', 'hide'];   // vc21/vc22 hook
const VC23_KINDS: KeyboardSignal['kind'][] = ['frame'];          // Android with KeyboardFrame
const fits = (g: number) => Math.abs(g) <= 0.5;                  // within rounding, no band, no overlap

test('keyboard fresh focus: text keyboard and number pad each get exact padding', () => {
  for (const kinds of [VC22_KINDS, VC23_KINDS]) {
    assert.ok(fits(gaps(deviceSteps(['name']), kinds)[0]), 'text keyboard');
    assert.ok(fits(gaps(deviceSteps(['points']), kinds)[0]), 'number pad');
  }
});

test('keyboard transition A, Name -> Points: no blank band above the shorter number pad', () => {
  const steps = deviceSteps(['name', 'points']);
  assert.ok(Math.abs(gaps(steps, VC22_KINDS)[1] - 40) < 1, 'vc22 reproduced: a 40 dp empty band (stale text-keyboard padding)');
  assert.ok(gaps(steps, VC23_KINDS).every(fits));
});

test('keyboard transition B, Points -> Description: the button rises above the taller text keyboard', () => {
  const steps = deviceSteps(['points', 'description']);
  assert.ok(Math.abs(gaps(steps, VC22_KINDS)[1] + 40) < 1, 'vc22 reproduced: the keyboard covers the button bar');
  assert.ok(gaps(steps, VC23_KINDS).every(fits));
});

test('keyboard transition C, Points -> Name: same as B', () => {
  const steps = deviceSteps(['points', 'name']);
  assert.ok(gaps(steps, VC22_KINDS)[1] < 0, 'vc22 reproduced');
  assert.ok(gaps(steps, VC23_KINDS).every(fits));
});

test('keyboard transition D, repeated switching: no drift, no cumulative padding, hide resets to 0', () => {
  const seq = ['points', 'description', 'points', 'name', 'points', 'description', 'name', 'points'] as const;
  const g = gaps(deviceSteps([...seq, ...seq]), VC23_KINDS);
  assert.ok(g.every(fits), `every step fits: ${g.join(', ')}`);
  // Same field, same padding, however many switches came before.
  assert.equal(overlapForKeyboardTop(KFRAME, PAD_TOP), overlapForKeyboardTop(KFRAME, keyboardTopFromSignal({ kind: 'frame', visible: true, screenY: PAD_TOP })));
  assert.equal(overlapForKeyboardTop(KFRAME, keyboardTopFromSignal({ kind: 'frame', visible: false, screenY: 640 })), 0);
  assert.equal(overlapForKeyboardTop(KFRAME, keyboardTopFromSignal({ kind: 'hide' })), 0);
  assert.equal(keyboardTopFromSignal({ kind: 'frame', visible: true, screenY: Number.NaN }), null);
});

test('keyboard source: Android uses the KeyboardFrame module (every geometry change); others fall back to RN events', () => {
  const src = code('features/adultRewards/keyboardTopSource.ts');
  assert.ok(src.includes("Platform.OS === 'android'\n  ? requireOptionalNativeModule<KeyboardFrameModule>('KeyboardFrame')"));
  assert.ok(/KeyboardFrame\.addListener\('onKeyboardFrame', \(e\) =>\s*emit\(\{ kind: 'frame', visible: e\.visible, screenY: e\.screenY \}\)\);/.test(src));
  assert.ok(/Keyboard\.addListener\(showEvent, \(e\) => emit\(\{ kind: 'show', screenY: e\.endCoordinates\.screenY \}\)\)/.test(src));
  const kt = readFileSync(new URL('../../../modules/keyboard-frame/android/src/main/java/expo/modules/keyboardframe/KeyboardFrameModule.kt', import.meta.url), 'utf8');
  assert.ok(kt.includes('Name("KeyboardFrame")') && kt.includes('"onKeyboardFrame"'));
  assert.ok(kt.includes('addOnGlobalLayoutListener(layoutListener)'), 'sees every layout pass (an IME inset change re-lays out the root)');
  assert.ok(kt.includes('if (imePx == lastImePx || view.height <= 0) return'), 'emits on every height change, not only open/close');
  assert.ok(kt.includes('WindowInsetsCompat.Type.ime()'));
  const cfg = JSON.parse(readFileSync(new URL('../../../modules/keyboard-frame/expo-module.config.json', import.meta.url), 'utf8'));
  assert.deepEqual(cfg.android.modules, ['expo.modules.keyboardframe.KeyboardFrameModule']);
});

// ── Navigation ──────────────────────────────────────────────────────────────

test('navigation: adult tabs unchanged; Rewards hosts Adult Rewards; NewReward and AdultReview are stack routes', () => {
  assert.deepEqual([...ADULT_TABS], ['Home', 'Tasks', 'Rewards', 'Family']);
  assert.ok(STACK_ROUTES.adult.includes('NewReward') && STACK_ROUTES.adult.includes('AdultReview'));
  assert.equal(isRouteAvailable('child', 'NewReward'), false);
  const shell = code(SHELL);
  assert.ok(shell.includes('<AdultTab.Screen name="Rewards" component={AdultRewardsTab}'));
  assert.ok(/onNewReward=\{\(\) => navigation\.navigate\('NewReward'\)\}/.test(shell));
  assert.ok(/function NewRewardRoute[\s\S]*?if \(navigation\.canGoBack\(\)\) navigation\.goBack\(\);[\s\S]*?<NewRewardScreen onDone=\{onDone\} \/>/.test(shell));
  assert.ok(/name="NewReward"[\s\S]*?title:\s+copy\.adultRewards\.create\.title[\s\S]*?headerBackButtonDisplayMode: 'minimal'/.test(shell));
  // Home's New reward opens the same route.
  assert.ok(/else navigation\.navigate\('NewReward'\);/.test(shell));
  for (const f of [SCREEN, NEWR]) assert.ok(!/useNavigation|navigation\.navigate|navigate\(/.test(code(f)), `${f} never navigates`);
});

// ── Guards ──────────────────────────────────────────────────────────────────

test('guards: no illustrations, edit, archive, category, XP or other future features', () => {
  for (const f of [SCREEN, NEWR, MODEL, FORM]) {
    const s = code(f);
    assert.ok(!/<Image|Illustration|illustration|edit|Edit|archive\b|Archive|category|Category|XP|stock|inventory|expiry|limited|badge|achievement/.test(s.replace(/editable/g, '')), f);
  }
  assert.ok(!/Edit|Archive|Category|XP|Stock|Expiry|Badge/.test(RW_STRINGS));
});

test('guards: adult intensity tokens (hairline card, radius 14, 48dp buttons, Rubik type layer)', () => {
  const s = code(SCREEN);
  assert.ok(s.includes('<Card density="adult"'));
  assert.ok(/newButton: \{[\s\S]*?minHeight:\s+sizes\.adultButton,[\s\S]*?borderRadius:\s+radius\.control,/.test(s));
  assert.ok(/reviewButton: \{[\s\S]*?minHeight:\s+sizes\.adultButton,[\s\S]*?borderRadius:\s+radius\.control,/.test(s));
  assert.ok(/backgroundColor:\s+colors\.adultGround/.test(s) && /backgroundColor:\s+colors\.adultGround/.test(code(NEWR)));
  for (const f of [SCREEN, NEWR]) {
    assert.ok(code(f).includes('useAdultText'), f);
    assert.ok(!/fontSize:|fontWeight:|shadow|elevation/.test(code(f)), `${f}: type from the locked layer, no shadows`);
  }
  assert.ok(/stepButton: \{[\s\S]*?width:\s+52,[\s\S]*?minHeight:\s+52,/.test(code(NEWR)));
});

test('layout: Review goes full width at 130% text on phones; inline at 100%', () => {
  for (const w of [360, 390, 412]) assert.equal(requestActionFullWidth(w, 1), false, `${w}@100%`);
  for (const w of [360, 390, 412]) assert.equal(requestActionFullWidth(w, 1.3), true, `${w}@130%`);
  // Long names wrap (no numberOfLines truncation anywhere on the screen).
  assert.ok(!/numberOfLines/.test(code(SCREEN)));
});

test('empty states: calm text, no fake rewards or requests', () => {
  const none = buildAdultRewardsModel(input({ rewards: [], redemptions: [] }));
  assert.equal(none.requests.count, 0);
  assert.equal(none.rewards.count, 0);
  assert.equal(none.requests.visible, true);
  const s = code(SCREEN);
  assert.ok(s.includes('copy.adultRewards.noRequests') && s.includes('copy.adultRewards.noRewardsCreate') && s.includes('copy.adultRewards.noRewards'));
  assert.equal(copy.adultRewards.noRequests, 'No reward requests waiting.');
});
