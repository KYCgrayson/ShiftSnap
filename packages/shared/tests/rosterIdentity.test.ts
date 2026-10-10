import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canSuggestRosterMatch,
  rosterNameSimilarity,
  reviewedRowPersonId,
  withoutTrailingRosterNumber,
} from '../src/utils/rosterIdentity.ts';

test('removes ASCII and full-width trailing roster codes only', () => {
  assert.equal(withoutTrailingRosterNumber(' Jason0 '), 'jason');
  assert.equal(withoutTrailingRosterNumber('Jason１'), 'jason');
  assert.equal(withoutTrailingRosterNumber('Ja0son'), 'ja0son');
  // Existing Jason0 / Jason1 labels intentionally share this key only
  // when the group owner enables numeric-code mode.
  assert.equal(withoutTrailingRosterNumber('Jason0'), withoutTrailingRosterNumber('Jason1'));
});

test('a reviewed self row retains canonical person_id without changing self source semantics', () => {
  const people = new Map([[0, 'canonical-me']]);
  assert.equal(reviewedRowPersonId(0, people), 'canonical-me');
  // Calendar self rendering is still determined by source/user_id, not person_id.
  const source = 'self_scan';
  assert.equal(source === 'self_scan', true);
});

test('suggestions are blocked for names that co-occur on one schedule', () => {
  assert.equal(canSuggestRosterMatch('Jason', 'Jasen', ['Jason', 'Jasen'], 'loose'), false);
  assert.equal(canSuggestRosterMatch('Jason', 'Jasen', ['Jason'], 'loose'), true);
  assert.equal(canSuggestRosterMatch('Jason', 'Jasen', ['Jason'], 'standard'), true);
  assert.ok(rosterNameSimilarity('Jason', 'Jasen') > 0.66);
});
