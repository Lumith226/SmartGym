import { ROOT_CONTEXT, context, propagation } from '@opentelemetry/api';
import { randomUUID } from 'node:crypto';
import { validCatalogEvent } from './feed-contract.js';
import type { Database } from '../../database.js';

export interface Publisher { publish(event: Record<string, unknown>): Promise<void> }
export class OutboxRelay {
  constructor(private readonly db:Database,private readonly publisher:Publisher,private readonly now=()=>new Date()){}
  async tick():Promise<boolean> {
    const token=randomUUID(), now=this.now();
    const row=(await this.db.query<{event_id:string;payload:Record<string,unknown>;attempts:number;traceparent:string|null;type:string;aggregate_version:string;schema_version:number;correlation_id:string}>(
      `WITH candidate AS (SELECT event_id FROM outbox_events WHERE status='PENDING' AND available_at<=$1
       AND (lease_until IS NULL OR lease_until<=$1) ORDER BY available_at,event_id FOR UPDATE SKIP LOCKED LIMIT 1)
       UPDATE outbox_events o SET lease_token=$2,lease_until=$1::timestamptz+interval '30 seconds',attempts=o.attempts+1
       FROM candidate c WHERE o.event_id=c.event_id RETURNING o.event_id,o.payload,o.traceparent,o.attempts,o.type,o.aggregate_version,o.schema_version,o.correlation_id`,[now,token])).rows[0];
    if(!row)return false;
    let code='PUBLISH_UNCONFIRMED';
    try {
      if(!validCatalogEvent(row.payload)||row.payload.aggregateId!=='catalog'||row.payload.producer!=='catalog'||row.payload.id!==row.event_id||
        row.payload.type!==row.type||row.payload.aggregateVersion!==Number(row.aggregate_version)||row.payload.schemaVersion!==row.schema_version||row.payload.correlationId!==row.correlation_id){code='OUTBOX_CONTRACT_INVALID';throw new Error('Invalid outbox envelope');}
      const parent = propagation.extract(ROOT_CONTEXT, row.traceparent ? { traceparent: row.traceparent } : {});
      await context.with(parent, () => this.publisher.publish(row.payload));
      await this.db.query(`UPDATE outbox_events SET status='PUBLISHED',published_at=$3,lease_token=NULL,lease_until=NULL,error_code=NULL
        WHERE event_id=$1 AND lease_token=$2`,[row.event_id,token,this.now()]);
    } catch {
      const retry=new Date(this.now().getTime()+Math.min(300000,5000*2**Math.min(row.attempts-1,6)));
      await this.db.query(`UPDATE outbox_events SET available_at=$3,lease_token=NULL,lease_until=NULL,error_code=$4
        WHERE event_id=$1 AND lease_token=$2`,[row.event_id,token,retry,code]);
      throw new Error('Outbox publish unconfirmed; retry retained');
    }
    return true;
  }
}
