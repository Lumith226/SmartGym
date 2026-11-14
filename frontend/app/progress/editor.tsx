'use client';
import Link from 'next/link';
import {useRef,useState,type FormEvent} from 'react';
import {workout,WorkoutError,type Occurrence} from '../workout/api';
import {Confirm,Feedback,ZoneField,useCreateKey,useResource,useUnsaved} from '../workout/shared';
import {ExercisePicker} from '../workout/plans';
import {label,localInstant,localValue} from '../workout/time';
import {sourceLabel,type ActualSet,type Log} from './types';
type Row=ActualSet&{exerciseNameVi:string;key:string};
function initialRows(log?:Log,occurrence?:Occurrence){
  if(log)return {rows:log.sets.map((row,i)=>({...row,key:String(i)})),limited:false};
  const rows:Row[]=[],ordinals=new Map<string,number>();let count=0;
  for(const item of occurrence?.plannedExercises??[])for(let n=0;n<item.sets;n++){
    const ordinal=(ordinals.get(item.exerciseId)??0)+1;ordinals.set(item.exerciseId,ordinal);count++;
    if(rows.length<200)rows.push({exerciseId:item.exerciseId,exerciseNameVi:item.exerciseNameVi,ordinal,repetitions:item.targetReps,durationSeconds:item.targetDurationSeconds,key:String(count)});
  }
  return {rows,limited:count>200};
}
function Editor({initial,initialEtag,occurrence,zone:initialZone,now}:{initial?:Log;initialEtag?:string|null;occurrence?:Occurrence;zone:string;now:string}){
  const prepared=initialRows(initial,occurrence);
  const [log,setLog]=useState(initial),[etag,setEtag]=useState(initialEtag),[zone,setZone]=useState(initialZone),[at,setAt]=useState(localValue(initial?.performedAt??now,initialZone));
  const [duration,setDuration]=useState(initial?.durationSeconds===undefined?'':String(initial.durationSeconds)),[notes,setNotes]=useState(initial?.notes??''),[rows,setRows]=useState<Row[]>(prepared.rows);
  const [dirty,setDirty]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState<unknown>(),[success,setSuccess]=useState(''),[deleted,setDeleted]=useState(false);
  const active=useRef(false),createKey=useCreateKey();useUnsaved(dirty);
  const change=(key:string,patch:Partial<Row>)=>{setRows(old=>old.map(row=>row.key===key?{...row,...patch}:row));setDirty(true);setSuccess('');};
  async function save(e:FormEvent){e.preventDefault();if(active.current)return;active.current=true;setPending(true);setError(undefined);setSuccess('');
    try{
      let performedAt:string;try{performedAt=localInstant(at,zone).toString();}catch{throw new WorkoutError(422,'VALIDATION_ERROR');}
      const body={performedAt,notes,...(log?.occurrenceId||occurrence?{occurrenceId:log?.occurrenceId??occurrence!.id}:{}),...(duration?{durationSeconds:Number(duration)}:{}),
        sets:rows.map(({exerciseNameVi:_,key:__,...row})=>Object.fromEntries(Object.entries(row).filter(([,v])=>v!==undefined)))};
      const result=await workout<Log>('progress/logs'+(log?'/'+log.id:''),{method:log?'PUT':'POST',body,match:etag??undefined,key:log?undefined:createKey(body)});
      setLog(result.data);setEtag(result.etag);setRows(result.data.sets.map((row,i)=>({...row,key:String(i)})));setDirty(false);setSuccess('Đã lưu nhật ký.');
    }catch(e){setError(e);}finally{active.current=false;setPending(false);}
  }
  const existing=error instanceof WorkoutError&&error.code==='OCCURRENCE_ALREADY_LOGGED'?/^\/api\/v1\/progress\/logs\/([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/.exec(error.detail??'')?.[1]:undefined;
  if(deleted)return <><p role="status">Đã xóa nhật ký. Dấu chống trùng của buổi liên kết được giữ.</p><p><Link href="/app/nhat-ky">Về nhật ký</Link> · <Link href="/app/tien-do">Xem tiến độ</Link></p></>;
  return <><p><Link href="/app/nhat-ky">Tất cả nhật ký</Link> · <Link href="/app/tien-do">Tiến độ</Link></p>
    {log&&<p>{sourceLabel[log.source]} · {label(log.performedAt,zone)} ({zone}) · <Link href={'/app/nhat-ky/'+log.id}>Mở nhật ký đã lưu</Link></p>}
    {log?.poseSummary&&<aside className="workout-note" aria-label="Nguồn AI gốc"><h2>Nguồn AI gốc</h2><p>AI đo {log.poseSummary.repCount} rep · {log.poseSummary.modelVersion} / {log.poseSummary.configVersion}.</p><p>Hoàn tất phân tích: {label(log.poseSummary.completedAt,zone)} ({zone}). Số đo gốc giữ nguyên khi bạn sửa các set thực tế. Một set nhập là tổng rep quan sát, không phải phân set do AI xác định.</p><Link href={'/app/tap-ai/ket-qua/'+log.poseResultId}>Xem kết quả AI nếu còn hạn</Link></aside>}
    {(log?.occurrenceId||occurrence)&&<p><Link href={'/app/lich/buoi/'+(log?.occurrenceId??occurrence!.id)}>Buổi tập liên kết</Link>. Sửa nhật ký không thay đổi lịch dự kiến.</p>}
    {!log&&occurrence&&<p className="workout-note">Các set được điền từ kế hoạch. Hãy sửa thành kết quả thực tế trước khi lưu.{prepared.limited?' Đã điền 200 set đầu vì mỗi nhật ký tối đa 200 set.':''}</p>}
    {!!error&&<Feedback error={error}/>}{existing&&<p><Link href={'/app/nhat-ky/'+existing}>Mở nhật ký đã liên kết</Link></p>}{success&&<p role="status">{success}</p>}
    <form className="workout-form" aria-label="Nhật ký buổi tập" onSubmit={save}><fieldset disabled={pending}><legend>Buổi tập thực tế</legend>
      <label>Thời điểm tập thực tế<input type="datetime-local" required value={at} onChange={e=>{setAt(e.target.value);setDirty(true);}}/></label>
      <ZoneField label="Múi giờ nhập liệu" value={zone} onChange={value=>{setZone(value);setDirty(true);}}/>
      <label>Thời lượng cả buổi (giây, tùy chọn)<input type="number" min={1} max={14400} value={duration} onChange={e=>{setDuration(e.target.value);setDirty(true);}}/></label>
      <label>Ghi chú buổi tập<textarea maxLength={2000} value={notes} onChange={e=>{setNotes(e.target.value);setDirty(true);}}/></label></fieldset>
      <ol className="workout-items" aria-label="Các set thực tế">{rows.map((row,index)=><li key={row.key}><fieldset disabled={pending}><legend>{row.exerciseNameVi} · Set {row.ordinal}</legend>
        <label>Số thứ tự set<input type="number" required min={1} max={200} value={row.ordinal} onChange={e=>change(row.key,{ordinal:Number(e.target.value)})}/></label>
        <label>Số rep thực tế<input type="number" min={1} max={500} required={row.durationSeconds===undefined} value={row.repetitions??''} onChange={e=>change(row.key,{repetitions:e.target.value===''?undefined:Number(e.target.value)})}/></label>
        <label>Thời lượng set (giây)<input type="number" min={1} max={14400} required={row.repetitions===undefined} value={row.durationSeconds??''} onChange={e=>change(row.key,{durationSeconds:e.target.value===''?undefined:Number(e.target.value)})}/></label>
        <label>Trọng lượng (kg)<input type="number" min={0} max={1000} step="any" value={row.weightKg??''} onChange={e=>change(row.key,{weightKg:e.target.value===''?undefined:Number(e.target.value)})}/></label>
        <label>RPE (1–10, tùy chọn)<input type="number" min={1} max={10} value={row.rpe??''} onChange={e=>change(row.key,{rpe:e.target.value===''?undefined:Number(e.target.value)})}/></label>
        <button type="button" className="cms-secondary" aria-label={'Bỏ set '+(index+1)} onClick={()=>{setRows(old=>old.filter(r=>r.key!==row.key));setDirty(true);}}>Bỏ set</button>
      </fieldset></li>)}</ol>{!rows.length&&<p>Chọn bài từ thư viện để thêm set đầu tiên.</p>}
      <p>Mỗi set cần số rep hoặc thời lượng. Khối lượng tổng chỉ tính set có cả số rep và kg.</p><button type="submit" disabled={pending||!rows.length}>{pending?'Đang lưu…':'Lưu nhật ký'}</button>
    </form><ExercisePicker disabled={pending||rows.length>=200} add={item=>{
      const used=new Set(rows.filter(r=>r.exerciseId===item.id).map(r=>r.ordinal));let ordinal=1;while(used.has(ordinal))ordinal++;
      setRows(old=>[...old,{exerciseId:item.id,exerciseNameVi:item.nameVi,ordinal,repetitions:10,key:crypto.randomUUID()}]);setDirty(true);setSuccess('');
    }}/>
    {log&&<Confirm label="Xóa nhật ký" disabled={pending||dirty} description="Xóa số liệu và ghi chú khỏi nhật ký và tổng hợp. Buổi đã liên kết vẫn giữ dấu chống trùng, không tự tạo lại từ lần gửi cũ." onConfirm={async()=>{
      await workout('progress/logs/'+log.id,{method:'DELETE',match:etag??undefined});setRows([]);setNotes('');setDirty(false);setDeleted(true);
    }}/>}
  </>;
}
export function LogEditor({id,occurrenceId,zone,now}:{id?:string;occurrenceId?:string;zone:string;now:string}){
  if(id)return <ExistingLog id={id} zone={zone} now={now}/>;
  if(occurrenceId)return <ScheduledLog id={occurrenceId} zone={zone} now={now}/>;
  return <Editor zone={zone} now={now}/>;
}
function ExistingLog({id,zone,now}:{id:string;zone:string;now:string}){
  const {data,etag,error,retry}=useResource<Log>('progress/logs/'+id);
  if(error)return <Feedback error={error} retry={retry}/>;if(!data)return <p role="status">Đang tải nhật ký…</p>;
  return <><Editor key={id+':'+data.version} initial={data} initialEtag={etag} zone={zone} now={now}/><Confirm label="Tải nhật ký mới nhất" description="Bỏ nội dung đang nhập và đọc lại nhật ký từ máy chủ?" onConfirm={async()=>retry()}/></>;
}
function ScheduledLog({id,zone,now}:{id:string;zone:string;now:string}){
  const {data,error,retry}=useResource<Occurrence>('workout-occurrences/'+id);if(error)return <Feedback error={error} retry={retry}/>;if(!data)return <p role="status">Đang tải buổi liên kết…</p>;
  return <Editor occurrence={data} zone={zone} now={now}/>;
}
