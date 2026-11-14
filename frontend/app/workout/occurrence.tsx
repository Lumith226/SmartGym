'use client';
import Link from 'next/link';
import { useRef,useState,type FormEvent } from 'react';
import { workout,WorkoutError,type Occurrence } from './api';
import { Confirm,Feedback,ZoneField,useResource,useUnsaved } from './shared';
import { label,localInstant,localValue } from './time';
function Details({initial,initialEtag}:{initial:Occurrence;initialEtag:string|null}){
  const [item,setItem]=useState(initial),[etag,setEtag]=useState(initialEtag),[zone,setZone]=useState(initial.timeZone),[local,setLocal]=useState(localValue(initial.startAt,initial.timeZone));
  const [duration,setDuration]=useState((Date.parse(initial.endAt)-Date.parse(initial.startAt))/60000),[dirty,setDirty]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState<unknown>(),[saved,setSaved]=useState('');
  const active=useRef(false);useUnsaved(dirty);
  const started=Date.parse(item.startAt)<=Date.now(),disabled=item.status==='CANCELED'||started;
  async function move(e:FormEvent){e.preventDefault();if(active.current)return;active.current=true;setPending(true);setError(undefined);setSaved('');
    try{let start;try{start=localInstant(local,zone);}catch{throw new WorkoutError(422,'INVALID_OCCURRENCE');}const body={startAt:start.toString(),endAt:start.add({minutes:duration}).toString(),timeZone:zone};
      const result=await workout<Occurrence>('workout-occurrences/'+item.id,{method:'PATCH',body,match:etag??undefined});setItem(result.data);setEtag(result.etag);setDirty(false);setSaved('Đã dời buổi tập.');
    }catch(e){setError(e);}finally{active.current=false;setPending(false);}}
  let hint='';try{hint=label(localInstant(local,zone).toString(),zone)+' ('+zone+')';}catch{hint='Kiểm tra ngày giờ và múi giờ.';}
  return <><p>{item.status==='CANCELED'?'Đã hủy':started?'Buổi đã bắt đầu':'Đã lên lịch'}</p><p>{label(item.startAt,item.timeZone)} – {label(item.endAt,item.timeZone)} ({item.timeZone})</p>
    <p><Link href={'/app/chuong-trinh/'+item.planId}>Xem chương trình</Link>{' · '}<Link href={'/app/lich?scheduleId='+item.scheduleId}>Xem quy tắc lịch</Link></p>
    <p><Link href={'/app/nhat-ky/moi?occurrenceId='+item.id}>Ghi nhật ký từ buổi này</Link></p>
    <h2>Bài đã lên kế hoạch</h2><ol>{item.plannedExercises.map((row,i)=><li key={i}>{row.exerciseNameVi}: {row.sets} set × {row.targetReps!==undefined?row.targetReps+' rep':row.targetDurationSeconds+' giây'}{row.restSeconds!==undefined?' · Nghỉ '+row.restSeconds+' giây':''}</li>)}</ol>
    {!!error&&<Feedback error={error}/>}{saved&&<p role="status">{saved}</p>}
    {!disabled&&<><form className="workout-form" aria-label="Dời buổi tập" onSubmit={move}><fieldset disabled={pending}><legend>Dời riêng buổi này</legend>
      <label>Ngày giờ mới<input type="datetime-local" required value={local} onChange={e=>{setLocal(e.target.value);setDirty(true);}}/></label>
      <ZoneField value={zone} onChange={value=>{setZone(value);setDirty(true);}}/>
      <label>Thời lượng mới (phút)<input type="number" min={5} max={240} required value={duration} onChange={e=>{setDuration(Number(e.target.value));setDirty(true);}}/></label>
      <p>Giờ sẽ gửi: {hint}. Giờ DST thiếu chọn giờ hợp lệ đầu tiên, giờ lặp chọn lần sớm hơn.</p></fieldset><button type="submit" disabled={pending}>{pending?'Đang lưu…':'Lưu giờ mới'}</button></form>
      <Confirm label="Hủy buổi này" disabled={pending} description="Chỉ hủy buổi này. Giữ quy tắc lặp và các buổi khác, nhật ký đã ghi không bị xóa." onConfirm={async()=>{
        await workout('workout-occurrences/'+item.id+'/cancel',{method:'POST',match:etag??undefined});setItem({...item,status:'CANCELED',version:item.version+1});setDirty(false);setSaved('Đã hủy buổi tập.');}}/>
    </>}
  </>;
}
export function OccurrenceDetail({id}:{id:string}){
  const {data,etag,error,retry}=useResource<Occurrence>('workout-occurrences/'+id);
  if(error)return <Feedback error={error} retry={retry}/>;if(!data)return <p role="status">Đang tải buổi tập…</p>;
  return <><Details key={data.id+':'+data.version} initial={data} initialEtag={etag??null}/><Confirm label="Tải buổi mới nhất" description="Bỏ dữ liệu đang nhập và đọc lại buổi tập từ máy chủ?" onConfirm={async()=>retry()}/></>;
}
