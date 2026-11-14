'use client';
import Link from 'next/link';
import { useEffect,useRef,useState,type FormEvent } from 'react';
import { workout,type Page,type Plan,type PlanItem } from './api';
import { Confirm,Feedback,useCreateKey,useResource,useUnsaved } from './shared';

export function PlanList({status,cursor}:{status:string;cursor?:string}){
  const query=new URLSearchParams({status,limit:'20'});if(cursor)query.set('cursor',cursor);
  const {data,error,retry}=useResource<Page<Plan>>('workout-plans?'+query);
  return <><div className="workout-actions"><Link href="/app/chuong-trinh/moi">Tạo chương trình</Link><Link href="/app/lich">Lịch tập</Link></div>
    <nav aria-label="Trạng thái chương trình"><Link href="/app/chuong-trinh" aria-current={status==='ACTIVE'?'page':undefined}>Đang hoạt động</Link>{' · '}
      <Link href="/app/chuong-trinh?status=ARCHIVED" aria-current={status==='ARCHIVED'?'page':undefined}>Đã lưu trữ</Link></nav>
    {!!error?<Feedback error={error} retry={retry}/>:!data?<p role="status">Đang tải chương trình…</p>:<>
      {!data.items.length?<p>Chưa có chương trình trong danh sách này. Bạn có thể tạo chương trình đầu tiên từ các bài trong thư viện.</p>:
      <ul className="workout-list" aria-label="Danh sách chương trình">{data.items.map(plan=><li key={plan.id}><Link href={'/app/chuong-trinh/'+plan.id}><strong>{plan.name}</strong></Link>
        <p>{plan.exercises.length} bài · {plan.status==='ACTIVE'?'Đang hoạt động':'Đã lưu trữ'}</p></li>)}</ul>}
      {data.nextCursor&&<Link href={'/app/chuong-trinh?'+new URLSearchParams({status,cursor:data.nextCursor})}>Trang tiếp</Link>}
    </>}{cursor&&<p><Link href={'/app/chuong-trinh?status='+status}>Về trang đầu</Link></p>}</>;
}
type Choice={id:string;nameVi:string;slug:string};
export function ExercisePicker({add,disabled}:{add:(value:Choice)=>void;disabled:boolean}){
  const [draft,setDraft]=useState(''),[query,setQuery]=useState(''),[cursor,setCursor]=useState('');
  const params=new URLSearchParams({limit:'10'});if(query)params.set('q',query);if(cursor)params.set('cursor',cursor);
  const {data,error,retry}=useResource<Page<Choice>>('exercises?'+params);
  return <section aria-label="Chọn bài từ thư viện"><h2>Thêm bài tập</h2>
    <form onSubmit={e=>{e.preventDefault();setQuery(draft.trim());setCursor('');}}><label>Tìm bài tập<input maxLength={100} value={draft} onChange={e=>setDraft(e.target.value)}/></label><button type="submit">Tìm bài</button></form>
    {!!error?<Feedback error={error} retry={retry}/>:!data?<p role="status">Đang tải bài tập…</p>:<>
    {!data.items.length&&<p>Không tìm thấy bài phù hợp. Hãy đổi từ khóa.</p>}
    <ul className="workout-picker">{data.items.map(item=><li key={item.id}><span>{item.nameVi}</span><button type="button" disabled={disabled} className="cms-secondary" onClick={()=>add(item)} aria-label={'Thêm '+item.nameVi}>Thêm</button></li>)}</ul>
    <div className="workout-actions">{data.nextCursor&&<button type="button" className="cms-secondary" onClick={()=>setCursor(data.nextCursor!)}>Thêm kết quả</button>}{cursor&&<button type="button" className="cms-secondary" onClick={()=>setCursor('')}>Kết quả đầu</button>}</div>
    </>}</section>;
}
type Row=PlanItem&{rowKey:string};
export function PlanEditor({id}:{id?:string}){
  const [plan,setPlan]=useState<Plan>(),[etag,setEtag]=useState<string|null>(null),[name,setName]=useState(''),[description,setDescription]=useState(''),[rows,setRows]=useState<Row[]>([]);
  const [loaded,setLoaded]=useState(!id),[loadError,setLoadError]=useState<unknown>(),[error,setError]=useState<unknown>(),[dirty,setDirty]=useState(false),[pending,setPending]=useState(false),[success,setSuccess]=useState('');
  const active=useRef(false),createKey=useCreateKey();useUnsaved(dirty);
  async function load(signal?:AbortSignal){
    if(!id)return;setLoadError(undefined);
    try{const result=await workout<Plan>('workout-plans/'+id,{signal});if(signal?.aborted)return;
      setPlan(result.data);setEtag(result.etag);setName(result.data.name);setDescription(result.data.description??'');setRows(result.data.exercises.map((row,i)=>({...row,rowKey:String(i)})));setDirty(false);setLoaded(true);setError(undefined);
    }catch(e){if(!signal?.aborted)setLoadError(e);}
  }
  useEffect(()=>{const c=new AbortController();void load(c.signal);return()=>c.abort();},[id]);
  const patch=(key:string,change:Partial<PlanItem>)=>{setRows(old=>old.map(row=>row.rowKey===key?{...row,...change}:row));setDirty(true);setSuccess('');};
  const archived=plan?.status==='ARCHIVED';
  async function save(e:FormEvent){e.preventDefault();if(active.current||archived)return;active.current=true;setPending(true);setError(undefined);setSuccess('');
    try{const body={name:name.trim(),description,exercises:rows.map(({exerciseNameVi:_,rowKey:__,...row})=>Object.fromEntries(Object.entries(row).filter(([,v])=>v!==undefined)))};
      const result=await workout<Plan>('workout-plans'+(plan?'/'+plan.id:''),{method:plan?'PUT':'POST',body,match:etag??undefined,key:plan?undefined:createKey(body)});
      setPlan(result.data);setEtag(result.etag);setDirty(false);setSuccess('Đã lưu chương trình.');
    }catch(e){setError(e);}finally{active.current=false;setPending(false);}
  }
  if(loadError)return <Feedback error={loadError} retry={()=>void load()}/>;
  if(!loaded)return <p role="status">Đang tải chương trình…</p>;
  return <><p><Link href="/app/chuong-trinh">Tất cả chương trình</Link></p>{archived&&<p className="workout-note">Chương trình đã lưu trữ, giữ lại để xem lịch sử.</p>}
    {plan&&<div className="workout-actions"><Link href={'/app/chuong-trinh/'+plan.id}>Mở chương trình đã lưu</Link>{!archived&&<Link href={'/app/lich?planId='+plan.id}>Lên lịch chương trình này</Link>}</div>}
    {!!error&&<Feedback error={error}/>}{success&&<p role="status">{success}</p>}
    <form className="workout-form" aria-label="Chương trình tập" onSubmit={save}>
      <fieldset disabled={pending||archived}><legend>Thông tin chương trình</legend>
        <label>Tên chương trình<input required maxLength={120} value={name} onChange={e=>{setName(e.target.value);setDirty(true);}}/></label>
        <label>Ghi chú<textarea maxLength={500} value={description} onChange={e=>{setDescription(e.target.value);setDirty(true);}}/></label></fieldset>
      <ol className="workout-items" aria-label="Bài trong chương trình">{rows.map((row,index)=><li key={row.rowKey}><fieldset disabled={pending||archived}><legend>{index+1}. {row.exerciseNameVi}</legend>
        <label>Số set<input type="number" required min={1} max={30} value={row.sets} onChange={e=>patch(row.rowKey,{sets:Number(e.target.value)})}/></label>
        <label>Loại mục tiêu<select value={row.targetReps===undefined?'duration':'reps'} onChange={e=>patch(row.rowKey,e.target.value==='reps'?{targetReps:12,targetDurationSeconds:undefined}:{targetReps:undefined,targetDurationSeconds:45})}><option value="reps">Số rep</option><option value="duration">Thời lượng</option></select></label>
        {row.targetReps!==undefined?<label>Số rep mỗi set<input type="number" required min={1} max={200} value={row.targetReps} onChange={e=>patch(row.rowKey,{targetReps:Number(e.target.value)})}/></label>:
          <label>Thời lượng mỗi set (giây)<input type="number" required min={1} max={3600} value={row.targetDurationSeconds} onChange={e=>patch(row.rowKey,{targetDurationSeconds:Number(e.target.value)})}/></label>}
        <label>Nghỉ giữa set (giây)<input type="number" min={0} max={600} value={row.restSeconds??''} onChange={e=>patch(row.rowKey,{restSeconds:e.target.value===''?undefined:Number(e.target.value)})}/></label>
        <div className="workout-actions"><button type="button" className="cms-secondary" disabled={index===0} aria-label={'Đưa bài '+(index+1)+' lên'} onClick={()=>{setRows(old=>{const next=[...old];[next[index-1],next[index]]=[next[index],next[index-1]];return next;});setDirty(true);}}>Lên</button>
          <button type="button" className="cms-secondary" disabled={index===rows.length-1} aria-label={'Đưa bài '+(index+1)+' xuống'} onClick={()=>{setRows(old=>{const next=[...old];[next[index+1],next[index]]=[next[index],next[index+1]];return next;});setDirty(true);}}>Xuống</button>
          <button type="button" className="cms-secondary" aria-label={'Bỏ bài '+(index+1)} onClick={()=>{setRows(old=>old.filter(x=>x.rowKey!==row.rowKey));setDirty(true);}}>Bỏ bài</button></div>
      </fieldset></li>)}</ol>
      {!rows.length&&<p>Hãy thêm ít nhất một bài từ thư viện bên dưới.</p>}
      {!archived&&<button disabled={pending||!rows.length} type="submit">{pending?'Đang lưu…':'Lưu chương trình'}</button>}
    </form>
    {!archived&&<ExercisePicker disabled={pending||rows.length>=40} add={item=>{setRows(old=>[...old,{rowKey:crypto.randomUUID(),exerciseId:item.id,exerciseNameVi:item.nameVi,sets:3,targetReps:12,restSeconds:60}]);setDirty(true);setSuccess('');}}/>}
    {id&&<Confirm label="Tải phiên bản mới" description="Thay các trường đang nhập bằng dữ liệu mới nhất từ máy chủ?" onConfirm={()=>load()}/>}
    {plan&&!archived&&<Confirm label="Lưu trữ chương trình" disabled={pending||dirty} description="Chương trình sẽ chuyển sang danh sách đã lưu trữ. Lịch đang hoạt động phải được hủy trước." onConfirm={async()=>{
      await workout('workout-plans/'+plan.id,{method:'DELETE',match:etag??undefined});setPlan({...plan,status:'ARCHIVED',version:plan.version+1});setSuccess('Đã lưu trữ chương trình.');
    }}/>}
  </>;
}
