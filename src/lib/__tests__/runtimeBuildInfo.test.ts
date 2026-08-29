import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRuntimeBuildInfo, classifyBackendTarget, formatBuildInfoForCopy, formatQaBadgeText, type RuntimeBuildInfoInput } from '@/lib/runtimeBuildInfo';

const QA_URL = 'https://umzfyedxnvtmfnwldwtq.supabase.co';
const PRODUCTION_URL = 'https://aqjiweueckwnkczcyedu.supabase.co';

// nativeBuildVersion defaults to null (Web/local — the common case for
// every pre-existing test below, none of which cares about native build
// resolution specifically; the native-build-priority tests further down
// override it explicitly).
function info(overrides: Partial<RuntimeBuildInfoInput> & Pick<RuntimeBuildInfoInput, 'appVersion' | 'appVariant' | 'buildNumber' | 'gitSha' | 'supabaseUrl'>) {
  return buildRuntimeBuildInfo({ nativeBuildVersion: null, ...overrides });
}

test('1. canonical Product version resolves correctly', () => {
  const result = info({
    appVersion: '1.0.0', appVariant: undefined, buildNumber: undefined, gitSha: undefined, supabaseUrl: undefined,
  });
  assert.equal(result.appVersion, '1.0.0');
});

test('2. QA display version becomes "<version> QA"', () => {
  const result = info({
    appVersion: '1.0.0', appVariant: 'qa', buildNumber: undefined, gitSha: undefined, supabaseUrl: QA_URL,
  });
  assert.equal(result.displayVersion, '1.0.0 QA');
});

test('3. Production display version remains "<version>"', () => {
  const result = info({
    appVersion: '1.0.0', appVariant: 'production', buildNumber: undefined, gitSha: undefined, supabaseUrl: PRODUCTION_URL,
  });
  assert.equal(result.displayVersion, '1.0.0');
});

test('4. QA app name becomes "ChoreHero QA"', () => {
  const result = info({
    appVersion: '1.0.0', appVariant: 'qa', buildNumber: undefined, gitSha: undefined, supabaseUrl: QA_URL,
  });
  assert.equal(result.appName, 'ChoreHero QA');
});

test('5. Production app name becomes "ChoreHero"', () => {
  const result = info({
    appVersion: '1.0.0', appVariant: 'production', buildNumber: undefined, gitSha: undefined, supabaseUrl: PRODUCTION_URL,
  });
  assert.equal(result.appName, 'ChoreHero');
});

test('6. QA badge eligibility = true for QA (appVariant === "qa")', () => {
  const result = info({
    appVersion: '1.0.0', appVariant: 'qa', buildNumber: undefined, gitSha: undefined, supabaseUrl: QA_URL,
  });
  assert.equal(result.appVariant === 'qa', true);
});

test('7. QA badge eligibility = false for Production', () => {
  const result = info({
    appVersion: '1.0.0', appVariant: 'production', buildNumber: undefined, gitSha: undefined, supabaseUrl: PRODUCTION_URL,
  });
  assert.equal(result.appVariant === 'qa', false);
});

test('8. known QA backend -> QA', () => {
  assert.equal(classifyBackendTarget(QA_URL), 'QA');
});

test('9. known Production backend -> PRODUCTION', () => {
  assert.equal(classifyBackendTarget(PRODUCTION_URL), 'PRODUCTION');
});

test('10. missing Supabase target -> MOCK', () => {
  assert.equal(classifyBackendTarget(undefined), 'MOCK');
  assert.equal(classifyBackendTarget(''), 'MOCK');
});

test('11. unknown/unrecognized target -> UNKNOWN', () => {
  assert.equal(classifyBackendTarget('https://aaaaaaaaaaaaaaaaaaaa.supabase.co'), 'UNKNOWN');
  assert.equal(classifyBackendTarget('not-a-url'), 'UNKNOWN');
});

test('12. Git SHA shortens predictably', () => {
  const result = info({
    appVersion: '1.0.0', appVariant: undefined, buildNumber: undefined,
    gitSha: 'c0597fd338ead01654fa6c9173940d0d91471262', supabaseUrl: undefined,
  });
  assert.equal(result.gitSha, 'c0597fd338ead01654fa6c9173940d0d91471262');
  assert.equal(result.shortGitSha, 'c0597fd');
});

