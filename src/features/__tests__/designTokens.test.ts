// Slice 2 — locked design tokens (Board 14) + opt-in primitive variants.
// Main acceptance criterion: existing screens do not change unless a call
// site opts into a new variant. Tokens are imported directly; components
// are checked statically (no RN renderer in the node test runner), the same
// approach as designSystemConsistency.test.ts.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';

import {
  colors, depth, DEPTH_EDGE, DENSITIES, lockedSpacing, radius, shadows, sizes, spacing, typeScale, typography,
} from '@/theme';

const SRC = new URL('../../', import.meta.url);
const read = (rel: string) => readFileSync(new URL(rel, SRC), 'utf8');
const code = (rel: string) => read(rel).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const flat = (s: string) => s.replace(/\s+/g, ' ');

function files(dirRel: string, ext: string[]): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const name of readdirSync(new URL(rel, SRC))) {
      const child = `${rel}${name}`;
      if (statSync(new URL(child, SRC)).isDirectory()) { if (name !== '__tests__') walk(`${child}/`); }
      else if (ext.some((e) => name.endsWith(e))) out.push(child);
    }
  };
  walk(dirRel);
  return out;
}

// ── Tokens ──────────────────────────────────────────────────────────────────

test('locked colour tokens exist with the exact Board 14 values', () => {
  const locked: Record<string, string> = {
    indigo: '#4F46E5', indigoDeep: '#3730A3', indigoTint: '#EEF0FF', gold: '#FFB627',
    success: '#15803D', waiting: '#92520A', waitingSoft: '#FEF3C7', error: '#B91C1C',
    errorSoft: '#FEE2E2', ink: '#0F172A', adultGround: '#F7F8FC',
  };
  for (const [k, v] of Object.entries(locked)) assert.equal((colors as Record<string, string>)[k], v, k);
});

test('no conflicting duplicates: locked tokens agree with the legacy tokens of the same meaning', () => {
  assert.equal(colors.indigo, colors.primary);
  assert.equal(colors.indigoTint, colors.primarySoft);
  assert.equal(colors.error, colors.danger);
  assert.equal(colors.errorSoft, colors.dangerSoft);
  assert.equal(colors.waitingSoft, colors.warningSoft);
  // Every token name is declared once in colors.ts.
  const names = [...read('theme/colors.ts').matchAll(/^\s+(\w+):\s/gm)].map((m) => m[1]);
  assert.deepEqual(names.filter((n, i) => names.indexOf(n) !== i), []);
});

test('legacy colour values are unchanged', () => {
  assert.deepEqual(
    [colors.background, colors.surface, colors.textPrimary, colors.border, colors.borderSoft, colors.primary,
      colors.primaryPressed, colors.warning, colors.danger, colors.surfaceMuted],
    ['#F6F6FA', '#FFFFFF', '#111827', '#E3E5EC', '#EDEEF3', '#4F46E5', '#4338CA', '#B45309', '#B91C1C', '#F1F2F7'],
  );
});

test('locked spacing scale 4/8/12/16/24 is additive; legacy 20 and 32 remain', () => {
  assert.deepEqual(Object.values(lockedSpacing), [4, 8, 12, 16, 24]);
  for (const [k, v] of Object.entries(lockedSpacing)) assert.equal((spacing as Record<string, number>)[k], v, k);
  assert.equal(spacing.xl, 20);
  assert.equal(spacing.xxxl, 32);
});

test('locked radii 10/12/14/20/28 with semantics; legacy radii unchanged', () => {
  assert.deepEqual(
    [radius.chip, radius.field, radius.control, radius.childCard, radius.sheet],
    [10, 12, 14, 20, 28],
  );
  assert.deepEqual([radius.sm, radius.md, radius.lg, radius.xl, radius.pill], [8, 12, 16, 20, 999]);
});

test('locked type scale values; legacy typography unchanged; no font family yet', () => {
  const pairs = Object.fromEntries(Object.entries(typeScale).map(([k, v]) => [k, `${v.fontSize}/${v.lineHeight}`]));
  assert.deepEqual(pairs, {
    display: '26/29', displayChild: '26/29', h1: '22/26', h2: '17/21',
    body: '15/20', title: '15/20', caption: '13/18', overline: '11/14',
  });
  assert.equal(typeScale.displayChild.fontWeight, '800');
  for (const v of Object.values(typeScale)) assert.equal('fontFamily' in v, false);
  assert.deepEqual(typography.body, { fontSize: 16, fontWeight: '400', lineHeight: 24 });
  assert.deepEqual(typography.title, { fontSize: 28, fontWeight: '700', lineHeight: 34 });
});

