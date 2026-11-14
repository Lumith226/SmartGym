import { connectDatabase } from './database.js';
import { ConfirmPublisher } from './broker.js';
import { OutboxRelay } from './outbox.js';

async function main(){
  const url=process.env.WORKOUT_AMQP_URL;if(!url)throw new Error('Missing broker configuration');
  const db=connectDatabase();let stopped=false,publisher:ConfirmPublisher|undefined;
  const stop=()=>{stopped=true;};process.once('SIGINT',stop);process.once('SIGTERM',stop);
  try {
    while(!stopped){
      try {
        publisher=await ConfirmPublisher.open(url,process.env.AMQP_CA_FILE,process.env.BROKER_ALLOW_LOOPBACK_PLAINTEXT==='true');
        const relay=new OutboxRelay(db,publisher);
        while(!stopped){if(!await relay.tick())await new Promise(resolve=>setTimeout(resolve,1000));}
      }catch{console.error('Workout outbox relay unavailable; pending events retained');await new Promise(resolve=>setTimeout(resolve,1000));}
      finally{await publisher?.close();publisher=undefined;}
    }
  }finally{await db.close();}
}
main().catch(()=>{console.error('Workout relay startup failed');process.exitCode=1;});