test('13. missing SHA -> unknown', () => {
  const result = info({
    appVersion: '1.0.0', appVariant: undefined, buildNumber: undefined, gitSha: undefined, supabaseUrl: undefined,
  });
  assert.equal(result.gitSha, 'unknown');
  assert.equal(result.shortGitSha, 'unknown');
});

test('14. missing build (Web/no native artifact, no EXPO_PUBLIC_BUILD_NUMBER) -> approved local fallback', () => {
  const result = info({
    appVersion: '1.0.0', appVariant: undefined, buildNumber: undefined, gitSha: undefined, supabaseUrl: undefined,
  });
  assert.equal(result.buildNumber, 'local');
});

test('15. copied diagnostic formatter uses the canonical runtime model (round-trips every field)', () => {
  const result = info({
    appVersion: '1.0.0', appVariant: 'qa', buildNumber: '28', gitSha: 'c0597fd338ead0', supabaseUrl: QA_URL,
  });
  const copied = formatBuildInfoForCopy(result);
  assert.ok(copied.includes(result.appName));
  assert.ok(copied.includes(result.displayVersion));
  assert.ok(copied.includes(result.buildNumber));
  assert.ok(copied.includes(result.environmentLabel));
  assert.ok(copied.includes(result.shortGitSha));
  assert.ok(copied.includes(result.backendTarget));
});

test('16. QA copied text includes QA identity', () => {
  const result = info({
    appVersion: '1.0.0', appVariant: 'qa', buildNumber: '28', gitSha: 'c0597fd', supabaseUrl: QA_URL,
  });
  const copied = formatBuildInfoForCopy(result);
  assert.equal(
    copied,
    'ChoreHero QA\nVersion: 1.0.0 QA\nBuild: 28\nEnvironment: QA\nCommit: c0597fd\nBackend: QA',
  );
});

test('17. Production copied text does not leak QA identity', () => {
  const result = info({
    appVersion: '1.0.0', appVariant: 'production', buildNumber: '34', gitSha: 'abc1234', supabaseUrl: PRODUCTION_URL,
  });
  const copied = formatBuildInfoForCopy(result);
  assert.ok(!copied.toLowerCase().includes('qa'));
  assert.equal(
    copied,
    'ChoreHero\nVersion: 1.0.0\nBuild: 34\nEnvironment: Production\nCommit: abc1234\nBackend: PRODUCTION',
  );
});

test('18. copied text contains no secrets/config keys/tokens', () => {
  const result = info({
    appVersion: '1.0.0', appVariant: 'qa', buildNumber: '28', gitSha: 'c0597fd', supabaseUrl: QA_URL,
  });
  const copied = formatBuildInfoForCopy(result);
  assert.ok(!copied.includes('supabase.co'));
  assert.ok(!copied.includes(QA_URL));
  assert.ok(!/key|token|secret|anon/i.test(copied));
});

test('19. Product version remains independent of environment', () => {
  const qaInfo = info({
    appVersion: '1.0.0', appVariant: 'qa', buildNumber: undefined, gitSha: undefined, supabaseUrl: QA_URL,
  });
  const prodInfo = info({
    appVersion: '1.0.0', appVariant: 'production', buildNumber: undefined, gitSha: undefined, supabaseUrl: PRODUCTION_URL,
  });
  assert.equal(qaInfo.appVersion, prodInfo.appVersion);
});

test('20. diagnostics remain read-only/pure: identical inputs always produce an identical, side-effect-free result', () => {
  const input: RuntimeBuildInfoInput = {
    appVersion: '1.0.0', appVariant: 'qa', nativeBuildVersion: null, buildNumber: '28', gitSha: 'c0597fd', supabaseUrl: QA_URL,
  };
  assert.deepEqual(buildRuntimeBuildInfo(input), buildRuntimeBuildInfo(input));
});

test('environmentLabel falls back to backend classification when appVariant is unset (e.g. today\'s Vercel Web build)', () => {
  const result = info({
    appVersion: '1.0.0', appVariant: undefined, buildNumber: undefined, gitSha: undefined, supabaseUrl: PRODUCTION_URL,
  });
  assert.equal(result.appVariant, null);
  assert.equal(result.environmentLabel, 'Production');
  assert.equal(result.backendTarget, 'PRODUCTION');
});

