import { context, propagation } from '@opentelemetry/api';
import { connect, ChannelModel, ConfirmChannel } from 'amqplib';
import { readFile } from 'node:fs/promises';
import { Publisher } from './modules/feed/outbox.js';

export function validateBrokerUrl(value:string,allowLocal=false):string {
  const url=new URL(value);
  if(url.protocol!=='amqps:' && !(allowLocal&&process.env.NODE_ENV!=='production'&&url.protocol==='amqp:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw new Error('AMQP requires TLS or explicit loopback sandbox');
  return value;
}
export class ConfirmPublisher implements Publisher {
  private constructor(private readonly connection:ChannelModel,private readonly channel:ConfirmChannel){}
  static async open(url:string,caFile?:string,allowLocal=false) {
    const connection=await connect(validateBrokerUrl(url,allowLocal),{timeout:5000,...(caFile?{ca:await readFile(caFile)}:{})});
    connection.on('error',()=>{});
    try {
      const channel=await connection.createConfirmChannel();channel.on('error',()=>{});
      await channel.checkExchange('smartgym.events.v1');
      return new ConfirmPublisher(connection,channel);
    } catch(error){await connection.close().catch(()=>{});throw error;}
  }
  async publish(event:Record<string,unknown>):Promise<void> {
    await new Promise<void>((resolve,reject)=>{
      let returned=false,settled=false;
      const onReturn=()=>{returned=true;};
      const finish=(error?:unknown)=>{if(settled)return;settled=true;clearTimeout(timer);this.channel.removeListener('return',onReturn);error?reject(new Error('Publish unconfirmed')):resolve();};
      const timer=setTimeout(()=>{finish(new Error('Confirm timeout'));void this.channel.close().catch(()=>{});},5000);
      this.channel.on('return',onReturn);
      try {
        const headers: Record<string, string> = {};
        propagation.inject(context.active(), headers);
        this.channel.publish('smartgym.events.v1',String(event.type),Buffer.from(JSON.stringify(event)),{
          headers,persistent:true,mandatory:true,contentType:'application/json',messageId:String(event.id),type:String(event.type),appId:'catalog',
        },error=>finish(error||returned?new Error('Unroutable or nacked'):undefined));
      } catch(error){finish(error);}
    });
  }
  async close(){await this.connection.close().catch(()=>{});}
}
