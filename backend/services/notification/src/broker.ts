import { connect,ChannelModel,Channel } from 'amqplib';
import { readFile } from 'node:fs/promises';
import { InvalidEvent } from './contracts.js';
export function brokerUrl(value:string,allowLocal=false){
  const url=new URL(value);
  if(url.protocol!=='amqps:'&&!(allowLocal&&process.env.NODE_ENV!=='production'&&url.protocol==='amqp:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)))throw new Error('Broker TLS required');
  return value;
}
export class EmailConsumer {
  private connection?:ChannelModel;private channel?:Channel;private closing=false;
  ready=false;
  constructor(private readonly inbox:{accept(buffer:Buffer):Promise<void>},private readonly queue='smartgym.notification.email.v1',private readonly producer='identity',private readonly routingKey='identity.email-action.requested.v1'){}
  async start(url:string,allowLocal=false,caFile?:string){
    this.closing=false;
    const connection=await connect(brokerUrl(url,allowLocal),{timeout:5000,...(caFile?{ca:await readFile(caFile)}:{})});
    this.connection=connection;connection.on('error',()=>{});connection.on('close',()=>{if(this.connection===connection)this.ready=false;});
    try{
      const channel=await connection.createChannel();this.channel=channel;channel.on('error',()=>{});channel.on('close',()=>{if(this.connection===connection)this.ready=false;});
      await channel.checkQueue(this.queue);await channel.prefetch(8);
      await channel.consume(this.queue,message=>{
        if(!message){if(this.connection===connection){this.ready=false;void this.close();}return;}
        void(async()=>{
          try{
            if(message.content.length>16384)throw new InvalidEvent('Oversized broker message');
            const event=JSON.parse(message.content.toString('utf8'));
            if(!event||message.properties.appId!==this.producer||message.properties.messageId!==event.id||message.fields.routingKey!==this.routingKey||message.properties.contentType!=='application/json')throw new InvalidEvent('Broker envelope mismatch');
            await this.inbox.accept(message.content);channel.ack(message);
          }catch(error){
            if(error instanceof InvalidEvent||error instanceof SyntaxError){try{channel.nack(message,false,false);}catch{}}else if(this.connection===connection){this.ready=false;await this.close();}
          }
        })().catch(()=>{if(this.connection===connection){this.ready=false;void this.close();}});
      },{noAck:false});this.ready=true;
    }catch(error){await this.close();throw error;}
  }
  async close(){if(this.closing)return;this.closing=true;this.ready=false;await this.connection?.close().catch(()=>{});this.connection=undefined;this.channel=undefined;}
}
export class WorkoutConsumer extends EmailConsumer{
  constructor(inbox:{accept(buffer:Buffer):Promise<void>}){super(inbox,'smartgym.notification.workout.v1','workout','workout.occurrence.changed.v1');}
}
