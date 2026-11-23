import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test, { afterEach } from 'node:test';

import type { Session } from '@supabase/supabase-js';

import { useAppStore } from '@/store/useAppStore';

// Production vc2 (EAS ea4734c1) was rejected because every zustand `set`
// went through console.trace, so a release build wrote the full Supabase
// session (access + refresh token, email) to logcat on sign-in. These
// tests keep store updates silent and keep the store module free of
// console output.

const ACCESS_TOKEN  = 'eyJ-test-access-token-must-never-be-logged';
const REFRESH_TOKEN = 'test-refresh-token-must-never-be-logged';

const fakeSession = {
  access_token:  ACCESS_TOKEN,
  refresh_token: REFRESH_TOKEN,
  token_type:    'bearer',
  expires_in:    3600,
  expires_at:    1_900_000_000,
  user: {
    id:            'user-1',
    aud:           'authenticated',
    role:          'authenticated',
    email:         'secret-owner@example.test',
    app_metadata:  {},
    user_metadata: {},
    created_at:    '2026-01-01T00:00:00Z',
  },
} as unknown as Session;

const CONSOLE_METHODS = ['log', 'trace', 'debug', 'info', 'warn', 'error'] as const;

function captureConsole(): { calls: unknown[][]; restore: () => void } {
  const calls: unknown[][] = [];
  const originals = CONSOLE_METHODS.map((m) => [m, console[m]] as const);
  for (const m of CONSOLE_METHODS) {
    console[m] = (...args: unknown[]) => { calls.push([m, ...args]); };
  }
  return {
    calls,
    restore: () => { for (const [m, fn] of originals) console[m] = fn; },
  };
}

afterEach(() => {
  useAppStore.getState().resetAppState();
  useAppStore.getState().clearAuthSession();
});

test('applying an auth session writes nothing to the console', () => {
  const cap = captureConsole();
  try {
    useAppStore.getState().applyAuthSession(fakeSession);
    useAppStore.getState().setAuthLoading(true);
    useAppStore.getState().clearAuthSession();
  } finally {
    cap.restore();
  }
  assert.deepEqual(cap.calls, []);
});

test('the session is still stored after the logger removal', () => {
  useAppStore.getState().applyAuthSession(fakeSession);
  const s = useAppStore.getState();
  assert.equal(s.authSession?.access_token, ACCESS_TOKEN);
  assert.equal(s.authUser?.id, 'user-1');
  assert.equal(s.isAuthResolved, true);
});

test('useAppStore.ts contains no console calls', () => {
  const src = readFileSync(
    fileURLToPath(new URL('../useAppStore.ts', import.meta.url)),
    'utf8',
  );
  assert.deepEqual(src.match(/\bconsole\s*\.\s*\w+\s*\(/g) ?? [], []);
});
