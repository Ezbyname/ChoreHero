// Slice 6A: Adult Home / Family Control Center (Board 06). Needs attention
// (composition, count, the one decision word), Quick actions, Kids today
// (D1 progress + waiting), privacy / anti-ranking, banned features,
// navigation, routing reuse, and the adult design guards.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  ATTENTION_KIND_ORDER,
  buildAdultHomeModel,
  buildKidsToday,
  childMembers,
  findAttentionItem,
  photoMeta,
  quickActionsStacked,
  reviewFullWidth,
  showDashboardSubtitle,
  type AdultHomeInput,
  type AdultHomePermissions,
} from '@/features/adultHome/adultHomeModel';
import { selectDailyProgress } from '@/features/tasks/dailyProgress';
import { copy } from '@/content/copy';
import { ADULT_TABS, STACK_ROUTES, isRouteAvailable, resolveShellKind, settingsEntryPoints, tabsForShell } from '@/navigation/roleShell';
import type { ContributionClaim, HouseholdMember, Reward, RewardRedemption, Task, TaskSubmissionSummary } from '@/types';

const SRC = new URL('../../', import.meta.url);
const raw  = (rel: string) => readFileSync(new URL(rel, SRC), 'utf8');
const code = (rel: string) => raw(rel).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const SCREEN = 'screens/AdultHomeScreen.tsx';
const REVIEW = 'screens/AdultReviewScreen.tsx';
const MODEL  = 'features/adultHome/adultHomeModel.ts';
const HOOK   = 'features/adultHome/useAdultHomeInput.ts';
const SHELL  = 'navigation/AppTabs.tsx';
const COPY   = raw('content/copy.ts');
const HOME_COPY = COPY.slice(COPY.indexOf('  adultHome: {'), COPY.indexOf('// Slice 6B: Adult Tasks'));

const TZ   = 'Asia/Jerusalem';
const NOW  = new Date('2026-11-13T12:00:00Z');   // 14:00 in IL, 13 Nov
const TODAY     = '2026-11-13T00:00:00.000Z';
const YESTERDAY = '2026-11-12T00:00:00.000Z';
const TOMORROW  = '2026-11-14T00:00:00.000Z';

const ME   = 'adult-1';
const MAYA = 'kid-maya';
const NOAM = 'kid-noam';

const member = (userId: string, name: string, role: HouseholdMember['role']): HouseholdMember => ({ id: `m-${userId}`, userId, name, role });
const MEMBERS: HouseholdMember[] = [
  member(ME, 'Dana', 'owner'),
  member(MAYA, 'Maya', 'child'),
  member('adult-2', 'Avi', 'adult'),
  member(NOAM, 'Noam', 'child'),
];

const task = (id: string, over: Partial<Task> = {}): Task => ({ id, title: `Task ${id}`, status: 'open', assigneeId: MAYA, ...over });
const sub = (taskId: string, photoCount: number, status: TaskSubmissionSummary['status'] = 'pending'): TaskSubmissionSummary =>
  ({ id: `s-${taskId}`, taskId, status, submittedByProfileId: MAYA, submittedAt: '2026-11-13T10:00:00Z', photoCount });
const reward = (id: string, requiredPoints: number, over: Partial<Reward> = {}): Reward =>
  ({ id, householdId: 'hh', title: `Reward ${id}`, requiredPoints, isActive: true, ...over });
const red = (id: string, rewardId: string, over: Partial<RewardRedemption> = {}): RewardRedemption => ({
  id, householdId: 'hh', rewardId, requestedByProfileId: NOAM, clientRequestId: `c-${id}`, pointsRequiredSnapshot: 20,
  status: 'pending', reservationModel: 'reserved', requestedAt: '', createdAt: '', updatedAt: '', ...over,
});
const claim = (id: string, over: Partial<ContributionClaim> = {}): ContributionClaim =>
  ({ id, householdId: 'hh', title: `Helped ${id}`, points: 5, status: 'pending', claimedByProfileId: MAYA, createdAt: '', ...over });

const ALL: AdultHomePermissions = {
  canReviewMissions: true, canReviewRewards: true, canReviewContributions: true, canCreateMissions: true, canCreateRewards: true,
};
const input = (over: Partial<AdultHomeInput> = {}): AdultHomeInput => ({
  tasks: [], taskSubmissions: [], rewards: [], redemptions: [], claims: [], members: MEMBERS,
  viewerId: ME, permissions: ALL, now: NOW, timeZone: TZ, ...over,
});

