import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildScheduleImageStoragePath,
  getShiftImageStoragePath,
  isPersistentShiftImageReference,
} from '../src/services/shiftImages.ts';

test('builds an owner/group/month/schedule image path', () => {
  assert.equal(
    buildScheduleImageStoragePath('owner-id', 'group-id', '2026-08', 'schedule-id', 'png'),
    'owner-id/group-id/2026-08/schedule-id.png',
  );
});

test('recovers raw object paths from historical Supabase URLs', () => {
  assert.equal(
    getShiftImageStoragePath(
      'https://project.supabase.co/storage/v1/object/sign/shift-images/owner-id%2Fschedule.jpg?token=x',
    ),
    'owner-id/schedule.jpg',
  );
});

test('rejects local picker references as persistent records', () => {
  assert.equal(isPersistentShiftImageReference('file:///tmp/schedule.jpg'), false);
  assert.equal(isPersistentShiftImageReference('owner-id/2026-08/schedule.jpg'), true);
});
