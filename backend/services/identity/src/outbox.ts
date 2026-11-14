import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import { Database } from './database.js';

const ajv = new Ajv2020({strict:false});
(addFormatsModule as unknown as (ajv:Ajv2020)=>void)(ajv);
const validEvent = ajv.compile(JSON.parse(await readFile(new URL('../data/email-event.schema.json',import.meta.url),'utf8')));
export interface Publisher { publish(event:Record<string,unknown>):Promise<void> }
export class OutboxRelay {
  constructor(private readonly db:Database,private readonly publisher:Publisher,private readonly now=()=>new Date()){}
  async tick():Promise<boolean> {
    const token=randomUUID(), now=this.now();
    const row=(await this.db.query<{event_id:string;payload:Record<string,unknown>;attempts:number}>(
      `WITH candidate AS (SELECT event_id FROM outbox_events WHERE status='PENDING' AND available_at<=$1
       AND (lease_until IS NULL OR lease_until<=$1) ORDER BY available_at,event_id FOR UPDATE SKIP LOCKED LIMIT 1)
       UPDATE outbox_events o SET lease_token=$2,lease_until=$1::timestamptz+interval '30 seconds',attempts=o.attempts+1
       FROM candidate c WHERE o.event_id=c.event_id RETURNING o.event_id,o.payload,o.attempts`,[now,token])).rows[0];
    if(!row)return false;
    try {
      if(!validEvent(row.payload)||row.payload.id!==row.event_id)throw new Error('Invalid outbox envelope');
      await this.publisher.publish(row.payload);
      await this.db.query(`UPDATE outbox_events SET status='PUBLISHED',published_at=$3,lease_token=NULL,lease_until=NULL,error_code=NULL
        WHERE event_id=$1 AND lease_token=$2`,[row.event_id,token,this.now()]);
    } catch {
      const retry=new Date(this.now().getTime()+Math.min(300000,5000*2**Math.min(row.attempts-1,6)));
      await this.db.query(`UPDATE outbox_events SET available_at=$3,lease_token=NULL,lease_until=NULL,error_code='PUBLISH_UNCONFIRMED'
        WHERE event_id=$1 AND lease_token=$2`,[row.event_id,token,retry]);
      throw new Error('Outbox publish unconfirmed; retry retained');
    }
    return true;
  }
}
