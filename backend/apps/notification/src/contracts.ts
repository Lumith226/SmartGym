import { readFile } from 'node:fs/promises';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import {HttpException} from '@nestjs/common';
const contracts=JSON.parse(await readFile(new URL('../data/contracts.json',import.meta.url),'utf8'));
const ajv=new Ajv2020({strict:false});(addFormatsModule as unknown as (ajv:Ajv2020)=>void)(ajv);
ajv.addSchema({$id:'notification',$defs:contracts.schemas});
export const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function valid(name:string,value:unknown){return Boolean(ajv.getSchema('notification#/$defs/'+name)?.(value));}
export function reject(status:number,code:string):never{throw new HttpException({code},status);}
const checkEvent=ajv.compile(contracts.event),checkDelivery=ajv.compile(contracts.delivery);
const checkOccurrence=ajv.compile(contracts.occurrenceEvent),checkContact=ajv.compile(contracts.contact),checkPreferences=ajv.compile(contracts.preferences);
export interface OccurrenceEvent {id:string;aggregateId:string;aggregateVersion:number;occurredAt:string;data:{occurrenceId:string;userId:string;status:'SCHEDULED'|'CANCELED';startAt:string;endAt:string;timeZone:string}}
export interface NotificationContact {userId:string;email:string;emailVerified:boolean;timeZone:string}
export interface PreferencesInput {reminderInAppEnabled:boolean;reminderEmailEnabled:boolean;leadMinutes:number}
export function parseOccurrence(buffer:Buffer):OccurrenceEvent {
  if(buffer.length>16384)throw new InvalidEvent('Event too large');
  let value:unknown;try{value=JSON.parse(buffer.toString('utf8'));}catch{throw new InvalidEvent('Invalid JSON');}
  if(!checkOccurrence(value))throw new InvalidEvent('Invalid occurrence event');
  const event=value as OccurrenceEvent,d=event.data;
  const start=Date.parse(d.startAt),end=Date.parse(d.endAt);
  if(event.aggregateId!==d.occurrenceId||!Number.isFinite(start)||!Number.isFinite(end)||start>=end||/^[+-]/.test(d.timeZone))throw new InvalidEvent('Invalid occurrence reference or range');
  try{new Intl.DateTimeFormat('vi',{timeZone:d.timeZone});}catch{throw new InvalidEvent('Invalid occurrence zone');}
  return event;
}
export function parseContact(value:unknown):NotificationContact {
  if(!checkContact(value))throw new Error('Invalid contact response');return value as NotificationContact;
}
export function parsePreferences(value:unknown):PreferencesInput {
  if(!checkPreferences(value))throw new Error('Invalid reminder preferences');return value as PreferencesInput;
}
export class InvalidEvent extends Error{}
export interface EmailEvent {id:string;type:string;producer:string;schemaVersion:number;aggregateId:string;aggregateVersion:number;occurredAt:string;correlationId:string;data:{deliveryRef:string;purpose:'VERIFY_EMAIL'|'RESET_PASSWORD';expiresAt:string}}
export interface EmailDelivery {deliveryRef:string;purpose:'VERIFY_EMAIL'|'RESET_PASSWORD';recipient:string;actionUrl:string;expiresAt:string}
export function parseEvent(buffer:Buffer):EmailEvent {
  if(buffer.length>16384)throw new InvalidEvent('Event too large');
  let value:unknown;try{value=JSON.parse(buffer.toString('utf8'));}catch{throw new InvalidEvent('Invalid JSON');}
  if(!checkEvent(value))throw new InvalidEvent('Invalid envelope');
  const event=value as EmailEvent;
  if(event.aggregateId!==event.data.deliveryRef)throw new InvalidEvent('Mismatched reference');
  return event;
}
export function parseDelivery(value:unknown):EmailDelivery {
  if(!checkDelivery(value))throw new Error('Invalid Identity delivery response');return value as EmailDelivery;
}
