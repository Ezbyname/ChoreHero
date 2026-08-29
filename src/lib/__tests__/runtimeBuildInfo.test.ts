import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRuntimeBuildInfo, classifyBackendTarget, formatBuildInfoForCopy, formatQaBadgeText } from '@/lib/runtimeBuildInfo';

const QA_URL = 'https://umzfyedxnvtmfnwldwtq.supabase.co';
const PRODUCTION_URL = 'https://aqjiweueckwnkczcyedu.supabase.co';

test('1. canonical Product version resolves correctly', () => {
  const info = buildRuntimeBuildInfo({
    appVersion: '1.0.0', appVariant: undefined, buildNumber: undefined, gitSha: undefined, supabaseUrl: undefined,
  });
  assert.equal(info.appVersion, '1.0.0');
});

test('2. QA display version becomes "<version> QA"', () => {
  const info = buildRuntimeBuildInfo({
    appVersion: '1.0.0', appVariant: 'qa', buildNumber: undefined, gitSha: undefined, supabaseUrl: QA_URL,
  });
  assert.equal(info.displayVersion, '1.0.0 QA');
});

test('3. Production display version remains "<version>"', () => {
  const info = buildRuntimeBuildInfo({
    appVersion: '1.0.0', appVariant: 'production', buildNumber: undefined, gitSha: undefined, supabaseUrl: PRODUCTION_URL,
  });
  assert.equal(info.displayVersion, '1.0.0');
});

test('4. QA app name becomes "ChoreHero QA"', () => {
  const info = buildRuntimeBuildInfo({
    appVersion: '1.0.0', appVariant: 'qa', buildNumber: undefined, gitSha: undefined, supabaseUrl: QA_URL,
  });
  assert.equal(info.appName, 'ChoreHero QA');
});

test('5. Production app name becomes "ChoreHero"', () => {
  const info = buildRuntimeBuildInfo({
    appVersion: '1.0.0', appVariant: 'production', buildNumber: undefined, gitSha: undefined, supabaseUrl: PRODUCTION_URL,
  });
  assert.equal(info.appName, 'ChoreHero');
});

test('6. QA badge eligibility = true for QA (appVariant === "qa")', () => {
  const info = buildRuntimeBuildInfo({
    appVersion: '1.0.0', appVariant: 'qa', buildNumber: undefined, gitSha: undefined, supabaseUrl: QA_URL,
  });
  assert.equal(info.appVariant === 'qa', true);
});

test('7. QA badge eligibility = false for Production', () => {
  const info = buildRuntimeBuildInfo({
    appVersion: '1.0.0', appVariant: 'production', buildNumber: undefined, gitSha: undefined, supabaseUrl: PRODUCTION_URL,
  });
  assert.equal(info.appVariant === 'qa', false);
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
  const info = buildRuntimeBuildInfo({
    appVersion: '1.0.0', appVariant: undefined, buildNumber: undefined,
    gitSha: 'c0597fd338ead01654fa6c9173940d0d91471262', supabaseUrl: undefined,
  });
  assert.equal(info.gitSha, 'c0597fd338ead01654fa6c9173940d0d91471262');
  assert.equal(info.shortGitSha, 'c0597fd');
});

test('13. missing SHA -> unknown', () => {
  const info = buildRuntimeBuildInfo({
    appVersion: '1.0.0', appVariant: undefined, buildNumber: undefined, gitSha: undefined, supabaseUrl: undefined,
  });
  assert.equal(info.gitSha, 'unknown');
  assert.equal(info.shortGitSha, 'unknown');
});

test('14. missing build -> approved local fallback', () => {
  const info = buildRuntimeBuildInfo({
    appVersion: '1.0.0', appVariant: undefined, buildNumber: undefined, gitSha: undefined, supabaseUrl: undefined,
  });
  assert.equal(info.buildNumber, 'local');
});

test('15. copied diagnostic formatter uses the canonical runtime model (round-trips every field)', () => {
  const info = buildRuntimeBuildInfo({
    appVersion: '1.0.0', appVariant: 'qa', buildNumber: '28', gitSha: 'c0597fd338ead0', supabaseUrl: QA_URL,
  });
  const copied = formatBuildInfoForCopy(info);
  assert.ok(copied.includes(info.appName));
  assert.ok(copied.includes(info.displayVersion));
  assert.ok(copied.includes(info.buildNumber));
  assert.ok(copied.includes(info.environmentLabel));
  assert.ok(copied.includes(info.shortGitSha));
  assert.ok(copied.includes(info.backendTarget));
});

