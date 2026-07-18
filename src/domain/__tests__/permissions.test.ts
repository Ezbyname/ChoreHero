import assert from 'node:assert/strict';
import test from 'node:test';
import { hasHouseholdPermission } from '@/domain/permissions';

// Matches rewards_insert_adult_plus RLS policy (owner/admin/adult, not child).
test('rewards.create is granted to owner, admin, and adult, and denied to child', () => {
  assert.equal(hasHouseholdPermission('owner', 'rewards.create'), true);
  assert.equal(hasHouseholdPermission('admin', 'rewards.create'), true);
  assert.equal(hasHouseholdPermission('adult', 'rewards.create'), true);
  assert.equal(hasHouseholdPermission('child', 'rewards.create'), false);
});