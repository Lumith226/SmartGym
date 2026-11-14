import next from 'next';
import {createServer as httpServer} from 'node:http';
import {createServer as httpsServer} from 'node:https';
import {readFile} from 'node:fs/promises';
import {loadAuthConfig,profileForSession,AuthError} from './server/identity-client.mjs';
import {handleAuth,problem} from './server/auth.mjs';
import {handleGoogleAuth} from './server/google-auth.mjs';
import {handleCatalogAdmin} from './server/catalog-admin.mjs';
import {handleWorkout} from './server/workout.mjs';
import {handleProgress} from './server/progress.mjs';
import {handleNotifications} from './server/notifications.mjs';
import {handleChat} from './server/chat.mjs';
import {handleMediaGateway} from './server/media-gateway.mjs';
import {attachPoseLiveBff,handlePoseLive,loadPoseLiveConfig} from './server/pose-live.mjs';
import {loadPoseStudio} from './server/pose-studio.mjs';
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
});
process.on('exit', (code) => {
  console.log('[PROCESS EXIT EVENT]', code, new Error().stack);
});
process.on('SIGINT', () => console.log('[SIGINT RECEIVED]'));
process.on('SIGTERM', () => console.log('[SIGTERM RECEIVED]'));

async function main(){
  const port=Number(process.env.PORT??'3000'),hostname=process.env.HOST??'0.0.0.0';
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid web port');
  const enabled=process.env.BFF_AUTH_ENABLED==='true',config=enabled?await loadAuthConfig():null;
  const pose=config?await loadPoseLiveConfig():null;
  const studio=config?await loadPoseStudio(config.webOrigin):null;
  const webTls=enabled?{key:await readFile(process.env.BFF_WEB_KEY_FILE,'utf8'),cert:await readFile(process.env.BFF_WEB_CERT_FILE,'utf8'),minVersion:'TLSv1.2'}:null;
  // Next registers its automatic upgrade listener on the provided server. When Pose
  // is enabled, keep that listener off the public server and route upgrades once below.
  const dev=process.env.NEXT_DEV==='true';
  const app=next({dev,hostname,port,...(pose||studio?{httpServer:httpServer()}: {})});await app.prepare();const handler=app.getRequestHandler();
  const server=(enabled?httpsServer.bind(null,webTls):httpServer)(async(req,res)=>{
    try{
      if(!req.url?.startsWith('/')||req.url.startsWith('//')){problem(res,400,'BAD_REQUEST');return;}
      const url=new URL(req.url,config?.webOrigin??'http://localhost'),path=url.pathname;
      if(path.startsWith('/internal/')){problem(res,404,'NOT_FOUND');return;}
      if(await handleMediaGateway(req,res,url,config?.webOrigin))return;
      if(path==='/api/v1/auth/google'||path==='/api/v1/auth/google/callback'){
        if(!config){problem(res,503,'AUTH_UNAVAILABLE');return;}
        await handleGoogleAuth(req,res,config);return;
      }
      if(path==='/api/v1/chat'||path.startsWith('/api/v1/chat/')){
        if(!config){problem(res,503,'RAG_DISABLED');return;}
        await handleChat(req,res,config.webOrigin);
        return;
      }
      if(/^\/api\/v1\/(notifications|notification-preferences)(\/|$)/.test(path)){
        if(!config){problem(res,503,'NOTIFICATION_UNAVAILABLE');return;}
        await handleNotifications(req,res,config.webOrigin);return;
      }
      if(path.startsWith('/api/v1/progress/')){
        if(!config){problem(res,503,'PROGRESS_UNAVAILABLE');return;}
        await handleProgress(req,res,config.webOrigin);return;
      }
      if(path==='/api/v1/exercises'||/^\/api\/v1\/workout-(plans|schedules|occurrences)(\/|$)/.test(path)){
        if(!config && path !== '/api/v1/exercises'){problem(res,503,'WORKOUT_UNAVAILABLE');return;}
        await handleWorkout(req,res,config?.webOrigin);return;
      }
      if(path.startsWith('/api/v1/pose/')){
        if(!config){problem(res,503,'AUTH_UNAVAILABLE');return;}
        await handlePoseLive(req,res,config.webOrigin,pose);return;
      }
      if(path.startsWith('/api/pose-studio/')){
        if(!studio){problem(res,503,'POSE_UNAVAILABLE');return;}
        await studio.http(req,res);return;
      }
      if(path.startsWith('/api/v1/admin/')){
        if(!config){problem(res,503,'CATALOG_UNAVAILABLE');return;}
        await handleCatalogAdmin(req,res,config.webOrigin);return;
      }
      if(path.startsWith('/api/v1/auth/')||path==='/api/v1/me'){
        await handleAuth(req,res,config);return;
      }
      if(path==='/admin'||path.startsWith('/admin/')){
        try{
          const profile=await profileForSession(req.headers.cookie??'');
          if(!profile.roles.includes('ADMIN')){
            res.writeHead(403,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-frame-options':'DENY'});
            res.end('<!doctype html><html lang="vi"><meta name="viewport" content="width=device-width"><title>Không có quyền quản trị — SmartGym</title><main><h1>Không có quyền quản trị</h1><p>Tài khoản của bạn không có quyền truy cập trang này.</p><a href="/app">Về tài khoản</a> · <a href="/">Thư viện bài tập</a></main></html>');return;
          }
        }catch(error){
          if(error instanceof AuthError&&error.status===401){res.writeHead(303,{Location:'/dang-nhap?next=%2Fadmin','cache-control':'no-store'});res.end();return;}
          problem(res,503,'AUTH_UNAVAILABLE');return;
        }
      }
      await handler(req,res);
    }catch{if(!res.headersSent)problem(res,503,'WEB_UNAVAILABLE');else res.end();}
  });
  server.requestTimeout=10000;server.headersTimeout=10000;
  const nextUpgrade=app.getUpgradeHandler();
  const upgrade=(req,socket,head)=>studio?.isUpgrade(req.url)
    ? studio.upgrade(req,socket,head)
    : nextUpgrade(req,socket,head);
  const stopPose=pose?.live?attachPoseLiveBff(server,config.webOrigin,pose,{fallback:upgrade}):null;
  if(studio&&!stopPose)server.on('upgrade',upgrade);
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,hostname,resolve);});
  const stop=()=>{stopPose?.();studio?.close();server.close(()=>{void app.close();});};process.once('SIGINT',stop);process.once('SIGTERM',stop);
  console.log('SmartGym Web ready');
}
main().catch((err)=>{console.error('Web startup failed; verify build, TLS and BFF config', err);process.exitCode=1;});
