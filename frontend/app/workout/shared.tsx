'use client';
import { useEffect,useRef,useState } from 'react';
import { message,workout,WorkoutError } from './api';
export function useResource<T>(path:string){
  const [attempt,setAttempt]=useState(0),[result,setResult]=useState<{data:T;etag:string|null}>(),[error,setError]=useState<unknown>();
  useEffect(()=>{const c=new AbortController();setResult(undefined);setError(undefined);
    workout<T>(path,{signal:c.signal}).then(value=>{if(!c.signal.aborted)setResult(value);}).catch(e=>{if(!c.signal.aborted)setError(e);});
    return()=>c.abort();},[path,attempt]);
  return {...result,error,retry:()=>setAttempt(x=>x+1)};
}
export function Feedback({error,retry}:{error:unknown;retry?:()=>void}){return <div className="workout-feedback"><p role="alert" aria-label="Lỗi tập luyện">{message(error)}</p>
  {error instanceof WorkoutError&&error.status===401&&<p><a href="/dang-nhap" target="_blank" rel="noopener">Đăng nhập lại ở tab mới</a></p>}
  {retry&&<button type="button" className="cms-secondary" onClick={retry}>Thử tải lại</button>}</div>;}
export function useUnsaved(dirty:boolean){
  useEffect(()=>{if(!dirty)return;
    const leave=(e:BeforeUnloadEvent)=>{e.preventDefault();};
    const click=(e:MouseEvent)=>{const a=(e.target as Element)?.closest?.('a');if(!a||a.target==='_blank'||a.getAttribute('href')?.startsWith('#'))return;
      if(!window.confirm('Bạn có thay đổi chưa lưu. Rời trang và bỏ thay đổi?')){e.preventDefault();e.stopPropagation();}};
    window.addEventListener('beforeunload',leave);document.addEventListener('click',click,true);
    return()=>{window.removeEventListener('beforeunload',leave);document.removeEventListener('click',click,true);};
  },[dirty]);
}
export function useCreateKey(){const ref=useRef<{body:string;key:string}|null>(null);return(body:object)=>{const text=JSON.stringify(body);if(ref.current?.body!==text)ref.current={body:text,key:crypto.randomUUID()};return ref.current.key;};}
export function Confirm({label,description,onConfirm,disabled=false}:{label:string;description:string;onConfirm:()=>Promise<void>;disabled?:boolean}){
  const ref=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null);
  const [pending,setPending]=useState(false),[error,setError]=useState<unknown>();
  return <><button ref={trigger} type="button" className="cms-secondary" disabled={disabled} onClick={()=>{setError(undefined);ref.current?.showModal();}}>{label}</button>
    <dialog ref={ref} aria-label={label} onCancel={e=>{if(pending)e.preventDefault();}} onClose={()=>trigger.current?.focus()}>
      <h2>{label}</h2><p>{description}</p>{!!error&&<Feedback error={error}/>}
      <div className="workout-actions"><button type="button" autoFocus disabled={pending} className="cms-secondary" onClick={()=>ref.current?.close()}>Quay lại</button>
      <button type="button" disabled={pending} onClick={async()=>{if(pending)return;setPending(true);setError(undefined);try{await onConfirm();ref.current?.close();}catch(e){setError(e);}finally{setPending(false);}}}>{pending?'Đang xử lý…':'Xác nhận'}</button></div>
    </dialog></>;
}
export function ZoneField({value,onChange,label='Múi giờ'}:{value:string;onChange:(value:string)=>void;label?:string}){return <label>{label}<input required maxLength={80} value={value} onChange={e=>onChange(e.target.value)} placeholder="Asia/Bangkok"/><small>Ví dụ: Asia/Bangkok, Asia/Ho_Chi_Minh, America/New_York.</small></label>;}
