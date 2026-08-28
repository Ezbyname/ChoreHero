import assert from 'node:assert/strict';
import test from 'node:test';
import { extractRecoveryTokens, parseLinkingUrl } from '@/lib/authRecoveryLinkParsing';

test('parseLinkingUrl splits a full recovery URL into hash and search, both with their leading marker', () => {
  const url = 'chorehero-qa://reset-password?foo=bar#access_token=abc&refresh_token=def&type=recovery';
  assert.deepEqual(parseLinkingUrl(url), {
    search: '?foo=bar',
    hash:   '#access_token=abc&refresh_token=def&type=recovery',
  });
});

test('parseLinkingUrl with no hash returns an empty hash', () => {
  assert.deepEqual(parseLinkingUrl('chorehero-qa://reset-password?code=abc123'), {
    search: '?code=abc123',
    hash:   '',
  });
});

test('parseLinkingUrl with no search returns an empty search', () => {
  assert.deepEqual(parseLinkingUrl('chorehero-qa://reset-password#type=recovery'), {
    search: '',
    hash:   '#type=recovery',
  });
});

test('parseLinkingUrl with neither returns both empty', () => {
  assert.deepEqual(parseLinkingUrl('chorehero-qa://reset-password'), { search: '', hash: '' });
});

test('extractRecoveryTokens reads access_token and refresh_token from a hash', () => {
  assert.deepEqual(
    extractRecoveryTokens('#access_token=abc&refresh_token=def&type=recovery'),
    { accessToken: 'abc', refreshToken: 'def' },
  );
});

test('extractRecoveryTokens works without a leading #', () => {
  assert.deepEqual(
    extractRecoveryTokens('access_token=abc&refresh_token=def'),
    { accessToken: 'abc', refreshToken: 'def' },
  );
});

test('extractRecoveryTokens returns null when access_token is missing', () => {
  assert.equal(extractRecoveryTokens('#refresh_token=def&type=recovery'), null);
});

test('extractRecoveryTokens returns null when refresh_token is missing', () => {
  assert.equal(extractRecoveryTokens('#access_token=abc&type=recovery'), null);
});

test('extractRecoveryTokens returns null for an empty hash', () => {
  assert.equal(extractRecoveryTokens(''), null);
});
