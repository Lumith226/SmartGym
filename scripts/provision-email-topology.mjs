import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
const require=createRequire(new URL('../backend/services/notification/package.json',import.meta.url));
const {connect}=require('amqplib');
export async function provisionEmailTopology(url,caFile){
  const connection=await connect(url,{timeout:5000,...(caFile?{ca:await readFile(caFile)}:{})});connection.on('error',()=>{});
  try{
    const channel=await connection.createChannel();channel.on('error',()=>{});
    await channel.assertExchange('smartgym.events.v1','topic',{durable:true});
    await channel.assertExchange('smartgym.email.dlx.v1','direct',{durable:true});
    await channel.assertQueue('smartgym.notification.email.dlq.v1',{durable:true,arguments:{'x-queue-type':'quorum'}});
    await channel.bindQueue('smartgym.notification.email.dlq.v1','smartgym.email.dlx.v1','rejected');
    await channel.assertQueue('smartgym.notification.email.v1',{durable:true,arguments:{'x-queue-type':'quorum','x-dead-letter-exchange':'smartgym.email.dlx.v1','x-dead-letter-routing-key':'rejected'}});
    await channel.bindQueue('smartgym.notification.email.v1','smartgym.events.v1','identity.email-action.requested.v1');
  }finally{await connection.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const url=process.env.AMQP_ADMIN_URL;if(!url)throw new Error('AMQP_ADMIN_URL required for provisioning');
  const {brokerUrl}=await import('../backend/services/notification/dist/broker.js');
  await provisionEmailTopology(brokerUrl(url,process.env.NOTIFICATION_ALLOW_LOOPBACK_PLAINTEXT==='true'),process.env.AMQP_CA_FILE);
  console.log('Durable email topology provisioned');
}
