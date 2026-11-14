import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import { HttpException } from '@nestjs/common';
const ajv=new Ajv2020({strict:false});
const addFormats=addFormatsModule as unknown as (ajv:Ajv2020)=>void;addFormats(ajv);
ajv.addSchema(JSON.parse(readFileSync(new URL('../data/contracts.json',import.meta.url),'utf8')));
export const valid=(name:string,value:unknown)=>!!ajv.getSchema('progress-contract#/components/schemas/'+name)?.(value);
export const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export function reject(status:number,code:string):never{throw new HttpException({code},status);}
