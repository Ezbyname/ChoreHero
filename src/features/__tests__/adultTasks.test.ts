// Slice 6B: Adult Tasks (Board 07). Segments (Open · Waiting · Sent back ·
// Done), classification from the existing task state rule, counts, scan
// order, Review routing, the reused Create mission form, open-to-anyone,
// permissions, colour semantics, and the banned features.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  TASK_SEGMENTS,
  actionFullWidth,
  legacyTodayCompleteIds,
  buildAdultTasksModel,
  orderTasks,
  segmentFor,
  segmentsInGrid,
  type AdultTasksInput,
  type AdultTasksPermissions,
} from '@/features/adultTasks/adultTasksModel';
import { buildAdultHomeModel } from '@/features/adultHome/adultHomeModel';
import { buildTodaySections, deriveTaskStatus } from '@/features/tasks/taskListSections';
import { TaskAdapter } from '@/domain/adapters/taskActivityAdapter';
import { copy } from '@/content/copy';
import { ADULT_TABS, STACK_ROUTES, isRouteAvailable } from '@/navigation/roleShell';
import type { HouseholdMember, Task, TaskSubmissionSummary } from '@/types';

const SRC = new URL('../../', import.meta.url);
const raw  = (rel: string) => readFileSync(new URL(rel, SRC), 'utf8');
const code = (rel: string) => raw(rel).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const SCREEN = 'screens/AdultTasksScreen.tsx';
const MODEL  = 'features/adultTasks/adultTasksModel.ts';
const NEWM   = 'screens/NewMissionScreen.tsx';
const SHELL  = 'navigation/AppTabs.tsx';
const COPY   = raw('content/copy.ts');
const TASKS_COPY = COPY.slice(COPY.indexOf('  adultTasks: {'), COPY.indexOf('// Slice 4 role-based navigation.'));
const TASKS_STRINGS = TASKS_COPY.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

const NOW = new Date('2026-11-18T10:00:00Z');
const TODAY = '2026-11-18T00:00:00.000Z';
const ME = 'adult-1', MAYA = 'kid-maya', NOAM = 'kid-noam';
const MEMBERS: HouseholdMember[] = [
  { id: 'm1', userId: ME, name: 'Dana', role: 'owner' },
  { id: 'm2', userId: MAYA, name: 'Maya', role: 'child' },
  { id: 'm3', userId: NOAM, name: 'Noam', role: 'child' },
];

const task = (id: string, over: Partial<Task> = {}): Task => ({ id, title: `Task ${id}`, status: 'open', assigneeId: MAYA, ...over });
const sub = (taskId: string, status: TaskSubmissionSummary['status'], submittedAt = '2026-11-18T08:00:00Z'): TaskSubmissionSummary =>
  ({ id: `s-${taskId}-${submittedAt}`, taskId, status, submittedByProfileId: MAYA, submittedAt, photoCount: 1 });
const ALL: AdultTasksPermissions = { canCreateTasks: true, canReviewTasks: true, canClaimOpen: true, canCompleteTasks: true };
const input = (over: Partial<AdultTasksInput> = {}): AdultTasksInput =>
  ({ tasks: [], taskSubmissions: [], members: MEMBERS, viewerId: ME, permissions: ALL, now: NOW, ...over });

const MIXED = input({
  tasks: [
    task('open1', { title: 'Clean your room', points: 25, dueAt: TODAY }),
    task('anyone', { title: 'Dishes', assigneeId: undefined, points: 10 }),
    task('wait', { title: 'Math homework', status: 'needs_attention', points: 25 }),
    task('back', { title: 'Fold laundry', assigneeId: NOAM, points: 15 }),
    task('done', { title: 'Feed Biscuit', status: 'completed' }),
    task('mine', { title: 'Pay bills', assigneeId: ME }),
  ],
  taskSubmissions: [sub('wait', 'pending'), sub('back', 'rejected')],
});
const ids = (rows: readonly { task: Task }[]) => rows.map((r) => r.task.id);

// ── Segments and classification ─────────────────────────────────────────────

