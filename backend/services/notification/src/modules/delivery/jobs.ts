import { createHash,randomUUID } from 'node:crypto';
import { Database } from '../../database.js';
import { parseEvent,InvalidEvent,EmailDelivery } from '../../contracts.js';

const CONSUMER='notification.email.v1';export const backoffs=[5000,30000,120000,600000];
export function canonical(value:unknown):string {
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
  return JSON.stringify(value);
}
export type Job=Record<string,unknown>&{id:string;source_ref:string;purpose:string;expires_at:Date;attempts:number;lease_token:string;provider_idempotency_key:string};
export class Inbox {
  constructor(private readonly db:Database,private readonly now=()=>new Date()){}
  async accept(buffer:Buffer){
    const event=parseEvent(buffer),hash=createHash('sha256').update(canonical(event)).digest('hex'),now=this.now();
    await this.db.transaction(async client=>{
      const inserted=await client.query(`INSERT INTO inbox_events(consumer,event_id,payload_hash,received_at,processed_at,outcome)
        VALUES($1,$2,$3,$4,$4,'ACCEPTED') ON CONFLICT DO NOTHING RETURNING event_id`,[CONSUMER,event.id,hash,now]);
      if(!inserted.rows.length){
        const prior=(await client.query<{payload_hash:string}>('SELECT payload_hash FROM inbox_events WHERE consumer=$1 AND event_id=$2',[CONSUMER,event.id])).rows[0];
        if(prior.payload_hash!==hash)throw new InvalidEvent('Event ID reused');return;
      }
      const id=randomUUID(),status=new Date(event.data.expiresAt)<=now?'CANCELED':'PENDING';
      await client.query(`INSERT INTO delivery_jobs(id,channel,purpose,source_ref,source_version,expires_at,due_at,status,provider_idempotency_key,created_at,updated_at)
        VALUES($1,'EMAIL',$2,$3,1,$4,$5,$6,$7,$5,$5) ON CONFLICT(source_ref) WHERE purpose IN('VERIFY_EMAIL','RESET_PASSWORD') DO NOTHING`,
        [id,event.data.purpose,event.data.deliveryRef,new Date(event.data.expiresAt),now,status,'<'+id+'@mail.smartgym.invalid>']);
      const prior=(await client.query<{purpose:string;expires_at:Date}>("SELECT purpose,expires_at FROM delivery_jobs WHERE source_ref=$1 AND purpose IN('VERIFY_EMAIL','RESET_PASSWORD')",[event.data.deliveryRef])).rows[0];
      if(prior.purpose!==event.data.purpose||new Date(prior.expires_at).getTime()!==new Date(event.data.expiresAt).getTime())throw new InvalidEvent('Conflicting business source');
    });
  }
}
export type Outcome='SENT'|'RETRY'|'FAILED'|'CANCELED'|'UNKNOWN';
export class DeliveryError extends Error {
  constructor(readonly outcome:Exclude<Outcome,'SENT'>,readonly code:string){super(code);}
}
export interface IdentityDeliveryClient {resolve(ref:string):Promise<EmailDelivery>}
export interface MailProvider {send(delivery:EmailDelivery,messageId:string):Promise<void>}
export class DeliveryWorker {
  constructor(private readonly db:Database,private readonly identity:IdentityDeliveryClient,private readonly mail:MailProvider,private readonly now=()=>new Date()){}
  async recover(){
    const now=this.now();
    await this.db.transaction(async client=>{
      const expired=(await client.query<Job&{status:string}>("SELECT * FROM delivery_jobs WHERE purpose IN('VERIFY_EMAIL','RESET_PASSWORD') AND status IN('CLAIMED','SENDING') AND lease_until<=$1 FOR UPDATE SKIP LOCKED",[now])).rows;
      for(const job of expired){
        const outcome=job.status==='SENDING'?'UNKNOWN':job.attempts>=5?'FAILED':'RETRY';
        await client.query(`UPDATE delivery_jobs SET status=$2,error_code=$3,lease_token=NULL,lease_until=NULL,due_at=$4,updated_at=$4 WHERE id=$1`,[job.id,outcome,job.status==='SENDING'?'LEASE_LOST_AFTER_SEND':'LEASE_LOST_BEFORE_SEND',now]);
        await client.query('UPDATE delivery_attempts SET outcome=$3 WHERE delivery_job_id=$1 AND attempt_no=$2',[job.id,job.attempts,outcome]);
      }
      await client.query("UPDATE delivery_jobs SET status='CANCELED',error_code='ACTION_EXPIRED',updated_at=$1 WHERE purpose IN('VERIFY_EMAIL','RESET_PASSWORD') AND status IN('PENDING','RETRY') AND expires_at<=$1",[now]);
    });
  }
  private async claim():Promise<Job|undefined>{
    const now=this.now(),token=randomUUID();
    return this.db.transaction(async client=>{
      const job=(await client.query<Job>(`WITH candidate AS(SELECT id FROM delivery_jobs WHERE purpose IN('VERIFY_EMAIL','RESET_PASSWORD') AND status IN('PENDING','RETRY') AND due_at<=$1 AND expires_at>$1 AND attempts<5 ORDER BY due_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
        UPDATE delivery_jobs j SET status='CLAIMED',lease_token=$2,lease_until=$1::timestamptz+interval '60 seconds',attempts=j.attempts+1,updated_at=$1 FROM candidate c WHERE j.id=c.id RETURNING j.*`,[now,token])).rows[0];
      if(job)await client.query('INSERT INTO delivery_attempts(id,delivery_job_id,attempt_no,at,outcome) VALUES($1,$2,$3,$4,$5)',[randomUUID(),job.id,job.attempts,now,'CLAIMED']);
      return job;
    });
  }
  private async finish(job:Job,outcome:Outcome,code:string|null){
    const now=this.now();
    if(outcome==='RETRY'&&job.attempts>=5){outcome='FAILED';code='RETRY_EXHAUSTED';}
    const due=new Date(now.getTime()+(outcome==='RETRY'?backoffs[job.attempts-1]:0));
    await this.db.transaction(async client=>{
      const updated=await client.query(`UPDATE delivery_jobs SET status=$3,error_code=$4,due_at=$5,lease_token=NULL,lease_until=NULL,updated_at=$6,provider_ref=$7
        WHERE id=$1 AND lease_token=$2 RETURNING id`,[job.id,job.lease_token,outcome,code,due,now,outcome==='SENT'?job.provider_idempotency_key:null]);
      if(updated.rows.length)await client.query('UPDATE delivery_attempts SET outcome=$3,provider_receipt=$4 WHERE delivery_job_id=$1 AND attempt_no=$2',
        [job.id,job.attempts,outcome,outcome==='SENT'?job.provider_idempotency_key:null]);
    });
  }
  async tick():Promise<boolean>{
    await this.recover();const job=await this.claim();if(!job)return false;
    let sending=false;
    try{
      const delivery=await this.identity.resolve(job.source_ref);
      if(delivery.deliveryRef!==job.source_ref||delivery.purpose!==job.purpose||new Date(delivery.expiresAt).getTime()!==new Date(job.expires_at).getTime())throw new DeliveryError('FAILED','IDENTITY_CONTRACT_MISMATCH');
      if(new Date(delivery.expiresAt)<=this.now())throw new DeliveryError('CANCELED','ACTION_EXPIRED');
      const claimed=await this.db.query(`UPDATE delivery_jobs SET status='SENDING',lease_until=$3::timestamptz+interval '60 seconds',updated_at=$3
        WHERE id=$1 AND lease_token=$2 AND status='CLAIMED' AND lease_until>$3 RETURNING id`,[job.id,job.lease_token,this.now()]);
      if(!claimed.rows.length)return true;
      sending=true;await this.mail.send(delivery,job.provider_idempotency_key);
      await this.finish(job,'SENT',null);
    }catch(error){
      if(error instanceof DeliveryError)await this.finish(job,error.outcome,error.code);
      else await this.finish(job,sending?'UNKNOWN':'RETRY',sending?'PROVIDER_OUTCOME_UNKNOWN':'IDENTITY_UNAVAILABLE');
    }
    return true;
  }
  async resolveUnknown(id:string,decision:'CONFIRMED_SENT'|'CONFIRMED_NOT_SENT',actorRef:string,evidenceRef:string){
    if(!['CONFIRMED_SENT','CONFIRMED_NOT_SENT'].includes(decision)||!/^OP-[A-Za-z0-9_-]{1,64}$/.test(actorRef)||!/^CASE-[A-Za-z0-9_-]{1,64}$/.test(evidenceRef))throw new Error('Opaque operator and case references required');
    await this.db.transaction(async client=>{
      const job=(await client.query<Job&{status:string}>('SELECT * FROM delivery_jobs WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if(!job||job.status!=='UNKNOWN')throw new Error('Job is not UNKNOWN');
      const now=this.now(),status=decision==='CONFIRMED_SENT'?'SENT':new Date(job.expires_at)<=now?'CANCELED':job.attempts>=5?'FAILED':'RETRY';
      await client.query('UPDATE delivery_jobs SET status=$2,error_code=$3,due_at=$4,updated_at=$4 WHERE id=$1',[id,status,decision,now]);
      await client.query('INSERT INTO delivery_resolutions(id,delivery_job_id,actor_ref,decision,evidence_ref,at) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),id,actorRef,decision,evidenceRef,now]);
    });
  }
}
