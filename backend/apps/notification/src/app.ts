import 'reflect-metadata';
import { CanActivate, Catch, ExceptionFilter, ExecutionContext, HttpException, type ArgumentsHost } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { Database } from './database.js';
import { NotificationConfig } from './config.js';
import { authenticate, type NotificationRequest } from './auth.js';
import { reject } from './contracts.js';
import { Notifications } from './modules/inbox/notifications.service.js';
import { NotificationModule } from './app.module.js';

type Response={status(code:number):Response;json(value:unknown):void;setHeader(name:string,value:string):void};
@Catch() class Problems implements ExceptionFilter{
  catch(error:unknown,host:ArgumentsHost){const res=host.switchToHttp().getResponse<Response>();
    const malformed=error&&typeof error==='object'&&'type' in error&&['entity.parse.failed','entity.too.large'].includes(String(error.type));
    const status=error instanceof HttpException?error.getStatus():malformed?400:503,payload=error instanceof HttpException?error.getResponse():undefined;
    const code=payload&&typeof payload==='object'&&'code' in payload?payload.code:status>=500?'NOTIFICATION_UNAVAILABLE':'BAD_REQUEST';
    res.status(status).json({type:'about:blank',title:'Chưa thể xử lý thông báo',status,code,requestId:randomUUID()});
  }
}

export async function createApp(db:Database,config:Pick<NotificationConfig,'tls'|'probeFingerprints'|'auth'>,consumerReady:()=>boolean,now=()=>new Date()){
  const notifications=new Notifications(db,now);
  class OwnerGuard implements CanActivate{async canActivate(c:ExecutionContext){if(!config.auth)reject(503,'NOTIFICATION_API_DISABLED');const req=c.switchToHttp().getRequest<NotificationRequest>();req.actor=await authenticate(req,config.auth);return true;}}

  const appModule = NotificationModule.register(db, config, consumerReady, notifications, OwnerGuard);

  const httpsOptions={...config.tls,requestCert:true,rejectUnauthorized:true,minVersion:'TLSv1.2' as const};
  const app=await NestFactory.create<NestExpressApplication>(appModule,{logger:false,bodyParser:false,httpsOptions});
  app.use((_req:unknown,res:Response,next:()=>void)=>{res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');next();});
  app.useBodyParser('json',{limit:'64kb'});app.useGlobalFilters(new Problems());return app;
}
