import { test, expect } from '@playwright/test';
import { login, logout, QA_USERS, COPY } from './helpers';

// Runs as one ordered story against the fixed dataset from
// scripts/seed-qa-data.mjs (reset + re-seeded by e2e/global-setup.ts before
// this file runs). Serial because each step depends on the state the
// previous step left behind — this isn't a set of independent unit tests.
test.describe.serial('ContributionClaim lifecycle', () => {
  test('owner sees the seeded pending claim and can approve it', async ({ page }) => {
    await login(page, QA_USERS.owner.email);

    await expect(page.getByText(COPY.reviewSectionTitle)).toBeVisible();
    const claimCard = page.getByText('Fed the dog');
    await expect(claimCard).toBeVisible();

    await page.getByText(COPY.approveButton, { exact: true }).click();

    await expect(page.getByText('Fed the dog')).toHaveCount(0, { timeout: 10_000 });

    await logout(page);
  });

  test('child does not see the approval-review section at all', async ({ page }) => {
    await login(page, QA_USERS.child.email);

    await expect(page.getByText(COPY.reviewSectionTitle)).toHaveCount(0);

    await logout(page);
  });

  test('child can submit a new claim now that no pending claim remains', async ({ page }) => {
    await login(page, QA_USERS.child.email);

    await page.getByPlaceholder(COPY.claimFieldPlaceholder).fill('Cleaned up the playroom');
    await page.getByText(COPY.claimSubmitButton, { exact: true }).click();

    await expect(page.getByText(COPY.claimSuccess)).toBeVisible({ timeout: 10_000 });

    await logout(page);
  });

  test('duplicate pending claim is blocked with a friendly message', async ({ page }) => {
    await login(page, QA_USERS.child.email);

    await page.getByPlaceholder(COPY.claimFieldPlaceholder).fill('Another chore entirely');
    await page.getByText(COPY.claimSubmitButton, { exact: true }).click();

    await expect(page.getByText(COPY.claimDuplicatePending)).toBeVisible({ timeout: 10_000 });

    await logout(page);
  });

  test('adult can see and reject the pending claim', async ({ page }) => {
    await login(page, QA_USERS.adult.email);

    await expect(page.getByText(COPY.reviewSectionTitle)).toBeVisible();
    await expect(page.getByText('Cleaned up the playroom')).toBeVisible();

    await page.getByText(COPY.rejectButton, { exact: true }).click();

    await expect(page.getByText('Cleaned up the playroom')).toHaveCount(0, { timeout: 10_000 });

    await logout(page);
  });
});

// Not covered here: cross-household isolation (the current seed only
// creates one household) and the SECURITY DEFINER RLS behavior (not
// observable through the UI — see the migration's own local-Postgres
// validation for that). Ask for an extended seed + test if you want
// cross-household coverage added.
