// Slice 5B: Child Missions (Board 03). Structure (To Do / Waiting / Done),
// state semantics, the locked Waiting copy and card action, child privacy,
// reuse of the existing flows, gold semantics and the banned fake systems.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  buildChildMissionsModel,
  defaultMissionsSection,
  MISSIONS_SECTIONS,
  TONE_FOR_STATE,
  type ChildMissionsInput,
} from '@/features/childMissions/childMissionsModel';
import { selectNextMission } from '@/features/tasks/nextMission';
import { latestSubmissionByTask } from '@/features/tasks/taskListSections';
import type { Task, TaskSubmissionSummary } from '@/types';

const SRC = new URL('../../', import.meta.url);
const code = (rel: string) => readFileSync(new URL(rel, SRC), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const SCREEN = 'screens/ChildMissionsScreen.tsx';
const MODEL  = 'features/childMissions/childMissionsModel.ts';
const COPY   = readFileSync(new URL('content/copy.ts', SRC), 'utf8');
// Slice 5C added the Mission Details / child evidence blocks after this
// one; they have their own copy checks (missionDetails.test.ts).
const MISSIONS_COPY = COPY.slice(COPY.indexOf('childMissions: {'), COPY.indexOf('// Slice 5C: Child Mission Details'));

const TZ  = 'Asia/Jerusalem';
const KID = 'kid-1';
const SIB = 'kid-2';
const NOW = new Date('2026-11-13T12:00:00Z');   // 14:00 in IL, 13 Nov
const TODAY = '2026-11-13T00:00:00.000Z';
const YESTERDAY = '2026-11-12T00:00:00.000Z';

const task = (id: string, over: Partial<Task> = {}): Task => ({ id, title: `Title ${id}`, status: 'open', assigneeId: KID, ...over });
const sub = (taskId: string, status: TaskSubmissionSummary['status'], over: Partial<TaskSubmissionSummary> = {}): TaskSubmissionSummary =>
  ({ id: `s-${taskId}`, taskId, status, submittedByProfileId: KID, submittedAt: '2026-11-13T10:00:00Z', photoCount: 0, ...over });
const input = (over: Partial<ChildMissionsInput> = {}): ChildMissionsInput =>
  ({ tasks: [], taskSubmissions: [], childId: KID, now: NOW, timeZone: TZ, ...over });
const ids = (rows: readonly { task: Task }[]) => rows.map((r) => r.task.id);

// ── Structure ───────────────────────────────────────────────────────────────

test('three sections in Board 03 order: To Do, Waiting, Done', () => {
  assert.deepEqual([...MISSIONS_SECTIONS], ['todo', 'waiting', 'done']);
  const s = code(SCREEN);
  assert.ok(s.includes('todo:    copy.childMissions.sectionTodo,'));
  assert.ok(s.includes('waiting: copy.childMissions.sectionWaiting,'));
  assert.ok(s.includes('done:    copy.childMissions.sectionDone,'));
  assert.ok(MISSIONS_COPY.includes("sectionTodo:      'To Do',"));
  assert.ok(MISSIONS_COPY.includes("sectionWaiting:   'Waiting',"));
  assert.ok(MISSIONS_COPY.includes("sectionDone:      'Done',"));
  // Tabs are accessible tabs with a selected state and a 48dp target.
  assert.ok(s.includes('accessibilityRole="tablist"') && s.includes('accessibilityRole="tab"'));
  assert.ok(s.includes('accessibilityState={{ selected: on }}'));
  assert.match(s, /tab: \{[\s\S]*?minHeight:\s*sizes\.tapTarget,/);
});

test('each task lands in exactly one section by its real state', () => {
  const tasks = [
    task('ready', { dueAt: TODAY }),
    task('late', { dueAt: YESTERDAY }),
    task('back'),
    task('wait', { status: 'needs_attention' }),
    task('done', { status: 'completed', completedAt: '2026-11-13T09:00:00Z' }),
    task('old', { status: 'completed', completedAt: '2026-11-10T09:00:00Z' }),
    task('anyone', { assigneeId: undefined }),
  ];
  const subs = [sub('back', 'rejected'), sub('wait', 'pending', { photoCount: 3 })];
  const m = buildChildMissionsModel(input({ tasks, taskSubmissions: subs }));
  const todoIds = [...(m.first ? [m.first.task.id] : []), ...ids(m.todo)];
  assert.deepEqual(todoIds.sort(), ['anyone', 'back', 'late', 'ready']);
  assert.deepEqual(ids(m.waiting), ['wait']);
  assert.equal(m.waiting[0].photoCount, 3);
  assert.deepEqual(ids(m.doneToday), ['done']);
  assert.deepEqual(ids(m.doneEarlier), ['old']);
  assert.deepEqual(m.counts, { todo: 4, waiting: 1, done: 2 });
  const byId = new Map([...(m.first ? [m.first] : []), ...m.todo].map((r) => [r.task.id, r]));
  assert.equal(byId.get('back')!.state, 'sent_back');
  assert.equal(byId.get('back')!.action, 'retry');
  assert.equal(byId.get('late')!.state, 'overdue');
  assert.equal(byId.get('ready')!.state, 'ready');
  assert.equal(byId.get('anyone')!.state, 'open_to_anyone');
  assert.equal(byId.get('anyone')!.action, 'claim');
});

test('the weighted first mission is the Child Home next mission (no new priority rule)', () => {
  const tasks = [task('a', { dueAt: TODAY }), task('b', { dueAt: YESTERDAY }), task('c'), task('z', { assigneeId: undefined })];
  const subs = [sub('c', 'rejected')];
  const m = buildChildMissionsModel(input({ tasks, taskSubmissions: subs }));
  const next = selectNextMission({ tasks, latestSubmission: latestSubmissionByTask(subs), childId: KID, now: NOW, timeZone: TZ });
  assert.equal(next.kind, 'mission');
  assert.equal(m.first!.task.id, next.kind === 'mission' ? next.task.id : '');
  assert.equal(m.first!.reason, 'sent_back');
  assert.equal(m.first!.ribbonTone, 'indigo');
  assert.ok(!ids(m.todo).includes(m.first!.task.id), 'never shown twice');
  // The rest keep the existing list order: own tasks, then open-to-anyone.
  assert.deepEqual(ids(m.todo), ['a', 'b', 'z']);
  const s = code(MODEL);
  assert.ok(s.includes('selectNextMission({ tasks, latestSubmission: latest, childId, now, timeZone })'));
  assert.ok(s.includes('childActionFor(task, latest, childId)'), 'row actions use the shared Child Home rule');
  assert.ok(!/\.sort\(/.test(s), 'no new ordering algorithm');
});

test('only waiting work left: the screen opens on Waiting; otherwise To Do', () => {
  const onlyWaiting = buildChildMissionsModel(input({ tasks: [task('w', { status: 'needs_attention' })] }));
  assert.equal(defaultMissionsSection(onlyWaiting), 'waiting');
  assert.equal(onlyWaiting.first, null);
  const mixed = buildChildMissionsModel(input({ tasks: [task('w', { status: 'needs_attention' }), task('t')] }));
  assert.equal(defaultMissionsSection(mixed), 'todo');
  assert.equal(defaultMissionsSection(buildChildMissionsModel(input())), 'todo');
});

// ── State semantics ─────────────────────────────────────────────────────────

test('semantics: sent back indigo (never red), waiting amber, done success, overdue warning', () => {
  assert.equal(TONE_FOR_STATE.sent_back, 'indigo');
  assert.equal(TONE_FOR_STATE.waiting, 'waiting');
  assert.equal(TONE_FOR_STATE.done, 'success');
  assert.equal(TONE_FOR_STATE.overdue, 'warning');
  assert.notEqual(TONE_FOR_STATE.overdue, 'success');

  const s = code(SCREEN);
  // Sent back: "Give it another go" in indigo, "Try again" as the indigo primary button.
  assert.match(s, /name="refresh" size=\{16\} color=\{colors\.indigoDeep\}[\s\S]*?styles\.indigoDeepText[\s\S]*?copy\.childMissions\.giveItAnotherGo/);
  assert.ok(s.includes("variant={mission.action === 'retry' ? 'primary' : 'secondary'}"));
  assert.ok(MISSIONS_COPY.includes("giveItAnotherGo:  'Give it another go',"));
  assert.ok(!/colors\.(danger|error|dangerSoft|errorSoft)|variant="danger|'danger'|dangerOutline/.test(s), 'no red / destructive styling on this screen');
  // Waiting: calm amber.
  assert.match(s, /waitingBanner: \{[\s\S]*?backgroundColor: colors\.waitingSoft,/);
  assert.match(s, /waitingText:\s*\{ color: colors\.waiting \}/);
  // Done: quiet success (tick tile and success text), no celebration.
  assert.match(s, /doneTile: \{[\s\S]*?backgroundColor: colors\.successSoft,/);
  assert.match(s, /successText:\s*\{ color: colors\.success \}/);
  assert.ok(!/Animated|LottieView|confetti|celebrat/i.test(s), 'no animation or celebration replay');
  assert.deepEqual([...s.matchAll(/appSounds\.play\(/g)].length, 1, 'the only sound is the existing completion submit');
  // Overdue: amber icon + word, never success.
  assert.ok(s.includes('<Ionicons name="alarm-outline" size={16} color={colors.warning} />'));
  assert.match(s, /ribbonOverdue:\s*\{ backgroundColor: colors\.warning \}/);
});

test('every state has an icon and a word, never colour alone', () => {
  const s = code(SCREEN);
  for (const [icon, word] of [
    ['refresh', 'copy.childMissions.giveItAnotherGo'],
    ['alarm-outline', 'copy.childMissions.overdue'],
    ['people-outline', 'copy.childMissions.openToAnyone'],
    ['time-outline', 'copy.childMissions.waitingTitle'],
    ['checkmark', 'copy.childMissions.sectionDone'],
  ]) {
    assert.ok(s.includes(`name="${icon}"`), icon);
    assert.ok(s.includes(word), word);
  }
});

// ── Waiting: locked copy and the one card action ────────────────────────────

test('Waiting: exact locked copy, and the card exposes Change photos only', () => {
  assert.ok(MISSIONS_COPY.includes("waitingNote:      'You can still change your photos before a grown-up checks it.',"));
  assert.ok(MISSIONS_COPY.includes("changePhotos:     'Change photos',"));
  const s = code(SCREEN);
  assert.ok(s.includes('{copy.childMissions.waitingNote}'));
  const card = s.slice(s.indexOf('function WaitingCard('), s.indexOf('function DoneRow('));
  assert.ok(card.includes('label={copy.childMissions.changePhotos}'));
  assert.equal([...card.matchAll(/<AppButton|<Pressable/g)].length, 1, 'one action on the Waiting card');
  assert.ok(card.includes('onPress={() => onChangePhotos(mission)}'));
  // Change photos opens the existing pending sheet (which keeps Cancel completion inside).
  assert.ok(s.includes('setPendingTarget({ id: mission.task.id, householdId: household.id, title: mission.task.title });'));
  // Never a take-back / cancel / withdraw button on the screen itself.
  assert.ok(!/take it back|takeItBack|cancelCompletion|withdraw/i.test(s));
  assert.ok(!/take it back|cancel|withdraw/i.test(MISSIONS_COPY));
});

// ── Privacy ─────────────────────────────────────────────────────────────────

test('privacy: no sibling task, pending submission or needs-attention state ever appears', () => {
  const tasks = [
    task('mine'),
    task('sib-open', { assigneeId: SIB }),
    task('sib-wait', { assigneeId: SIB, status: 'needs_attention' }),
    task('sib-back', { assigneeId: SIB }),
    task('sib-done', { assigneeId: SIB, status: 'completed', completedAt: '2026-11-13T09:00:00Z' }),
    task('sib-claimed', { assigneeId: SIB, status: 'in_progress' }),
  ];
  const subs = [
    sub('sib-wait', 'pending', { submittedByProfileId: SIB, photoCount: 2 }),
    sub('sib-back', 'rejected', { submittedByProfileId: SIB }),
  ];
  const m = buildChildMissionsModel(input({ tasks, taskSubmissions: subs }));
  const all = [...(m.first ? [m.first] : []), ...m.todo, ...m.waiting, ...m.doneToday, ...m.doneEarlier].map((r) => r.task.id);
  assert.deepEqual(all, ['mine']);
  assert.deepEqual(m.counts, { todo: 1, waiting: 0, done: 0 });
  // A submission is only read for the child's own tasks.
  assert.ok(code(MODEL).includes('latestSubmissionByTask(taskSubmissions.filter((s) => ownIds.has(s.taskId)))'));
  // No child id: nothing is shown as the child's own.
  const none = buildChildMissionsModel(input({ tasks: [task('x', { assigneeId: '' })], childId: '' }));
  assert.equal(none.counts.waiting + none.counts.done, 0);
});

test('open-to-anyone: only unclaimed open tasks (the existing rule), never a claimed one', () => {
  const tasks = [
    task('free', { assigneeId: undefined }),
    task('free-done', { assigneeId: undefined, status: 'completed' }),
    task('free-wait', { assigneeId: undefined, status: 'needs_attention' }),
  ];
  const m = buildChildMissionsModel(input({ tasks }));
  assert.deepEqual([...(m.first ? [m.first] : []), ...m.todo].map((r) => r.task.id), ['free']);
  assert.ok(code(MODEL).includes('getUnassignedTasks([...tasks])'));
});

// ── Business-flow reuse ─────────────────────────────────────────────────────

test('every action reuses the existing flow; no duplicated business logic', () => {
  const s = code(SCREEN);
  assert.ok(s.includes("import { PendingCompletionModal, type PendingCompletionModalTask } from '@/features/tasks/components/PendingCompletionModal';"));
  assert.ok(s.includes("import { TaskCompletionModal, type TaskCompletionModalTask } from '@/features/tasks/components/TaskCompletionModal';"));
  assert.ok(s.includes('<TaskCompletionModal') && s.includes('<PendingCompletionModal'));
  assert.ok(s.includes('claimOpenTask({ taskId: task.id, householdId: household.id, profileId: user.id, role })'));
  assert.ok(s.includes('setCompletionTarget({ id: task.id, householdId: household.id, title: task.title });'), 'complete and retry open the completion sheet');
  assert.ok(s.includes('setCompletionNotice(copy.completionSheet.resendNotice);'), 'Change photos → reopen keeps the existing notice');
  assert.ok(s.includes("requestHouseholdRefresh('mutation');"));
  assert.ok(s.includes('const refreshControl = useHouseholdRefreshControl();'));
  // Slice 5C: Mission Details opens through the shell's onOpenMission
  // callback; the screen itself still never navigates.
  assert.ok(!/useNavigation|navigate\(/.test(s), 'the screen never navigates');
  assert.ok(!/from '@\/lib\/repositories|from '@\/services\/supabase|supabase\./.test(s + code(MODEL)));
  // The adult "My Tasks" view keeps its screen.
  assert.ok(code('screens/TasksScreen.tsx').includes('<MyTasksScreen headerAccessory={switcher} />'));
  assert.ok(code('navigation/AppTabs.tsx').includes('<ChildTab.Screen name="Missions" component={ChildMissionsTab}'));
  assert.ok(code('navigation/AppTabs.tsx').includes("return <ChildMissionsScreen onOpenMission={(taskId) => navigation.navigate('MissionDetails', { taskId })} />;"));
});

// ── Gold, illustrations, Rubik ──────────────────────────────────────────────

test('gold only for Points: the header coin and the shared Points pills; no gold CTA', () => {
  const s = code(SCREEN);
  assert.ok(!s.includes('variant="gold"') && !/variant=\{[^}]*'gold'/.test(s));
  const GOLD = /colors\.(gold|goldDeep|onGold)\b|depth\.goldButton/;
  const allowed = [
    /<View style=\{styles\.coinFace\}><Ionicons name="star" size=\{14\} color=\{colors\.goldDeep\} \/><\/View>/,
  ];
  const styleBlock = s.slice(s.indexOf('const styles = StyleSheet.create({'));
  const jsx = s.slice(0, s.indexOf('const styles = StyleSheet.create({'));
  const offenders = jsx.split('\n').filter((l) => GOLD.test(l) && !allowed.some((re) => re.test(l)));
  assert.deepEqual(offenders, []);
  // Gold styles: only the coin and its ink.
  const goldStyles = [...styleBlock.matchAll(/^ {2}(\w+):[^\n]*(?:\n(?! {2}\w+:)[^\n]*)*/gm)]
    .filter((m) => GOLD.test(m[0])).map((m) => /^ {2}(\w+):/.exec(m[0])![1]);
  assert.deepEqual(goldStyles.sort(), ['coin', 'onGoldText']);
  assert.ok(s.includes('styles.onGoldText]}>{availablePoints}'));
  // Mission Points pills reuse the Child Home PointsPill.
  assert.ok(s.includes('<PointsPill points={mission.points} short />'));
});

test('placeholder illustration only (Child Home MissionArt), never guessed from a title', () => {
  const s = code(SCREEN);
  assert.ok(s.includes('<MissionArt kind="mission"'));
  assert.ok(!/title\.(toLowerCase|includes|match)|kind=\{/.test(s));
});

test('child tokens: card 20 via Card density, 56dp buttons, Rubik via useT, font scaling kept', () => {
  const s = code(SCREEN);
  assert.ok(s.includes('<Card density="child"'));
  assert.ok(s.includes('density="child"'));
  assert.ok(!s.includes('compact'), 'no 40dp compact buttons');
  assert.ok(s.includes("t('h1')") && s.includes("t('title')"));
  assert.ok(!/allowFontScaling=\{false\}|maxFontSizeMultiplier/.test(s));
  assert.match(s, /first: \{[\s\S]*?borderColor:\s*colors\.indigo,[\s\S]*?\.\.\.depth\.childButton,/);
  // vc14 safe area carried over.
  assert.ok(s.includes('<View style={[styles.statusScrim, { height: insets.top }]} />'));
  assert.ok(s.includes("const SCREEN_EDGES = ['left', 'right'] as const;"));
});

// ── Banned fake systems ─────────────────────────────────────────────────────

test('no XP, levels, streaks, badges or achievements on Child Missions', () => {
  for (const src of [code(SCREEN), code(MODEL), MISSIONS_COPY]) {
    assert.ok(!/\bXP\b|\blevel|\bstreak|\bbadge|\bachievement|difficulty|categor/i.test(src));
  }
});
