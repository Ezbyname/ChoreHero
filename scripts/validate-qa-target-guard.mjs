#!/usr/bin/env node
// Bounded, network-free proof that the fail-closed QA target guard
// (scripts/lib/qaTargetGuard.mjs) behaves correctly for every required
// case. Imports only the pure validation function — never creates a
// Supabase client, never reads .env.local, makes no request of any kind.

import { validateQaTarget, APPROVED_QA_PROJECT_REF } from './lib/qaTargetGuard.mjs';

const CORRECT_URL = `https://${APPROVED_QA_PROJECT_REF}.supabase.co`;

const cases = [
  {
    name: 'A: correct QA URL + ALLOW=true',
    url: CORRECT_URL,
    allow: 'true',
    expectOk: true,
  },
  {
    name: 'B: different project URL + ALLOW=true',
    url: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co',
    allow: 'true',
    expectOk: false,
  },
  {
    name: 'C: correct QA URL + ALLOW=false',
    url: CORRECT_URL,
    allow: 'false',
    expectOk: false,
  },
  {
    name: 'D: correct QA URL + ALLOW missing',
    url: CORRECT_URL,
    allow: undefined,
    expectOk: false,
  },
  {
    name: 'E: malformed SUPABASE_URL',
    url: 'malformed-value',
    allow: 'true',
    expectOk: false,
  },
  {
    name: 'F: missing SUPABASE_URL',
    url: undefined,
    allow: 'true',
    expectOk: false,
  },
];

let allPass = true;

console.log('QA target guard — bounded local validation (no network access)\n');

for (const c of cases) {
  const result = validateQaTarget(c.url, c.allow);
  const gotOk = result.ok === true;
  const pass = gotOk === c.expectOk;
  if (!pass) allPass = false;

  console.log(`${pass ? 'PASS' : 'FAIL'}  ${c.name}`);
  console.log(`      expected ok=${c.expectOk}, got ok=${gotOk}${result.reason ? ` (${result.reason})` : ''}`);
}

console.log();
if (allPass) {
  console.log('All target-guard cases behaved as required.');
  process.exit(0);
} else {
  console.error('One or more target-guard cases did NOT behave as required.');
  process.exit(1);
}
