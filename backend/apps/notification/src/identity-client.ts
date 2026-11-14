import { request } from 'node:https';
import { EmailDelivery,parseDelivery,NotificationContact,parseContact } from './contracts.js';
import { DeliveryError,IdentityDeliveryClient } from './modules/delivery/jobs.js';
export class IdentityClient implements IdentityDeliveryClient {
  constructor(private readonly origin:string,private readonly tls:{key:string;cert:string;ca:string},private readonly webOrigin:string){
    const url=new URL(origin);if(url.protocol!=='https:'||url.origin!==origin)throw new Error('Identity HTTPS origin required');
  }
  async contact(userId:string):Promise<NotificationContact>{
    if(!/^[0-9a-f-]{36}$/i.test(userId))throw new DeliveryError('FAILED','INVALID_REFERENCE');
    return new Promise((resolve,reject)=>{
      const req=request(new URL('/internal/v1/identity/users/'+userId+'/notification-contact',this.origin),{...this.tls,agent:false,timeout:5000,signal:AbortSignal.timeout(5000),headers:{accept:'application/json'}},res=>{
        let text='';res.setEncoding('utf8');res.on('data',chunk=>{text+=chunk;if(Buffer.byteLength(text)>4096)req.destroy(new Error('Response too large'));});
        res.on('error',()=>reject(new DeliveryError('RETRY','IDENTITY_UNAVAILABLE')));
        res.on('end',()=>{
          if(res.statusCode!==200){reject(new DeliveryError(res.statusCode===404?'CANCELED':res.statusCode===401||res.statusCode===403?'FAILED':'RETRY',res.statusCode===404?'CONTACT_UNAVAILABLE':'IDENTITY_UNAVAILABLE'));return;}
          try{
            if(!res.headers['content-type']?.startsWith('application/json')||res.headers['cache-control']!=='no-store')throw new Error('Invalid privacy headers');
            const contact=parseContact(JSON.parse(text));
            if(contact.userId!==userId||!contact.emailVerified)throw new Error('Invalid contact');resolve(contact);
          }catch{reject(new DeliveryError('FAILED','IDENTITY_CONTACT_MISMATCH'));}
        });
      });
      req.on('error',()=>reject(new DeliveryError('RETRY','IDENTITY_UNAVAILABLE')));req.on('timeout',()=>req.destroy(new Error('Timeout')));req.end();
    });
  }
  async resolve(ref:string):Promise<EmailDelivery>{
    if(!/^[0-9a-f-]{36}$/i.test(ref))throw new DeliveryError('FAILED','INVALID_REFERENCE');
    return new Promise((resolve,reject)=>{
      const req=request(new URL('/internal/v1/identity/email-deliveries/'+ref,this.origin),{...this.tls,agent:false,timeout:5000,signal:AbortSignal.timeout(5000),headers:{accept:'application/json'}},res=>{
        let text='';res.setEncoding('utf8');res.on('data',chunk=>{text+=chunk;if(Buffer.byteLength(text)>16384)req.destroy(new Error('Response too large'));});
        res.on('error',()=>reject(new DeliveryError('RETRY','IDENTITY_UNAVAILABLE')));
        res.on('end',()=>{
          if(res.statusCode!==200){reject(new DeliveryError(res.statusCode===410?'CANCELED':res.statusCode===404||res.statusCode===401||res.statusCode===403?'FAILED':'RETRY',res.statusCode===410?'ACTION_EXPIRED':'IDENTITY_UNAVAILABLE'));return;}
          try{
            if(!res.headers['content-type']?.startsWith('application/json')||res.headers['cache-control']!=='no-store')throw new Error('Invalid privacy headers');
            const value=parseDelivery(JSON.parse(text)),url=new URL(value.actionUrl);
            const route=value.purpose==='VERIFY_EMAIL'?'/xac-minh-email':'/dat-lai-mat-khau';
            if(value.deliveryRef!==ref||url.origin!==this.webOrigin||url.pathname!==route||url.search||!/^#token=[A-Za-z0-9_-]{43}$/.test(url.hash)||url.username||url.password)throw new Error('Unsafe action URL');
            resolve(value);
          }catch{reject(new DeliveryError('FAILED','IDENTITY_CONTRACT_MISMATCH'));}
        });
      });
      req.on('error',()=>reject(new DeliveryError('RETRY','IDENTITY_UNAVAILABLE')));req.on('timeout',()=>req.destroy(new Error('Timeout')));req.end();
    });
  }
}
