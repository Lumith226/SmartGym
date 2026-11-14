import { metrics } from '@opentelemetry/api';
import { writeFile } from 'node:fs/promises';
import { connectDatabase } from './database.js';
import { ConfirmPublisher,validateBrokerUrl } from './broker.js';
import { OutboxRelay } from './modules/feed/outbox.js';

const age = metrics.getMeter('smartgym.outbox').createObservableGauge('smartgym.outbox.oldest', { unit: 's' });

async function main(){
  const url=process.env.CATALOG_AMQP_URL;if(!url)throw new Error('Missing broker configuration');
  validateBrokerUrl(url,process.env.BROKER_ALLOW_LOOPBACK_PLAINTEXT==='true');
  const db=connectDatabase();let stopped=false,publisher:ConfirmPublisher|undefined;
  const stop=()=>{stopped=true;};process.once('SIGINT',stop);process.once('SIGTERM',stop);
  try {
    if(!(await db.query('SELECT 1 FROM catalog_migrations WHERE version=8')).rows.length)throw Error('Migration required');
    if (process.env.OTEL_SDK_DISABLED === 'false') age.addCallback(async observation => {
      try {
        const row = (await db.query<{ seconds: string }>("SELECT coalesce(extract(epoch FROM now() - min(occurred_at)), 0)::text AS seconds FROM outbox_events WHERE status='PENDING'")).rows[0];
        observation.observe(Math.max(0, Number(row.seconds)));
      } catch { /* No sample when the owner database is unavailable. */ }
    });
    while(!stopped){
      try {
        publisher=await ConfirmPublisher.open(url,process.env.AMQP_CA_FILE,process.env.BROKER_ALLOW_LOOPBACK_PLAINTEXT==='true');
        const relay=new OutboxRelay(db,publisher);
        while (!stopped) {
          if (!await relay.tick()) await new Promise(resolve => setTimeout(resolve, 1000));
          if (process.env.SMARTGYM_WORKER_HEARTBEAT === 'true') await writeFile('/tmp/smartgym-worker-ready', '');
        }
      }catch{console.error('Catalog outbox relay unavailable; pending events retained');await new Promise(resolve=>setTimeout(resolve,1000));}
      finally{await publisher?.close();publisher=undefined;}
    }
  }finally{await db.close();}
}
main().catch(()=>{console.error('Catalog relay startup failed');process.exitCode=1;});
