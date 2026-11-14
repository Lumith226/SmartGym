'use client';
import Link from 'next/link';
import {useState} from 'react';
import {Temporal} from '@js-temporal/polyfill';
import {Card} from '../../components/ui/card';
import {type Page,type Occurrence} from '../workout/api';
import {Feedback,useResource} from '../workout/shared';
import {addDays,label,localInstant,validZone} from '../workout/time';
import {numberLabel,sourceLabel,type Log,type Summary} from './types';

export function PeriodForm({from,to,zone}:{from:string;to:string;zone:string}){
  const [values,setValues]=useState({from,to,zone}),[error,setError]=useState('');
  return <><form aria-label="Khoảng ngày tiến độ" onSubmit={e=>{try{const a=Temporal.PlainDate.from(values.from),b=Temporal.PlainDate.from(values.to);if(a.until(b).days<0||a.until(b).days>365||!validZone(values.zone))throw Error();}catch{e.preventDefault();setError('Chọn khoảng ngày hợp lệ tối đa 366 ngày và múi giờ IANA.');}}}>
    <label>Từ ngày<input required type="date" name="from" value={values.from} onChange={e=>setValues({...values,from:e.target.value})}/></label>
    <label>Đến hết ngày<input required type="date" name="to" value={values.to} onChange={e=>setValues({...values,to:e.target.value})}/></label>
    <label>Múi giờ xem<input required name="zone" value={values.zone} maxLength={80} onChange={e=>setValues({...values,zone:e.target.value})}/></label><button type="submit">Áp dụng khoảng ngày</button>
  </form>{error&&<p role="alert" aria-label="Lỗi khoảng ngày">{error}</p>}</>;
}
function Totals({data}:{data:Summary}){
  const totals = [
    {label:'Buổi đã ghi', value:data.workoutCount},
    {label:'Tổng rep', value:data.totalRepetitions},
    {label:'Khối lượng (rep × kg)', value:data.totalVolumeKg},
  ];
  return <dl className="progress-totals grid gap-2">
    {totals.map(({label,value}) => (
      <div key={label} className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-lg bg-surface px-3 py-2">
        <dt>{label}</dt><dd className="font-semibold tabular-nums text-ink">{numberLabel(value)}</dd>
      </div>
    ))}
  </dl>;
}
export function SummaryView({from,to,zone,compact=false}:{from:string;to:string;zone:string;compact?:boolean}){
  const {data,error,retry}=useResource<Summary>('progress/summary?'+new URLSearchParams({from,to,timeZone:zone}));
  if(error)return <Feedback error={error} retry={retry}/>;if(!data)return <p role="status">Đang tải tiến độ…</p>;
  const max=Math.max(1,...data.series.map(d=>d.workoutCount));
  const points=data.series.map((d,i)=>(15+i*770/Math.max(1,data.series.length-1))+','+(150-d.workoutCount/max*130)).join(' ');
  return <><Totals data={data}/>{!data.workoutCount&&<p>Chưa có nhật ký trong khoảng này. <Link href="/app/nhat-ky/moi">Ghi buổi đầu tiên</Link></p>}
    {!compact&&<><figure className="progress-chart"><svg role="img" aria-label="Biểu đồ số buổi theo ngày; dữ liệu đầy đủ trong bảng bên dưới" viewBox="0 0 800 180"><line x1="15" y1="150" x2="785" y2="150" stroke="#657c6d"/><polyline fill="none" stroke="#145c3b" strokeWidth="3" points={points}/>{data.series.map((d,i)=><circle key={d.date} cx={15+i*770/Math.max(1,data.series.length-1)} cy={150-d.workoutCount/max*130} r="3" fill="#145c3b"/>)}</svg><figcaption>Số buổi từ {from} đến {to} theo {zone}. Set chỉ có thời lượng không làm tăng rep hoặc rep × kg.</figcaption></figure>
      <div className="progress-table" role="region" aria-label="Bảng tiến độ theo ngày" tabIndex={0}><table><caption>Số liệu theo ngày · {zone}</caption><thead><tr><th scope="col">Ngày</th><th scope="col">Buổi</th><th scope="col">Rep</th><th scope="col">Rep × kg</th></tr></thead><tbody>{data.series.map(d=><tr key={d.date}><th scope="row">{d.date}</th><td>{numberLabel(d.workoutCount)}</td><td>{numberLabel(d.repetitions)}</td><td>{numberLabel(d.volumeKg)}</td></tr>)}</tbody></table></div></>}
    <p><button type="button" className="cms-secondary" onClick={retry}>Cập nhật tiến độ</button></p></>;
}
export function LogList({from,to,zone,cursor,compact=false}:{from:string;to:string;zone:string;cursor?:string;compact?:boolean}){
  let query=new URLSearchParams({limit:compact?'3':'10'});
  try{query.set('from',localInstant(from+'T00:00',zone).toString());query.set('to',localInstant(addDays(to,1)+'T00:00',zone).toString());}catch{query.set('from','invalid');}
  if(cursor)query.set('cursor',cursor);
  const {data,error,retry}=useResource<Page<Log>>('progress/logs?'+query);
  if(error)return <Feedback error={error} retry={retry}/>;if(!data)return <p role="status">Đang tải nhật ký…</p>;
  return <>{!data.items.length?<p>Chưa có nhật ký trong khoảng này. <Link href="/app/nhat-ky/moi">Ghi buổi tập</Link></p>:
    <ul className="workout-list" aria-label="Danh sách nhật ký">{data.items.map(log=><li key={log.id}><Link href={'/app/nhat-ky/'+log.id}><strong>{label(log.performedAt,zone)} ({zone})</strong></Link><p>{sourceLabel[log.source]} · {log.sets.length} set</p><p>{[...new Set(log.sets.map(s=>s.exerciseNameVi))].join(', ')}</p></li>)}</ul>}
    {!compact&&data.nextCursor&&<Link href={'/app/nhat-ky?'+new URLSearchParams({from,to,zone,cursor:data.nextCursor})}>Trang nhật ký tiếp</Link>}
    {cursor&&<p><Link href={'/app/nhat-ky?'+new URLSearchParams({from,to,zone})}>Về trang nhật ký đầu</Link></p>}</>;
}
export function Upcoming({now,zone}:{now:string;zone:string}){
  const [cursor,setCursor]=useState('');const params=new URLSearchParams({from:now,to:Temporal.Instant.from(now).add({hours:168}).toString(),limit:'20'});if(cursor)params.set('cursor',cursor);
  const {data,error,retry}=useResource<Page<Occurrence>>('workout-occurrences?'+params);
  if(error)return <Feedback error={error} retry={retry}/>;if(!data)return <p role="status">Đang tải lịch sắp tới…</p>;
  const active=data.items.filter(d=>d.status==='SCHEDULED');
  return <>{active.length?<ul className="workout-list" aria-label="Buổi dự kiến sắp tới">{active.slice(0,3).map(item=><li key={item.id}><Link href={'/app/lich/buoi/'+item.id}>{label(item.startAt,zone)} ({zone})</Link><p>{item.plannedExercises.length} bài theo kế hoạch</p></li>)}</ul>:<p>{data.nextCursor?'Trang này chưa có buổi đang hoạt động.':'Chưa có buổi dự kiến trong 7 ngày tới.'}</p>}
    {data.nextCursor&&<button type="button" className="cms-secondary" onClick={()=>setCursor(data.nextCursor!)}>Xem các buổi tiếp</button>}<p><Link href="/app/lich">Mở lịch tập</Link> · <button type="button" className="cms-secondary" onClick={retry}>Cập nhật lịch sắp tới</button></p></>;
}
export function Dashboard({zone,today,now}:{zone:string;today:string;now:string}){
  const weekStart = addDays(today,-6);
  const card = 'min-w-0 space-y-3 rounded-xl p-5 text-sm text-ink-soft [&_a]:font-semibold [&_a]:text-[#0066cc] [&_a:hover]:underline [&_button]:font-semibold [&_button]:text-[#0066cc] [&_button:hover]:underline [&_li]:mt-2 [&_li]:rounded-lg [&_li]:bg-surface [&_li]:p-3';
  const heading = 'text-lg font-semibold tracking-tight text-ink';
  return (
    <section aria-labelledby="training-overview">
      <h2 id="training-overview" className="mb-3 text-xl font-semibold tracking-tight">Tổng quan tập luyện</h2>
      <div className="progress-dashboard grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Card className={card}>
          <section aria-label="Tiến độ 7 ngày" className="space-y-3">
            <h3 className={heading}>Tiến độ 7 ngày gần đây</h3>
            <p>{weekStart} đến {today} · {zone}</p>
            <SummaryView from={weekStart} to={today} zone={zone} compact />
            <Link href="/app/tien-do">Xem toàn bộ tiến độ</Link>
          </section>
        </Card>
        <Card className={card}>
          <section aria-label="Nhật ký gần đây" className="space-y-3">
            <h3 className={heading}>Nhật ký gần đây</h3>
            <LogList from={addDays(today,-29)} to={today} zone={zone} compact />
            <Link href="/app/nhat-ky">Tất cả nhật ký</Link>
          </section>
        </Card>
        <Card className={card}>
          <section aria-label="Lịch dự kiến" className="space-y-3">
            <h3 className={heading}>Buổi dự kiến sắp tới</h3>
            <Upcoming now={now} zone={zone} />
          </section>
        </Card>
      </div>
    </section>
  );
}
