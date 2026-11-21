// Slice 5C: Child Mission Details (Board 19), the child Submit Evidence
// screen (Board 20) and the Child Home claim CTA touch target. Real fields
// only, the five states, open-to-anyone claim, privacy, the route above the
// tabs, reuse of the existing completion / evidence flow, and 48dp targets.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';

import { buildMissionDetailsModel, type MissionDetailsInput } from '@/features/childMissions/missionDetailsModel';
import { evidenceGridLayout, MIN_EVIDENCE_TILE } from '@/features/tasks/components/childEvidenceLayout';
import { beginCompletionSubmit, finishCompletionSubmit } from '@/features/tasks/components/taskCompletionSubmitFlow';
import {
  INITIAL_UI_STATE,
  MAX_EVIDENCE_PHOTOS,
  canAddPhotos,
  canSubmit,
  onPhotoRemovedAt,
  onPhotoReplacedAt,
  onPhotosAdded,
  onSubmitProgress,
  type SelectedPhoto,
} from '@/features/tasks/components/taskCompletionUiState';
import { STACK_ROUTES, isRouteAvailable } from '@/navigation/roleShell';
import { sizes } from '@/theme';
import type { Task, TaskSubmissionSummary } from '@/types';
import type { TaskCompletionSubmissionRow } from '@/types/supabase';

