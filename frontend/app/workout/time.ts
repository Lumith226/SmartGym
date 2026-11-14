import { Temporal } from '@js-temporal/polyfill';
export function validZone(zone:string){try{if(/^[+-]/.test(zone))return false;new Intl.DateTimeFormat('vi',{timeZone:zone});return true;}catch{return false;}}
export function localInstant(local:string,zone:string) {
  if(!validZone(zone))throw Error('Múi giờ IANA không hợp lệ.');
  const intended=Temporal.PlainDateTime.from(local);
  const earlier=intended.toZonedDateTime(zone,{disambiguation:'earlier'});
  const actual=earlier.toPlainDateTime().equals(intended)?earlier:earlier.getTimeZoneTransition('next');
  if(!actual)throw Error('Chưa xác định được giờ hợp lệ.');
  return actual.toInstant();
}
export const todayIn=(zone:string)=>Temporal.Now.zonedDateTimeISO(zone).toPlainDate().toString();
export const addDays=(date:string,days:number)=>Temporal.PlainDate.from(date).add({days}).toString();
export const localValue=(instant:string,zone:string)=>Temporal.Instant.from(instant).toZonedDateTimeISO(zone).toPlainDateTime().toString({smallestUnit:'minute'});
export const label=(instant:string,zone:string)=>new Intl.DateTimeFormat('vi-VN',{dateStyle:'medium',timeStyle:'short',timeZone:zone}).format(new Date(instant));
export function range(date:string,zone:string){return {from:localInstant(date+'T00:00',zone).toString(),to:localInstant(addDays(date,7)+'T00:00',zone).toString()};}
export function preview(date:string,time:string,zone:string,duration:number){
  const start=localInstant(date+'T'+time,zone);
  return label(start.toString(),zone)+' – '+label(start.add({minutes:duration}).toString(),zone)+' ('+zone+')';
}
