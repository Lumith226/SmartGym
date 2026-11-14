import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLocal, project, validateSchedule } from '../../backend/apps/workout/dist/modules/scheduling/schedule-time.js';

const weekly = { planId: 'unused-in-time-calculation', timeZone: 'America/New_York', startDate: '2027-03-01',
  startLocalTime: '02:30', durationMinutes: 30, recurrence: 'WEEKLY', weekdays: [7] };

test('DST gaps advance to the first valid instant and folds select the earlier instant', () => {
  assert.equal(resolveLocal('2027-03-14', '02:30', 'America/New_York').toString(), '2027-03-14T07:00:00Z');
  assert.equal(resolveLocal('2027-11-07', '01:30', 'America/New_York').toString(), '2027-11-07T05:30:00Z');
  assert.equal(resolveLocal('2027-10-03', '02:15', 'Australia/Lord_Howe').toString(), '2027-10-02T15:30:00Z');
  assert.equal(resolveLocal('2011-12-30', '08:00', 'Pacific/Apia').toString(), '2011-12-30T10:00:00Z');
});

test('projection uses 35 local dates, inclusive end dates and constant elapsed duration', () => {
  const result = project(weekly, new Date('2027-03-01T05:00:00Z'));
  assert.equal(result.length, 5);
  const gap = result.find(item => item.localDate === '2027-03-14');
  assert.equal(gap.start, '2027-03-14T07:00:00Z');
  assert.equal(gap.end, '2027-03-14T07:30:00Z');
  const bounded = project({ ...weekly, endDate: '2027-03-14' }, new Date('2027-03-01T05:00:00Z'));
  assert.deepEqual(bounded.map(item => item.localDate), ['2027-03-07', '2027-03-14']);
  const daily = project({ ...weekly, startDate: '2027-01-01', timeZone: 'Asia/Bangkok', startLocalTime: '08:00', weekdays: [1, 2, 3, 4, 5, 6, 7] }, new Date('2027-01-01T00:00:00Z'));
  assert.equal(daily.length, 35);
  assert.equal(daily[0].start, '2027-01-01T01:00:00Z');
  assert.equal(daily.at(-1).localDate, '2027-02-04');
});

test('past occurrences are skipped and ONCE waits until the date enters the horizon', () => {
  const input = { ...weekly, timeZone: 'UTC', recurrence: 'ONCE', weekdays: undefined, startDate: '2027-02-04', startLocalTime: '08:00' };
  assert.equal(project(input, new Date('2027-01-01T00:00:00Z')).length, 1);
  assert.equal(project({ ...input, startDate: '2027-02-05' }, new Date('2027-01-01T00:00:00Z')).length, 0);
  assert.equal(project({ ...input, startDate: '2027-01-01' }, new Date('2027-01-01T08:00:00Z')).length, 0);
});

test('invalid named zones and contradictory dates are rejected before database writes', () => {
  for (const changes of [{ timeZone: '+07:00' }, { timeZone: 'Invalid/Zone' }, { startDate: '2027-02-30' }, { endDate: '2027-02-01' },
    { recurrence: 'ONCE', weekdays: undefined, endDate: '2027-03-02' }]) {
    assert.throws(() => validateSchedule({ ...weekly, ...changes }), error => error.getStatus() === 422);
  }
});