test('formatQaBadgeText uses "b<n>" for a real numeric build number', () => {
  const result = info({
    appVersion: '1.0.0', appVariant: 'qa', buildNumber: '28', gitSha: 'c0597fd', supabaseUrl: QA_URL,
  });
  assert.equal(formatQaBadgeText(result), 'QA • v1.0.0 • b28');
});

test('formatQaBadgeText omits the "b" prefix for the local/unknown fallback (regression: "blocal")', () => {
  const localInfo = info({
    appVersion: '1.0.0', appVariant: 'qa', buildNumber: undefined, gitSha: undefined, supabaseUrl: QA_URL,
  });
  assert.equal(formatQaBadgeText(localInfo), 'QA • v1.0.0 • local');
});

test('mock mode (no Supabase configured) classifies as MOCK end to end', () => {
  const result = info({
    appVersion: '1.0.0', appVariant: undefined, buildNumber: undefined, gitSha: undefined, supabaseUrl: undefined,
  });
  assert.equal(result.backendTarget, 'MOCK');
  assert.equal(result.environmentLabel, 'Mock');
});

// ── QA-01.2 — native build identity (§27 of the QA-01.2 authorization) ───────

test('native build identity 1/2. native build version is preferred over EXPO_PUBLIC_BUILD_NUMBER when available', () => {
  const result = buildRuntimeBuildInfo({
    appVersion: '1.0.0', appVariant: 'qa', nativeBuildVersion: '28', buildNumber: '999', gitSha: undefined, supabaseUrl: QA_URL,
  });
  assert.equal(result.buildNumber, '28');
});

test('native build identity 2. native build "28" displays as Build 28 in the copy block', () => {
  const result = buildRuntimeBuildInfo({
    appVersion: '1.0.0', appVariant: 'qa', nativeBuildVersion: '28', buildNumber: undefined, gitSha: 'c0597fd', supabaseUrl: QA_URL,
  });
  assert.ok(formatBuildInfoForCopy(result).includes('Build: 28'));
});

test('native build identity 3. QA badge with a real native numeric build uses "b28"', () => {
  const result = buildRuntimeBuildInfo({
    appVersion: '1.0.0', appVariant: 'qa', nativeBuildVersion: '28', buildNumber: undefined, gitSha: undefined, supabaseUrl: QA_URL,
  });
  assert.equal(formatQaBadgeText(result), 'QA • v1.0.0 • b28');
});

test('native build identity 4. no native build (null) safely falls through to the EXPO_PUBLIC_BUILD_NUMBER / local fallback chain', () => {
  const withEnvFallback = buildRuntimeBuildInfo({
    appVersion: '1.0.0', appVariant: 'qa', nativeBuildVersion: null, buildNumber: '5', gitSha: undefined, supabaseUrl: QA_URL,
  });
  assert.equal(withEnvFallback.buildNumber, '5');

  const withLocalFallback = buildRuntimeBuildInfo({
    appVersion: '1.0.0', appVariant: 'qa', nativeBuildVersion: null, buildNumber: undefined, gitSha: undefined, supabaseUrl: QA_URL,
  });
  assert.equal(withLocalFallback.buildNumber, 'local');
});

test('native build identity 5. Web does not fabricate a numeric native build (nativeBuildVersion is always null there)', () => {
  const result = buildRuntimeBuildInfo({
    appVersion: '1.0.0', appVariant: undefined, nativeBuildVersion: null, buildNumber: undefined, gitSha: undefined, supabaseUrl: undefined,
  });
  assert.equal(result.buildNumber, 'local');
  assert.notEqual(result.buildNumber, '0');
});

test('Account type does not affect build identity (build fields unaffected by any account-type-shaped input)', () => {
  const result = info({
    appVersion: '1.0.0', appVariant: 'qa', buildNumber: '28', gitSha: 'c0597fd', supabaseUrl: QA_URL,
  });
  assert.ok(!('accountType' in result));
  assert.ok(!formatBuildInfoForCopy(result).toLowerCase().includes('account'));
});
