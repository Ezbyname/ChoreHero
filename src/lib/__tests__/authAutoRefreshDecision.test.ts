import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAutoRefreshAction } from '@/lib/authAutoRefreshDecision';

test('active -> start', () => {
  assert.equal(resolveAutoRefreshAction('active'), 'start');
});

test('background -> stop', () => {
  assert.equal(resolveAutoRefreshAction('background'), 'stop');
});

test('inactive -> stop', () => {
  assert.equal(resolveAutoRefreshAction('inactive'), 'stop');
});

test('extension -> stop', () => {
  assert.equal(resolveAutoRefreshAction('extension'), 'stop');
});

test('unknown -> stop', () => {
  assert.equal(resolveAutoRefreshAction('unknown'), 'stop');
});
