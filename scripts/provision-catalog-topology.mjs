import {createRequire} from 'node:module';import {readFile} from 'node:fs/promises';import {resolve} from 'node:path';import {fileURLToPath} from 'node:url';
const {connect}=createRequire(new URL('../backend/apps/catalog/package.json',import.meta.url))('amqplib');
export async function provisionCatalogTopology(url,caFile){
  const connection=await connect(url,{timeout:5000,...(caFile?{ca:await readFile(caFile)}:{})});connection.on('error',()=>{});
  try{const ch=await connection.createChannel();ch.on('error',()=>{});
    await ch.assertExchange('smartgym.events.v1','topic',{durable:true});await ch.assertExchange('smartgym.catalog.dlx.v1','direct',{durable:true});
    await ch.assertQueue('smartgym.rag.catalog.dlq.v1',{durable:true,arguments:{'x-queue-type':'quorum'}});await ch.bindQueue('smartgym.rag.catalog.dlq.v1','smartgym.catalog.dlx.v1','rejected');
    await ch.assertQueue('smartgym.rag.catalog.v1',{durable:true,arguments:{'x-queue-type':'quorum','x-dead-letter-exchange':'smartgym.catalog.dlx.v1','x-dead-letter-routing-key':'rejected'}});
    for(const action of ['published','updated','unpublished'])await ch.bindQueue('smartgym.rag.catalog.v1','smartgym.events.v1','catalog.exercise.'+action+'.v1');
  }finally{await connection.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const {validateBrokerUrl}=await import('../backend/apps/catalog/dist/broker.js');const url=process.env.AMQP_ADMIN_URL;if(!url)throw Error('AMQP_ADMIN_URL required');
  await provisionCatalogTopology(validateBrokerUrl(url,process.env.BROKER_ALLOW_LOOPBACK_PLAINTEXT==='true'),process.env.AMQP_CA_FILE);console.log('Proposed Catalog feed topology provisioned');
}