test('16. QA copied text includes QA identity', () => {
  const info = buildRuntimeBuildInfo({
    appVersion: '1.0.0', appVariant: 'qa', buildNumber: '28', gitSha: 'c0597fd', supabaseUrl: QA_URL,
  });
  const copied = formatBuildInfoForCopy(info);
  assert.equal(
    copied,
    'ChoreHero QA\nVersion: 1.0.0 QA\nBuild: 28\nEnvironment: QA\nCommit: c0597fd\nBackend: QA',
  );
});

test('17. Production copied text does not leak QA identity', () => {
  const info = buildRuntimeBuildInfo({
    appVersion: '1.0.0', appVariant: 'production', buildNumber: '34', gitSha: 'abc1234', supabaseUrl: PRODUCTION_URL,
  });
  const copied = formatBuildInfoForCopy(info);
  assert.ok(!copied.toLowerCase().includes('qa'));
  assert.equal(
    copied,
    'ChoreHero\nVersion: 1.0.0\nBuild: 34\nEnvironment: Production\nCommit: abc1234\nBackend: PRODUCTION',
  );
});

test('18. copied text contains no secrets/config keys/tokens', () => {
  const info = buildRuntimeBuildInfo({
    appVersion: '1.0.0', appVariant: 'qa', buildNumber: '28', gitSha: 'c0597fd', supabaseUrl: QA_URL,
  });
  const copied = formatBuildInfoForCopy(info);
  assert.ok(!copied.includes('supabase.co'));
  assert.ok(!copied.includes(QA_URL));
  assert.ok(!/key|token|secret|anon/i.test(copied));
});

test('19. Product version remains independent of environment', () => {
  const qaInfo = buildRuntimeBuildInfo({
    appVersion: '1.0.0', appVariant: 'qa', buildNumber: undefined, gitSha: undefined, supabaseUrl: QA_URL,
  });
  const prodInfo = buildRuntimeBuildInfo({
    appVersion: '1.0.0', appVariant: 'production', buildNumber: undefined, gitSha: undefined, supabaseUrl: PRODUCTION_URL,
  });
  assert.equal(qaInfo.appVersion, prodInfo.appVersion);
});

test('20. diagnostics remain read-only/pure: identical inputs always produce an identical, side-effect-free result', () => {
  const input = {
    appVersion: '1.0.0', appVariant: 'qa', buildNumber: '28', gitSha: 'c0597fd', supabaseUrl: QA_URL,
  };
  assert.deepEqual(buildRuntimeBuildInfo(input), buildRuntimeBuildInfo(input));
});

test('environmentLabel falls back to backend classification when appVariant is unset (e.g. today\'s Vercel Web build)', () => {
  const info = buildRuntimeBuildInfo({
    appVersion: '1.0.0', appVariant: undefined, buildNumber: undefined, gitSha: undefined, supabaseUrl: PRODUCTION_URL,
  });
  assert.equal(info.appVariant, null);
  assert.equal(info.environmentLabel, 'Production');
  assert.equal(info.backendTarget, 'PRODUCTION');
});

test('formatQaBadgeText uses "b<n>" for a real numeric build number', () => {
  const info = buildRuntimeBuildInfo({
    appVersion: '1.0.0', appVariant: 'qa', buildNumber: '28', gitSha: 'c0597fd', supabaseUrl: QA_URL,
  });
  assert.equal(formatQaBadgeText(info), 'QA • v1.0.0 • b28');
});

test('formatQaBadgeText omits the "b" prefix for the local/unknown fallback (regression: "blocal")', () => {
  const localInfo = buildRuntimeBuildInfo({
    appVersion: '1.0.0', appVariant: 'qa', buildNumber: undefined, gitSha: undefined, supabaseUrl: QA_URL,
  });
  assert.equal(formatQaBadgeText(localInfo), 'QA • v1.0.0 • local');
});

test('mock mode (no Supabase configured) classifies as MOCK end to end', () => {
  const info = buildRuntimeBuildInfo({
    appVersion: '1.0.0', appVariant: undefined, buildNumber: undefined, gitSha: undefined, supabaseUrl: undefined,
  });
  assert.equal(info.backendTarget, 'MOCK');
  assert.equal(info.environmentLabel, 'Mock');
});