test('shadow / depth tokens: 4dp edges, sheet intent, legacy card shadow unchanged', () => {
  assert.equal(DEPTH_EDGE, 4);
  assert.deepEqual(depth.childCard, { borderBottomWidth: 4, borderBottomColor: colors.indigoDepth });
  assert.deepEqual(depth.childButton, { borderBottomWidth: 4, borderBottomColor: colors.indigoDeep });
  assert.deepEqual(depth.goldButton, { borderBottomWidth: 4, borderBottomColor: colors.goldDeep });
  assert.equal(colors.indigoDepth, 'rgba(79, 70, 229, 0.14)');
  assert.deepEqual(shadows.sheet.shadowOffset, { width: 0, height: -12 });
  assert.equal(shadows.sheet.shadowOpacity, 0.2);
  assert.deepEqual(shadows.card, {
    shadowColor: '#000000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  });
});

test('minimum dimensions: child button 56, adult button 48, locked field 52, icon touch ≥ 48', () => {
  assert.equal(sizes.childButton, 56);
  assert.equal(sizes.adultButton, 48);
  assert.equal(sizes.lockedField, 52);
  assert.equal(sizes.tapTarget, 48);
  const hitSlop = Number(/hitSlop=\{(\d+)\}/.exec(code('components/ui/IconButton.tsx'))?.[1]);
  assert.ok(sizes.iconButton + 2 * hitSlop >= 48, 'IconButton effective touch area');
});

test('one design system, two intensities', () => {
  assert.deepEqual([...DENSITIES], ['child', 'adult']);
});

// ── Gold + hard-coded colours ───────────────────────────────────────────────

test('gold is theme-driven and only used by Points / reward primitives', () => {
  const gold = /#FFB627|#D4900F/i;
  const offenders = files('', ['.ts', '.tsx']).filter((f) => !f.startsWith('theme/') && gold.test(code(f)));
  assert.deepEqual(offenders, []);
  const users = files('', ['.tsx']).filter((f) => /colors\.gold\b|colors\.goldDeep|depth\.goldButton/.test(code(f)));
  // Slice 5A: the Child Home is the first screen to use gold, for its
  // Points coin, Points pills and the reward card only (see childHome.test.ts).
  // Slice 5B: Child Missions uses gold only for its Points coin (see
  // childMissions.test.ts); its Points pills are the Child Home's PointsPill.
  // Slice 5D: Child Rewards, a gold-semantic area: wallet, coin, reward
  // bubbles, progress toward a reward and "Ask for it" (see childRewards.test.ts).
  // Slice 6B: Adult Tasks, only for each task's real Points pill (see
  // adultTasks.test.ts).
  // Slice 6C: Adult Rewards, only for each reward's real cost pill (see
  // adultRewards.test.ts).
  assert.deepEqual(users.sort(), ['components/ui/AppButton.tsx', 'components/ui/StatusPill.tsx', 'screens/AdultRewardsScreen.tsx', 'screens/AdultTasksScreen.tsx', 'screens/ChildHomeScreen.tsx', 'screens/ChildMissionsScreen.tsx', 'screens/ChildRewardsScreen.tsx']);
});

test('no hard-coded colours in any UI .tsx (incl. the extended primitives)', () => {
  const ui = files('', ['.tsx']);
  const offenders = ui.filter((f) => /['"]#[0-9A-Fa-f]{3,8}['"]|rgba?\(/.test(code(f)));
  assert.deepEqual(offenders, []);
});

// ── Primitive variants are opt-in; defaults unchanged ───────────────────────

test('AppButton: gold variant + child/adult density; legacy base style and default variant unchanged', () => {
  const src = flat(code('components/ui/AppButton.tsx'));
  assert.ok(src.includes("variant = 'primary'"));
  assert.ok(src.includes('base: { minHeight: sizes.tapTarget, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, alignItems: \'center\', justifyContent: \'center\', }'));
  assert.ok(src.includes('compact: { minHeight: 40, paddingHorizontal: spacing.md, }'));
  // Density styles are gated on the prop; nothing applies when omitted.
  assert.ok(src.includes('density ? DENSITY[density] : null'));
  assert.ok(src.includes("density === 'child' ? CHILD_EDGE[variant] : null"));
  assert.ok(src.includes('child: { minHeight: sizes.childButton, borderRadius: radius.control }'));
  assert.ok(src.includes('adult: { minHeight: sizes.adultButton, borderRadius: radius.control }'));
  assert.ok(src.includes('primary: depth.childButton'));
  assert.ok(src.includes('gold: depth.goldButton'));
  assert.ok(src.includes('gold: { backgroundColor: colors.gold }'));
  assert.ok(src.includes('gold: colors.onGold'));
  // Legacy variants unchanged.
  assert.ok(src.includes('primary: { backgroundColor: colors.primary }'));
  assert.ok(src.includes('secondary: { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border }'));
});

test('Card: child/adult density; legacy card style unchanged and default is no density', () => {
  const src = flat(code('components/ui/Card.tsx'));
  assert.ok(src.includes("card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderSoft, padding: spacing.lg, ...shadows.card, }"));
  assert.ok(src.includes('density ? CARD_DENSITY[density] : null'));
  assert.ok(src.includes('child: { borderRadius: radius.childCard, borderWidth: 0, ...shadows.none, ...depth.childCard, }'));
  assert.ok(src.includes('adult: { borderRadius: radius.control, borderWidth: 1, borderColor: colors.border, ...shadows.none, }'));
});

test('TextField: locked field is opt-in; legacy fieldStyles.input unchanged', () => {
  const src = flat(code('components/ui/TextField.tsx'));
  assert.ok(src.includes('input: { ...typography.body, minHeight: sizes.tapTarget, color: colors.textPrimary, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, }'));
  assert.ok(src.includes('density ? fieldStyles.locked : null'));
  assert.ok(src.includes('locked: { minHeight: sizes.lockedField, borderRadius: radius.field, }'));
});

test('StatusPill: semantic statuses always have icon + text; sent back is indigo; legacy tones unchanged', () => {
  const src = flat(code('components/ui/StatusPill.tsx'));
  for (const s of ['done', 'waiting', 'sentBack', 'error', 'points']) assert.ok(new RegExp(`${s}: \\{ bg: colors\\.\\w+, fg: colors\\.\\w+, icon: '[\\w-]+' \\}`).test(src), s);
  assert.ok(src.includes('sentBack: { bg: colors.indigoTint, fg: colors.indigo,'));
  assert.ok(!/sentBack: \{[^}]*(danger|error)/.test(src), 'sent back must not be red');
  assert.ok(src.includes('<Ionicons name={icon ?? s.icon}'), 'semantic pill always renders an icon');
  // Semantic text may wrap (no numberOfLines) — large-font safe.
  const semanticBranch = src.slice(src.indexOf('if (status)'), src.indexOf('const t = TONES[tone]'));
  assert.ok(!semanticBranch.includes('numberOfLines'));
  // Legacy path + tones untouched (Banner also consumes TONES).
  assert.ok(src.includes("tone = 'neutral'"));
  assert.ok(src.includes('<Text style={[styles.text, { color: t.fg }]} numberOfLines={1}>{label}</Text>'));
  assert.ok(src.includes('danger: { bg: colors.dangerSoft, fg: colors.danger },'));
});

test('only the child screens (Slice 5A Home, Slice 5B Missions) opt into the new variants; every other call site is unchanged', () => {
  const ui = files('', ['.tsx']).filter((f) => !f.startsWith('components/ui/'));
  const optIns = ui.filter((f) => /\bdensity=|variant="gold"|status="(done|waiting|sentBack|error|points)"/.test(code(f))).sort();
  // Slice 5C: Mission Details and the child Submit Evidence screen.
  assert.deepEqual(optIns, [
    'features/tasks/components/ChildSubmitEvidence.tsx',
    'screens/ChildHomeScreen.tsx', 'screens/ChildMissionDetailsScreen.tsx', 'screens/ChildMissionsScreen.tsx',
    // Slice 5D: Child Rewards.
    'screens/ChildRewardsScreen.tsx',
  ].concat(
    // Slice 6A: Adult Home and its Review route, adult intensity only.
    // Slice 6B: Adult Tasks.
    // Slice 6C: Create Reward.
    // Slice 6D: Adult Family.
    ['screens/AdultFamilyScreen.tsx', 'screens/AdultHomeScreen.tsx', 'screens/AdultReviewScreen.tsx', 'screens/AdultRewardsScreen.tsx', 'screens/AdultTasksScreen.tsx', 'screens/NewRewardScreen.tsx'],
  ).sort());
  // They opt into the child intensity only, never the adult one.
  assert.ok(!code('screens/ChildHomeScreen.tsx').includes('density="adult"'));
  assert.ok(!code('screens/ChildMissionsScreen.tsx').includes('density="adult"'));
  assert.ok(!code('screens/ChildMissionDetailsScreen.tsx').includes('density="adult"'));
  assert.ok(!code('features/tasks/components/ChildSubmitEvidence.tsx').includes('density="adult"'));
  assert.ok(!code('screens/ChildRewardsScreen.tsx').includes('density="adult"'));
  // Slice 6A: the adult screens opt into the adult intensity only.
  for (const f of ['screens/AdultHomeScreen.tsx', 'screens/AdultReviewScreen.tsx', 'screens/AdultTasksScreen.tsx', 'screens/AdultRewardsScreen.tsx', 'screens/NewRewardScreen.tsx', 'screens/AdultFamilyScreen.tsx']) {
    assert.ok(!code(f).includes('density="child"'), f);
    assert.ok(!code(f).includes('variant="gold"'), f);
  }
});
