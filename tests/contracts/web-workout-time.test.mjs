import { test } from 'node:test';import assert from 'node:assert/strict';
import { localInstant,range,localValue,validZone } from '../../frontend/app/workout/time.ts';
test('browser calendar translates local time independently of device timezone',()=>{
  assert.equal(localInstant('2030-01-01T18:00','Asia/Bangkok').toString(),'2030-01-01T11:00:00Z');
  assert.equal(localValue('2030-01-01T11:00:00Z','Asia/Bangkok'),'2030-01-01T18:00');
  assert.equal(localValue('2030-01-01T11:00:00Z','UTC'),'2030-01-01T11:00');
});
test('browser DST previews follow the Workout gap and fold policy',()=>{
  assert.equal(localInstant('2027-03-14T02:30','America/New_York').toString(),'2027-03-14T07:00:00Z');
  assert.equal(localInstant('2027-11-07T01:30','America/New_York').toString(),'2027-11-07T05:30:00Z');
  assert.equal(localInstant('2027-10-03T02:15','Australia/Lord_Howe').toString(),'2027-10-02T15:30:00Z');
  assert.equal(validZone('+07:00'),false);assert.throws(()=>localInstant('2027-01-01T09:00','Invalid/Zone'));
});
test('week endpoints use local midnights across DST instead of fixed UTC days',()=>{
  const r=range('2027-03-10','America/New_York');assert.equal(r.from,'2027-03-10T05:00:00Z');assert.equal(r.to,'2027-03-17T04:00:00Z');
});
