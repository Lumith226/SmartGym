import { readFile } from 'node:fs/promises';
import { SmtpConfig } from './modules/delivery/mail.js';
import type {AuthConfig} from './auth.js';
export interface NotificationConfig{
  tls:{key:string;cert:string;ca:string};identityTls:{key:string;cert:string;ca:string};probeFingerprints:string[];
  identityOrigin:string;webOrigin:string;brokerUrl:string;brokerCaFile?:string;allowLocal:boolean;smtp:SmtpConfig;
  auth?:AuthConfig;
}
export async function loadConfig():Promise<NotificationConfig>{
  const required=(name:string)=>{const v=process.env[name];if(!v)throw new Error('Missing Notification configuration');return v;};
  const file=async(name:string)=>readFile(required(name),'utf8');
  const tls={key:await file('NOTIFICATION_TLS_KEY_FILE'),cert:await file('NOTIFICATION_TLS_CERT_FILE'),ca:await file('NOTIFICATION_TLS_CA_FILE')};
  const identityTls={key:await file('NOTIFICATION_IDENTITY_KEY_FILE'),cert:await file('NOTIFICATION_IDENTITY_CERT_FILE'),ca:await file('NOTIFICATION_IDENTITY_CA_FILE')};
  const probeFingerprints=JSON.parse(required('NOTIFICATION_PROBE_FINGERPRINTS'));
  if(!Array.isArray(probeFingerprints)||!probeFingerprints.length||probeFingerprints.some(v=>typeof v!=='string'||!/^([A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(v)))throw new Error('Invalid probe fingerprints');
  const webOrigin=required('NOTIFICATION_WEB_ORIGIN'),origin=new URL(webOrigin);
  if(origin.origin!==webOrigin||(origin.protocol!=='https:'&&!(origin.protocol==='http:'&&process.env.NODE_ENV!=='production'&&['localhost','127.0.0.1'].includes(origin.hostname))))throw new Error('Invalid web origin');
  const allowLocal=process.env.NOTIFICATION_ALLOW_LOOPBACK_PLAINTEXT==='true';
  const user=process.env.SMTP_USER;
  let auth:AuthConfig|undefined;
  if(process.env.NOTIFICATION_API_ENABLED==='true'){
    const bffFingerprints=JSON.parse(required('NOTIFICATION_BFF_FINGERPRINTS'));
    if(!Array.isArray(bffFingerprints)||!bffFingerprints.length||bffFingerprints.some(v=>typeof v!=='string'||!/^([A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(v)))throw new Error('Invalid BFF fingerprints');
    const origin=required('NOTIFICATION_IDENTITY_ORIGIN'),issuer=required('NOTIFICATION_IDENTITY_ISSUER');
    if(new URL(origin).origin!==origin||new URL(origin).protocol!=='https:'||new URL(issuer).protocol!=='https:')throw new Error('Invalid Identity configuration');
    auth={tls,bffFingerprints,identity:{...identityTls,origin,issuer}};
  }
  return {tls,identityTls,probeFingerprints,webOrigin,auth,identityOrigin:required('NOTIFICATION_IDENTITY_ORIGIN'),brokerUrl:required('NOTIFICATION_AMQP_URL'),
    brokerCaFile:process.env.AMQP_CA_FILE,allowLocal,smtp:{host:required('SMTP_HOST'),port:Number(required('SMTP_PORT')),from:required('SMTP_FROM'),secure:process.env.SMTP_SECURE==='true',allowLocal,
      user,password:user?(await file('SMTP_PASSWORD_FILE')).trim():undefined,ca:process.env.SMTP_CA_FILE?await readFile(process.env.SMTP_CA_FILE,'utf8'):undefined}};
}