const MIXED = input({
  tasks:           [task('math', { title: 'Math homework', status: 'needs_attention' }), task('open1')],
  taskSubmissions: [sub('math', 3)],
  rewards:         [reward('game', 60, { title: 'Game time' })],
  redemptions:     [red('r1', 'game', { pointsRequiredSnapshot: 60 })],
  claims:          [claim('c1', { title: 'Helped at the table', claimedByProfileId: MAYA })],
});

// ── Needs attention ─────────────────────────────────────────────────────────

test('needs attention: a mission waiting for review is a Mission review row', () => {
  const [row] = buildAdultHomeModel(MIXED).attention.items;
  assert.equal(row.kind, 'mission_review');
  assert.equal(row.id, 'math');
  assert.equal(row.heading, 'Maya · Math homework');
  assert.equal(row.typeLabel, 'Mission review');
  assert.equal(row.meta, '3 photos');
});

test('needs attention: a pending reward request is a Reward request row with its real Points', () => {
  const row = buildAdultHomeModel(MIXED).attention.items.find((i) => i.kind === 'reward_request')!;
  assert.equal(row.heading, 'Noam · Game time');
  assert.equal(row.typeLabel, 'Reward request');
  assert.equal(row.meta, '60 pts');
});

test('needs attention: a pending helpful contribution is a Helpful contribution row', () => {
  const row = buildAdultHomeModel(MIXED).attention.items.find((i) => i.kind === 'helpful_contribution')!;
  assert.equal(row.heading, 'Maya · Helped at the table');
  assert.equal(row.typeLabel, 'Helpful contribution');
  assert.equal(row.meta, null);
});

test('needs attention: the viewer’s own contribution claim is never theirs to review', () => {
  const m = buildAdultHomeModel(input({ claims: [claim('mine', { claimedByProfileId: ME }), claim('kid')] }));
  assert.deepEqual(m.attention.items.map((i) => i.id), ['kid']);
});

test('needs attention: resolved and non-actionable items are excluded', () => {
  const m = buildAdultHomeModel(input({
    tasks: [
      task('done', { status: 'completed' }), task('open', { status: 'open' }),
      task('doing', { status: 'in_progress' }), task('wait', { status: 'needs_attention' }),
    ],
    rewards:     [reward('g', 10)],
    redemptions: [
      red('ok', 'g', { status: 'approved' }), red('no', 'g', { status: 'rejected' }),
      red('cx', 'g', { status: 'cancelled' }), red('p', 'g'),
    ],
    claims: [claim('a', { status: 'approved' }), claim('r', { status: 'rejected' }), claim('p2')],
  }));
  assert.deepEqual(m.attention.items.map((i) => `${i.kind}:${i.id}`), ['mission_review:wait', 'reward_request:p', 'helpful_contribution:p2']);
});

test('needs attention: each kind appears only with its review permission', () => {
  const none = buildAdultHomeModel({ ...MIXED, permissions: { ...ALL, canReviewMissions: false, canReviewRewards: false, canReviewContributions: false } });
  assert.equal(none.attention.count, 0);
  const onlyRewards = buildAdultHomeModel({ ...MIXED, permissions: { ...ALL, canReviewMissions: false, canReviewContributions: false } });
  assert.deepEqual(onlyRewards.attention.items.map((i) => i.kind), ['reward_request']);
});

test('needs attention: an archived reward stays reviewable (Decision 7); an unknown one is not named', () => {
  const m = buildAdultHomeModel(input({
    rewards:     [reward('old', 30, { title: 'Old prize', isActive: false })],
    redemptions: [red('a', 'old'), red('b', 'missing')],
  }));
  assert.deepEqual(m.attention.items.map((i) => i.title), ['Old prize', copy.childRewards.unknownReward]);
});

