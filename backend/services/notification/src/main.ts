import { loadConfig } from './config.js';
import { connectDatabase } from './database.js';
import { Inbox,DeliveryWorker } from './modules/delivery/jobs.js';
import { IdentityClient } from './identity-client.js';
import { SmtpProvider } from './modules/delivery/mail.js';
import { EmailConsumer,WorkoutConsumer,brokerUrl } from './broker.js';
import {ReminderInbox,ReminderWorker} from './modules/inbox/reminders.js';
import { createApp } from './app.js';
async function main(){
  const config=await loadConfig();brokerUrl(config.brokerUrl,config.allowLocal);
  const port=Number(process.env.PORT??'3003');if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid port');
  const db=connectDatabase(),mail=new SmtpProvider(config.smtp,config.webOrigin),consumer=new EmailConsumer(new Inbox(db)),workoutConsumer=new WorkoutConsumer(new ReminderInbox(db));
  let stopped=false;
  const pause=()=>new Promise(resolve=>setTimeout(resolve,1000));
  const app=await createApp(db,config,()=>consumer.ready&&workoutConsumer.ready);
  const stop=()=>{stopped=true;};process.once('SIGINT',stop);process.once('SIGTERM',stop);
  try{
    const schema=await db.query('SELECT version FROM notification_migrations WHERE version=2');if(!schema.rows.length)throw new Error('Migration required');
    await app.listen(port,process.env.HOST??'127.0.0.1');
    const identity=new IdentityClient(config.identityOrigin,config.identityTls,config.webOrigin),worker=new DeliveryWorker(db,identity,mail),reminders=new ReminderWorker(db,identity,mail);
    const consume=async(current:EmailConsumer)=>{while(!stopped){try{await current.start(config.brokerUrl,config.allowLocal,config.brokerCaFile);while(!stopped&&current.ready)await pause();}catch{console.error('Notification broker unavailable; deliveries retained');}finally{await current.close();}if(!stopped)await pause();}};
    const consuming=[consume(consumer),consume(workoutConsumer)];
    while(!stopped){try{const auth=await worker.tick(),reminder=await reminders.tick();if(!auth&&!reminder)await pause();}catch{console.error('Notification worker unavailable; delivery state retained');await pause();}}
    await Promise.all(consuming);
  }finally{await consumer.close();await workoutConsumer.close();mail.close();await app.close();await db.close();}
}
main().catch(()=>{console.error('Notification startup failed; check config, TLS and database');process.exitCode=1;});
