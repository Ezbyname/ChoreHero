import { execFileSync } from 'node:child_process';
import path from 'node:path';

// Resets and re-seeds the fixed QA dataset before the suite runs, so every
// run starts from the same known state: qa-owner/qa-adult/qa-child exist
// with owner/adult/child roles, one household, and qa-child has exactly
// one pending claim, one approved, one rejected (see
// scripts/seed-qa-data.mjs). Requires the same .env.local (SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY) used for manual seeding — this never touches
// application code, only test data.
export default function globalSetup(): void {
  const repoRoot = path.resolve(__dirname, '..');
  const seedScript = path.join('scripts', 'seed-qa-data.mjs');

  execFileSync('node', [seedScript, '--reset'], { cwd: repoRoot, stdio: 'inherit' });
  execFileSync('node', [seedScript], { cwd: repoRoot, stdio: 'inherit' });
}
