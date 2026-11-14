import { Temporal } from '@js-temporal/polyfill';
import { reject } from '../../contract.js';

export type ScheduleInput = { planId: string; timeZone: string; startDate: string; endDate?: string; startLocalTime: string;
  durationMinutes: number; recurrence: 'ONCE' | 'WEEKLY'; weekdays?: number[] };
export type Candidate = { key: string; localDate: string; start: string; end: string };

export function validateSchedule(value: ScheduleInput) {
  try {
    if (/^[+-]/.test(value.timeZone)) throw new Error('Named zone required');
    new Intl.DateTimeFormat('en', { timeZone: value.timeZone });
    const start = Temporal.PlainDate.from(value.startDate);
    if (start.year < 1 || start.year > 9999) throw new Error('Date outside supported range');
    if (value.recurrence === 'ONCE' && value.endDate !== undefined) throw new Error('Once uses a single date');
    if (value.endDate !== undefined && (Temporal.PlainDate.from(value.endDate).year < 1 || Temporal.PlainDate.compare(value.startDate, value.endDate) > 0)) throw new Error('Invalid end date');
  } catch { reject(422, 'INVALID_SCHEDULE'); }
}

export function resolveLocal(localDate: string, localTime: string, timeZone: string) {
  const intended = Temporal.PlainDateTime.from(localDate + 'T' + localTime);
  const earlier = intended.toZonedDateTime(timeZone, { disambiguation: 'earlier' });
  if (earlier.toPlainDateTime().equals(intended)) return earlier.toInstant();
  const transition = earlier.getTimeZoneTransition('next');
  if (!transition) throw new Error('Missing zone transition');
  return transition.toInstant();
}

export function project(value: ScheduleInput, now: Date): Candidate[] {
  const current = Temporal.Instant.fromEpochMilliseconds(now.getTime());
  const today = current.toZonedDateTimeISO(value.timeZone).toPlainDate();
  const result: Candidate[] = [];
  for (let index = 0; index < 35; index++) {
    const date = today.add({ days: index });
    if (Temporal.PlainDate.compare(date, value.startDate) < 0 || (value.endDate && Temporal.PlainDate.compare(date, value.endDate) > 0)) continue;
    if (value.recurrence === 'ONCE' ? !date.equals(value.startDate) : !value.weekdays!.includes(date.dayOfWeek)) continue;
    const start = resolveLocal(date.toString(), value.startLocalTime, value.timeZone);
    if (Temporal.Instant.compare(start, current) <= 0) continue;
    result.push({ key: date.toString() + 'T' + value.startLocalTime, localDate: date.toString(), start: start.toString(),
      end: start.add({ seconds: value.durationMinutes * 60 }).toString() });
  }
  return result;
}
