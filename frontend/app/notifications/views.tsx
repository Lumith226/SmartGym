'use client';
import Link from 'next/link';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Bell} from 'lucide-react';
import {Button} from '../../components/ui/button';
import {workout,WorkoutError} from '../workout/api';
import {useUnsaved} from '../workout/shared';
type Notice={id:string;kind:'WORKOUT_REMINDER';title:string;message:string;occurrenceId:string;createdAt:string;readAt:string|null};
type InboxPage={items:Notice[];unreadCount:number;nextCursor:string|null};
type Preferences={reminderInAppEnabled:boolean;reminderEmailEnabled:boolean;leadMinutes:number;version:number};
function errorText(error:unknown){
  if(error instanceof WorkoutError){if(error.status===401)return 'Phiên đã hết hiệu lực. Đăng nhập lại ở tab mới rồi thử lại; thay đổi chưa lưu được giữ tại đây.';
    if(error.code==='VERSION_MISMATCH')return 'Cấu hình đã thay đổi ở nơi khác. Thay đổi của bạn vẫn được giữ. Tải cấu hình mới để đối chiếu trước khi lưu lại.';
    if(error.code==='INVALID_CURSOR')return 'Trang thông báo không còn phù hợp với bộ lọc. Hãy quay về trang đầu.';
    if(error.status===422||error.status===400)return 'Kiểm tra kênh nhận và số phút báo trước từ 5 đến 1440.';}
  return 'Chưa kết nối được dịch vụ thông báo. Hãy thử lại. Nếu vừa lưu, tải cấu hình trên server để đối chiếu kết quả.';
}
function ErrorFeedback({error,retry}:{error:unknown;retry?:()=>void}){return <div className="workout-feedback"><p role="alert" aria-label="Lỗi thông báo">{errorText(error)}</p>
  {error instanceof WorkoutError&&error.status===401&&<p><a href="/dang-nhap" target="_blank" rel="noopener">Đăng nhập lại ở tab mới</a></p>}
  {retry&&<button type="button" className="cms-secondary" onClick={retry}>Thử tải lại</button>}</div>;}
