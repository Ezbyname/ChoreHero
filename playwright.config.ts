import { defineConfig, devices } from '@playwright/test';

// E2E_BASE_URL must point at a deployed web build of the app (e.g. your
// Vercel URL). This suite assumes the seeded QA dataset from
// scripts/seed-qa-data.mjs exists in the Supabase project that deployment
// is wired to — globalSetup resets and re-seeds it before every run.
const baseURL = process.env.E2E_BASE_URL;

if (!baseURL) {
  throw new Error(
    'E2E_BASE_URL is not set. Point it at your deployed app, e.g.\n' +
    '  $env:E2E_BASE_URL="https://chorehero-one.vercel.app"; npx playwright test',
  );
}

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false, // tests share seeded state and run in a deliberate sequence
  retries: 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
