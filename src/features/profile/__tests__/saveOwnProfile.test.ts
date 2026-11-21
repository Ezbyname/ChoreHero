import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';

import { saveOwnProfile } from '@/features/profile/saveOwnProfile';
import { useAppStore } from '@/store/useAppStore';

const profileRow = (over: Record<string, unknown> = {}) => ({
  id: 'me', display_name: 'Dana', avatar_url: null, avatar_emoji: '🚀', default_household_id: null,
  created_at: 'x', updated_at: 'x', ...over,
}) as never;

beforeEach(() => {
  useAppStore.setState({
    // @ts-expect-error — test-only minimal shape, only .id is read
    authUser:  { id: 'me' },
    user:      { id: 'me', name: 'Old', avatarEmoji: '😀' },
    household: { id: 'hh', name: 'H', members: [
      { id: 'm1', userId: 'me', name: 'Old', role: 'adult', avatarEmoji: '😀' },
      { id: 'm2', userId: 'kid', name: 'Kid', role: 'child' },
    ] },
  });
});

test('saves the OWN profile only (id from the session) and updates the store in place', async () => {
  const calls: unknown[] = [];
  const r = await saveOwnProfile({ displayName: '  Dana ', avatarUrl: null, avatarEmoji: '🚀' }, {
    updateFn: async (input) => { calls.push(input); return { data: profileRow(), error: null }; },
  });
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(calls, [{ authUserId: 'me', displayName: 'Dana', avatarUrl: null, avatarEmoji: '🚀' }]);
  const s = useAppStore.getState();
  assert.equal(s.user?.name, 'Dana');
  assert.equal(s.user?.avatarEmoji, '🚀');
  assert.equal(s.household?.members.find((m) => m.userId === 'me')?.avatarEmoji, '🚀');
  assert.equal(s.household?.members.find((m) => m.userId === 'kid')?.avatarEmoji, undefined);
  // In place — never a re-hydration (no loading screen).
  assert.notEqual(s.appHydrationState, 'loading');
});

test('empty name is refused without a request; a failed update leaves the store untouched', async () => {
  let calls = 0;
  assert.deepEqual(await saveOwnProfile({ displayName: '  ', avatarUrl: null, avatarEmoji: null }, { updateFn: async () => { calls++; return { data: null, error: null } as never; } }),
    { ok: false, reason: 'invalid_input' });
  assert.equal(calls, 0);
  const r = await saveOwnProfile({ displayName: 'New', avatarUrl: null, avatarEmoji: null }, {
    updateFn: async () => ({ data: null, error: { code: 'PGRST500', message: 'x', details: '', hint: '' } as never }),
  });
  assert.deepEqual(r, { ok: false, reason: 'failed' });
  assert.equal(useAppStore.getState().user?.name, 'Old');
});

test('repository: plain UPDATE filtered to the caller id (profiles_update_self RLS), never an upsert', () => {
  const src = readFileSync(new URL('../../../lib/repositories/profiles.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const fn = src.slice(src.indexOf('export async function updateOwnProfile'));
  // End of the function body (the parameter block's own "\n})" is not it).
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.ok(body.includes(".update({"));
  assert.ok(body.includes(".eq('id', input.authUserId)"));
  assert.ok(!body.includes('upsert'));
});
