import {createHash,randomUUID} from 'node:crypto';
import {Database,SqlClient} from '../../database.js';
import {InvalidEvent,NotificationContact,PreferencesInput,parseOccurrence,parsePreferences} from '../../contracts.js';
import {backoffs,canonical,DeliveryError,Job,Outcome} from '../delivery/jobs.js';

type Projection=Record<string,unknown>&{occurrence_id:string;owner_user_id:string;version:number;status:string;starts_at:Date;ends_at:Date;time_zone:string};
type Preferences=Record<string,unknown>&{user_id:string;reminder_in_app_enabled:boolean;reminder_email_enabled:boolean;lead_minutes:number;version:number};
type ReminderJob=Job&{owner_user_id:string;channel:'IN_APP'|'EMAIL';source_version:number;status:string;due_at:Date};
const CONSUMER='notification.workout.v1';
async function ownerLock(client:SqlClient,owner:string){await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,19001))',[owner]);}
async function preferences(client:SqlClient,owner:string):Promise<Preferences>{
  await client.query('INSERT INTO notification_preferences(user_id) VALUES($1) ON CONFLICT DO NOTHING',[owner]);
  return (await client.query<Preferences>('SELECT * FROM notification_preferences WHERE user_id=$1',[owner])).rows[0];
}
function enabled(pref:Preferences,channel:string){return channel==='IN_APP'?pref.reminder_in_app_enabled:pref.reminder_email_enabled;}
function dueAt(projection:Projection,pref:Preferences){return new Date(new Date(projection.starts_at).getTime()-pref.lead_minutes*60000);}
function cancellation(projection:Projection,pref:Preferences,channel:string,now:Date):string|null{
  return projection.status!=='SCHEDULED'?'OCCURRENCE_CANCELED':new Date(projection.starts_at)<=now?'OCCURRENCE_STARTED':!enabled(pref,channel)?'PREFERENCE_DISABLED':null;
}
async function schedule(client:SqlClient,p:Projection,pref:Preferences,now:Date){
  // Never revoke SENDING: SMTP may already have accepted it. A CLAIMED worker loses its token.
  const superseded=(await client.query<{id:string;attempts:number}>(`UPDATE delivery_jobs SET status='CANCELED',error_code='OCCURRENCE_SUPERSEDED',lease_token=NULL,lease_until=NULL,updated_at=$3
    WHERE purpose='WORKOUT_REMINDER' AND source_ref=$1 AND source_version<$2 AND status IN('PENDING','RETRY','CLAIMED') RETURNING id,attempts`,[p.occurrence_id,p.version,now])).rows;
  for(const job of superseded)await client.query("UPDATE delivery_attempts SET outcome='CANCELED' WHERE delivery_job_id=$1 AND attempt_no=$2 AND outcome='CLAIMED'",[job.id,job.attempts]);
  for(const channel of ['IN_APP','EMAIL']){
    const reason=cancellation(p,pref,channel,now),id=randomUUID();
    await client.query(`INSERT INTO delivery_jobs(id,owner_user_id,channel,purpose,source_ref,source_version,expires_at,due_at,status,provider_idempotency_key,error_code,created_at,updated_at)
      VALUES($1,$2,$3,'WORKOUT_REMINDER',$4,$5,$6,$7,$8,$9,$10,$11,$11)
      ON CONFLICT(channel,purpose,source_ref,source_version) DO UPDATE SET due_at=EXCLUDED.due_at,expires_at=EXCLUDED.expires_at,
        status=EXCLUDED.status,error_code=EXCLUDED.error_code,lease_token=NULL,lease_until=NULL,updated_at=EXCLUDED.updated_at
      WHERE delivery_jobs.status IN('PENDING','RETRY','CLAIMED') OR
        (delivery_jobs.status='CANCELED' AND delivery_jobs.error_code='PREFERENCE_DISABLED' AND delivery_jobs.attempts<5)`,
    [id,p.owner_user_id,channel,p.occurrence_id,p.version,p.starts_at,dueAt(p,pref),reason?'CANCELED':'PENDING','<'+id+'@mail.smartgym.invalid>',reason,now]);
  }
  await client.query(`UPDATE delivery_attempts a SET outcome='CANCELED' FROM delivery_jobs j
    WHERE a.delivery_job_id=j.id AND a.attempt_no=j.attempts AND a.outcome='CLAIMED'
      AND j.source_ref=$1 AND j.purpose='WORKOUT_REMINDER' AND j.lease_token IS NULL`,[p.occurrence_id]);
}
export class ReminderInbox{
  constructor(private readonly db:Database,private readonly now=()=>new Date()){}
  async accept(buffer:Buffer){
    const event=parseOccurrence(buffer),d=event.data,hash=createHash('sha256').update(canonical(event)).digest('hex'),now=this.now();
    await this.db.transaction(async client=>{
      await ownerLock(client,d.userId);
      const inserted=await client.query(`INSERT INTO inbox_events(consumer,event_id,payload_hash,received_at,processed_at,outcome)
        VALUES($1,$2,$3,$4,$4,'ACCEPTED') ON CONFLICT DO NOTHING RETURNING event_id`,[CONSUMER,event.id,hash,now]);
      if(!inserted.rows.length){
        const prior=(await client.query<{payload_hash:string}>('SELECT payload_hash FROM inbox_events WHERE consumer=$1 AND event_id=$2',[CONSUMER,event.id])).rows[0];
        if(prior.payload_hash!==hash)throw new InvalidEvent('Event ID reused');return;
      }
      const prior=(await client.query<Projection>('SELECT * FROM occurrence_projection WHERE occurrence_id=$1 FOR UPDATE',[d.occurrenceId])).rows[0];
      if(prior&&prior.owner_user_id!==d.userId)throw new InvalidEvent('Occurrence owner changed');
      if(prior&&prior.version>=event.aggregateVersion){
        if(prior.version===event.aggregateVersion&&(prior.status!==d.status||new Date(prior.starts_at).getTime()!==Date.parse(d.startAt)||new Date(prior.ends_at).getTime()!==Date.parse(d.endAt)||prior.time_zone!==d.timeZone))throw new InvalidEvent('Conflicting occurrence version');
        await client.query("UPDATE inbox_events SET outcome='IGNORED_VERSION' WHERE consumer=$1 AND event_id=$2",[CONSUMER,event.id]);return;
      }
      const p=(await client.query<Projection>(`INSERT INTO occurrence_projection(occurrence_id,owner_user_id,version,status,starts_at,ends_at,time_zone,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(occurrence_id) DO UPDATE SET version=EXCLUDED.version,status=EXCLUDED.status,
        starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,time_zone=EXCLUDED.time_zone,updated_at=EXCLUDED.updated_at
        WHERE occurrence_projection.owner_user_id=EXCLUDED.owner_user_id AND occurrence_projection.version<EXCLUDED.version RETURNING *`,
      [d.occurrenceId,d.userId,event.aggregateVersion,d.status,new Date(d.startAt),new Date(d.endAt),d.timeZone,now])).rows[0];
      if(!p)throw new InvalidEvent('Conflicting occurrence owner or version');
      await schedule(client,p,await preferences(client,d.userId),now);
    });
  }
}
export class ReminderPreferences{
  constructor(private readonly db:Database,private readonly now=()=>new Date()){}
  async get(owner:string){return this.db.transaction(async client=>{await ownerLock(client,owner);return preferences(client,owner);});}
  async update(owner:string,input:PreferencesInput,expectedVersion:number){
    input=parsePreferences(input);
    return this.db.transaction(async client=>{
      await ownerLock(client,owner);const prior=await preferences(client,owner);
      if(prior.version!==expectedVersion)throw new Error('PREFERENCE_VERSION_CONFLICT');
      const next=(await client.query<Preferences>(`UPDATE notification_preferences SET reminder_in_app_enabled=$2,reminder_email_enabled=$3,lead_minutes=$4,version=version+1 WHERE user_id=$1 RETURNING *`,
      [owner,input.reminderInAppEnabled,input.reminderEmailEnabled,input.leadMinutes])).rows[0];
      const projections=(await client.query<Projection>("SELECT * FROM occurrence_projection WHERE owner_user_id=$1 AND status='SCHEDULED' AND starts_at>$2 ORDER BY starts_at,occurrence_id",[owner,this.now()])).rows;
      for(const p of projections)await schedule(client,p,next,this.now());return next;
    });
  }
}
export interface ContactClient{contact(userId:string):Promise<NotificationContact>}
export interface ReminderMail{sendReminder(delivery:{recipient:string;occurrenceId:string;startAt:string;timeZone:string},messageId:string):Promise<void>}
export class ReminderWorker{
  constructor(private readonly db:Database,private readonly identity:ContactClient,private readonly mail:ReminderMail,private readonly now=()=>new Date()){}
  private async locked<T>(candidate:ReminderJob,action:(client:SqlClient,job:ReminderJob)=>Promise<T>):Promise<T|undefined>{
    return this.db.transaction(async client=>{
      await ownerLock(client,candidate.owner_user_id);
      const job=(await client.query<ReminderJob>("SELECT * FROM delivery_jobs WHERE id=$1 AND purpose='WORKOUT_REMINDER' FOR UPDATE SKIP LOCKED",[candidate.id])).rows[0];
      if(!job)return;return action(client,job);
    });
  }
  private async finish(client:SqlClient,job:ReminderJob,outcome:Outcome,code:string|null,now:Date){
    if(outcome==='RETRY'&&(job.attempts>=5||new Date(job.expires_at)<=now)){outcome=job.attempts>=5?'FAILED':'CANCELED';code=job.attempts>=5?'RETRY_EXHAUSTED':'OCCURRENCE_STARTED';}
    await client.query(`UPDATE delivery_jobs SET status=$3,error_code=$4,due_at=$5,lease_token=NULL,lease_until=NULL,updated_at=$6,provider_ref=$7
      WHERE id=$1 AND lease_token=$2`,[job.id,job.lease_token,outcome,code,new Date(now.getTime()+(outcome==='RETRY'?backoffs[job.attempts-1]:0)),now,outcome==='SENT'?job.provider_idempotency_key:null]);
    await client.query('UPDATE delivery_attempts SET outcome=$3,provider_receipt=$4 WHERE delivery_job_id=$1 AND attempt_no=$2',
      [job.id,job.attempts,outcome,outcome==='SENT'?job.provider_idempotency_key:null]);
  }
  private async eligible(client:SqlClient,job:ReminderJob,now:Date){
    const p=(await client.query<Projection>('SELECT * FROM occurrence_projection WHERE occurrence_id=$1 AND owner_user_id=$2',[job.source_ref,job.owner_user_id])).rows[0];
    const pref=await preferences(client,job.owner_user_id);
    const reason=!p||p.version!==job.source_version?'OCCURRENCE_SUPERSEDED':cancellation(p,pref,job.channel,now);
    if(reason){await this.finish(client,job,'CANCELED',reason,now);return;}
    if(dueAt(p,pref)>now){await this.finish(client,job,'RETRY','PREFERENCE_DEFERRED',now);await client.query('UPDATE delivery_jobs SET due_at=$2 WHERE id=$1',[job.id,dueAt(p,pref)]);return;}
    return p;
  }
  async recover(){
    const now=this.now();
    const candidates=(await this.db.query<ReminderJob>(`SELECT * FROM delivery_jobs WHERE purpose='WORKOUT_REMINDER' AND
      ((status IN('CLAIMED','SENDING') AND lease_until<=$1) OR (status IN('PENDING','RETRY') AND expires_at<=$1)) ORDER BY due_at,id LIMIT 100`,[now])).rows;
    for(const candidate of candidates)await this.locked(candidate,async(client,job)=>{
      if(['CLAIMED','SENDING'].includes(job.status)&&new Date(job.lease_until as Date)<=now){
        await this.finish(client,job,job.status==='SENDING'?'UNKNOWN':'RETRY',job.status==='SENDING'?'LEASE_LOST_AFTER_SEND':'LEASE_LOST_BEFORE_SEND',now);
      }else if(['PENDING','RETRY'].includes(job.status)&&new Date(job.expires_at)<=now){
        await client.query("UPDATE delivery_jobs SET status='CANCELED',error_code='OCCURRENCE_STARTED',updated_at=$2 WHERE id=$1",[job.id,now]);
      }
    });
  }
  private async claim(){
    const now=this.now();
    // Owner lock precedes job row lock in every path; selecting candidates itself takes no row locks.
    const candidates=(await this.db.query<ReminderJob>(`SELECT * FROM delivery_jobs WHERE purpose='WORKOUT_REMINDER' AND status IN('PENDING','RETRY') AND due_at<=$1 AND expires_at>$1 AND attempts<5 ORDER BY due_at,id LIMIT 20`,[now])).rows;
    for(const candidate of candidates){
      const claimed=await this.locked(candidate,async(client,job)=>{
        if(!['PENDING','RETRY'].includes(job.status)||new Date(job.due_at)>now||new Date(job.expires_at)<=now||job.attempts>=5)return;
        // The token also fences cancellation before any attempt was created.
        job.lease_token=randomUUID();
        const p=(await client.query<Projection>('SELECT * FROM occurrence_projection WHERE occurrence_id=$1 AND owner_user_id=$2',[job.source_ref,job.owner_user_id])).rows[0],pref=await preferences(client,job.owner_user_id);
        const reason=!p||p.version!==job.source_version?'OCCURRENCE_SUPERSEDED':cancellation(p,pref,job.channel,now);
        if(reason){await client.query("UPDATE delivery_jobs SET status='CANCELED',error_code=$2,updated_at=$3 WHERE id=$1",[job.id,reason,now]);return;}
        const updated=(await client.query<ReminderJob>(`UPDATE delivery_jobs SET status='CLAIMED',attempts=attempts+1,lease_token=$2,lease_until=$3::timestamptz+interval '60 seconds',updated_at=$3 WHERE id=$1 RETURNING *`,[job.id,job.lease_token,now])).rows[0];
        await client.query("INSERT INTO delivery_attempts(id,delivery_job_id,attempt_no,at,outcome) VALUES($1,$2,$3,$4,'CLAIMED')",[randomUUID(),job.id,updated.attempts,now]);return updated;
      });
      if(claimed)return claimed;
    }
  }
  async tick():Promise<boolean>{
    await this.recover();const job=await this.claim();if(!job)return false;
    let sending=false;
    try{
      if(job.channel==='IN_APP'){
        await this.locked(job,async(client,current)=>{
          if(current.status!=='CLAIMED'||current.lease_token!==job.lease_token||new Date(current.lease_until as Date)<=this.now())return;
          const p=await this.eligible(client,current,this.now());if(!p)return;
          const message='Buổi tập bắt đầu lúc '+new Intl.DateTimeFormat('vi-VN',{timeZone:p.time_zone,dateStyle:'short',timeStyle:'short'}).format(new Date(p.starts_at))+' ('+p.time_zone+').';
          await client.query(`INSERT INTO notifications(id,user_id,kind,occurrence_id,source_ref,source_version,render_data,created_at)
            VALUES($1,$2,'WORKOUT_REMINDER',$3,$3,$4,$5,$6) ON CONFLICT(user_id,kind,source_ref,source_version) DO NOTHING`,
          [randomUUID(),job.owner_user_id,job.source_ref,job.source_version,JSON.stringify({title:'Sắp đến giờ tập',message}),this.now()]);
          await this.finish(client,current,'SENT',null,this.now());
        });return true;
      }
      const contact=await this.identity.contact(job.owner_user_id);
      if(contact.userId!==job.owner_user_id||!contact.emailVerified)throw new DeliveryError('FAILED','IDENTITY_CONTACT_MISMATCH');
      const p=await this.locked(job,async(client,current)=>{
        if(current.status!=='CLAIMED'||current.lease_token!==job.lease_token||new Date(current.lease_until as Date)<=this.now())return;
        const projection=await this.eligible(client,current,this.now());if(!projection)return;
        await client.query("UPDATE delivery_jobs SET status='SENDING',lease_until=$2::timestamptz+interval '60 seconds',updated_at=$2 WHERE id=$1",[job.id,this.now()]);return projection;
      });
      if(!p)return true;
      sending=true;await this.mail.sendReminder({recipient:contact.email,occurrenceId:job.source_ref,startAt:new Date(p.starts_at).toISOString(),timeZone:p.time_zone},job.provider_idempotency_key);
      await this.locked(job,async(client,current)=>{if(current.status==='SENDING'&&current.lease_token===job.lease_token)await this.finish(client,current,'SENT',null,this.now());});
    }catch(error){
      const outcome=error instanceof DeliveryError?error.outcome:sending?'UNKNOWN':'RETRY',code=error instanceof DeliveryError?error.code:sending?'PROVIDER_OUTCOME_UNKNOWN':'IDENTITY_UNAVAILABLE';
      await this.locked(job,async(client,current)=>{if(current.lease_token===job.lease_token&&['CLAIMED','SENDING'].includes(current.status))await this.finish(client,current,outcome,code,this.now());});
    }
    return true;
  }
}
