'use client';
import Link from 'next/link';
import {useEffect,useId,useRef,useState} from 'react';
import {workout,WorkoutError,type Occurrence,type Page} from '../workout/api';
import {Feedback,useCreateKey,ZoneField} from '../workout/shared';
import {label,localInstant,localValue} from '../workout/time';
import type {Result} from '../app/tap-ai/pose-client';
import type {Log} from './types';
export function PoseImport({result}:{result:Result}){
  const selectorId=useId();
  const [at,setAt]=useState(localValue(result.completedAt,'Asia/Bangkok')),[zone,setZone]=useState('Asia/Bangkok'),[link,setLink]=useState(false),[occurrence,setOccurrence]=useState('');
  const [options,setOptions]=useState<Occurrence[]>([]),[cursor,setCursor]=useState<string|null>(null),[loading,setLoading]=useState(false),[pickerError,setPickerError]=useState<unknown>(),[attempt,setAttempt]=useState(0);
  const [error,setError]=useState<unknown>(),[pending,setPending]=useState(false),[saved,setSaved]=useState<Log>();const controller=useRef<AbortController|undefined>(undefined),active=useRef(false),alive=useRef(true),createKey=useCreateKey();
  const loggable=result.repCountStatus==='AVAILABLE'&&result.repCount!==null&&result.repCount>0;
  const from=new Date(Date.parse(result.completedAt)-7*86400000).toISOString(),to=new Date(Date.parse(result.completedAt)+7*86400000).toISOString();
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;controller.current?.abort();};},[]);
  useEffect(()=>{if(!link||!loggable)return;const c=new AbortController();setLoading(true);setPickerError(undefined);
    workout<Page<Occurrence>>('workout-occurrences?'+new URLSearchParams({from,to,limit:'100'}),{signal:c.signal}).then(r=>{if(!c.signal.aborted){setOptions(r.data.items);setCursor(r.data.nextCursor);}},e=>{if(!c.signal.aborted)setPickerError(e);}).finally(()=>{if(!c.signal.aborted)setLoading(false);});return()=>c.abort();
  },[link,loggable,from,to,attempt]);
  async function more(){if(!cursor||loading)return;const c=new AbortController();controller.current=c;setLoading(true);try{const r=await workout<Page<Occurrence>>('workout-occurrences?'+new URLSearchParams({from,to,limit:'100',cursor}),{signal:c.signal});if(alive.current&&!c.signal.aborted){setOptions(old=>[...old,...r.data.items]);setCursor(r.data.nextCursor);setPickerError(undefined);}}catch(e){if(alive.current&&!c.signal.aborted)setPickerError(e);}finally{if(alive.current&&!c.signal.aborted)setLoading(false);}}
  async function save(){if(active.current||!loggable)return;active.current=true;setPending(true);setError(undefined);const c=new AbortController();controller.current=c;
    try{let performedAt:string;try{performedAt=localInstant(at,zone).toString();}catch{throw new WorkoutError(422,'VALIDATION_ERROR');}
      const body={poseResultId:result.id,...(at===localValue(result.completedAt,'Asia/Bangkok')&&zone==='Asia/Bangkok'?{}:{performedAt}),...(link&&occurrence?{occurrenceId:occurrence}:{})};const r=await workout<Log>('progress/pose-imports',{method:'POST',body,key:createKey(body),signal:c.signal});if(alive.current&&!c.signal.aborted)setSaved(r.data);
    }catch(e){if(alive.current&&!c.signal.aborted)setError(e);}finally{active.current=false;if(alive.current&&!c.signal.aborted)setPending(false);}}
  const existing=error instanceof WorkoutError&&['POSE_RESULT_ALREADY_IMPORTED','OCCURRENCE_ALREADY_LOGGED'].includes(error.code)?/^\/api\/v1\/progress\/logs\/([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/.exec(error.detail??'')?.[1]:undefined;
  if(!loggable)return <section className="workout-note" aria-label="Lưu kết quả vào nhật ký"><h2>Lưu vào nhật ký</h2><p>{result.repCountStatus==='AVAILABLE'?'AI đo 0 rep; chưa có set để nhập tự động.':'Kết quả này chưa có số rep để nhập tự động.'} Không tự suy ra số rep hoặc thời lượng từ video.</p><Link href="/app/nhat-ky/moi">Ghi nhật ký thủ công</Link></section>;
  if(saved)return <section aria-label="Kết quả nhập nhật ký"><p role="status">Đã nhập kết quả AI vào nhật ký.</p><Link href={'/app/nhat-ky/'+saved.id}>Mở nhật ký đã nhập</Link></section>;
  return <section className="workout" aria-label="Lưu kết quả vào nhật ký"><h2>Lưu vào nhật ký</h2><p>Nhập một set gộp {result.repCount} rep AI đã đo. Không tự thêm trọng lượng, thời lượng hoặc chia set.</p><p>Thời điểm bên dưới mặc định là lúc hoàn tất phân tích; hãy xác nhận hoặc sửa thành lúc bạn thực sự tập.</p>
    {!!error&&<Feedback error={error}/>} {existing&&<p><Link href={'/app/nhat-ky/'+existing}>Mở nhật ký đã có</Link></p>}
    <form aria-label="Nhập kết quả AI vào nhật ký" onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={pending}><legend>Xác nhận buổi tập thực tế</legend><label>Thời điểm tập thực tế<input required type="datetime-local" value={at} onChange={e=>setAt(e.target.value)}/></label><ZoneField label="Múi giờ nhập liệu" value={zone} onChange={setZone}/>
      <label className="notification-check"><input type="checkbox" checked={link} onChange={e=>setLink(e.target.checked)}/>Liên kết với buổi trong lịch</label>
      {link&&<div><p>Buổi trong vòng 7 ngày trước/sau thời điểm phân tích. Không chọn buổi sẽ tạo nhật ký AI riêng.</p>{loading&&<p role="status">Đang tải buổi tập…</p>}{!!pickerError&&<Feedback error={pickerError} retry={()=>{setOccurrence('');setAttempt(n=>n+1);}}/>}<label htmlFor={selectorId}>Buổi tập liên kết</label><select id={selectorId} value={occurrence} onChange={e=>setOccurrence(e.target.value)}><option value="">Không liên kết buổi</option>{options.map(o=><option key={o.id} value={o.id}>{label(o.startAt,o.timeZone)} ({o.timeZone}) · {o.status==='CANCELED'?'Đã hủy':'Đã lên lịch'}</option>)}</select>{cursor&&<button type="button" disabled={loading} onClick={()=>void more()}>Tải thêm buổi</button>}</div>}
      <button type="submit">{pending?'Đang nhập…':'Xác nhận lưu vào nhật ký'}</button></fieldset></form></section>;
}
