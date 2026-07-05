import { expect, type Page } from '@playwright/test';

// Must match scripts/seed-qa-data.mjs exactly.
export const QA_PASSWORD = 'ChoreHeroQA123!';
export const QA_USERS = {
  owner: { email: 'qa-owner@chorehero.test', role: 'owner' },
  adult: { email: 'qa-adult@chorehero.test', role: 'adult' },
  child: { email: 'qa-child@chorehero.test', role: 'child' },
} as const;

// Copy strings pulled from src/content/copy.ts — kept here rather than
// imported directly since this suite runs against a deployed build, not
// the source tree, and duplicating a handful of literal strings is more
// robust than wiring up a cross-package import for an e2e test.
export const COPY = {
  emailPlaceholder:    'your@email.com',
  passwordPlaceholder: '••••••••',
  signInButton:        'Sign in',
  reviewSectionTitle:  'Waiting for your approval',
  approveButton:       'Approve',
  rejectButton:        'Not this time',
  claimFieldPlaceholder: 'What did you do?',
  claimSubmitButton:   'Send for approval',
  claimSuccess:        'Sent! Waiting for a grown-up to approve.',
  claimDuplicatePending: 'You already have something waiting for approval. Hang tight!',
  signOut:             'Sign out',
};

export async function login(page: Page, email: string, password: string = QA_PASSWORD): Promise<void> {
  await page.goto('/');
  await page.getByPlaceholder(COPY.emailPlaceholder).fill(email);
  await page.getByPlaceholder(COPY.passwordPlaceholder).fill(password);
  await page.getByText(COPY.signInButton, { exact: true }).click();

  // No dashboard-specific landmark to wait on beyond the login form
  // disappearing — AuthGate swaps to RootNavigator once AuthBootstrap's
  // listener fires, which isn't immediate.
  await expect(page.getByPlaceholder(COPY.emailPlaceholder)).toHaveCount(0, { timeout: 15_000 });
}

export async function logout(page: Page): Promise<void> {
  await page.getByText('Settings', { exact: true }).click();
  await page.getByText(COPY.signOut, { exact: true }).click();
  await expect(page.getByPlaceholder(COPY.emailPlaceholder)).toBeVisible({ timeout: 15_000 });
}
