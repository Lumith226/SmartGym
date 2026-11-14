import { connectDatabase } from './database.js';
import { ConfirmPublisher,validateBrokerUrl } from './broker.js';
import { OutboxRelay } from './modules/feed/outbox.js';

async function main(){
  const url=process.env.CATALOG_AMQP_URL;if(!url)throw new Error('Missing broker configuration');
  validateBrokerUrl(url,process.env.BROKER_ALLOW_LOOPBACK_PLAINTEXT==='true');
  const db=connectDatabase();let stopped=false,publisher:ConfirmPublisher|undefined;
  const stop=()=>{stopped=true;};process.once('SIGINT',stop);process.once('SIGTERM',stop);
  try {
    if(!(await db.query('SELECT 1 FROM catalog_migrations WHERE version=8')).rows.length)throw Error('Migration required');
    while(!stopped){
      try {
        publisher=await ConfirmPublisher.open(url,process.env.AMQP_CA_FILE,process.env.BROKER_ALLOW_LOOPBACK_PLAINTEXT==='true');
        const relay=new OutboxRelay(db,publisher);
        while(!stopped){if(!await relay.tick())await new Promise(resolve=>setTimeout(resolve,1000));}
      }catch{console.error('Catalog outbox relay unavailable; pending events retained');await new Promise(resolve=>setTimeout(resolve,1000));}
      finally{await publisher?.close();publisher=undefined;}
    }
  }finally{await db.close();}
}
main().catch(()=>{console.error('Catalog relay startup failed');process.exitCode=1;});