const SRC = new URL('../../', import.meta.url);
const code = (rel: string) => readFileSync(new URL(rel, SRC), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const DETAILS  = 'screens/ChildMissionDetailsScreen.tsx';
const MODEL    = 'features/childMissions/missionDetailsModel.ts';
const EVIDENCE = 'features/tasks/components/ChildSubmitEvidence.tsx';
const SHEET    = 'features/tasks/components/TaskCompletionModal.tsx';
const MISSIONS = 'screens/ChildMissionsScreen.tsx';
const COPY     = readFileSync(new URL('content/copy.ts', SRC), 'utf8');
const NEW_COPY = COPY.slice(COPY.indexOf('// Slice 5C: Child Mission Details'), COPY.indexOf('// Slice 4 role-based navigation.'));

const TZ   = 'Asia/Jerusalem';
const KID  = 'kid-1';
const SIB  = 'kid-2';
const MOM  = 'mom-1';
const NOW  = new Date('2026-11-13T12:00:00Z');
const YESTERDAY = '2026-11-12T00:00:00.000Z';

const task = (id: string, over: Partial<Task> = {}): Task =>
  ({ id, title: `Title ${id}`, status: 'open', assigneeId: KID, createdById: MOM, points: 20, ...over });
const sub = (taskId: string, status: TaskSubmissionSummary['status'], over: Partial<TaskSubmissionSummary> = {}): TaskSubmissionSummary =>
  ({ id: `s-${taskId}`, taskId, status, submittedByProfileId: KID, submittedAt: '2026-11-13T10:12:00Z', photoCount: 0, ...over });
const input = (taskId: string, over: Partial<MissionDetailsInput> = {}): MissionDetailsInput => ({
  taskId, tasks: [], taskSubmissions: [], childId: KID, now: NOW, timeZone: TZ,
  members: [{ userId: MOM, name: 'Dana' }, { userId: KID, name: 'Maya' }, { userId: SIB, name: 'Noa' }],
  ...over,
});
const details = (taskId: string, over: Partial<MissionDetailsInput> = {}) => {
  const m = buildMissionDetailsModel(input(taskId, over));
  assert.equal(m.kind, 'mission', `${taskId} should be visible`);
  return m as Extract<typeof m, { kind: 'mission' }>;
};
const photo = (n: number): SelectedPhoto => ({ previewUri: `file:///p-${n}.jpg`, mimeType: 'image/jpeg', source: n % 2 ? 'camera' : 'gallery' });
const ids = () => { let n = 0; return () => `id-${++n}`; };

// ── Mission Details: real fields only ───────────────────────────────────────

test('real fields only: title, description, Points, due, asked by, state, action', () => {
  const m = details('t1', { tasks: [task('t1', { description: '  Toys in the box.  ', dueAt: '2026-11-13T16:00:00.000Z', dueAtHasTime: true })] });
  assert.deepEqual(Object.keys(m).sort(), ['action', 'askedBy', 'description', 'dueLabel', 'kind', 'photoCount', 'points', 'sentLabel', 'state', 'task', 'title']);
  assert.equal(m.title, 'Title t1');
  assert.equal(m.description, 'Toys in the box.');
  assert.equal(m.points, 20);
  assert.ok(m.dueLabel && m.dueLabel.includes('·'), 'date and time');
  assert.equal(m.askedBy, 'Dana', 'the task creator, by member name');
  // Absent fields stay absent, never invented.
  const bare = details('t2', { tasks: [task('t2', { description: '   ', points: 0, createdById: undefined })] });
  assert.equal(bare.description, null);
  assert.equal(bare.points, null);
  assert.equal(bare.dueLabel, null);
  assert.equal(bare.askedBy, null);
});

test('no fake systems: no XP, level, streak, badge, category, difficulty, progress or reviewer note', () => {
  const banned = /\bxp\b|\blevel|streak|badge|achievement|category|difficulty|progressMetric|reviewerNote|reviewNote|adventure/i;
  for (const f of [MODEL, DETAILS, EVIDENCE]) assert.ok(!banned.test(code(f)), f);
  assert.ok(!banned.test(NEW_COPY));
  // The sent-back banner names nobody and quotes no reviewer.
  assert.ok(NEW_COPY.includes("sentBackBanner: 'A grown-up asked for one more try. You can send it again.',"));
});

// ── States ──────────────────────────────────────────────────────────────────

test('ready: "I did it!" (complete); overdue keeps the same action, warning state', () => {
  const ready = details('r', { tasks: [task('r')] });
  assert.equal(ready.state, 'ready');
  assert.equal(ready.action, 'complete');
  const late = details('o', { tasks: [task('o', { dueAt: YESTERDAY, dueAtHasTime: false })] });
  assert.equal(late.state, 'overdue');
  assert.equal(late.action, 'complete');
  const s = code(DETAILS);
  assert.ok(s.includes('complete: copy.childHome.ctaComplete,'));
  assert.ok(COPY.includes("ctaComplete:      'I did it!',"));
});

test('sent back: indigo and encouraging, "Try again", never red', () => {
  const m = details('sb', { tasks: [task('sb')], taskSubmissions: [sub('sb', 'rejected')] });
  assert.equal(m.state, 'sent_back');
  assert.equal(m.action, 'retry');
  const s = code(DETAILS);
  assert.ok(s.includes('retry:    copy.childHome.ctaRetry,'));
  assert.ok(s.includes('sent_back:      copy.childMissions.giveItAnotherGo,'));
  assert.ok(/bannerIndigo:\s*\{[^}]*colors\.indigo/.test(s));
  assert.ok(!/colors\.(danger|error|errorSoft|dangerSoft)\b/.test(s), 'no red on Mission Details');
});

test('waiting: calm amber, no completion CTA; the action opens the pending flow', () => {
  const m = details('w', {
    tasks: [task('w', { status: 'needs_attention' })],
    taskSubmissions: [sub('w', 'pending', { photoCount: 3 })],
  });
  assert.equal(m.state, 'waiting');
  assert.equal(m.action, 'manage');
  assert.equal(m.photoCount, 3);
  assert.ok(m.sentLabel && m.sentLabel.includes('·'), 'send time from the pending submission');
  const s = code(DETAILS);
  assert.ok(s.includes('manage:   copy.childMissions.changePhotos,'));
  assert.ok(s.includes("if (mission.action === 'manage') {\n      setPendingTarget({ id: task.id, householdId: household.id, title: task.title });"));
  assert.ok(/bannerAmber:\s*\{ backgroundColor: colors\.waitingSoft \}/.test(s));
  assert.ok(!/cancelCompletion|withdraw|take it back/i.test(s), 'Cancel completion stays inside the pending sheet');
});

test('done: quiet success, no action, no pinned bar, no celebration', () => {
  const m = details('d', { tasks: [task('d', { status: 'completed', completedAt: '2026-11-13T09:00:00Z' })] });
  assert.equal(m.state, 'done');
  assert.equal(m.action, null);
  const s = code(DETAILS);
  assert.ok(s.includes('{mission && mission.action ? ('), 'the bar renders only with an action');
  assert.ok(!/confetti|celebrat|Animated|LayoutAnimation|appSounds\.play\('completion_(approved|done)/.test(s));
});

test('open to anyone: "I\'ll do this" through the existing claim; after the claim the same id reads as To do', () => {
  const open = task('oa', { assigneeId: undefined });
  const before = details('oa', { tasks: [open] });
  assert.equal(before.state, 'open_to_anyone');
  assert.equal(before.action, 'claim');
  // The store updates after the claim; the screen re-reads by id.
  const after = details('oa', { tasks: [{ ...open, assigneeId: KID }] });
  assert.equal(after.state, 'ready');
  assert.equal(after.action, 'complete');
  const s = code(DETAILS);
  assert.ok(s.includes('claimOpenTask({ taskId: task.id, householdId: household.id, profileId: user.id, role })'));
  assert.ok(s.includes('claim:    copy.childHome.ctaClaim,'));
});

test('privacy: a sibling\'s task, a claimed task and an unknown id are all "missing"', () => {
  assert.equal(buildMissionDetailsModel(input('x', { tasks: [task('x', { assigneeId: SIB })] })).kind, 'missing');
  assert.equal(buildMissionDetailsModel(input('x', { tasks: [task('x', { assigneeId: SIB, status: 'needs_attention' })], taskSubmissions: [sub('x', 'pending', { submittedByProfileId: SIB })] })).kind, 'missing');
  assert.equal(buildMissionDetailsModel(input('x', { tasks: [task('x', { assigneeId: undefined, status: 'completed' })] })).kind, 'missing');
  assert.equal(buildMissionDetailsModel(input('nope', { tasks: [task('x')] })).kind, 'missing');
  assert.equal(buildMissionDetailsModel(input('x', { tasks: [task('x')], childId: '' })).kind, 'missing');
  // Another task's submission never leaks into this one.
  const m = details('mine', { tasks: [task('mine'), task('other', { assigneeId: SIB })], taskSubmissions: [sub('other', 'rejected')] });
  assert.equal(m.state, 'ready');
});

// ── Route ───────────────────────────────────────────────────────────────────

test('route: MissionDetails is a child-only root-stack route, above the tabs (no tab bar)', () => {
  assert.deepEqual([...STACK_ROUTES.child], ['MissionDetails']);
  assert.equal(isRouteAvailable('child', 'MissionDetails'), true);
  assert.equal(isRouteAvailable('adult', 'MissionDetails'), false);
  const shell = code('navigation/AppTabs.tsx');
  assert.ok(!/<ChildTab\.Screen name="MissionDetails"/.test(shell), 'not a tab');
  assert.ok(shell.includes('<Stack.Screen name="MissionDetails" component={MissionDetailsRoute} />'));
  // The root stack holds the tab navigator as one screen, so a pushed
  // stack screen covers the tab bar.
  assert.ok(shell.includes("<Stack.Screen name=\"Tabs\" component={shell === 'adult' ? AdultTabs : ChildTabs} />"));
  assert.ok(shell.includes('return <ChildMissionDetailsScreen taskId={route.params.taskId} onBack={() => navigation.goBack()} />;'));
  assert.ok(code('navigation/types.ts').includes('MissionDetails: { taskId: string };'), 'only a stable id travels in the route');
});

test('the detail screen reads current state from the store by id and never navigates by itself', () => {
  const s = code(DETAILS);
  assert.ok(s.includes('buildMissionDetailsModel({'));
  assert.ok(s.includes('useAppStore(selectTasks)') && s.includes('useAppStore((s) => s.taskSubmissions)'));
  assert.ok(!/useNavigation|navigation\.navigate|navigate\(/.test(s));
  assert.ok(!/from '@\/lib\/repositories|from '@\/services\/supabase|supabase\./.test(s + code(MODEL)));
  // Safe area, native-feeling back with a 48dp target, pinned action.
  assert.ok(s.includes("edges={['top', 'left', 'right', 'bottom']}"));
  assert.match(s, /back: \{\s*width:\s*sizes\.tapTarget,\s*height:\s*sizes\.tapTarget,/);
  assert.ok(s.includes('accessibilityLabel={copy.missionDetails.back}'));
});

test('Child Missions opens details from the card body; buttons keep their direct action', () => {
  const s = code(MISSIONS);
  assert.ok(s.includes('const openFor = (taskId: string) => (onOpenMission ? () => onOpenMission(taskId) : undefined);'));
  assert.equal([...s.matchAll(/onOpen=\{openFor\(/g)].length, 5, 'first, rows, waiting and both done lists');
  assert.ok(s.includes('onPress={() => onAction(mission)}'), 'CTA buttons still act directly');
  assert.match(s, /openArea: \{ minHeight: sizes\.tapTarget/);
});

// ── Evidence: the existing flow, restyled ───────────────────────────────────

test('evidence 0 photos: submit with no photo is allowed (existing rule)', () => {
  assert.equal(canSubmit(INITIAL_UI_STATE), true);
  const working = beginCompletionSubmit(INITIAL_UI_STATE, ids());
  assert.equal(working.phase, 'submitting');
  assert.equal(working.attempt?.photos.length, 0);
  assert.ok(NEW_COPY.includes("hint:             'Add up to {max} photos. You can also send without photos.',"));
});

test('evidence 1 and 5 photos; a sixth is never added; add tiles hide at 5', () => {
  const one = onPhotosAdded(INITIAL_UI_STATE, [photo(1)], ids());
  assert.equal(one.photos.length, 1);
  assert.equal(canAddPhotos(one), true);
  const five = onPhotosAdded(one, [photo(2), photo(3), photo(4), photo(5)], ids());
  assert.equal(five.photos.length, MAX_EVIDENCE_PHOTOS);
  assert.equal(canAddPhotos(five), false);
  assert.equal(canSubmit(five), true);
  const six = onPhotosAdded(five, [photo(6)], ids());
  assert.equal(six.photos.length, 5);
  assert.equal(six.error?.kind, 'too_many_photos');
  const s = code(EVIDENCE);
  assert.ok(s.includes('{addEnabled ? ('), 'add tiles only while photos can be added');
  assert.ok(s.includes('{atMax && !editDisabled ? ('));
});

test('evidence remove / change: a fresh attempt for the new set (existing transitions)', () => {
  const two = onPhotosAdded(INITIAL_UI_STATE, [photo(1), photo(2)], ids());
  const removed = onPhotoRemovedAt(two, 0, ids());
  assert.deepEqual(removed.photos.map((p) => p.previewUri), ['file:///p-2.jpg']);
  const changed = onPhotoReplacedAt(two, 1, photo(9), ids());
  assert.deepEqual(changed.photos.map((p) => p.previewUri), ['file:///p-1.jpg', 'file:///p-9.jpg']);
  const s = code(EVIDENCE);
  assert.ok(s.includes('onPress={() => onRemove(i)}'));
  assert.ok(s.includes('onPress={closeSheetThen(onCamera)}') && s.includes('onPress={closeSheetThen(onGallery)}') && s.includes('onPress={closeSheetThen(onRemove)}'));
});

test('evidence Camera and Gallery reach the existing pickers', () => {
  const s = code(EVIDENCE);
  assert.ok(s.includes('onPress={() => onCamera(null)}') && s.includes('onPress={() => onGallery(null)}'));
  const sheet = code(SHEET);
  assert.ok(sheet.includes('onCamera={(i) => { void pickFromCamera(i); }}'));
  assert.ok(sheet.includes('onGallery={(i) => { void pickFromGallery(i); }}'));
  assert.ok(sheet.includes('onRemove={removeAt}') && sheet.includes('onSubmit={() => { void handleSubmit(); }}'));
});

test('evidence submit with photos and sending state go through the existing sequence', async () => {
  const state = onPhotosAdded(INITIAL_UI_STATE, [photo(1), photo(2)], ids());
  const working = beginCompletionSubmit(state, ids());
  assert.equal(working.phase, 'submitting');
  const progressed = onSubmitProgress(working, { current: 1, total: 2 } as never);
  assert.deepEqual(progressed.progress, { current: 1, total: 2 });
  const submission = { id: 'sub-1' } as TaskCompletionSubmissionRow;
  const seen: number[] = [];
  const outcome = await finishCompletionSubmit(working, { id: 't', householdId: 'h' }, {
    submit: async (attempt) => { seen.push(attempt.photos.length); return { ok: true, submission }; },
  });
  assert.deepEqual(seen, [2]);
  assert.equal(outcome.completed, true);
  assert.equal(outcome.submission, submission);
  // Sending: controls dimmed, status in words, Send busy; back disabled.
  const s = code(EVIDENCE);
  assert.ok(s.includes('isSubmitting && styles.sending'));
  assert.ok(s.includes('copy.childEvidence.sendingPhotos'));
  assert.ok(s.includes('busy={isSubmitting}'));
  assert.ok(s.includes('disabled={isSubmitting}'));
});

test('existing flow reused: one submit path; "Sent!" only after a confirmed submission', () => {
  const sheet = code(SHEET);
  assert.ok(sheet.includes("if (outcome.completed && variant === 'child') setSentTask(task);"));
  assert.ok(/if \(outcome\.completed\) onCompleted\(outcome\.submission\);/.test(sheet));
  assert.equal([...sheet.matchAll(/finishCompletionSubmit\(/g)].length, 1);
  assert.ok(sheet.includes("variant = 'sheet'"), 'adults keep the existing sheet by default');
  // Only the child screens opt in; adult screens are unchanged.
  for (const f of ['screens/ChildHomeScreen.tsx', 'screens/ChildMissionsScreen.tsx', DETAILS]) assert.ok(code(f).includes('variant="child"'), f);
  for (const f of ['screens/TodayScreen.tsx', 'screens/MyTasksScreen.tsx']) assert.ok(!code(f).includes('variant="child"'), f);
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

test('Slice 5C.1: Child Home opens the same child Submit Evidence as Missions / Details', () => {
  const childScreens = ['screens/ChildHomeScreen.tsx', 'screens/ChildMissionsScreen.tsx', DETAILS];
  for (const f of childScreens) {
    const s = code(f);
    // Exactly one completion flow per screen, always the child variant with
    // the shared mission card; no screen renders the evidence UI itself.
    assert.equal([...s.matchAll(/<TaskCompletionModal\b/g)].length, 1, f);
    assert.ok(/<TaskCompletionModal\s+variant="child"/.test(s), f);
    assert.ok(s.includes('missionCard={') && s.includes('<EvidenceMissionCard'), f);
    assert.ok(!/ChildSubmitEvidence|expo-image-picker|finishCompletionSubmit|beginCompletionSubmit/.test(s), f);
  }
  // One mission card implementation, owned by the Child Home (no require cycle).
  const owners = ['screens/ChildHomeScreen.tsx', 'screens/ChildMissionsScreen.tsx', DETAILS]
    .filter((f) => code(f).includes('export function EvidenceMissionCard'));
  assert.deepEqual(owners, ['screens/ChildHomeScreen.tsx']);
  assert.ok(!code('screens/ChildHomeScreen.tsx').includes("from '@/screens/ChildMissionDetailsScreen'"));
  // The child evidence surface is rendered only by TaskCompletionModal.
  const users = [...uiFiles('screens/'), ...uiFiles('features/'), ...uiFiles('navigation/')]
    .filter((f) => f !== EVIDENCE && /<ChildSubmitEvidence\b/.test(code(f)));
  assert.deepEqual(users, [SHEET]);
  // Pending flow unchanged: Change photos still reopens through the same modal.
  const home = code('screens/ChildHomeScreen.tsx');
  assert.ok(home.includes('<PendingCompletionModal'));
  assert.ok(home.includes('setCompletionNotice(copy.completionSheet.resendNotice);'));
});

test('secure evidence path untouched: the child view never picks, uploads, or sees storage', () => {
  const s = code(EVIDENCE);
  assert.ok(!/expo-image-picker|ImagePicker|supabase|storage|signedUrl|createSignedUrl|getPublicUrl|photoStoragePath|photo_storage_path|fetch\(/i.test(s));
  for (const f of [DETAILS, MODEL]) {
    assert.ok(!/signedUrl|createSignedUrl|getPublicUrl|photoStoragePath|photo_storage_path|\.storage\b/.test(code(f)), f);
  }
});

// ── Responsive ──────────────────────────────────────────────────────────────

test('photo grid: 3 per row fits at 360 / 390 / 412 with 16dp gutters; tiles hold a 48dp target', () => {
  for (const w of [360, 390, 412]) {
    const { tile, gap } = evidenceGridLayout(w, 16, 8);
    assert.ok(tile * 3 + gap * 2 <= w - 32, `${w}: no horizontal overflow`);
    assert.ok(tile >= MIN_EVIDENCE_TILE && tile >= sizes.tapTarget, `${w}`);
  }
  assert.equal(evidenceGridLayout(Number.NaN, 16, 8).tile, MIN_EVIDENCE_TILE);
});

// ── Accessibility ───────────────────────────────────────────────────────────

test('Child Home "I\'ll do this": compact + child density never drops below 48dp', () => {
  assert.equal(sizes.tapTarget, 48);
  const btn = code('components/ui/AppButton.tsx');
  assert.ok(btn.includes('compact && (density ? styles.compactDense : styles.compact),'));
  assert.match(btn, /compactDense: \{\s*minHeight:\s*sizes\.tapTarget,/);
  // Legacy compact (no density) is unchanged everywhere else.
  assert.match(btn, /compact: \{\s*minHeight:\s*40,/);
  // The Child Home claim is the only compact + density button: the fix
  // changes no other control.
  const home = code('screens/ChildHomeScreen.tsx');
  assert.ok(home.includes('<AppButton label={copy.childHome.ctaClaim} variant="secondary" density="child" compact busy={busy} onPress={() => onAction(mission)} />'));
  for (const f of ['screens/ChildMissionsScreen.tsx', DETAILS, EVIDENCE, 'screens/TodayScreen.tsx', 'screens/SettingsScreen.tsx', 'screens/TasksScreen.tsx']) {
    assert.ok(!/density="(child|adult)"[^>]*\bcompact\b|\bcompact\b[^>]*density="(child|adult)"/.test(code(f)), f);
  }
});

test('evidence controls are 48dp targets around smaller visible marks', () => {
  const s = code(EVIDENCE);
  assert.match(s, /removeHit: \{[\s\S]*?width:\s*sizes\.tapTarget,\s*height:\s*sizes\.tapTarget,/);
  assert.match(s, /removeMark: \{\s*width:\s*28,/);
  assert.match(s, /back: \{\s*width:\s*sizes\.tapTarget,\s*height:\s*sizes\.tapTarget,/);
  assert.match(s, /tile: \{[\s\S]*?minHeight:\s*sizes\.tapTarget,/);
  assert.ok(s.includes('accessibilityLabel={formatCopy(copy.completionSheet.removePhotoA11y, { i: i + 1 })}'));
  // Remove is never the dominant control: outline, last before Cancel.
  assert.ok(/label=\{copy\.childEvidence\.removePhoto\}[^\n]*variant="dangerOutline"/.test(s));
  assert.ok(!/variant="danger"\s/.test(s));
});

test('Board 20 copy and no gold CTA on the new child surfaces', () => {
  for (const line of [
    "title:            'I did it!',", "submit:           'Send it in',", "sentTitle:        'Sent!',",
    "photoCount:       '{n} of {max}',", "maxReached:       'That is the maximum, {max} photos. Remove one to add another.',",
  ]) assert.ok(NEW_COPY.includes(line), line);
  for (const f of [DETAILS, EVIDENCE]) {
    const s = code(f);
    assert.ok(!s.includes('variant="gold"'), f);
    assert.ok(!/colors\.(gold|goldDeep|onGold)\b|depth\.goldButton/.test(s), `${f}: gold only via the shared PointsPill`);
  }
});