test('needs attention: count is derived from the rows shown, never a constant', () => {
  for (const scenario of [input(), MIXED, input({ tasks: [task('a', { status: 'needs_attention' }), task('b', { status: 'needs_attention' })] })]) {
    const m = buildAdultHomeModel(scenario);
    assert.equal(m.attention.count, m.attention.items.length);
  }
  assert.equal(buildAdultHomeModel(input()).attention.count, 0);
  assert.equal(buildAdultHomeModel(MIXED).attention.count, 3);
  // The screen renders the model's count and rows, nothing hardcoded.
  const s = code(SCREEN);
  assert.ok(/count=\{model\.attention\.count\}/.test(s));
  assert.ok(/items=\{model\.attention\.items\}/.test(s));
  assert.ok(!/<CountPill count=\{\d/.test(s));
});

test('needs attention: every Home decision CTA is exactly "Review"', () => {
  const m = buildAdultHomeModel(MIXED);
  assert.equal(copy.adultHome.review, 'Review');
  for (const item of m.attention.items) assert.equal(item.cta, 'Review');
  // No other decision word on the Home screen or in its copy block.
  const banned = /\b(Approve|Decline|Check|View|Decide|Open|Accept|Send back|Reject)\b/;
  const strings = HOME_COPY.split('\n').filter((l) => !l.trim().startsWith('//'))
    .filter((l) => !/Hint|A11y|reviewGone|backToHome/.test(l)).join('\n');
  assert.ok(!banned.test(strings), 'decision words in visible Home copy');
  assert.ok(!/approve|reject|decline/i.test(code(SCREEN).replace(/import[^;]+;/g, '')), 'the Home screen decides nothing');
});

test('needs attention: rows follow Board 06 kind order, store order within a kind', () => {
  assert.deepEqual([...ATTENTION_KIND_ORDER], ['mission_review', 'reward_request', 'helpful_contribution']);
  const m = buildAdultHomeModel(input({
    tasks:       [task('t2', { status: 'needs_attention' }), task('t1', { status: 'needs_attention' })],
    rewards:     [reward('g', 5)],
    redemptions: [red('rb', 'g'), red('ra', 'g')],
    claims:      [claim('cb'), claim('ca')],
  }));
  assert.deepEqual(m.attention.items.map((i) => i.id), ['t2', 't1', 'rb', 'ra', 'cb', 'ca']);
});

test('needs attention: photo meta is real submission metadata only', () => {
  assert.equal(photoMeta(undefined), null);
  assert.equal(photoMeta(0), null);
  assert.equal(photoMeta(1), '1 photo');
  assert.equal(photoMeta(4), '4 photos');
  const m = buildAdultHomeModel(input({ tasks: [task('x', { status: 'needs_attention' })], taskSubmissions: [sub('x', 2, 'rejected')] }));
  assert.equal(m.attention.items[0].meta, null, 'a non-pending submission’s photos are not this review’s');
});

test('needs attention: Review buttons say what they open', () => {
  const [row] = buildAdultHomeModel(MIXED).attention.items;
  assert.equal(row.ctaA11yLabel, 'Review: Maya, Math homework');
  assert.equal(row.ctaA11yHint, 'Opens the mission review');
  assert.equal(row.a11yLabel, 'Maya · Math homework. Mission review. 3 photos');
});

test('needs attention: empty state is calm and fabricates nothing', () => {
  const m = buildAdultHomeModel(input({ tasks: [task('o')] }));
  assert.deepEqual(m.attention.items, []);
  assert.ok(code(SCREEN).includes('copy.adultHome.allClear'));
});

// ── Review routing (reuse, not duplication) ─────────────────────────────────

test('routing: Review opens the existing review sections; no review rule in Home', () => {
  const r = code(REVIEW);
  assert.ok(/<TaskReviewSection/.test(r) && /<RedemptionReviewSection/.test(r) && /<ContributionReviewSection/.test(r));
  assert.ok(/from '@\/screens\/TodayScreen'/.test(r));
  for (const f of [SCREEN, REVIEW, MODEL, HOOK]) {
    assert.ok(!/approveRewardRedemption|rejectRewardRedemption|approveContributionClaim|rejectContributionClaim|approveTaskCompletionSubmission|rejectTaskCompletionSubmission|supabase|\.rpc\(/.test(code(f)), f);
  }
  const shell = code(SHELL);
  assert.ok(/navigate\('AdultReview', \{ kind: item\.kind, id: item\.id \}\)/.test(shell));
});

test('routing: the review route finds items through the same rules as Home', () => {
  assert.equal(findAttentionItem(MIXED, 'reward_request', 'r1')?.id, 'r1');
  assert.equal(findAttentionItem(MIXED, 'mission_review', 'r1'), null, 'kind must match');
  const resolved = { ...MIXED, redemptions: [red('r1', 'game', { status: 'approved' })] };
  assert.equal(findAttentionItem(resolved, 'reward_request', 'r1'), null);
  const noPerm = { ...MIXED, permissions: { ...ALL, canReviewRewards: false } };
  assert.equal(findAttentionItem(noPerm, 'reward_request', 'r1'), null, 'navigation is not authorization');
});

// ── Quick actions ───────────────────────────────────────────────────────────

test('quick actions: exactly New mission and New reward', () => {
  assert.deepEqual(buildAdultHomeModel(input()).quickActions.map((a) => a.label), ['New mission', 'New reward']);
  assert.deepEqual(buildAdultHomeModel(input()).quickActions.map((a) => a.key), ['new_mission', 'new_reward']);
});

test('quick actions: each follows its create permission', () => {
  assert.deepEqual(buildAdultHomeModel(input({ permissions: { ...ALL, canCreateRewards: false } })).quickActions.map((a) => a.key), ['new_mission']);
  assert.deepEqual(buildAdultHomeModel(input({ permissions: { ...ALL, canCreateMissions: false } })).quickActions.map((a) => a.key), ['new_reward']);
});

test('quick actions: they open the create forms (NewMission, NewReward)', () => {
  const shell = code(SHELL);
  // Slice 6B: New mission opens the NewMission route, which hosts the
  // existing Create mission form (it was Tasks → Assigned in Slice 6A).
  assert.ok(/if \(key === 'new_mission'\) navigation\.navigate\('NewMission'\);/.test(shell));
  // Slice 6C: New reward opens the NewReward route (Create Reward, Board 11).
  assert.ok(/else navigation\.navigate\('NewReward'\);/.test(shell));
  assert.ok(/<NewRewardScreen onDone=/.test(shell));
  assert.ok(/<CreateTaskForm/.test(code('screens/NewMissionScreen.tsx')));
  for (const f of [SCREEN, MODEL]) assert.ok(!/createTask\(|createReward\(|TextInput|TextField/.test(code(f)), `${f}: no duplicated form`);
  assert.ok(!/Invite|Add child|challenge|Award points|category/i.test(HOME_COPY.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')));
});

// ── Kids today ──────────────────────────────────────────────────────────────

test('kids today: child members only, in the store’s order', () => {
  assert.deepEqual(childMembers(MEMBERS).map((m) => m.name), ['Maya', 'Noam']);
  assert.deepEqual(buildAdultHomeModel(input()).kids.map((k) => k.member.name), ['Maya', 'Noam']);
});

test('kids today: D1 — due today, assigned to that child; overdue, undated, future and unclaimed open excluded', () => {
  const tasks = [
    task('done',    { dueAt: TODAY, status: 'completed' }),
    task('waiting', { dueAt: TODAY, status: 'needs_attention' }),
    task('open',    { dueAt: TODAY }),
    task('over',    { dueAt: YESTERDAY }),
    task('undated'),
    task('future',  { dueAt: TOMORROW }),
    task('anyone',  { dueAt: TODAY, assigneeId: undefined }),
    task('noam',    { dueAt: TODAY, assigneeId: NOAM, status: 'completed' }),
  ];
  const [maya, noam] = buildKidsToday({ tasks, members: MEMBERS, now: NOW, timeZone: TZ });
  assert.equal(maya.total, 3, 'done + waiting + open; waiting stays in the denominator');
  assert.equal(maya.completed, 1);
  assert.equal(maya.progressLabel, '1 of 3 missions done');
  assert.equal(noam.total, 1);
  assert.equal(noam.completed, 1);
});

test('kids today: the same D1 selector as Child Home, so "today" has one definition', () => {
  const tasks = [
    task('a', { dueAt: TODAY, status: 'completed' }),
    task('early', { dueAt: TODAY, status: 'completed', completedAt: '2026-11-11T09:00:00Z' } as Partial<Task>),
    task('b', { dueAt: TODAY }),
  ];
  const [maya] = buildKidsToday({ tasks, members: MEMBERS, now: NOW, timeZone: TZ });
  assert.deepEqual({ completed: maya.completed, total: maya.total }, selectDailyProgress(tasks, MAYA, NOW, TZ));
  assert.equal(maya.completed, 2, 'done early still counts');
  assert.ok(/selectDailyProgress/.test(code(MODEL)));
});

test('kids today: timed missions use the viewer’s local day', () => {
  const tasks = [
    task('late',  { dueAt: '2026-11-13T21:30:00Z', dueAtHasTime: true }),  // 23:30 IL, 13 Nov → today
    task('next',  { dueAt: '2026-11-13T22:30:00Z', dueAtHasTime: true }),  // 00:30 IL, 14 Nov → future
  ];
  const [maya] = buildKidsToday({ tasks, members: MEMBERS, now: NOW, timeZone: TZ });
  assert.equal(maya.total, 1);
});

test('kids today: waiting counts that child’s missions waiting for review, not reward requests', () => {
  const m = buildAdultHomeModel(input({
    tasks: [
      task('w1', { status: 'needs_attention', dueAt: TODAY }),
      task('w2', { status: 'needs_attention', dueAt: YESTERDAY }),
      task('n1', { status: 'needs_attention', assigneeId: NOAM }),
    ],
    rewards: [reward('g', 5)],
    redemptions: [red('r', 'g', { requestedByProfileId: MAYA })],
  }));
  const [maya, noam] = m.kids;
  assert.equal(maya.waiting, 2);
  assert.equal(maya.waitingLabel, '2 waiting');
  assert.equal(noam.waiting, 1);
  const missionRows = m.attention.items.filter((i) => i.kind === 'mission_review').length;
  assert.equal(m.kids.reduce((n, k) => n + k.waiting, 0), missionRows, 'the waiting counts add up to the mission review rows');
});

test('kids today: no "0 waiting" badge; a calm label when nothing is due', () => {
  const [maya] = buildAdultHomeModel(input()).kids;
  assert.equal(maya.waiting, 0);
  assert.equal(maya.waitingLabel, null);
  assert.equal(maya.progressLabel, 'No missions due today');
  assert.equal(maya.a11yLabel, 'Maya. No missions due today');
});

test('kids today: the row reads in words', () => {
  const m = buildAdultHomeModel(input({ tasks: [task('a', { dueAt: TODAY, status: 'needs_attention' }), task('b', { dueAt: TODAY, status: 'completed' })] }));
  assert.equal(m.kids[0].a11yLabel, 'Maya. 1 of 2 missions done today. 1 waiting for your review');
});

// ── Privacy / anti-ranking / banned features ────────────────────────────────

test('privacy: no child Points, balances, wallets or rankings on Adult Home', () => {
  const kid = buildAdultHomeModel(MIXED).kids[0];
  assert.deepEqual(Object.keys(kid).sort(), ['a11yLabel', 'completed', 'member', 'progressLabel', 'total', 'waiting', 'waitingLabel']);
  for (const f of [SCREEN, MODEL, HOOK]) {
    assert.ok(!/pointsBalances|selectPointsBalances|selectMyPointsBalance|grossBalance|balance|wallet|computeMyPointsSummary/i.test(code(f)), f);
    assert.ok(!/\brank|leader|winner|topChild|\bsort\(/i.test(code(f)), f);
  }
});

test('privacy: kids are never ordered by progress', () => {
  const tasks = [task('n', { dueAt: TODAY, assigneeId: NOAM, status: 'completed' }), task('m', { dueAt: TODAY })];
  assert.deepEqual(buildAdultHomeModel(input({ tasks })).kids.map((k) => k.member.name), ['Maya', 'Noam']);
});

test('no family progress metric, no Recent activity, no fake systems', () => {
  const visible = HOME_COPY.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.ok(!/Our family|family today|Recent activity|percent|%|score|challenge/i.test(visible));
  for (const f of [SCREEN, MODEL, REVIEW]) {
    const s = code(f);
    assert.ok(!/selectFamilyToday|familyToday|recentActivity|RecentActivity|ProgressRing/i.test(s), f);
    assert.ok(!/\b(XP|level|streak|achievement|badge|leaderboard|Adventure)\b/i.test(s), f);
  }
  assert.ok(!/selectFamilyToday/.test(code(MODEL)));
});

// ── Navigation ──────────────────────────────────────────────────────────────

test('navigation: adult tabs stay Home | Tasks | Rewards | Family; no Settings tab', () => {
  assert.deepEqual([...ADULT_TABS], ['Home', 'Tasks', 'Rewards', 'Family']);
  for (const role of ['adult', 'admin', 'owner']) assert.deepEqual([...tabsForShell(resolveShellKind(role))], ['Home', 'Tasks', 'Rewards', 'Family']);
  assert.ok(!(ADULT_TABS as readonly string[]).includes('Settings'));
});

test('navigation: Settings stays behind the Home avatar (and Family); Review is a stack route', () => {
  assert.deepEqual([...settingsEntryPoints('adult')], ['homeAvatar', 'familySettingsLink']);
  // Slice 6B adds NewMission (the existing Create mission form); Slice 6C
  // adds NewReward (Create Reward).
  assert.deepEqual([...STACK_ROUTES.adult], ['Settings', 'AdultReview', 'NewMission', 'NewReward']);
  assert.equal(isRouteAvailable('adult', 'AdultReview'), true);
  assert.equal(isRouteAvailable('child', 'AdultReview'), false);
  const s = code(SCREEN);
  assert.ok(/onPress=\{onOpenSettings\}[\s\S]{0,120}accessibilityLabel=\{copy\.navigation\.openProfileA11y\}/.test(s));
  assert.ok(/onOpenSettings=\{openSettings\}/.test(code(SHELL)));
});

// ── Layout ──────────────────────────────────────────────────────────────────

test('layout: Review goes full width at 130% text; quick actions stack only when very narrow', () => {
  assert.equal(reviewFullWidth(360, 1), false);
  assert.equal(reviewFullWidth(390, 1), false);
  assert.equal(reviewFullWidth(412, 1), false);
  assert.equal(reviewFullWidth(360, 1.3), true);
  assert.equal(reviewFullWidth(390, 1.3), true);
  assert.equal(quickActionsStacked(390, 1.3), false);
  assert.equal(quickActionsStacked(360, 1.3), true);
  assert.equal(quickActionsStacked(360, 1), false);
  assert.equal(showDashboardSubtitle(640), false);
  assert.equal(showDashboardSubtitle(844), true);
});

// ── Design guards ───────────────────────────────────────────────────────────

test('design: adult density — flat hairline cards, no child depth edge or shadow', () => {
  const s = code(SCREEN);
  assert.ok(/<Card density="adult"/.test(s));
  assert.ok(!/density="child"|depth\.|shadows\.|elevation|shadowOffset|childCard|childHero|childHeader/.test(s));
  assert.ok(/backgroundColor:\s+colors\.adultGround/.test(s));
  assert.ok(/borderTopColor: colors\.border/.test(s), 'hairline separators');
});

test('design: gold is not used on Adult Home (nothing there is a Points balance)', () => {
  for (const f of [SCREEN, REVIEW]) assert.ok(!/colors\.(gold|goldDeep|onGold)|variant="gold"/.test(code(f)), f);
});

test('design: Rubik through lockedTextStyle; 48dp controls; section titles are headers', () => {
  const s = code(SCREEN);
  assert.ok(/lockedTextStyle\(token, ready\)/.test(s) && /useRubikReady/.test(s));
  assert.ok(/reviewButton: \{\s+minHeight:\s+sizes\.adultButton/.test(s));
  assert.ok(/quickButton: \{\s+minHeight:\s+sizes\.adultButton/.test(s));
  assert.ok(/avatarButton: \{\s+width:\s+sizes\.tapTarget,\s+height:\s+sizes\.tapTarget/.test(s));
  assert.equal((s.match(/accessibilityRole="header"/g) ?? []).length, 3, 'greeting, Needs attention, Kids today');
  assert.ok(!/numberOfLines/.test(s), 'long titles wrap, never truncate');
});

test('design: every state is a word plus an icon, never colour alone', () => {
  const s = code(SCREEN);
  assert.ok(/time-outline[\s\S]{0,200}kid\.waitingLabel/.test(s), 'waiting pill: icon + word');
  assert.ok(/KIND_ICON\[item\.kind\][\s\S]{0,400}item\.typeLabel/.test(s), 'attention row: icon + type word');
});

test('the copy block holds no fake example values', () => {
  assert.ok(!/\b(Dana|Maya|Noam|Eli|Math homework|Game time|10 min ago)\b/.test(HOME_COPY));
});