function signalChange(){window.dispatchEvent(new Event('smartgym:notifications-changed'));}
function useInbox(path:string){
  const [data,setData]=useState<InboxPage>(),[error,setError]=useState<unknown>(),[loading,setLoading]=useState(true);
  const controller=useRef<AbortController|undefined>(undefined),generation=useRef(0);
  const refresh=useCallback(async()=>{
    const serial=++generation.current;controller.current?.abort();const current=new AbortController();controller.current=current;setLoading(true);
    try{const value=await workout<InboxPage>(path,{signal:current.signal});if(serial===generation.current&&!current.signal.aborted){setData(value.data);setError(undefined);}}
    catch(e){if(serial===generation.current&&!current.signal.aborted){setError(e);if(e instanceof WorkoutError&&e.status===401)setData(undefined);}}
    finally{if(serial===generation.current&&!current.signal.aborted)setLoading(false);}
  },[path]);
  useEffect(()=>{setData(undefined);setError(undefined);void refresh();
    const visibleRefresh=()=>{if(document.visibilityState==='visible')void refresh();};
    window.addEventListener('focus',visibleRefresh);window.addEventListener('smartgym:notifications-changed',visibleRefresh);document.addEventListener('visibilitychange',visibleRefresh);
    const timer=setInterval(visibleRefresh,30000);return()=>{++generation.current;controller.current?.abort();clearInterval(timer);window.removeEventListener('focus',visibleRefresh);window.removeEventListener('smartgym:notifications-changed',visibleRefresh);document.removeEventListener('visibilitychange',visibleRefresh);};
  },[refresh]);
  return{data,error,loading,refresh,forget:()=>setData(undefined)};
}
export function NotificationBadge(){
  const {data,error}=useInbox('notifications?limit=1&unreadOnly=true');
  const count = data && !error ? data.unreadCount : undefined;
  return <div className="grid justify-items-start gap-2">
    <Button asChild variant="secondary">
      <Link href="/app/thong-bao" aria-label={count === undefined ? 'Thông báo' : 'Thông báo, '+count+' chưa đọc'}>
        <Bell className="size-4" aria-hidden="true" />
        Thông báo
        {count !== undefined && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-[#0066cc]">{count}</span>}
      </Link>
    </Button>
    {!!error && <p role="status" className="text-xs text-ink-soft">Chưa tải được số thông báo.</p>}
  </div>;
}
export function Inbox({unreadOnly=false,cursor,zone}:{unreadOnly?:boolean;cursor?:string;zone:string}){
  const query=new URLSearchParams({unreadOnly:String(unreadOnly),limit:'10',...(cursor?{cursor}:{})});
  const {data,error,loading,refresh,forget}=useInbox('notifications?'+query),[pending,setPending]=useState<string[]>([]),[readError,setReadError]=useState<unknown>(),[success,setSuccess]=useState('');
  const mounted=useRef(true),writes=useRef(new Map<string,AbortController>());useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;for(const c of writes.current.values())c.abort();writes.current.clear();};},[]);
  const date=(value:string)=>new Intl.DateTimeFormat('vi-VN',{timeZone:zone,dateStyle:'short',timeStyle:'short'}).format(new Date(value));
  async function mark(id:string){if(writes.current.has(id))return;const c=new AbortController();writes.current.set(id,c);setPending(p=>[...p,id]);setReadError(undefined);setSuccess('');
    try{await workout('notifications/'+id+'/read',{method:'PUT',signal:c.signal});if(mounted.current&&!c.signal.aborted){setSuccess('Đã đánh dấu thông báo là đã đọc.');signalChange();}}
    catch(e){if(mounted.current&&!c.signal.aborted){setReadError(e);if(e instanceof WorkoutError&&e.status===401)forget();}}finally{writes.current.delete(id);if(mounted.current)setPending(p=>p.filter(x=>x!==id));}}
  return <><nav className="workout-actions" aria-label="Lọc hộp thông báo"><Link aria-current={!unreadOnly?'page':undefined} href="/app/thong-bao">Tất cả</Link><Link aria-current={unreadOnly?'page':undefined} href="/app/thong-bao?unreadOnly=true">Chưa đọc</Link><button type="button" onClick={()=>void refresh()} disabled={loading}>Làm mới thông báo</button></nav>
    {loading&&<p role="status">Đang tải thông báo…</p>}{!!error&&<ErrorFeedback error={error} retry={()=>void refresh()}/>}{!!readError&&<ErrorFeedback error={readError}/>}{success&&<p role="status">{success}</p>}
    {data&&<><p>Tổng chưa đọc: {data.unreadCount} · Thời gian hiển thị theo {zone}.</p>{!data.items.length&&<p>{unreadOnly?'Không có thông báo chưa đọc trong trang này.':'Chưa có thông báo trong trang này.'} <Link href="/app/lich">Xem lịch tập</Link></p>}
      <ul className="notification-list" aria-label="Danh sách thông báo">{data.items.map(item=><li key={item.id} className={item.readAt?'':'notification-unread'}><article aria-labelledby={'notice-'+item.id}><h2 id={'notice-'+item.id}>{item.title}</h2><p>{item.message}</p><p><time dateTime={item.createdAt}>{date(item.createdAt)}</time> · {item.readAt?'Đã đọc':'Chưa đọc'}</p><div className="workout-actions"><Link href={'/app/lich/buoi/'+item.occurrenceId}>Xem buổi tập hiện tại</Link>{!item.readAt&&<button type="button" disabled={pending.includes(item.id)} onClick={()=>void mark(item.id)} aria-label={'Đánh dấu đã đọc: '+item.title}>{pending.includes(item.id)?'Đang đánh dấu…':'Đánh dấu đã đọc'}</button>}</div></article></li>)}</ul>
      <nav className="workout-actions" aria-label="Phân trang thông báo">{cursor&&<Link href={'/app/thong-bao'+(unreadOnly?'?unreadOnly=true':'')}>Về trang đầu</Link>}{data.nextCursor&&<Link href={'/app/thong-bao?'+new URLSearchParams({unreadOnly:String(unreadOnly),cursor:data.nextCursor})}>Trang tiếp</Link>}</nav></>}
    {!data&&cursor&&<Link href={'/app/thong-bao'+(unreadOnly?'?unreadOnly=true':'')}>Về trang đầu</Link>}</>;
}
export function PreferencesForm(){
  const [values,setValues]=useState<Preferences>(),[saved,setSaved]=useState<Preferences>(),[etag,setEtag]=useState<string|null>(null),[error,setError]=useState<unknown>(),[pending,setPending]=useState(false),[success,setSuccess]=useState('');
  const alive=useRef(true),controller=useRef<AbortController|undefined>(undefined);
  const dirty=!!values&&!!saved&&JSON.stringify(values)!==JSON.stringify(saved);useUnsaved(dirty);
  const load=useCallback(async()=>{controller.current?.abort();const c=new AbortController();controller.current=c;setPending(true);setError(undefined);setSuccess('');try{
    const result=await workout<Preferences>('notification-preferences',{signal:c.signal});if(!c.signal.aborted&&alive.current){setValues(result.data);setSaved(result.data);setEtag(result.etag);}
  }catch(e){if(!c.signal.aborted&&alive.current)setError(e);}finally{if(!c.signal.aborted&&alive.current)setPending(false);}},[]);
  useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;controller.current?.abort();};},[load]);
  async function save(){if(pending||!values||!etag)return;setPending(true);setError(undefined);setSuccess('');const c=new AbortController();controller.current=c;
    try{const {version,...body}=values;const result=await workout<Preferences>('notification-preferences',{method:'PUT',match:etag,body,signal:c.signal});if(alive.current&&!c.signal.aborted){setValues(result.data);setSaved(result.data);setEtag(result.etag);setSuccess('Đã lưu tùy chọn nhắc lịch.');signalChange();}}
    catch(e){if(alive.current&&!c.signal.aborted)setError(e);}finally{if(alive.current&&!c.signal.aborted)setPending(false);}}
  return <>{!!error&&<ErrorFeedback error={error} retry={!values?()=>void load():undefined}/>}{!values&&!error&&<p role="status">Đang tải tùy chọn nhắc lịch…</p>}{success&&<p role="status">{success}</p>}
    {values&&<form aria-label="Tùy chọn nhắc lịch" onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={pending}><legend>Kênh nhận nhắc lịch tập</legend>
      <label className="notification-check"><input type="checkbox" checked={values.reminderInAppEnabled} onChange={e=>setValues({...values,reminderInAppEnabled:e.target.checked})}/>Nhận nhắc trong ứng dụng</label>
      <label className="notification-check"><input type="checkbox" checked={values.reminderEmailEnabled} onChange={e=>setValues({...values,reminderEmailEnabled:e.target.checked})}/>Nhận nhắc qua email</label>
      <label>Báo trước buổi tập (phút)<input required type="number" min="5" max="1440" step="1" value={Number.isNaN(values.leadMinutes)?'':values.leadMinutes} onChange={e=>setValues({...values,leadMinutes:e.target.value===''?NaN:Number(e.target.value)})}/></label>
      <p>Từ 5 đến 1440 phút. Email xác minh và đặt lại mật khẩu luôn hoạt động, độc lập với tùy chọn nhắc lịch.</p><p>Thư đã chuyển đi không thể thu hồi. Thông báo đã gửi được giữ trong lịch sử.</p>
      <div className="workout-actions"><button type="submit" disabled={!dirty}>{pending?'Đang lưu…':'Lưu tùy chọn'}</button><button type="button" className="cms-secondary" onClick={()=>{if(!dirty||window.confirm('Tải cấu hình trên server và bỏ thay đổi chưa lưu?'))void load();}}>Tải cấu hình trên server</button></div>
    </fieldset></form>}</>;
}
