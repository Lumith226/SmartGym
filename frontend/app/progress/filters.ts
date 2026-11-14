import {addDays,todayIn,validZone} from '../workout/time';
export function period(query:Record<string,string|string[]|undefined>,profileZone:string){
  const fallback=validZone(profileZone)?profileZone:'Asia/Bangkok';
  const zone=typeof query.zone==='string'?query.zone:fallback;
  const today=todayIn(fallback);
  return {zone,from:typeof query.from==='string'?query.from:addDays(today,-29),to:typeof query.to==='string'?query.to:today};
}
