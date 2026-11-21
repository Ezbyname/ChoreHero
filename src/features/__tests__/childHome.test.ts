// Slice 5A: Child Home. These tests check that the screen consumes the
// approved selectors (no duplicated rules), every Hero / reward / family
// state, Points semantics, the privacy rules, Rubik opt-in and the
// system-font fallback.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';

import {
  buildChildHomeModel,
  COMPACT_HEIGHT_MAX,
  heroActionFor,
  heroRibbonTone,
  isCompactHeight,
  progressRatio,
  rewardRatio,
  type ChildHomeInput,
} from '@/features/childHome/childHomeModel';
import { CHILD_WEIGHTS, childText } from '@/features/childHome/childType';
import { selectSuggestedReward } from '@/features/rewards/suggestedReward';
import { selectDailyProgress, selectFamilyToday } from '@/features/tasks/dailyProgress';
import { selectNextMission } from '@/features/tasks/nextMission';
import { latestSubmissionByTask } from '@/features/tasks/taskListSections';
import { RUBIK, colors, typeScale } from '@/theme';
import type { Reward, RewardRedemption, Task, TaskSubmissionSummary } from '@/types';

const SRC = new URL('../../', import.meta.url);
const code = (rel: string) => readFileSync(new URL(rel, SRC), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const SCREEN = 'screens/ChildHomeScreen.tsx';
const MODEL  = 'features/childHome/childHomeModel.ts';

const TZ  = 'Asia/Jerusalem';
const KID = 'kid-1';
const SIB = 'kid-2';
const NOW = new Date('2026-11-13T12:00:00Z');   // 14:00 in IL, 13 Nov
const TODAY = '2026-11-13T00:00:00.000Z';
const YESTERDAY = '2026-11-12T00:00:00.000Z';
const TOMORROW = '2026-11-14T00:00:00.000Z';

const task = (id: string, over: Partial<Task> = {}): Task => ({ id, title: `Title ${id}`, status: 'open', assigneeId: KID, ...over });
const sub = (taskId: string, status: TaskSubmissionSummary['status']): TaskSubmissionSummary =>
  ({ id: `s-${taskId}`, taskId, status, submittedByProfileId: KID, submittedAt: '2026-11-13T10:00:00Z', photoCount: 0 });
const reward = (id: string, requiredPoints: number, over: Partial<Reward> = {}): Reward =>
  ({ id, householdId: 'hh', title: `Reward ${id}`, requiredPoints, isActive: true, ...over });
const redemption = (rewardId: string, snapshot: number, over: Partial<RewardRedemption> = {}): RewardRedemption => ({
  id: `r-${rewardId}`, householdId: 'hh', rewardId, requestedByProfileId: KID, clientRequestId: 'c', pointsRequiredSnapshot: snapshot,
  status: 'pending', reservationModel: 'reserved', requestedAt: '', createdAt: '', updatedAt: '', ...over,
});

function input(over: Partial<ChildHomeInput> = {}): ChildHomeInput {
  return { tasks: [], taskSubmissions: [], rewards: [], redemptions: [], grossBalance: 0, childId: KID, now: NOW, timeZone: TZ, ...over };
}

// ── Selector consumption, not duplicated rules ──────────────────────────────

test('the model consumes the approved selectors and re-implements none of their rules', () => {
  const m = code(MODEL);
  for (const sel of ['selectDailyProgress(', 'selectFamilyToday(', 'selectNextMission(', 'selectSuggestedReward(', 'computeMyPointsSummary(', 'selectReservedPendingSnapshots(']) {
    assert.ok(m.includes(sel), sel);
  }
  // No tier ordering, due classification or affordability logic of its own.
  assert.ok(!/classifyDue|dueDayKey|localDayKey|TIER_ORDER|requiredPoints\s*[<>]/.test(m));
  // The screen renders the model and calls no selector or rule directly.
  const s = code(SCREEN);
  assert.ok(s.includes('buildChildHomeModel({'));
  assert.ok(!/selectNextMission|selectDailyProgress|selectFamilyToday|selectSuggestedReward|classifyDue|computeMyPointsSummary/.test(s));
});

test('model output equals the selectors’ own output for the same data', () => {
  const tasks = [
    task('a', { dueAt: TODAY, status: 'completed' }),
    task('b', { dueAt: TODAY }),
    task('c', { dueAt: TODAY, assigneeId: SIB }),
    task('d', { dueAt: YESTERDAY }),
  ];
  const rewards = [reward('x', 500), reward('y', 50)];
  const model = buildChildHomeModel(input({ tasks, rewards, grossBalance: 120 }));
  assert.deepEqual(model.progress, selectDailyProgress(tasks, KID, NOW, TZ));
  assert.deepEqual(model.familyToday, selectFamilyToday(tasks, NOW, TZ));
  const next = selectNextMission({ tasks, latestSubmission: latestSubmissionByTask([]), childId: KID, now: NOW, timeZone: TZ });
  assert.equal(next.kind, 'mission');
  assert.equal(model.hero.kind === 'mission' && model.hero.mission.task.id, next.kind === 'mission' && next.task.id);
  assert.deepEqual(model.suggested, selectSuggestedReward({ rewards, redemptions: [], viewerId: KID, availablePoints: 120 }));
});

// ── Daily progress ──────────────────────────────────────────────────────────

test('daily progress = completed / due today; waiting does not count as done; future excluded', () => {
  const m = buildChildHomeModel(input({ tasks: [
    task('done', { dueAt: TODAY, status: 'completed' }),
    task('waiting', { dueAt: TODAY, status: 'needs_attention' }),
    task('open', { dueAt: TODAY }),
    task('future', { dueAt: TOMORROW }),
    task('undated'),
  ] }));
  assert.deepEqual(m.progress, { completed: 1, total: 3 });
  assert.equal(m.leftToday, 2);
  assert.equal(progressRatio(m.progress), 1 / 3);
  assert.equal(progressRatio({ completed: 0, total: 0 }), 0);
});

// ── Hero ────────────────────────────────────────────────────────────────────

test('actionable Hero: the selector’s mission, with the matching CTA per tier', () => {
  const sentBack = buildChildHomeModel(input({ tasks: [task('s', { dueAt: TODAY }), task('o', { dueAt: YESTERDAY })], taskSubmissions: [sub('s', 'rejected')] }));
  assert.ok(sentBack.hero.kind === 'mission' && sentBack.hero.reason === 'sent_back' && sentBack.hero.mission.action === 'retry');
  const overdue = buildChildHomeModel(input({ tasks: [task('o', { dueAt: YESTERDAY, points: 20 }), task('t', { dueAt: TODAY })] }));
  assert.ok(overdue.hero.kind === 'mission' && overdue.hero.reason === 'overdue' && overdue.hero.mission.action === 'complete');
  assert.equal(overdue.hero.kind === 'mission' && overdue.hero.mission.points, 20);
  const open = buildChildHomeModel(input({ tasks: [task('any', { assigneeId: undefined })] }));
  assert.ok(open.hero.kind === 'mission' && open.hero.reason === 'open_to_anyone' && open.hero.mission.action === 'claim');
  assert.equal(heroActionFor('due_today_timed'), 'complete');
  assert.equal(heroActionFor('undated'), 'complete');
});

test('future-due missions never enter the Hero', () => {
  const m = buildChildHomeModel(input({ tasks: [task('f', { dueAt: TOMORROW })] }));
  assert.equal(m.hero.kind, 'none');
});

test('waiting Hero: only pending work left → calm state, never actionable', () => {
  const m = buildChildHomeModel(input({ tasks: [task('w1', { status: 'needs_attention' }), task('w2', { status: 'needs_attention', dueAt: TODAY })] }));
  assert.deepEqual(m.hero, { kind: 'waiting', pendingCount: 2 });
  const s = code(SCREEN);
  const waitingBlock = s.slice(s.indexOf("if (hero.kind === 'waiting')"), s.indexOf('if (hero.allDone)'));
  assert.ok(!/AppButton|onPress|Pressable/.test(waitingBlock), 'the waiting Hero has no call to action');
});

test('no-action Hero: all done only when today’s missions are really completed; otherwise the empty state', () => {
  const allDone = buildChildHomeModel(input({ tasks: [task('a', { dueAt: TODAY, status: 'completed' })] }));
  assert.deepEqual(allDone.hero, { kind: 'none', allDone: true });
  const empty = buildChildHomeModel(input());
  assert.deepEqual(empty.hero, { kind: 'none', allDone: false });
  const onlyFuture = buildChildHomeModel(input({ tasks: [task('f', { dueAt: TOMORROW })] }));
  assert.deepEqual(onlyFuture.hero, { kind: 'none', allDone: false });
});

// ── Secondary rows (preserved Home capabilities) ────────────────────────────

test('secondary rows keep the old Home actions (claim, complete, retry, manage) and never show a sibling’s task', () => {
  const m = buildChildHomeModel(input({
    tasks: [
      task('hero', { dueAt: YESTERDAY }),
      task('mine', { dueAt: TODAY }),
      task('back', { dueAt: TODAY }),
      task('wait', { status: 'needs_attention' }),
      task('any', { assigneeId: undefined }),
      task('sib', { dueAt: TODAY, assigneeId: SIB }),
      task('sibwait', { status: 'needs_attention', assigneeId: SIB }),
    ],
    taskSubmissions: [sub('back', 'rejected')],
  }));
  assert.ok(m.hero.kind === 'mission' && m.hero.reason === 'sent_back');
  const rows = Object.fromEntries(m.secondary.map((r) => [r.task.id, r.action]));
  assert.equal(rows.back, undefined, 'the hero task is not repeated');
  assert.equal(rows.mine, 'complete');
  assert.equal(rows.wait, 'manage');
  assert.equal(rows.any, 'claim');
  assert.equal(rows.hero, undefined, 'an overdue task stays in Missions, as before');
  assert.ok(!('sib' in rows) && !('sibwait' in rows), 'no sibling titles on the child Home');
});

test('the screen wires each action to the existing flow (no new business logic)', () => {
  const s = code(SCREEN);
  assert.ok(s.includes('claimOpenTask({ taskId: task.id, householdId: household.id, profileId: user.id, role })'));
  assert.ok(s.includes('<TaskCompletionModal'));
  assert.ok(s.includes('<PendingCompletionModal'));
  assert.ok(s.includes("if (submission) appSounds.play('completion_submitted', submission.id);"));
  assert.ok(s.includes("requestHouseholdRefresh('mutation');"));
  assert.ok(s.includes('<ClaimContributionForm'));
  assert.ok(s.includes('{canClaim && household && user ? ('));
  assert.ok(s.includes('const refreshControl = useHouseholdRefreshControl();'));
  assert.ok(!/useNavigation|navigate\(/.test(s));
  // No business-logic writes of its own: no repository or supabase imports.
  assert.ok(!/from '@\/lib\/repositories|from '@\/services\/supabase|supabase\./.test(s));
});

// ── Suggested reward ────────────────────────────────────────────────────────

test('Suggested Reward shown: the cheapest reward the child cannot afford yet, with points to go', () => {
  const m = buildChildHomeModel(input({ rewards: [reward('ready', 50), reward('next', 200), reward('far', 900)], grossBalance: 120 }));
  assert.ok(m.suggested.kind === 'suggested');
  assert.equal(m.suggested.kind === 'suggested' && m.suggested.reward.id, 'next');
  assert.equal(m.suggested.kind === 'suggested' && m.suggested.pointsRemaining, 80);
  assert.equal(rewardRatio(120, 200), 0.6);
});

test('Suggested Reward omitted when everything is affordable or nothing is eligible; the screen renders nothing then', () => {
  assert.deepEqual(buildChildHomeModel(input({ rewards: [reward('a', 10), reward('b', 100)], grossBalance: 100 })).suggested, { kind: 'none' });
  assert.deepEqual(buildChildHomeModel(input({ rewards: [reward('arch', 500, { isActive: false })], grossBalance: 0 })).suggested, { kind: 'none' });
  assert.deepEqual(buildChildHomeModel(input({ rewards: [reward('asked', 500)], redemptions: [redemption('asked', 500)], grossBalance: 600 })).suggested, { kind: 'none' });
  assert.ok(code(SCREEN).includes("{suggested.kind === 'suggested' ? ("));
});

// ── Points ──────────────────────────────────────────────────────────────────

test('Points shown = available Points (gross minus this child’s reserved pending requests), the Rewards semantics', () => {
  const m = buildChildHomeModel(input({
    grossBalance: 340,
    redemptions: [
      redemption('a', 100),                                         // reserved → held
      redemption('b', 40, { reservationModel: 'legacy' }),          // legacy → not held
      redemption('c', 60, { requestedByProfileId: SIB }),           // someone else's
      redemption('d', 70, { status: 'approved' }),                  // not pending
    ],
  }));
  assert.equal(m.availablePoints, 240);
  const s = code(SCREEN);
  assert.ok(s.includes('grossBalance: myBalance?.balance ?? 0,'));
  assert.ok(s.includes('{model.availablePoints}'));
  assert.ok(s.includes("formatCopy(copy.childHome.pointsA11y, { n: model.availablePoints })"));
  // The Suggested Reward is fed the same available Points.
  assert.ok(code(MODEL).includes('selectSuggestedReward({ rewards, redemptions, viewerId: childId, availablePoints })'));
});

// ── Family Today ────────────────────────────────────────────────────────────

test('Family Today: counts only from the approved selector; no sibling titles, Points or ranking', () => {
  const m = buildChildHomeModel(input({ tasks: [
    task('a', { dueAt: TODAY, status: 'completed' }),
    task('b', { dueAt: TODAY, assigneeId: SIB, status: 'completed', points: 99 }),
    task('c', { dueAt: TODAY, assigneeId: SIB }),
  ] }));
  assert.deepEqual(m.familyToday, { completed: 2, total: 3 });
  assert.deepEqual(Object.keys(m.familyToday).sort(), ['completed', 'total']);
  const s = code(SCREEN);
  const block = s.slice(s.indexOf('{!compact && familyToday.total > 0 ? ('), s.indexOf('Helpful claim'));
  assert.ok(block.length > 200);
  assert.ok(block.includes('familyToday.completed') && block.includes('familyToday.total'));
  assert.ok(!/\.title|points|Points|balance|rank|sort\(/.test(block), 'nothing but counts and avatars');
});

// ── Honesty: no invented game state ─────────────────────────────────────────

test('no XP, levels, streaks, badges or achievements anywhere on the Child Home', () => {
  const sources = [code(SCREEN), code(MODEL), code('features/childHome/childType.ts')];
  const { copy } = { copy: readFileSync(new URL('content/copy.ts', SRC), 'utf8') };
  const childCopy = copy.slice(copy.indexOf('childHome: {'), copy.indexOf('// Slice 4 role-based navigation.'));
  for (const src of [...sources, childCopy]) assert.ok(!/\bXP\b|\blevel|\bstreak|\bbadge|\bachievement/i.test(src));
});

// ── Rubik opt-in + system-font fallback ─────────────────────────────────────

test('Rubik when ready: the child weights map to the right Rubik family, with locked sizes', () => {
  assert.equal(childText('display', true).fontFamily, RUBIK.extraBold);
  assert.equal(childText('h1', true).fontFamily, RUBIK.extraBold);
  assert.equal(childText('h2', true).fontFamily, RUBIK.bold);
  assert.equal(childText('title', true).fontFamily, RUBIK.semiBold);
  assert.equal(childText('caption', true).fontFamily, RUBIK.medium);
  assert.equal(childText('overline', true).fontFamily, RUBIK.bold);
  assert.equal(childText('h1', true).fontWeight, 'normal');
  assert.equal(childText('h1', true).fontSize, typeScale.h1.fontSize);
  assert.equal(childText('display', true).lineHeight, typeScale.displayChild.lineHeight);
  assert.equal(childText('overline', true).textTransform, 'uppercase');
});

test('system-font fallback: same size, line height and child weight, no fontFamily', () => {
  for (const tok of Object.keys(CHILD_WEIGHTS) as (keyof typeof CHILD_WEIGHTS)[]) {
    const ready = childText(tok, true);
    const fallback = childText(tok, false);
    assert.equal('fontFamily' in fallback, false, tok);
    assert.equal(fallback.fontWeight, CHILD_WEIGHTS[tok], tok);
    assert.equal(fallback.fontSize, ready.fontSize, tok);
    assert.equal(fallback.lineHeight, ready.lineHeight, tok);
  }
  // The screen reads readiness from the Slice 3 hook. Nothing waits on fonts.
  const s = code(SCREEN);
  assert.ok(s.includes('const ready = useRubikReady();'));
  assert.ok(s.includes('childText(token, ready)'));
});

function uiFiles(dirRel: string): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const name of readdirSync(new URL(rel, SRC))) {
      const child = `${rel}${name}`;
      if (statSync(new URL(child, SRC)).isDirectory()) { if (name !== '__tests__') walk(`${child}/`); }
      else if (name.endsWith('.tsx')) out.push(child);
    }
  };
  walk(dirRel);
  return out;
}

