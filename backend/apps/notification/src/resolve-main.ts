import { connectDatabase } from './database.js';
import { DeliveryWorker } from './modules/delivery/jobs.js';
async function main(){
  const[id,decision,actor,evidence]=process.argv.slice(2);
  if(!/^[a-f0-9-]{36}$/i.test(id??''))throw new Error('Usage: resolve <jobId> CONFIRMED_SENT|CONFIRMED_NOT_SENT OP-actor CASE-evidence');
  const db=connectDatabase();
  try{
    const worker=new DeliveryWorker(db,{resolve:async()=>{throw new Error('Not available in operator command');}},{send:async()=>{throw new Error('Not available in operator command');}});
    await worker.resolveUnknown(id,decision as 'CONFIRMED_SENT'|'CONFIRMED_NOT_SENT',actor,evidence);
    console.log('Delivery reconciled with operator evidence');
  }finally{await db.close();}
}
main().catch(()=>{console.error('Delivery reconciliation refused; verify UNKNOWN status and evidence references');process.exitCode=1;});