test('segments: exactly Open · Waiting · Sent back · Done', () => {
  assert.deepEqual([...TASK_SEGMENTS], ['open', 'waiting', 'sent_back', 'done']);
  assert.deepEqual(buildAdultTasksModel(input()).segments.map((s) => s.label), ['Open', 'Waiting', 'Sent back', 'Done']);
  assert.ok(!/\b(Assigned|My Tasks|Pending|Completed|Archived)\b/.test(TASKS_STRINGS), 'no old or banned segment words');
});

test('classification: open → Open, pending submission → Waiting, sent back → Sent back, completed → Done', () => {
  const m = buildAdultTasksModel(MIXED);
  assert.deepEqual(ids(m.rows.open).sort(), ['anyone', 'mine', 'open1']);
  assert.deepEqual(ids(m.rows.waiting), ['wait']);
  assert.deepEqual(ids(m.rows.sent_back), ['back']);
  assert.deepEqual(ids(m.rows.done), ['done']);
});

test('classification reuses the existing deriveTaskStatus rule', () => {
  const cases: [Task, TaskSubmissionSummary | undefined][] = [
    [task('a'), undefined], [task('b', { assigneeId: undefined }), undefined], [task('c', { status: 'in_progress' }), undefined],
    [task('d'), sub('d', 'withdrawn')], [task('e'), sub('e', 'rejected')], [task('f', { status: 'needs_attention' }), sub('f', 'pending')],
    [task('g', { status: 'completed' }), sub('g', 'approved')],
  ];
  for (const [t, s] of cases) {
    const m = buildAdultTasksModel(input({ tasks: [t], taskSubmissions: s ? [s] : [] }));
    const expected = segmentFor(deriveTaskStatus(t, s).key);
    assert.deepEqual(ids(m.rows[expected]), [t.id], t.id);
  }
  assert.ok(/deriveTaskStatus/.test(code(MODEL)));
  // Taken back by the child stays Open; only a reviewer's rejection is Sent back.
  assert.equal(segmentFor('taken_back'), 'open');
  assert.equal(segmentFor('needs_retry'), 'sent_back');
});

test('a resubmitted task is Waiting again, not Sent back (latest submission wins)', () => {
  const m = buildAdultTasksModel(input({
    tasks: [task('x', { status: 'needs_attention' })],
    taskSubmissions: [sub('x', 'rejected', '2026-11-17T08:00:00Z'), sub('x', 'pending', '2026-11-18T08:00:00Z')],
  }));
  assert.deepEqual(ids(m.rows.waiting), ['x']);
  assert.equal(m.rows.sent_back.length, 0);
});

test('Waiting matches Adult Home’s mission review items exactly', () => {
  const tasks = MIXED.tasks;
  const home = buildAdultHomeModel({
    tasks, taskSubmissions: MIXED.taskSubmissions, rewards: [], redemptions: [], claims: [], members: MEMBERS, viewerId: ME,
    permissions: { canReviewMissions: true, canReviewRewards: true, canReviewContributions: true, canCreateMissions: true, canCreateRewards: true },
    now: NOW, timeZone: 'Asia/Jerusalem',
  });
  const homeMissions = home.attention.items.filter((i) => i.kind === 'mission_review').map((i) => i.id).sort();
  assert.deepEqual(ids(buildAdultTasksModel(MIXED).rows.waiting).sort(), homeMissions);
});

// ── Counts ──────────────────────────────────────────────────────────────────

test('counts: every segment count equals its rows, never a constant', () => {
  for (const scenario of [input(), MIXED]) {
    const m = buildAdultTasksModel(scenario);
    for (const s of m.segments) assert.equal(s.count, m.rows[s.key].length, s.key);
  }
  assert.deepEqual(buildAdultTasksModel(MIXED).segments.map((s) => s.count), [3, 1, 1, 1]);
  assert.equal(buildAdultTasksModel(MIXED).segments[1].a11yLabel, 'Waiting, 1 task');
  assert.equal(buildAdultTasksModel(MIXED).segments[0].a11yLabel, 'Open, 3 tasks');
  const s = code(SCREEN);
  assert.ok(/s\.count > 0 \?/.test(s) && /\{s\.count\}/.test(s), 'the screen renders the model count');
  assert.ok(!/count[^\n]{0,20}\b[1-9]\b\s*\}/.test(s));
});

