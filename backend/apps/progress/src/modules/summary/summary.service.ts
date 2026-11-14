import { Temporal } from '@js-temporal/polyfill';
import type { Database } from '../../database.js';
import { reject,valid } from '../../contract.js';

export function summaryRange(query:Record<string,unknown>){
  if(Object.keys(query).some(k=>!['from','to','timeZone'].includes(k))||['from','to','timeZone'].some(k=>typeof query[k]!=='string'))reject(400,'BAD_REQUEST');
  try{
    const from=String(query.from),to=String(query.to),timeZone=String(query.timeZone);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||/^[+-]/.test(timeZone)||timeZone.length>80)throw Error();
    new Intl.DateTimeFormat('en',{timeZone});
    const start=Temporal.PlainDate.from(from),end=Temporal.PlainDate.from(to),days=start.until(end).days+1;
    if(start.year<1||end.year<1||days<1||days>366)throw Error();
    const lower=start.toZonedDateTime(timeZone).toInstant();
    const upper=end.add({days:1}).toZonedDateTime(timeZone).toInstant();
    // Logs have UTC years 1..9999. Clamp the lower edge only when a local date starts in UTC year 0.
    const fromUtc=lower.toZonedDateTimeISO('UTC').year<1?'0001-01-01T00:00:00Z':lower.toString();
    return {from,to,timeZone,fromUtc,toUtc:upper.toString().replace(/^\+0(?=\d{5}-)/,''),days};
  }catch{reject(400,'INVALID_SUMMARY_RANGE');}
}
type Daily=Record<string,unknown>&{date:string;workoutCount:number;repetitions:number;volumeKg:number};
export class Summaries{
  constructor(private readonly db:Database){}
  async get(owner:string,query:Record<string,unknown>){
    const r=summaryRange(query);
    const result=await this.db.query<Daily>(`WITH selected AS (
      SELECT id,(performed_at AT TIME ZONE $3)::date AS day FROM workout_logs
      WHERE owner_user_id=$1 AND deleted_at IS NULL AND performed_at>=$4::timestamptz AND performed_at<$5::timestamptz
    ), per_log AS (
      SELECT l.id,l.day,coalesce(sum(s.repetitions),0) AS reps,
        coalesce(sum(s.repetitions::numeric*s.weight_kg) FILTER(WHERE s.repetitions IS NOT NULL AND s.weight_kg IS NOT NULL),0) AS volume
      FROM selected l LEFT JOIN log_exercises e ON e.log_id=l.id LEFT JOIN log_sets s ON s.log_exercise_id=e.id GROUP BY l.id,l.day
    ), daily AS (
      SELECT day,count(*) AS workouts,sum(reps) AS reps,sum(volume) AS volume FROM per_log GROUP BY day
    ) SELECT ($6::date+n)::text AS date,coalesce(d.workouts,0)::integer AS "workoutCount",
      coalesce(d.reps,0)::numeric AS repetitions,coalesce(d.volume,0)::numeric AS "volumeKg",
      sum(coalesce(d.workouts,0)) OVER() AS total_workouts,sum(coalesce(d.reps,0)) OVER() AS total_reps,
      sum(coalesce(d.volume,0)) OVER() AS total_volume
      FROM generate_series(0,$2::integer-1) n LEFT JOIN daily d ON d.day=$6::date+n ORDER BY n`,
    [owner,r.days,r.timeZone,r.fromUtc,r.toUtc,r.from]);
    const series=result.rows.map(d=>({date:d.date,workoutCount:Number(d.workoutCount),repetitions:Number(d.repetitions),volumeKg:Number(d.volumeKg)}));
    const totalRepetitions=Number(result.rows[0].total_reps),workoutCount=Number(result.rows[0].total_workouts);
    const totalVolumeKg=Number(result.rows[0].total_volume);
    const body={from:r.from,to:r.to,timeZone:r.timeZone,workoutCount,totalRepetitions,totalVolumeKg,series};
    if(!valid('ProgressSummary',body))reject(503,'SUMMARY_UNAVAILABLE');return body;
  }
}
