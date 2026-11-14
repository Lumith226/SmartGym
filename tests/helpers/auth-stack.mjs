import {createRequire} from 'node:module';import {readFile,writeFile} from 'node:fs/promises';import {request} from 'node:https';
import {randomBytes,generateKeyPairSync} from 'node:crypto';import {join} from 'node:path';
import {startPostgres,freePort} from './postgres.mjs';import {startRabbit} from './rabbitmq.mjs';import {startProcess} from './processes.mjs';
import {provisionEmailTopology} from '../../scripts/provision-email-topology.mjs';
import {createTestTls} from '../../backend/services/identity/test/tls.cjs';
import {connectDatabase as identityDatabase} from '../../backend/services/identity/dist/database.js';
import {migrate as identityMigrate} from '../../backend/services/identity/dist/migrate.js';
import {createApp} from '../../backend/services/identity/dist/app.js';import {IdentityKeys} from '../../backend/services/identity/dist/modules/accounts/crypto.js';
import {OutboxRelay} from '../../backend/services/identity/dist/outbox.js';import {ConfirmPublisher} from '../../backend/services/identity/dist/broker.js';
import {connectDatabase as notificationDatabase} from '../../backend/services/notification/dist/database.js';
import {migrate as notificationMigrate} from '../../backend/services/notification/dist/migrate.js';
import {Inbox,DeliveryWorker} from '../../backend/services/notification/dist/modules/delivery/jobs.js';import {EmailConsumer} from '../../backend/services/notification/dist/broker.js';
import {IdentityClient} from '../../backend/services/notification/dist/identity-client.js';import {SmtpProvider} from '../../backend/services/notification/dist/modules/delivery/mail.js';
import {connectDatabase as catalogDatabase} from '../../backend/services/catalog/dist/database.js';
import {migrate as catalogMigrate} from '../../backend/services/catalog/dist/migrate.js';import {importSnapshot} from '../../backend/services/catalog/dist/import.js';
import {fingerprint} from '../../backend/services/catalog/dist/modules/admin/admin-store.js';
import {startMediaTools} from './media-stack.mjs';
import {startChatProvider} from './chat-provider.mjs';
const require=createRequire(new URL('../../backend/services/notification/package.json',import.meta.url)),{SMTPServer}=require('smtp-server');
export async function startAuthStack({workout:workoutRequested=false,progress:progressRequested=false,notifications:withNotifications=false,pose:withPose=false,chat:withChat=false,webPort:requestedWebPort}={}){
  const withProgress=progressRequested||withPose;
  const withWorkout=workoutRequested||withProgress;
  const cleanup=[];let closed=false;
  const defer=action=>cleanup.push(action);
  async function stop(){if(closed)return;closed=true;const errors=[];for(const action of cleanup.reverse())try{await action();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'Auth fixture cleanup failed');}
  try{
    const pg=await startPostgres();defer(pg.stop);const broker=await startRabbit();defer(broker.stop);await provisionEmailTopology(broker.url);
    const snapshot=JSON.parse(await readFile('backend/services/catalog/data/smartgym-m2.json','utf8'));
    const catalogDb=catalogDatabase(pg.connectionString);defer(()=>catalogDb.close());await catalogMigrate(catalogDb);await importSnapshot(catalogDb,snapshot,true);
    const databaseUrls={};
    for(const name of ['identity_browser','notification_browser',...(withWorkout?['workout_browser']:[]),...(withProgress?['progress_browser']:[]),...(withPose?['pose_browser']:[])]){
      const password=randomBytes(24).toString('hex');await catalogDb.query("CREATE ROLE "+name+" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '"+password+"'");
      await catalogDb.query('CREATE DATABASE '+name+' OWNER '+name);await catalogDb.query('REVOKE CONNECT ON DATABASE '+name+' FROM PUBLIC');
      const value=new URL(pg.connectionString);value.username=name;value.password=password;value.pathname='/'+name;databaseUrls[name]=value.href;
    }
    const identityDb=identityDatabase(databaseUrls.identity_browser),notificationDb=notificationDatabase(databaseUrls.notification_browser);defer(()=>identityDb.close());defer(()=>notificationDb.close());
    await identityMigrate(identityDb);await notificationMigrate(notificationDb);
    const tls=await createTestTls();defer(tls.stop);
    const webPort=requestedWebPort??await freePort(),url='https://127.0.0.1:'+webPort,identityPort=await freePort();
    const pair=generateKeyPairSync('rsa',{modulusLength:2048});const keys=new IdentityKeys(pair.privateKey.export({type:'pkcs8',format:'pem'}),'browser-test','https://identity.test',randomBytes(32),randomBytes(32));
    const {app,identity}=await createApp(identityDb,{keys,webOrigin:url,callers:tls.callers,tls:{...tls.clients.server,ca:tls.ca}});await app.listen(identityPort,'127.0.0.1');
    let identityClosed=false;const stopIdentity=async()=>{if(!identityClosed){identityClosed=true;await app.close();}};defer(stopIdentity);
    const catalogPort=await freePort(),catalogAdminPort=await freePort();
    const cmsTools = process.env.CMS_TEST_TOOLS === 'true' ? await startMediaTools() : undefined;
    let cmsEnv = {}, importFixture;
    if (cmsTools) {
      defer(cmsTools.stop);
      const {PutBucketCorsCommand}=createRequire(new URL('../../backend/services/catalog/package.json',import.meta.url))('@aws-sdk/client-s3');
      await cmsTools.client.send(new PutBucketCorsCommand({Bucket:cmsTools.bucket,CORSConfiguration:{CORSRules:[{
        AllowedOrigins:[url],AllowedMethods:['PUT'],AllowedHeaders:['content-type','if-none-match','x-amz-checksum-sha256'],MaxAgeSeconds:60,
      }]}}),{abortSignal:AbortSignal.timeout(5000)});
      const pkg={sourceKey:'SMARTGYM_KB',sourceRevision:'browser-kb.v1',
        provenance:{sourceRef:snapshot.source.path,sha256:snapshot.source.sha256,rights:snapshot.source.rights},
        records:[{id:'browser_import_eq',contentType:'equipment',data:{nameVi:'Dụng cụ từ KB thử nghiệm',slug:'browser-import-eq'}}]};
      importFixture={sourceKey:pkg.sourceKey,sourceRevision:pkg.sourceRevision,manifestSha256:fingerprint(pkg)};
      const registry=join(cmsTools.directory,'registry.json');
      await writeFile(join(cmsTools.directory,'browser-kb.json'),JSON.stringify(pkg));
      await writeFile(registry,JSON.stringify([{...importFixture,file:'browser-kb.json'}]));
      cmsEnv={CATALOG_IMPORT_REGISTRY_FILE:registry,CATALOG_MEDIA_ENABLED:'true',NODE_ENV:'development',
        CATALOG_MEDIA_S3_ENDPOINT:cmsTools.endpoint,CATALOG_MEDIA_BUCKET:cmsTools.bucket,CATALOG_MEDIA_REGION:'us-east-1',
        CATALOG_MEDIA_PUBLIC_ORIGIN:'http://127.0.0.1:'+catalogPort,CATALOG_MEDIA_FFMPEG:cmsTools.ffmpeg,CATALOG_MEDIA_FFPROBE:cmsTools.ffprobe,
        CATALOG_MEDIA_CLAMD_HOST:cmsTools.scanner.host,CATALOG_MEDIA_CLAMD_PORT:String(cmsTools.scanner.port),
        AWS_ACCESS_KEY_ID:cmsTools.credentials.accessKeyId,AWS_SECRET_ACCESS_KEY:cmsTools.credentials.secretAccessKey};
    }
    const catalog=startProcess(['dist/main.js'],'backend/services/catalog',{
      ...cmsEnv,PORT:String(catalogPort),DATABASE_URL:pg.connectionString,HOST:'127.0.0.1',
      CATALOG_ADMIN_ENABLED:'true',CATALOG_ADMIN_PORT:String(catalogAdminPort),CATALOG_ADMIN_HOST:'127.0.0.1',
      CATALOG_ADMIN_BFF_FINGERPRINTS:JSON.stringify(tls.callers.bff),
      ...(withWorkout?{CATALOG_REF_FINGERPRINTS:JSON.stringify([...tls.callers.notification,...(withProgress?tls.callers.catalog:[])])}:{}),
      CATALOG_ADMIN_TLS_KEY_FILE:join(tls.directory,'server.key'),CATALOG_ADMIN_TLS_CERT_FILE:join(tls.directory,'server.crt'),
      CATALOG_ADMIN_TLS_CA_FILE:join(tls.directory,'ca.crt'),CATALOG_IDENTITY_TLS_CA_FILE:join(tls.directory,'ca.crt'),
      CATALOG_IDENTITY_TLS_KEY_FILE:join(tls.directory,'catalog.key'),CATALOG_IDENTITY_TLS_CERT_FILE:join(tls.directory,'catalog.crt'),
      CATALOG_IDENTITY_ORIGIN:'https://127.0.0.1:'+identityPort,CATALOG_IDENTITY_ISSUER:'https://identity.test',
    });defer(()=>catalog.stop());await catalog.waitFor('http://127.0.0.1:'+catalogPort+'/health/ready');
    if (cmsTools) {
      const worker=startProcess(['dist/media-worker.js'],'backend/services/catalog',{...cmsEnv,DATABASE_URL:pg.connectionString});
      defer(()=>worker.stop());
    }
    let workoutDb,stopWorkout;
    if(withWorkout){
      const {connectDatabase}=await import('../../backend/services/workout/dist/database.js');
      const {migrate}=await import('../../backend/services/workout/dist/migrate.js');
      workoutDb=connectDatabase(databaseUrls.workout_browser);defer(()=>workoutDb.close());await migrate(workoutDb);
      const workoutPort=await freePort();databaseUrls.workoutOrigin='https://127.0.0.1:'+workoutPort;
      const workout=startProcess(['dist/main.js'],'backend/services/workout',{
        DATABASE_URL:databaseUrls.workout_browser,WORKOUT_PORT:String(workoutPort),WORKOUT_HOST:'127.0.0.1',
        WORKOUT_BFF_FINGERPRINTS:JSON.stringify(tls.callers.bff),
        ...(withProgress?{WORKOUT_PROGRESS_FINGERPRINTS:JSON.stringify(tls.callers.catalog)}:{}),
        WORKOUT_TLS_KEY_FILE:join(tls.directory,'server.key'),WORKOUT_TLS_CERT_FILE:join(tls.directory,'server.crt'),WORKOUT_TLS_CA_FILE:join(tls.directory,'ca.crt'),
        WORKOUT_IDENTITY_ORIGIN:'https://127.0.0.1:'+identityPort,WORKOUT_IDENTITY_ISSUER:'https://identity.test',
        WORKOUT_IDENTITY_TLS_KEY_FILE:join(tls.directory,'catalog.key'),WORKOUT_IDENTITY_TLS_CERT_FILE:join(tls.directory,'catalog.crt'),WORKOUT_IDENTITY_TLS_CA_FILE:join(tls.directory,'ca.crt'),
        WORKOUT_CATALOG_ORIGIN:'https://127.0.0.1:'+catalogAdminPort,WORKOUT_CATALOG_TLS_KEY_FILE:join(tls.directory,'notification.key'),
        WORKOUT_CATALOG_TLS_CERT_FILE:join(tls.directory,'notification.crt'),WORKOUT_CATALOG_TLS_CA_FILE:join(tls.directory,'ca.crt'),
      });stopWorkout=()=>workout.stop();defer(stopWorkout);
      let ready=false;
      for(let i=0;i<100;i++){
        ready=await new Promise(resolve=>{const req=request(databaseUrls.workoutOrigin+'/health/ready',{...tls.clients.bff,ca:tls.ca,agent:false,signal:AbortSignal.timeout(500)},res=>{res.resume();resolve(res.statusCode===200);});req.on('error',()=>resolve(false));req.end();});
        if(ready)break;await new Promise(resolve=>setTimeout(resolve,100));
      }
      if(!ready)throw Error('Workout fixture did not start');
    }
    let poseDb,poseSummary;
    if(withPose){
      const {connectDatabase}=await import('../../backend/services/pose/dist/database.js'),{migrate}=await import('../../backend/services/pose/dist/migrate.js');
      const {startPoseSummary}=await import('./pose-summary.mjs');poseDb=connectDatabase(databaseUrls.pose_browser);defer(()=>poseDb.close());await migrate(poseDb);
      poseSummary=await startPoseSummary(poseDb,tls,'https://127.0.0.1:'+identityPort);defer(poseSummary.stop);
    }
    let progressDb,stopProgress;
    if(withProgress){
      const {connectDatabase}=await import('../../backend/services/progress/dist/database.js');const {migrate}=await import('../../backend/services/progress/dist/migrate.js');
      progressDb=connectDatabase(databaseUrls.progress_browser);defer(()=>progressDb.close());await migrate(progressDb);
      const progressPort=await freePort();databaseUrls.progressOrigin='https://127.0.0.1:'+progressPort;
      const certs=(prefix,client)=>Object.fromEntries([['KEY',client+'.key'],['CERT',client+'.crt'],['CA','ca.crt']].map(([key,file])=>[prefix+'_'+key+'_FILE',join(tls.directory,file)]));
      const service=startProcess(['dist/main.js'],'backend/services/progress',{
        DATABASE_URL:databaseUrls.progress_browser,PROGRESS_PORT:String(progressPort),PROGRESS_HOST:'127.0.0.1',PROGRESS_BFF_FINGERPRINTS:JSON.stringify(tls.callers.bff),
        ...certs('PROGRESS_TLS','server'),...certs('PROGRESS_IDENTITY_TLS','catalog'),PROGRESS_IDENTITY_ORIGIN:'https://127.0.0.1:'+identityPort,PROGRESS_IDENTITY_ISSUER:'https://identity.test',
        PROGRESS_WORKOUT_ORIGIN:databaseUrls.workoutOrigin,...certs('PROGRESS_WORKOUT_TLS','catalog'),PROGRESS_CATALOG_ORIGIN:'https://127.0.0.1:'+catalogAdminPort,...certs('PROGRESS_CATALOG_TLS','catalog'),
        ...(withPose?{PROGRESS_POSE_ORIGIN:poseSummary.origin,...certs('PROGRESS_POSE_TLS','catalog')}:{}),
      });stopProgress=()=>service.stop();defer(stopProgress);
      let ready=false;for(let i=0;i<100;i++){
        ready=await new Promise(resolve=>{const req=request(databaseUrls.progressOrigin+'/health/ready',{...tls.clients.bff,ca:tls.ca,agent:false,signal:AbortSignal.timeout(500)},res=>{res.resume();resolve(res.statusCode===200);});req.on('error',()=>resolve(false));req.end();});
        if(ready)break;await new Promise(resolve=>setTimeout(resolve,100));
      }if(!ready)throw Error('Progress fixture did not start');
    }
    const messages=[];
    const smtp=new SMTPServer({authOptional:true,disabledCommands:['AUTH','STARTTLS'],onData(stream,session,callback){let raw='';stream.setEncoding('utf8');stream.on('data',chunk=>raw+=chunk);stream.on('end',()=>{
      const text=Buffer.from(raw.split('\r\n\r\n').slice(1).join('\r\n\r\n').replaceAll('\r\n',''),'base64').toString('utf8');
      const action=text.match(/https:\/\/127\.0\.0\.1:\d+\/[^\s]+#token=[A-Za-z0-9_-]{43}/)?.[0];messages.push({recipients:session.envelope.rcptTo.map(v=>v.address),action});callback(null,'sandbox-accepted');
    });}});smtp.on('error',()=>{});await new Promise(resolve=>smtp.listen(0,'127.0.0.1',resolve));defer(()=>new Promise(resolve=>{for(const connection of smtp.connections)connection.close();smtp.close(resolve);}));
    const mail=new SmtpProvider({host:'127.0.0.1',port:smtp.server.address().port,from:'noreply@smartgym.test',secure:false,allowLocal:true});defer(()=>mail.close());
    const consumer=new EmailConsumer(new Inbox(notificationDb));await consumer.start(broker.consumerUrl,true);defer(()=>consumer.close());
    const publisher=await ConfirmPublisher.open(broker.publisherUrl,undefined,true);defer(()=>publisher.close());
    const relay=new OutboxRelay(identityDb,publisher),worker=new DeliveryWorker(notificationDb,new IdentityClient('https://127.0.0.1:'+identityPort,{...tls.clients.notification,ca:tls.ca},url),mail);
    let pumping=true,pumpFailed=false;
    const pump=(async()=>{while(pumping){try{await relay.tick();await worker.tick();}catch{pumpFailed=true;}await new Promise(resolve=>setTimeout(resolve,50));}})();
    defer(async()=>{pumping=false;await pump;});
    let notificationOrigin,stopNotification;
    if(withNotifications){
      const {createApp}=await import('../../backend/services/notification/dist/app.js');
      const api=await createApp(notificationDb,{tls:{...tls.clients.server,ca:tls.ca},probeFingerprints:tls.callers.bff,
        auth:{tls:{...tls.clients.server,ca:tls.ca},bffFingerprints:tls.callers.bff,identity:{...tls.clients.notification,ca:tls.ca,origin:'https://127.0.0.1:'+identityPort,issuer:'https://identity.test'}}},()=>consumer.ready);
      await api.listen(0,'127.0.0.1');notificationOrigin='https://127.0.0.1:'+api.getHttpServer().address().port;
      let closed=false;stopNotification=async()=>{if(!closed){closed=true;await api.close();}};defer(stopNotification);
    }
    const chatProvider=withChat?await startChatProvider(tls):undefined;if(chatProvider)defer(chatProvider.stop);
    const web=startProcess(['server.mjs'],'frontend',{NODE_ENV:'production',PORT:String(webPort),HOST:'127.0.0.1',NEXT_TELEMETRY_DISABLED:'1',CATALOG_URL:'http://127.0.0.1:'+catalogPort,
      ...(chatProvider?.env??{}),
      WEB_PUBLIC_ORIGIN:url,
      BFF_AUTH_ENABLED:'true',BFF_WEB_ORIGIN:url,BFF_IDENTITY_ORIGIN:'https://127.0.0.1:'+identityPort,
      BFF_CATALOG_ADMIN_ORIGIN:'https://127.0.0.1:'+catalogAdminPort,BFF_CATALOG_ADMIN_KEY_FILE:join(tls.directory,'bff.key'),
      BFF_CATALOG_ADMIN_CERT_FILE:join(tls.directory,'bff.crt'),BFF_CATALOG_ADMIN_CA_FILE:join(tls.directory,'ca.crt'),
      ...(withWorkout?{BFF_WORKOUT_ORIGIN:databaseUrls.workoutOrigin,BFF_WORKOUT_KEY_FILE:join(tls.directory,'bff.key'),
        BFF_WORKOUT_CERT_FILE:join(tls.directory,'bff.crt'),BFF_WORKOUT_CA_FILE:join(tls.directory,'ca.crt')}:{}),
      ...(withProgress?{BFF_PROGRESS_ORIGIN:databaseUrls.progressOrigin,BFF_PROGRESS_KEY_FILE:join(tls.directory,'bff.key'),BFF_PROGRESS_CERT_FILE:join(tls.directory,'bff.crt'),BFF_PROGRESS_CA_FILE:join(tls.directory,'ca.crt')}:{}),
      ...(withPose?{BFF_POSE_ORIGIN:poseSummary.origin,BFF_POSE_TLS_KEY_FILE:join(tls.directory,'bff.key'),BFF_POSE_TLS_CERT_FILE:join(tls.directory,'bff.crt'),BFF_POSE_TLS_CA_FILE:join(tls.directory,'ca.crt')}:{}),
      ...(withNotifications?{BFF_NOTIFICATION_ORIGIN:notificationOrigin,BFF_NOTIFICATION_KEY_FILE:join(tls.directory,'bff.key'),BFF_NOTIFICATION_CERT_FILE:join(tls.directory,'bff.crt'),BFF_NOTIFICATION_CA_FILE:join(tls.directory,'ca.crt')}:{}),
      ...(cmsTools ? {BFF_CATALOG_MEDIA_ORIGIN:cmsTools.endpoint,WEB_CATALOG_MEDIA_ORIGIN:cmsEnv.CATALOG_MEDIA_PUBLIC_ORIGIN} : {}),
      BFF_WEB_KEY_FILE:join(tls.directory,'server.key'),BFF_WEB_CERT_FILE:join(tls.directory,'server.crt'),
      BFF_IDENTITY_KEY_FILE:join(tls.directory,'bff.key'),BFF_IDENTITY_CERT_FILE:join(tls.directory,'bff.crt'),BFF_IDENTITY_CA_FILE:join(tls.directory,'ca.crt')});defer(()=>web.stop());
    const ready=()=>new Promise(resolve=>{const req=request(url+'/dang-nhap',{ca:tls.ca,agent:false,signal:AbortSignal.timeout(1000)},res=>{res.resume();resolve(res.statusCode===200);});req.on('error',()=>resolve(false));req.end();});
    const deadline=Date.now()+20000;let listening=false;while(Date.now()<deadline&&web.child.exitCode===null){if(await ready()){listening=true;break;}await new Promise(resolve=>setTimeout(resolve,100));}
    if(!listening)throw new Error('Auth Web did not become ready');
    return{url,chatProvider,identity,identityDb,keys,messages,stop,stopIdentity,workoutDb,stopWorkout,progressDb,stopProgress,poseDb,poseSummary,progressOrigin:databaseUrls.progressOrigin,testTls:tls,notificationDb,stopNotification,importFixture,mediaPng:cmsTools?.png,
      mediaWebm:cmsTools?.extra.find(asset=>asset.mime==='video/webm')?.bytes,
      async publication(){return (await catalogDb.query('SELECT revision FROM publication_revisions ORDER BY aggregate_version DESC LIMIT 1')).rows[0].revision;},
      async mailLink(email,purpose,after=0){const deadline=Date.now()+12000;while(Date.now()<deadline){
        const found=messages.slice(after).find(m=>m.recipients.includes(email)&&m.action?.includes(purpose==='verify'?'/xac-minh-email#':'/dat-lai-mat-khau#'));if(found)return found.action;
        await new Promise(resolve=>setTimeout(resolve,50));
      }throw new Error(pumpFailed?'Auth email pipeline had a fixture failure':'Sandbox email deadline exceeded');}};
  }catch(error){await stop();throw error;}
}
