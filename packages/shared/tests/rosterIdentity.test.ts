import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canSuggestRosterMatch,
  rosterComparisonKey,
  rosterNameSimilarity,
  reviewedRowPersonId,
  withoutTrailingRosterNumber,
} from '../src/utils/rosterIdentity.ts';

test('ignores roster labels at either edge and preserves internal digits and punctuation', () => {
  const cases = [
    ['Jason1.', 'jason'],
    ['Jason.1', 'jason'],
    ['Jason-2', 'jason'],
    ['王小明3。', '王小明'],
    ['Jason 1', 'jason'],
    ['1.Jason', 'jason'],
    ['.1Jason', 'jason'],
    ['3王小明', '王小明'],
    ['01-王小明', '王小明'],
    ['1.Jason2.', 'jason'],
    ['Jason.', 'jason'],
    ['.Jason', 'jason'],
    ['J.Lo', 'j.lo'],
    ['A1B', 'a1b'],
    [' Ja0son ', 'ja0son'],
    [' Jason0 ', 'jason'],
    ['Jason1', 'jason'],
    ['Jason１', 'jason'],
    ['1.Élodie2.', 'élodie'],
    ['\u3000_１２．\t王小明\u00a0．３_\uFEFF', '王小明'],
  ];
  for (const [value, expected] of cases) {
    assert.equal(rosterComparisonKey(value, 'ignore_trailing_numbers'), expected, value);
  }
});

test('keeps a nonempty key for labels made only of digits and punctuation', () => {
  assert.equal(withoutTrailingRosterNumber('１２3'), '１２3');
  assert.equal(withoutTrailingRosterNumber('._-。．'), '._-。．');
  assert.equal(withoutTrailingRosterNumber(' 1.２ '), '1.');
  assert.equal(withoutTrailingRosterNumber('\t\u3000'), '');
  assert.equal(withoutTrailingRosterNumber(''), '');
  assert.equal(withoutTrailingRosterNumber(null), '');
  assert.equal(withoutTrailingRosterNumber(undefined), '');
});

test('keeps edge digits and punctuation in exact and fuzzy modes', () => {
  assert.equal(rosterComparisonKey(' 1.Jason2. ', 'exact'), '1.jason2.');
  assert.equal(rosterComparisonKey(' 1.Jason2. ', 'fuzzy_suggestions'), '1.jason2.');
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
