'use client';
import Link from 'next/link';
import { useRef,useState,type FormEvent } from 'react';
import { Temporal } from '@js-temporal/polyfill';
import { workout,WorkoutError,type Page,type Plan,type Rule,type RuleInput,type Occurrence } from './api';
import { Confirm,Feedback,ZoneField,useCreateKey,useResource,useUnsaved } from './shared';
import { addDays,label,localInstant,localValue,preview,range,validZone } from './time';

const days=['Thứ hai','Thứ ba','Thứ tư','Thứ năm','Thứ sáu','Thứ bảy','Chủ nhật'];
function RuleForm({rule,etag,zone,date,planId,onSaved}:{rule?:Rule;etag?:string|null;zone:string;date:string;planId?:string;onSaved:()=>void}){
  const [body,setBody]=useState<RuleInput>(rule??{planId:planId??'',recurrence:'ONCE',timeZone:zone,startDate:date,startLocalTime:'18:00',durationMinutes:60});
  const [dirty,setDirty]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState<unknown>(),[saved,setSaved]=useState('');
  const [currentEtag,setCurrentEtag]=useState(etag);
  const [cursor,setCursor]=useState('');const plans=useResource<Page<Plan>>('workout-plans?limit=100'+(cursor?'&cursor='+cursor:''));
  const active=useRef(false),createKey=useCreateKey();useUnsaved(dirty);
  const change=(value:Partial<RuleInput>)=>{setBody(old=>({...old,...value}));setDirty(true);setSaved('');};
  let previews:string[]=[],previewError='';
  try{
    if(body.startDate&&body.startLocalTime&&validZone(body.timeZone)){
      const start=Temporal.PlainDate.from(body.startDate),today=Temporal.Now.zonedDateTimeISO(body.timeZone).toPlainDate();
      const first=Temporal.PlainDate.compare(start,today)>0?start:today;
      for(let i=0;i<35&&previews.length<3;i++){
        const current=first.add({days:i});if(body.endDate&&current.toString()>body.endDate)break;
        if(body.recurrence==='ONCE'?!current.equals(start):!body.weekdays?.includes(current.dayOfWeek))continue;
        if(Temporal.Instant.compare(localInstant(current.toString()+'T'+body.startLocalTime,body.timeZone),Temporal.Now.instant())>0)
          previews.push(preview(current.toString(),body.startLocalTime,body.timeZone,body.durationMinutes));
      }
    }else previewError='Nhập ngày, giờ và múi giờ IANA hợp lệ để xem trước.';
  }catch{previewError='Kiểm tra ngày, giờ và múi giờ.';}
  async function save(e:FormEvent){e.preventDefault();if(active.current)return;
    if(!validZone(body.timeZone)){setError(new WorkoutError(422,'INVALID_SCHEDULE'));return;}
    active.current=true;setPending(true);setError(undefined);setSaved('');
    try{
      const input:RuleInput={planId:body.planId,recurrence:body.recurrence,timeZone:body.timeZone,startDate:body.startDate,startLocalTime:body.startLocalTime,durationMinutes:body.durationMinutes,
        ...(body.recurrence==='WEEKLY'?{weekdays:body.weekdays??[],...(body.endDate?{endDate:body.endDate}:{})}:{})};
      const result=await workout<Rule>('workout-schedules'+(rule?'/'+rule.id:''),{method:rule?'PUT':'POST',body:input,match:currentEtag??undefined,key:rule?undefined:createKey(input)});
      setCurrentEtag(result.etag);
      setDirty(false);setSaved(rule?'Đã cập nhật lịch.':'Đã tạo lịch.');onSaved();
    }catch(e){setError(e);}finally{active.current=false;setPending(false);}
  }
  return <section className="workout-rule"><h2>{rule?'Chỉnh quy tắc lịch':'Tạo lịch tập'}</h2>
    {rule&&<p className="workout-note">Áp dụng cho các buổi chưa bắt đầu và chưa sửa riêng. Giữ lịch sử và buổi đã dời/hủy riêng. Thời điểm cuối cùng do máy chủ xác nhận.</p>}
    {!!error&&<Feedback error={error}/>}{saved&&<p role="status">{saved}</p>}
    <form className="workout-form" aria-label="Quy tắc lịch tập" onSubmit={save}><fieldset disabled={pending||rule?.status==='CANCELED'}><legend>Ngày giờ và phạm vi</legend>
      <label>Chương trình<select required value={body.planId} onChange={e=>change({planId:e.target.value})}><option value="">Chọn chương trình</option>
        {body.planId&&!plans.data?.items.some(p=>p.id===body.planId)&&<option value={body.planId}>Chương trình đã chọn</option>}
        {plans.data?.items.map(plan=><option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
      {!!plans.error&&<Feedback error={plans.error} retry={plans.retry}/>}
      {!plans.data&&!plans.error&&<p role="status">Đang tải chương trình để chọn…</p>}
      {plans.data&&!plans.data.items.length&&<p>Chưa có chương trình đang hoạt động. <Link href="/app/chuong-trinh/moi">Tạo chương trình</Link></p>}
      {plans.data?.nextCursor&&<button type="button" className="cms-secondary" onClick={()=>setCursor(plans.data!.nextCursor!)}>Chương trình trang tiếp</button>}
      <label>Kiểu lịch<select value={body.recurrence} onChange={e=>change({recurrence:e.target.value as RuleInput['recurrence'],weekdays:body.weekdays??[1]})}><option value="ONCE">Một lần</option><option value="WEEKLY">Hằng tuần</option></select></label>
      <ZoneField value={body.timeZone} onChange={timeZone=>change({timeZone})}/>
      <label>Ngày bắt đầu<input required type="date" value={body.startDate} onChange={e=>change({startDate:e.target.value})}/></label>
      <label>Giờ bắt đầu địa phương<input required type="time" value={body.startLocalTime} onChange={e=>change({startLocalTime:e.target.value})}/></label>
      <label>Thời lượng buổi (phút)<input type="number" required min={5} max={240} value={body.durationMinutes} onChange={e=>change({durationMinutes:Number(e.target.value)})}/></label>
      {body.recurrence==='WEEKLY'&&<><label>Ngày kết thúc (không bắt buộc)<input type="date" min={body.startDate} value={body.endDate??''} onChange={e=>change({endDate:e.target.value||undefined})}/></label>
      <fieldset className="workout-weekdays"><legend>Lặp vào các ngày</legend>{days.map((day,index)=><label key={day}><input type="checkbox" checked={body.weekdays?.includes(index+1)??false} onChange={e=>change({weekdays:e.target.checked?[...(body.weekdays??[]),index+1].sort():(body.weekdays??[]).filter(d=>d!==index+1)})}/>{day}</label>)}</fieldset></>}
    </fieldset><div className="workout-note"><h3>Xem trước theo múi giờ lịch</h3>{previewError?<p>{previewError}</p>:<ul>{previews.map(p=><li key={p}>{p}</li>)}</ul>}
      <p>Lịch được duy trì trong cửa sổ 35 ngày địa phương. Giờ DST bị thiếu chuyển tới giờ hợp lệ đầu tiên, giờ lặp lấy lần sớm hơn. Bản xem trước có thể khác máy chủ nếu dữ liệu múi giờ của thiết bị cũ.</p></div>
    <button type="submit" disabled={pending||rule?.status==='CANCELED'||(body.recurrence==='WEEKLY'&&!body.weekdays?.length)}>{pending?'Đang lưu…':rule?'Lưu quy tắc':'Tạo lịch'}</button></form>
  </section>;
}
function EditRule({id,zone,date,onSaved}:{id:string;zone:string;date:string;onSaved:()=>void}){
  const {data,etag,error,retry}=useResource<Rule>('workout-schedules/'+id);
  if(error)return <Feedback error={error} retry={retry}/>;if(!data)return <p role="status">Đang tải quy tắc lịch…</p>;
  return <><p><Link href="/app/lich">Đóng chỉnh quy tắc</Link></p><RuleForm key={id+':'+data.version} rule={data} etag={etag} zone={zone} date={date} onSaved={onSaved}/>
    <Confirm label="Tải quy tắc mới" description="Bỏ thay đổi đang nhập và tải phiên bản quy tắc mới nhất?" onConfirm={async()=>retry()}/></>;
}
function RuleList({zone,cursor,onSaved}:{zone:string;cursor?:string;onSaved:()=>void}){
  const {data,error,retry}=useResource<Page<Rule>>('workout-schedules?limit=20'+(cursor?'&cursor='+cursor:''));
  if(error)return <Feedback error={error} retry={retry}/>;if(!data)return <p role="status">Đang tải lịch đang hoạt động…</p>;
  return <><ul className="workout-list" aria-label="Quy tắc lịch đang hoạt động">{data.items.map(rule=><li key={rule.id}>
    <h3>{rule.recurrence==='WEEKLY'?'Lịch hằng tuần':'Lịch một lần'} · {rule.startLocalTime} ({rule.timeZone})</h3>
    <p>Từ {rule.startDate}{rule.endDate?' đến hết '+rule.endDate:''} · {rule.durationMinutes} phút</p>
    <Link href={'/app/lich?'+new URLSearchParams({scheduleId:rule.id,zone})}>Chỉnh quy tắc</Link>{' · '}
    <Link href={'/app/chuong-trinh/'+rule.planId}>Xem chương trình</Link>
    {rule.projectionConflicts?.length>0&&<div className="workout-feedback"><h4>Buổi chưa tạo vì chồng lịch</h4><ul>{rule.projectionConflicts.map(conflict=><li key={conflict.localDate}>{label(conflict.startAt,zone)} – {label(conflict.endAt,zone)} ({zone}). Đổi quy tắc hoặc dời buổi đang chiếm giờ.</li>)}</ul></div>}
    <Confirm label="Hủy cả lịch" description="Hủy tất cả buổi chưa bắt đầu của lịch này, gồm buổi đã dời riêng. Buổi đã bắt đầu và nhật ký được giữ." onConfirm={async()=>{
      await workout('workout-schedules/'+rule.id,{method:'DELETE',match:'"v'+rule.version+'"'});retry();onSaved();}}/>
  </li>)}</ul>{!data.items.length&&<p>Chưa có lịch đang hoạt động.</p>}
    {data.nextCursor&&<p><Link href={'/app/lich?'+new URLSearchParams({zone,scheduleCursor:data.nextCursor})}>Trang lịch tiếp</Link></p>}{cursor&&<p><Link href="/app/lich">Về trang lịch đầu</Link></p>}</>;
}
export function Calendar({zone,date,view,cursor,scheduleCursor,planId,scheduleId}:{zone:string;date:string;view:string;cursor?:string;scheduleCursor?:string;planId?:string;scheduleId?:string}){
  const [revision,setRevision]=useState(0);const window=range(date,zone);
  const params=new URLSearchParams({...window,limit:'100'});if(cursor)params.set('cursor',cursor);
  const {data,error,retry}=useResource<Page<Occurrence>>('workout-occurrences?'+params);
  const [filterZone,setFilterZone]=useState(zone),[filterDate,setFilterDate]=useState(date),[filterError,setFilterError]=useState('');
  const destination=(date:string,viewOverride=view)=>'/app/lich?'+new URLSearchParams({date,zone,view:viewOverride});
  const saved=()=>{setRevision(x=>x+1);retry();};
  const card=(item:Occurrence)=><li key={item.id}><Link href={'/app/lich/buoi/'+item.id}><strong>{label(item.startAt,zone)} – {label(item.endAt,zone)}</strong></Link>
    <p>{item.status==='CANCELED'?'Đã hủy':'Đã lên lịch'} · {item.plannedExercises.length} bài · {zone}</p>
    {item.timeZone!==zone&&<p>Giờ của buổi: {label(item.startAt,item.timeZone)} ({item.timeZone})</p>}</li>;
  return <><div className="workout-actions"><Link href="/app/chuong-trinh">Chương trình tập</Link><Link href="/app">Tài khoản</Link></div>
    <form aria-label="Khoảng lịch hiển thị" onSubmit={e=>{if(!validZone(filterZone)||!filterDate){e.preventDefault();setFilterError('Nhập ngày và múi giờ IANA hợp lệ.');}}}>
      <label>Ngày đầu tuần hiển thị<input type="date" name="date" required value={filterDate} onChange={e=>setFilterDate(e.target.value)}/></label>
      <label>Múi giờ hiển thị<input name="zone" required maxLength={80} value={filterZone} onChange={e=>setFilterZone(e.target.value)}/></label><input type="hidden" name="view" value={view}/>
      <button type="submit">Xem lịch</button></form>{filterError&&<p role="alert">{filterError}</p>}
    <p>Khoảng hiển thị: {date} đến {addDays(date,6)} · {zone}. Giờ của lịch gốc được giữ khi đổi múi giờ xem.</p>
    <nav className="workout-actions" aria-label="Điều hướng lịch"><Link href={destination(addDays(date,-7))}>Tuần trước</Link><Link href={destination(addDays(date,7))}>Tuần sau</Link>
      <Link href={destination(date,'agenda')} aria-current={view==='agenda'?'page':undefined}>Danh sách</Link><Link href={destination(date,'week')} aria-current={view==='week'?'page':undefined}>Theo tuần</Link><button type="button" className="cms-secondary" onClick={saved}>Cập nhật lịch</button></nav>
    {!!error?<Feedback error={error} retry={retry}/>:!data?<p role="status">Đang tải buổi tập…</p>:<section aria-label="Các buổi trong tuần">
      {!data.items.length&&<p>Chưa có buổi tập trong khoảng này. Bạn có thể tạo lịch bên dưới.</p>}
      {view==='week'?<div className="workout-week">{Array.from({length:7},(_,i)=>addDays(date,i)).map(day=><section key={day}><h2>{day}</h2><ul className="workout-list">{data.items.filter(item=>localValue(item.startAt,zone).slice(0,10)===day).map(card)}</ul></section>)}</div>:
        <ul className="workout-list" aria-label="Danh sách buổi tập">{data.items.map(card)}</ul>}
      {data.nextCursor&&<p><Link href={destination(date)+'&cursor='+data.nextCursor}>Trang buổi tiếp</Link></p>}{cursor&&<p><Link href={destination(date)}>Về trang buổi đầu</Link></p>}
    </section>}
    {scheduleId?<EditRule key={scheduleId} id={scheduleId} zone={zone} date={date} onSaved={saved}/>:<RuleForm zone={zone} date={date} planId={planId} onSaved={saved}/>}
    <section><h2>Lịch đang hoạt động</h2><RuleList key={revision} zone={zone} cursor={scheduleCursor} onSaved={saved}/></section>
  </>;
}
