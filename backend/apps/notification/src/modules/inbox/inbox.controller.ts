import { Body, CanActivate, Controller, Get, Headers, HttpCode, Param, Put, Query, Req, Res, UseGuards, type Type } from '@nestjs/common';
import { type NotificationRequest } from '../../auth.js';
import { reject } from '../../contracts.js';
import { Notifications } from './notifications.service.js';

type Response={status(code:number):Response;json(value:unknown):void;setHeader(name:string,value:string):void};

export function createNotificationInboxControllers(notifications: Notifications, OwnerGuard: Type<CanActivate>) {
  @Controller('api/v1') @UseGuards(OwnerGuard)
  class InboxController{
    @Get('notifications')list(@Req()req:NotificationRequest,@Query()query:Record<string,unknown>){return notifications.list(req.actor!,query);}
    @Put('notifications/:id/read') @HttpCode(204)
    read(@Req()req:NotificationRequest,@Param('id')id:string,@Body()body:unknown){if(body!==undefined&&(body===null||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length))reject(422,'VALIDATION_ERROR');return notifications.read(req.actor!,id);}
    @Get('notification-preferences')async get(@Req()req:NotificationRequest,@Res({passthrough:true})res:Response){const data=await notifications.getPreferences(req.actor!);res.setHeader('ETag','"v'+data.version+'"');return data;}
    @Put('notification-preferences')async update(@Req()req:NotificationRequest,@Headers('if-match')etag:unknown,@Body()body:unknown,@Res({passthrough:true})res:Response){
      if(etag===undefined)reject(428,'PRECONDITION_REQUIRED');if(typeof etag!=='string'||!/^"v[1-9][0-9]{0,9}"$/.test(etag)||Number(etag.slice(2,-1))>2147483647)reject(400,'INVALID_ETAG');
      const data=await notifications.updatePreferences(req.actor!,body,Number(etag.slice(2,-1)));res.setHeader('ETag','"v'+data.version+'"');return data;
    }
  }

  return { InboxController };
}
