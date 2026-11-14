import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import 'reflect-metadata';
import { CanActivate, Catch, ExceptionFilter, ExecutionContext, HttpException, type ArgumentsHost } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { authenticate, type AuthConfig, type ProgressRequest } from './auth.js';
import type { Database } from './database.js';
import type { CatalogClient } from './modules/logs/catalog-client.js';
import type { WorkoutClient } from './modules/logs/workout-client.js';
import { reject } from './contract.js';
import { Logs } from './modules/logs/logs.service.js';
import { unavailablePose, type PoseClient } from './modules/logs/pose-client.js';
import { Summaries } from './modules/summary/summary.service.js';
import { ProgressModule } from './app.module.js';

const selfProbeFingerprint = process.env.SMARTGYM_SELF_PROBE === 'true'
  ? new X509Certificate(readFileSync('/run/secrets/client.crt')).fingerprint256 : undefined;

type Response={status(code:number):Response;json(value:unknown):void;setHeader(name:string,value:string):void};
@Catch()
class Problems implements ExceptionFilter{
  catch(error:unknown,host:ArgumentsHost){const res=host.switchToHttp().getResponse<Response>();
    const malformed=error&&typeof error==='object'&&'type' in error&&['entity.parse.failed','entity.too.large'].includes(String(error.type));
    const status=error instanceof HttpException?error.getStatus():malformed?400:503;
    const payload=error instanceof HttpException?error.getResponse():undefined;
    const code=payload&&typeof payload==='object'&&'code' in payload?payload.code:status>=500?'PROGRESS_UNAVAILABLE':'BAD_REQUEST';
    res.status(status).json({type:'about:blank',title:'Chưa thể xử lý nhật ký tập',status,code,requestId:randomUUID(),
      ...(payload&&typeof payload==='object'&&'detail' in payload&&typeof payload.detail==='string'?{detail:payload.detail}:{})});
  }
}

export async function createProgressApp(db:Database,auth:AuthConfig,catalog:CatalogClient,workout:WorkoutClient,now=()=>new Date(),pose:PoseClient=unavailablePose){
  const logs=new Logs(db,catalog,workout,now,pose);
  const summaries=new Summaries(db);
  class OwnerGuard implements CanActivate{async canActivate(c:ExecutionContext){const req=c.switchToHttp().getRequest<ProgressRequest>();req.actor=await authenticate(req,auth);return true;}}
  class ProbeGuard implements CanActivate{canActivate(c:ExecutionContext){const req=c.switchToHttp().getRequest<ProgressRequest>();if (process.env.SMARTGYM_SELF_PROBE === 'true' && req.socket.authorized && req.socket.remoteAddress === '127.0.0.1' && req.socket.getPeerCertificate().fingerprint256 === selfProbeFingerprint) return true;
      if(!req.socket.authorized||!auth.bffFingerprints.includes(req.socket.getPeerCertificate().fingerprint256))reject(403,'SERVICE_FORBIDDEN');return true;}}

  const appModule = ProgressModule.register(db, logs, summaries, OwnerGuard, ProbeGuard);

  const httpsOptions={...auth.tls,requestCert:true,rejectUnauthorized:true,minVersion:'TLSv1.2' as const};
  const app=await NestFactory.create<NestExpressApplication>(appModule,{logger:false,bodyParser:false,httpsOptions});
  app.use((_req:unknown,res:Response,next:()=>void)=>{res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');next();});
  app.useBodyParser('json',{limit:'64kb'});app.useGlobalFilters(new Problems());return app;
}
