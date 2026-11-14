import { Body, CanActivate, Controller, Delete, Get, Headers, HttpCode, Param, Post, Put, Query, Req, Res, UseGuards, type Type } from '@nestjs/common';
import { type ProgressRequest } from '../../auth.js';
import { reject, uuid } from '../../contract.js';
import { Logs, validateInput, validatePoseImport } from './logs.service.js';

type Response={status(code:number):Response;json(value:unknown):void;setHeader(name:string,value:string):void};

const id=(value:string)=>{if(!uuid.test(value))reject(400,'BAD_REQUEST');return value;};

function match(value:unknown){if(value===undefined)reject(428,'PRECONDITION_REQUIRED');if(typeof value!=='string'||!/^"v[1-9][0-9]{0,9}"$/.test(value)||Number(value.slice(2,-1))>2147483647)reject(400,'INVALID_ETAG');return Number(value.slice(2,-1));}

export function createProgressLogsControllers(logs: Logs, OwnerGuard: Type<CanActivate>) {
  @Controller('api/v1/progress/logs') @UseGuards(OwnerGuard)
  class ControllerLogs{
    @Get()list(@Req()req:ProgressRequest,@Query()query:Record<string,unknown>){return logs.list(req.actor!,query);}
    @Get(':id')async get(@Req()req:ProgressRequest,@Param('id')value:string,@Res({passthrough:true})res:Response){const result=await logs.get(req.actor!,id(value));res.setHeader('ETag','"v'+result.version+'"');return result;}
    @Post() @HttpCode(201)
    async create(@Req()req:ProgressRequest,@Headers('idempotency-key')key:unknown,@Body()body:unknown,@Res({passthrough:true})res:Response){
      if(typeof key!=='string'||!/^[A-Za-z0-9._-]{16,128}$/.test(key))reject(400,'INVALID_IDEMPOTENCY_KEY');
      const result=await logs.create(req.actor!,key,validateInput(body),String(req.headers.authorization));
      res.setHeader('ETag','"v'+result.version+'"');res.setHeader('Location','/api/v1/progress/logs/'+result.id);return result;
    }
    @Put(':id')async update(@Req()req:ProgressRequest,@Param('id')value:string,@Headers('if-match')etag:unknown,@Body()body:unknown,@Res({passthrough:true})res:Response){
      const result=await logs.update(req.actor!,id(value),match(etag),validateInput(body));res.setHeader('ETag','"v'+result.version+'"');return result;
    }
    @Delete(':id') @HttpCode(204)
    remove(@Req()req:ProgressRequest,@Param('id')value:string,@Headers('if-match')etag:unknown){return logs.remove(req.actor!,id(value),match(etag));}
  }

  @Controller('api/v1/progress')
  @UseGuards(OwnerGuard)
  class PoseImportController {
    @Post('pose-imports') @HttpCode(201)
    async importPose(@Req()req:ProgressRequest,@Headers('idempotency-key')key:unknown,@Body()body:unknown,@Res({passthrough:true})res:Response){
      if(typeof key!=='string'||!/^[A-Za-z0-9._-]{16,128}$/.test(key))reject(400,'INVALID_IDEMPOTENCY_KEY');
      const result=await logs.importPose(req.actor!,key,validatePoseImport(body),String(req.headers.authorization));
      res.setHeader('ETag','"v'+result.version+'"');res.setHeader('Location','/api/v1/progress/logs/'+result.id);return result;
    }
  }

  return { ControllerLogs, PoseImportController };
}