test('Rubik and child density are opted into by the Child Home and Child Missions only', () => {
  const ui = [...uiFiles('screens/'), ...uiFiles('features/'), ...uiFiles('components/'), ...uiFiles('navigation/')];
  const rubik = ui.filter((f) => /useRubikReady|lockedTextStyle|childText\(|Rubik-/.test(code(f)));
  // Slice 5C: the child Submit Evidence screen uses childText directly.
  // Slice 6A: the Adult Home uses the adult type scale (lockedTextStyle).
  assert.deepEqual(rubik.sort(), ['features/tasks/components/ChildSubmitEvidence.tsx', SCREEN, 'screens/AdultHomeScreen.tsx'].sort());
  // Slice 5B: Child Missions takes Rubik through the Child Home's useT().
  assert.ok(code('screens/ChildMissionsScreen.tsx').includes("import { EvidenceMissionCard, MissionArt, PointsPill, useT } from '@/screens/ChildHomeScreen';"));
  const density = ui.filter((f) => /density="child"/.test(code(f)));
  assert.deepEqual(density.sort(), [
    SCREEN, 'screens/ChildMissionsScreen.tsx',
    'screens/ChildMissionDetailsScreen.tsx', 'features/tasks/components/ChildSubmitEvidence.tsx',
    // Slice 5D: Child Rewards (Rubik through the Child Home's useT()).
    'screens/ChildRewardsScreen.tsx',
  ].sort());
});

// ── Visual system: locked tokens only ───────────────────────────────────────

test('child surfaces use the locked tokens (indigo, gold for Points only, card 20, button 56, tactile depth)', () => {
  const s = code(SCREEN);
  assert.ok(s.includes('<Card density="child"'));
  // Slice 5A.1 owner decision: the hero CTA ("I did it!" / "Try again" /
  // "I'll do this") is the indigo child button, never gold.
  assert.ok(/variant="primary"\s+density="child"/.test(s), 'the hero CTA is the child 56dp indigo button');
  assert.ok(s.includes('...depth.childButton') && s.includes('...depth.goldButton'));
  assert.ok(s.includes('lockedSpacing as sp'));
  assert.ok(!/['"]#[0-9A-Fa-f]{3,8}['"]|rgba?\(/.test(s), 'no raw colours in the screen');
  assert.equal(colors.childHeader, '#5B4BF0');
  assert.equal(colors.childHero, '#6D5BF0');
});

test('Slice 5A.1: no mission CTA is gold; gold appears only for Points and rewards', () => {
  const s = code(SCREEN);
  assert.ok(!s.includes('variant="gold"'), 'no AppButton on the Child Home uses variant="gold"');
  // Every hero CTA label ("I did it!" / "Try again" / "I'll do this") is
  // rendered by the one hero button, which is the indigo child button.
  assert.equal([...s.matchAll(/CTA_LABEL\[mission\.action\]/g)].length, 1);
  assert.ok(/label=\{CTA_LABEL\[mission\.action\]\}\s+variant="primary"\s+density="child"/.test(s));
  // The secondary-row claim stays the neutral secondary button.
  assert.ok(/label=\{copy\.childHome\.ctaClaim\} variant="secondary"/.test(s));

  // Allowlist: every gold token sits in a Points / reward context.
  const GOLD = /colors\.(gold|goldDeep|onGold)\b|depth\.goldButton/;
  const POINTS_REWARD_STYLES = new Set(['coin', 'pointsPill', 'rewardBubble', 'onGoldText']);
  const POINTS_REWARD_JSX = [
    /<Ionicons name="star" size=\{14\} color=\{colors\.goldDeep\} \/>/,           // Points coin face
    /ILLUSTRATION_PLACEHOLDER\.reward\} size=\{28\} color=\{colors\.goldDeep\}/,    // suggested-reward art
    /rewardRatio\(model\.availablePoints.*backgroundColor: colors\.gold \}/,       // reward progress bar
  ];
  const lines = s.split('\n');
  const sheetStart = lines.findIndex((l) => l.includes('StyleSheet.create('));
  assert.ok(sheetStart > 0);
  let styleKey: string | null = null;
  const offenders: string[] = [];
  lines.forEach((line, i) => {
    if (i > sheetStart) {
      const key = /^  (\w+):/.exec(line);
      if (key) styleKey = key[1];
    }
    if (!GOLD.test(line)) return;
    const ok = i > sheetStart
      ? styleKey !== null && POINTS_REWARD_STYLES.has(styleKey)
      : POINTS_REWARD_JSX.some((re) => re.test(line)) || /styles\.onGoldText/.test(line);
    if (!ok) offenders.push(`${i + 1}: ${line.trim()}`);
  });
  assert.deepEqual(offenders, [], 'gold outside a Points / reward context');
  // Those gold styles are used only by the Points coin, Points pill and reward card.
  assert.equal([...s.matchAll(/styles\.coin\b/g)].length, 1);
  assert.equal([...s.matchAll(/styles\.pointsPill\b/g)].length, 1);
  assert.equal([...s.matchAll(/styles\.rewardBubble\b/g)].length, 1);
  assert.equal([...s.matchAll(/styles\.onGoldText\b/g)].length, 2);   // Points pill + Points coin value
});

test('Slice 5A.1: no gradient or vector-art dependency was added', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', SRC), 'utf8'));
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  assert.deepEqual(deps.filter((d) => /gradient|svg|lottie|skia/i.test(d)), [], 'no gradient / vector-art library');
  assert.ok(!/LinearGradient|react-native-svg|expo-linear-gradient/.test(code(SCREEN)));
});

// ── Responsive ──────────────────────────────────────────────────────────────

test('responsive: 360×640 is the compact layout; 390×844 and 412×915 are standard', () => {
  assert.equal(isCompactHeight(640), true);
  assert.equal(isCompactHeight(844), false);
  assert.equal(isCompactHeight(915), false);
  assert.equal(COMPACT_HEIGHT_MAX, 700);
  // Text never sets a fixed height, so 130% font scaling grows cards
  // rather than clipping; the main titles are never truncated.
  const s = code(SCREEN);
  assert.ok(!/allowFontScaling=\{false\}/.test(s));
  assert.ok(!/numberOfLines=\{1\}/.test(s));
});

// ── vc14 Android correction gate ────────────────────────────────────────────

test('vc14: READY uses success semantics; OVERDUE uses warning amber, never success', () => {
  assert.equal(heroRibbonTone('due_today'), 'success');
  assert.equal(heroRibbonTone('due_today_timed'), 'success');
  assert.equal(heroRibbonTone('undated'), 'success');
  assert.equal(heroRibbonTone('overdue'), 'warning');
  assert.notEqual(heroRibbonTone('overdue'), 'success');
  assert.equal(heroRibbonTone('sent_back'), 'indigo');

  const s = code(SCREEN);
  assert.match(s, /ribbon: \{\s*backgroundColor:\s*colors\.success,/, 'the READY ribbon is success green');
  assert.match(s, /ribbonOverdue:\s*\{ backgroundColor: colors\.warning \}/, 'the OVERDUE ribbon is the semantic warning token');
  assert.ok(s.includes("tone === 'warning' && styles.ribbonOverdue"), 'overdue applies the amber style');
  assert.notEqual(colors.warning, colors.success);
  // Copy and business rules are unchanged: the label is still OVERDUE and the CTA still completes.
  assert.ok(s.includes('overdue:        copy.childHome.ribbonOverdue'));
  assert.equal(heroActionFor('overdue'), 'complete');
});

test('vc14: scrolled Child Home content stays below the status bar (Child Home-local, no double inset)', () => {
  const s = code(SCREEN);
  assert.ok(s.includes("const SCREEN_EDGES = ['left', 'right'] as const;"), 'Screen still adds no top inset');
  assert.ok(s.includes('paddingTop: insets.top + sp.sm'), 'the header band keeps its one top inset');
  assert.ok(s.includes('<View style={[styles.statusScrim, { height: insets.top }]} />'), 'a fixed strip covers exactly the status bar');
  assert.match(s, /statusScrim: \{\s*position:\s*'absolute',\s*top:\s*0,[\s\S]*?backgroundColor: colors\.childHeader,\s*pointerEvents:\s*'none',/, 'band colour, ignores touches');
  assert.ok(!code('components/Screen.tsx').includes('statusScrim'), 'the shared Screen primitive is untouched');
});