test('empty segments: quiet empty states, no fake rows', () => {
  const m = buildAdultTasksModel(input());
  for (const k of TASK_SEGMENTS) assert.equal(m.rows[k].length, 0);
  assert.deepEqual(Object.values(copy.adultTasks.empty), ['No open tasks right now.', 'Nothing is waiting for review.', 'Nothing has been sent back.', 'No finished tasks yet.']);
  assert.ok(code(SCREEN).includes('copy.adultTasks.empty[selected]'));
});

// ── Scan order, ordering ────────────────────────────────────────────────────

test('scan order: title, assignee · due, state, Points in fixed positions', () => {
  const row = buildAdultTasksModel(MIXED).rows.open.find((r) => r.task.id === 'open1')!;
  assert.equal(row.title, 'Clean your room');
  assert.equal(row.assigneeName, 'Maya');
  assert.equal(row.stateLabel, 'Open');
  assert.equal(row.pointsLabel, '25');
  assert.ok(row.a11yLabel.startsWith('Clean your room. Maya · '));
  assert.ok(row.a11yLabel.endsWith('. Open. 25 points'));
  // One row template in the screen: title, then "assignee · due", then the
  // state pill, with Points always the trailing pill.
  const s = code(SCREEN);
  const iTitle = s.indexOf('{row.title}'), iMeta = s.indexOf('`${row.assigneeName} · ${row.dueLabel}`'), iState = s.indexOf('<StatePill'), iPoints = s.indexOf('{row.pointsLabel}</Text>');
  assert.ok(iTitle > 0 && iTitle < iMeta && iMeta < iState && iState < iPoints);
});

test('due: real due label, or "No due date"', () => {
  const m = buildAdultTasksModel(MIXED);
  assert.equal(m.rows.open.find((r) => r.task.id === 'anyone')!.dueLabel, 'No due date');
  assert.notEqual(m.rows.open.find((r) => r.task.id === 'open1')!.dueLabel, 'No due date');
});

test('ordering: newest created first (the old Assigned order); undated last; ties keep store order', () => {
  const tasks = [
    task('old', { createdAt: '2026-11-01T00:00:00Z' }), task('noDate1'), task('new', { createdAt: '2026-11-10T00:00:00Z' }), task('noDate2'),
  ];
  assert.deepEqual(orderTasks(tasks).map((t) => t.id), ['new', 'old', 'noDate1', 'noDate2']);
  const dated = [task('a', { createdAt: '2026-11-01T00:00:00Z' }), task('b', { createdAt: '2026-11-03T00:00:00Z' }), task('c', { createdAt: '2026-11-02T00:00:00Z' })];
  assert.deepEqual(orderTasks(dated).map((t) => t.id), ['b', 'c', 'a']);
  const undated = [task('x'), task('y'), task('z')];
  assert.deepEqual(orderTasks(undated).map((t) => t.id), ['x', 'y', 'z']);
  assert.ok(!/localeCompare\(a\.title|\.title\s*<|title\.localeCompare/.test(code(MODEL)), 'never sorted by title');
});

// ── Actions: Review, claim, complete; permissions ───────────────────────────

test('Waiting rows use "Review" and route to AdultReview; no review logic in Tasks', () => {
  const row = buildAdultTasksModel(MIXED).rows.waiting[0];
  assert.equal(row.action, 'review');
  assert.equal(row.actionLabel, 'Review');
  assert.equal(row.actionA11yLabel, 'Review: Math homework');
  assert.ok(/navigate\('AdultReview', \{ kind: 'mission_review', id: taskId \}\)/.test(code(SHELL)));
  for (const f of [SCREEN, MODEL]) {
    assert.ok(!/approveTaskCompletion|rejectTaskCompletion|TaskReviewEvidenceModal|supabase|\.rpc\(/.test(code(f)), f);
    assert.ok(!/\b(Approve|Check|Inspect|Decline)\b/.test(code(f)), f);
  }
});

test('open to anyone: shown as "Anyone", never a guessed child; the existing claim', () => {
  const row = buildAdultTasksModel(MIXED).rows.open.find((r) => r.task.id === 'anyone')!;
  assert.equal(row.assigneeName, 'Anyone');
  assert.equal(row.isAnyone, true);
  assert.equal(row.stateLabel, 'Open to anyone');
  assert.equal(row.action, 'claim');
  assert.equal(row.actionLabel, copy.activityCard.claimAction);
  assert.ok(/claimOpenTask\(/.test(code(SCREEN)));
});

test('the viewer’s own open task keeps the existing direct Complete', () => {
  const m = buildAdultTasksModel(MIXED);
  assert.equal(m.rows.open.find((r) => r.task.id === 'mine')!.action, 'complete');
  assert.equal(m.rows.sent_back[0].action, null);
  assert.equal(m.rows.done[0].action, null);
  assert.ok(/completeTask\(/.test(code(SCREEN)));
});

// ── Slice 6B.1: the old adult Home's direct Complete on a child's task ──────

const YESTERDAY = '2026-11-17T00:00:00.000Z';
const TOMORROW  = '2026-11-19T00:00:00.000Z';
const CHILD_CASES = input({
  tasks: [
    task('kidToday',    { title: 'Kid today',    dueAt: TODAY }),
    task('kidOverdue',  { title: 'Kid overdue',  dueAt: YESTERDAY }),
    task('kidFuture',   { title: 'Kid future',   dueAt: TOMORROW }),
    task('kidUndated',  { title: 'Kid undated' }),
    task('kidWaiting',  { title: 'Kid waiting',  dueAt: TODAY, status: 'needs_attention' }),
    task('kidDone',     { title: 'Kid done',     dueAt: TODAY, status: 'completed' }),
    task('kidSentBack', { title: 'Kid sent back', dueAt: TODAY }),
    task('anyToday',    { title: 'Anyone today', dueAt: TODAY, assigneeId: undefined }),
    task('mineFuture',  { title: 'Mine future',  dueAt: TOMORROW, assigneeId: ME }),
  ],
  taskSubmissions: [sub('kidWaiting', 'pending'), sub('kidSentBack', 'rejected')],
});
const actionOf = (m: ReturnType<typeof buildAdultTasksModel>, id: string) =>
  Object.values(m.rows).flat().find((r) => r.task.id === id)!.action;

test('6B.1: a child’s open task due today gets the legacy Complete; overdue, future and undated do not', () => {
  const m = buildAdultTasksModel(CHILD_CASES);
  assert.equal(actionOf(m, 'kidToday'), 'complete');
  assert.equal(actionOf(m, 'kidOverdue'), null);
  assert.equal(actionOf(m, 'kidFuture'), null);
  assert.equal(actionOf(m, 'kidUndated'), null);
});

test('6B.1: eligibility is exactly the old Home list (buildTodaySections + TaskAdapter "complete")', () => {
  const ids = legacyTodayCompleteIds(CHILD_CASES.tasks, true, NOW);
  const legacy = buildTodaySections(CHILD_CASES.tasks, { canReview: true }, NOW).generalTasks
    .filter((t) => TaskAdapter.toFamilyActivity(t).availableActions.includes('complete')).map((t) => t.id);
  assert.deepEqual([...ids].sort(), legacy.sort());
  assert.ok(/buildTodaySections\(tasks, \{ canReview \}, now\)/.test(code(MODEL)));
  assert.ok(/TaskAdapter\.toFamilyActivity\(t\)\.availableActions\.includes\('complete'\)/.test(code(MODEL)));
});

test('6B.1: waiting, done and sent-back rows never expose it (Open rows only)', () => {
  const m = buildAdultTasksModel(CHILD_CASES);
  assert.equal(actionOf(m, 'kidWaiting'), 'review');
  assert.equal(actionOf(m, 'kidDone'), null);
  assert.equal(actionOf(m, 'kidSentBack'), null, 'the old Home showed it here; 6B.1 keeps it to Open rows');
});

test('6B.1: permission respected; claim and own Complete unaffected', () => {
  const noComplete = buildAdultTasksModel({ ...CHILD_CASES, permissions: { ...ALL, canCompleteTasks: false } });
  assert.equal(actionOf(noComplete, 'kidToday'), null);
  assert.equal(actionOf(noComplete, 'mineFuture'), null);
  assert.equal(actionOf(noComplete, 'anyToday'), 'claim');
  const m = buildAdultTasksModel(CHILD_CASES);
  assert.equal(actionOf(m, 'anyToday'), 'claim');
  assert.equal(actionOf(m, 'mineFuture'), 'complete', 'own task: any due date, as the old My Tasks view');
  assert.equal(actionOf(m, 'kidWaiting'), 'review');
});

test('6B.1: same domain path, no duplicated business logic', () => {
  const s = code(SCREEN);
  assert.ok(/await completeTask\(\{ taskId: row\.task\.id, householdId: household\.id, role \}\)/.test(s));
  assert.ok(s.includes('copy.activityCard.completeNotAllowed') && s.includes('copy.activityCard.completeNotOpen') && s.includes('copy.activityCard.completeError'));
  for (const f of [SCREEN, MODEL]) assert.ok(!/complete_task|\.rpc\(|supabase|setTasks|pointsBalances/.test(code(f)), f);
});

test('permissions: each action and New follow their existing permission', () => {
  const none = buildAdultTasksModel({ ...MIXED, permissions: { canCreateTasks: false, canReviewTasks: false, canClaimOpen: false, canCompleteTasks: false } });
  assert.equal(none.canCreate, false);
  for (const k of TASK_SEGMENTS) for (const r of none.rows[k]) assert.equal(r.action, null, `${k}:${r.task.id}`);
  assert.equal(buildAdultTasksModel({ ...MIXED, permissions: { ...ALL, canReviewTasks: false } }).rows.waiting[0].action, null);
  assert.equal(buildAdultTasksModel(MIXED).canCreate, true);
  const s = code(SCREEN);
  assert.ok(/model\.canCreate \?/.test(s));
  assert.ok(/useAppStore\(selectCanCreateTasks\)/.test(s) && /useAppStore\(selectCanApproveTaskCompletion\)/.test(s));
  assert.ok(/hasHouseholdPermission\(role, 'tasks\.claim_open'\)/.test(s) && /hasHouseholdPermission\(role, 'tasks\.complete'\)/.test(s));
  assert.ok(!/role === '/.test(s), 'no raw role compare');
});

// ── New mission (existing form) ─────────────────────────────────────────────

test('New opens the existing Create mission form; no second form', () => {
  assert.ok(/onNewMission=\{\(\) => navigation\.navigate\('NewMission'\)\}/.test(code(SHELL)));
  assert.ok(/navigate\('NewMission'\)/.test(code(SHELL).slice(code(SHELL).indexOf('function AdultHomeTab'))), 'Home New mission too');
  const n = code(NEWM);
  assert.ok(/import \{ CreateTaskForm \} from '@\/screens\/AssignedByMeScreen'/.test(n));
  assert.ok(/canCreateTasks && household && user && \(\s*<CreateTaskForm/.test(n));
  assert.ok(/export function CreateTaskForm\(/.test(code('screens/AssignedByMeScreen.tsx')));
  for (const f of [SCREEN, NEWM, MODEL]) assert.ok(!/createTask\(|TextField|TextInput|DateTimePicker/.test(code(f)), f);
  assert.equal(copy.adultTasks.newLabel, 'New');
  assert.equal(copy.adultTasks.newA11y, 'New mission');
});

test('navigation: adult tabs unchanged; Review and New mission are stack routes', () => {
  assert.deepEqual([...ADULT_TABS], ['Home', 'Tasks', 'Rewards', 'Family']);
  assert.deepEqual([...STACK_ROUTES.adult], ['Settings', 'AdultReview', 'NewMission', 'NewReward']);
  assert.equal(isRouteAvailable('child', 'NewMission'), false);
  assert.ok(code(SHELL).includes('<AdultTab.Screen name="Tasks"   component={AdultTasksTab}'));
  assert.ok(!/useNavigation|navigate\(/.test(code(SCREEN)), 'the screen never navigates');
});

// ── Semantics and design ────────────────────────────────────────────────────

test('semantics: Waiting amber, Sent back indigo (never red), Done success, Points gold only', () => {
  const s = code(SCREEN);
  const tone = s.slice(s.indexOf('const STATE_TONE'), s.indexOf('const styles'));
  assert.ok(/waiting:\s+\{ bg: colors\.waitingSoft,\s+fg: colors\.waiting \}/.test(tone));
  assert.ok(/sent_back: \{ bg: colors\.indigoTint,\s+fg: colors\.indigoDeep \}/.test(tone));
  assert.ok(/done:\s+\{ bg: colors\.successSoft,\s+fg: colors\.success \}/.test(tone));
  assert.ok(!/danger|error|dangerSoft|errorSoft/.test(tone), 'sent back is never red');
  // Gold appears exactly once: the Points pill background.
  assert.equal((s.match(/colors\.gold\b/g) ?? []).length, 1);
  assert.ok(/pointsPill: \{[\s\S]*?backgroundColor:\s+colors\.gold,/.test(s));
  assert.ok(!/variant="gold"|goldDeep/.test(s));
});

test('every state is a word plus an icon, never colour alone', () => {
  const s = code(SCREEN);
  assert.ok(/<Ionicons name=\{STATE_ICON\[segment\]\}[\s\S]{0,120}\{label\}/.test(s));
  assert.ok(/waiting:\s+'time-outline'/.test(s) && /sent_back: 'arrow-undo-outline'/.test(s) && /done:\s+'checkmark-circle-outline'/.test(s));
  for (const r of Object.values(buildAdultTasksModel(MIXED).rows).flat()) assert.ok(r.stateLabel.length > 0);
});

test('no child wallet data or ranking', () => {
  for (const f of [SCREEN, MODEL]) {
    assert.ok(!/pointsBalances|selectPointsBalances|selectMyPointsBalance|balance|wallet|computeMyPointsSummary/i.test(code(f)), f);
    assert.ok(!/\brank|leader|winner/i.test(code(f)), f);
  }
});

test('no Edit, Archive, Delete or fake features', () => {
  for (const f of [SCREEN, MODEL]) {
    const s = code(f);
    assert.ok(!/\b(Edit|Archive|Delete|kebab|ellipsis-vertical|more-vert)\b/.test(s), f);
    assert.ok(!/\b(category|difficulty|XP|streak|badge|achievement|analytics|leaderboard)\b/i.test(s), f);
    assert.ok(!/familyToday|selectFamilyToday|celebrat|confetti/i.test(s), f);
  }
  assert.ok(!/\b(Edit|Archive|Delete)\b/.test(TASKS_STRINGS));
});

test('adult design: flat hairline card, adult ground, 48dp controls, Rubik via the adult type layer', () => {
  const s = code(SCREEN);
  assert.ok(/<Card density="adult"/.test(s));
  assert.ok(!/density="child"|depth\.|shadows\.|elevation|shadowOffset|MissionArt|ILLUSTRATION/.test(s));
  assert.ok(/backgroundColor:\s+colors\.adultGround/.test(s));
  assert.ok(/borderTopColor: colors\.border/.test(s));
  assert.ok(/import \{ useAdultText, useBoldCaption \} from '@\/screens\/AdultHomeScreen'/.test(s));
  assert.ok(/actionButton: \{[\s\S]*?minHeight:\s+sizes\.adultButton/.test(s));
  assert.ok(/newButton: \{\s+minHeight:\s+sizes\.adultButton/.test(s));
  assert.ok(/segment: \{[\s\S]*?minHeight:\s+sizes\.tapTarget/.test(s));
  assert.ok(/accessibilityRole="tab"/.test(s) && /accessibilityState=\{\{ selected: on \}\}/.test(s));
  assert.ok(!/numberOfLines/.test(s), 'titles wrap, never truncate');
});

test('layout: segments 2×2 on phones (text never shrunk), one row from 440dp; actions full width at 130%', () => {
  for (const w of [360, 390, 412]) assert.equal(segmentsInGrid(w, 1), true, String(w));
  assert.equal(segmentsInGrid(390, 1.3), true);
  assert.equal(segmentsInGrid(600, 1), false);
  assert.equal(actionFullWidth(360, 1), false);
  assert.equal(actionFullWidth(360, 1.3), true);
  assert.equal(actionFullWidth(390, 1.3), true);
});

test('the copy block holds no fake example values', () => {
  assert.ok(!/\b(Maya|Noam|Eli|Biscuit|Math homework|Fold laundry|4:12)\b/.test(TASKS_COPY));
});
