import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';import {readFile} from 'node:fs/promises';
import {startAuthStack} from '../helpers/auth-stack.mjs';
import {addDays,todayIn} from '../../frontend/app/workout/time.ts';
test.use({ignoreHTTPSErrors:true,trace:'off'});
let stack;const password='SmartGym progress browser 123!';
test.beforeAll(async()=>{test.setTimeout(180000);stack=await startAuthStack({progress:true});});
test.afterAll(async()=>{test.setTimeout(90000);await stack?.stop();});
const headers=()=>({Origin:stack.url,'X-SmartGym-CSRF':'1'});
async function login(context,page){const email='progress-'+randomUUID()+'@example.test';
  expect((await context.request.post(stack.url+'/api/v1/auth/register',{headers:headers(),data:{email,password,displayName:'Người ghi nhật ký'}})).status()).toBe(202);
  const token=new URLSearchParams(new URL(await stack.mailLink(email,'verify')).hash.slice(1)).get('token');expect((await context.request.post(stack.url+'/api/v1/auth/verify-email',{headers:headers(),data:{token}})).status()).toBe(204);
  expect((await context.request.post(stack.url+'/api/v1/auth/login',{headers:headers(),data:{email,password}})).status()).toBe(200);await page.goto(stack.url+'/app');
}
const baseInput={performedAt:'2020-01-01T12:00:00Z',sets:[{exerciseId:'bodyweight_squat',ordinal:1,repetitions:10,weightKg:20}]};
async function postLog(context,body=baseInput,key=randomUUID()){const r=await context.request.post(stack.url+'/api/v1/progress/logs',{headers:{...headers(),'Idempotency-Key':key},data:body});expect(r.status()).toBe(201);return r.json();}
const total=(page,name)=>page.locator('.progress-totals > div').filter({has:page.getByText(name,{exact:true})}).locator('dd');
async function summaryPage(page,from,to=from,zone='Asia/Bangkok'){await page.goto(stack.url+'/app/tien-do?'+new URLSearchParams({from,to,zone}));await expect(page.getByRole('table')).toBeVisible();}
test('manual log persists actual sets and summary follows edit, stale reload and delete',async({page,context})=>{
  await login(context,page);const date=addDays(todayIn('Asia/Bangkok'),-1);await page.goto(stack.url+'/app/nhat-ky/moi');
  await page.getByLabel('Tìm bài tập',{exact:true}).fill('squat');await page.getByRole('button',{name:'Tìm bài',exact:true}).click();await page.getByRole('button',{name:'Thêm Squat không tạ',exact:true}).click();
  let items=page.getByRole('list',{name:'Các set thực tế'}).locator(':scope > li');await items.nth(0).getByLabel('Trọng lượng (kg)',{exact:true}).fill('20');
  await page.getByRole('button',{name:'Thêm Squat không tạ',exact:true}).click();await items.nth(1).getByLabel('Số rep thực tế').fill('');await items.nth(1).getByLabel('Thời lượng set (giây)').fill('45');
  const form=page.getByRole('form',{name:'Nhật ký buổi tập'});await form.getByLabel('Thời điểm tập thực tế').fill(date+'T12:00');await form.getByLabel('Ghi chú buổi tập').fill('Nhật ký đầu tiên');
  await form.getByRole('button',{name:'Lưu nhật ký',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Đã lưu nhật ký.'})).toBeVisible();
  const href=await page.getByRole('link',{name:'Mở nhật ký đã lưu'}).getAttribute('href');await summaryPage(page,date);await expect(total(page,'Buổi đã ghi')).toHaveText('1');await expect(total(page,'Tổng rep')).toHaveText('10');await expect(total(page,'Khối lượng (rep × kg)')).toHaveText('200');
  await page.goto(stack.url+href);await expect(page.getByLabel('Ghi chú buổi tập')).toHaveValue('Nhật ký đầu tiên');items=page.getByRole('list',{name:'Các set thực tế'}).locator(':scope > li');await items.nth(0).getByLabel('Số rep thực tế').fill('12');await page.getByRole('button',{name:'Lưu nhật ký',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Đã lưu nhật ký.'})).toBeVisible();
  await summaryPage(page,date);await expect(total(page,'Tổng rep')).toHaveText('12');await expect(total(page,'Khối lượng (rep × kg)')).toHaveText('240');
  await page.goto(stack.url+href);await expect(page.getByLabel('Ghi chú buổi tập')).toHaveValue('Nhật ký đầu tiên');
  const id=href.split('/').at(-1),read=await context.request.get(stack.url+'/api/v1/progress/logs/'+id),log=await read.json();
  const body={performedAt:log.performedAt,notes:'Ghi chú ở tab khác',sets:log.sets.map(({exerciseNameVi,...s})=>s)};
  expect((await context.request.put(stack.url+'/api/v1/progress/logs/'+id,{headers:{...headers(),'If-Match':read.headers().etag},data:body})).status()).toBe(200);
  await page.getByLabel('Ghi chú buổi tập').fill('Bản nháp đang nhập');await page.getByRole('button',{name:'Lưu nhật ký',exact:true}).click();await expect(page.getByRole('alert',{name:'Lỗi tập luyện'})).toContainText('Dữ liệu đã thay đổi');await expect(page.getByLabel('Ghi chú buổi tập')).toHaveValue('Bản nháp đang nhập');
  await page.getByRole('button',{name:'Tải nhật ký mới nhất',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Quay lại'}).click();await expect(page.getByRole('button',{name:'Tải nhật ký mới nhất',exact:true})).toBeFocused();
  await page.getByRole('button',{name:'Tải nhật ký mới nhất',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Xác nhận'}).click();await expect(page.getByLabel('Ghi chú buổi tập')).toHaveValue('Ghi chú ở tab khác');
  await page.getByRole('button',{name:'Xóa nhật ký',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Xác nhận'}).click();await expect(page.getByRole('status')).toContainText('Đã xóa nhật ký');
  await summaryPage(page,date);await expect(total(page,'Buổi đã ghi')).toHaveText('0');await expect(total(page,'Khối lượng (rep × kg)')).toHaveText('0');
});
test('scheduled log uses owned snapshot and a duplicate offers the existing log',async({page,context,browser})=>{
  await login(context,page);const p=await context.request.post(stack.url+'/api/v1/workout-plans',{headers:{...headers(),'Idempotency-Key':randomUUID()},data:{name:'Lịch để ghi thực tế',exercises:[{exerciseId:'bodyweight_squat',sets:3,targetReps:12}]}});expect(p.status()).toBe(201);const plan=await p.json(),date=addDays(todayIn('UTC'),1);
  const s=await context.request.post(stack.url+'/api/v1/workout-schedules',{headers:{...headers(),'Idempotency-Key':randomUUID()},data:{planId:plan.id,recurrence:'ONCE',timeZone:'UTC',startDate:date,startLocalTime:'12:00',durationMinutes:60}});expect(s.status()).toBe(201);const schedule=await s.json();
  const occurrence=(await stack.workoutDb.query('SELECT id FROM workout_occurrences WHERE schedule_id=$1',[schedule.id])).rows[0].id;
  await page.goto(stack.url+'/app/lich/buoi/'+occurrence);await page.getByRole('link',{name:'Ghi nhật ký từ buổi này'}).click();await expect(page.getByRole('list',{name:'Các set thực tế'}).locator(':scope > li')).toHaveCount(3);
  await page.getByRole('button',{name:'Lưu nhật ký',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Đã lưu nhật ký.'})).toBeVisible();const href=await page.getByRole('link',{name:'Mở nhật ký đã lưu'}).getAttribute('href');
  await page.goto(stack.url+'/app/nhat-ky/moi?occurrenceId='+occurrence);await page.getByRole('button',{name:'Lưu nhật ký',exact:true}).click();await expect(page.getByRole('alert',{name:'Lỗi tập luyện'})).toContainText('đã có nhật ký');await expect(page.getByRole('link',{name:'Mở nhật ký đã liên kết'})).toHaveAttribute('href',href);
  const other=await browser.newContext({ignoreHTTPSErrors:true});try{const tab=await other.newPage();await login(other,tab);expect((await other.request.get(stack.url+'/api/v1/progress/logs/'+href.split('/').at(-1))).status()).toBe(404);await tab.goto(stack.url+'/app/nhat-ky/moi?occurrenceId='+occurrence);await expect(tab.getByRole('alert',{name:'Lỗi tập luyện'})).toContainText('Không tìm thấy dữ liệu');}finally{await other.close();}
});
test('date filters, zone changes and keyset pagination use real progress data',async({page,context})=>{
  await login(context,page);await postLog(context,{...baseInput,performedAt:'2020-01-01T23:30:00Z'});await summaryPage(page,'2020-01-01','2020-01-01','UTC');await expect(total(page,'Buổi đã ghi')).toHaveText('1');
  await page.getByLabel('Múi giờ xem',{exact:true}).fill('Asia/Bangkok');await page.getByRole('button',{name:'Áp dụng khoảng ngày'}).click();await expect(total(page,'Buổi đã ghi')).toHaveText('0');
  for(let i=0;i<12;i++)await postLog(context,{...baseInput,performedAt:'2020-02-01T12:00:00Z',notes:String(i)});
  await page.goto(stack.url+'/app/nhat-ky?from=2020-02-01&to=2020-02-01&zone=UTC');await expect(page.getByRole('list',{name:'Danh sách nhật ký'}).locator(':scope > li')).toHaveCount(10);await page.getByRole('link',{name:'Trang nhật ký tiếp'}).click();await expect(page.getByRole('list',{name:'Danh sách nhật ký'}).locator(':scope > li')).toHaveCount(2);
});
test('Progress BFF protects writes and preserves a draft after session expiry',async({page,context})=>{
  await login(context,page);const key=randomUUID(),log=await postLog(context,baseInput,key),path=stack.url+'/api/v1/progress/logs/'+log.id;
  const replay=await postLog(context,baseInput,key);expect(replay.id).toBe(log.id);
  expect((await context.request.put(path,{headers:{Origin:'https://evil.test','X-SmartGym-CSRF':'1','If-Match':'"v1"'},data:baseInput})).status()).toBe(403);
  expect((await context.request.delete(path,{headers:headers()})).status()).toBe(428);
  expect((await context.request.get(stack.url+'/api/v1/progress/summary?from=2020-01-01')).status()).toBe(400);
  expect((await context.request.get(stack.url+'/api/v1/progress/logs?limit=1&limit=2')).status()).toBe(400);
  expect((await context.request.post(stack.url+'/api/v1/progress/logs',{headers:{...headers(),'Idempotency-Key':randomUUID()},data:{...baseInput,ownerUserId:randomUUID()}})).status()).toBe(422);
  const response=await context.request.get(path);expect(response.headers()['cache-control']).toBe('no-store');expect(response.headers()['set-cookie']).toBeUndefined();expect(JSON.stringify(await response.json())).not.toMatch(/accessToken|eyJ/);
  await page.goto(stack.url+'/app/nhat-ky/'+log.id);await expect(page.getByLabel('Thời điểm tập thực tế')).toHaveValue('2020-01-01T19:00');await context.request.post(stack.url+'/api/v1/auth/logout',{headers:headers(),data:{}});
  await page.getByLabel('Ghi chú buổi tập').fill('Không mất ghi chú sau hết phiên');await page.getByRole('button',{name:'Lưu nhật ký',exact:true}).click();await expect(page.getByRole('alert',{name:'Lỗi tập luyện'})).toContainText('Phiên đã hết hiệu lực');await expect(page.getByLabel('Ghi chú buổi tập')).toHaveValue('Không mất ghi chú sau hết phiên');
});
test('mobile chart/table accessibility and dashboard isolate Workout and Progress failures',async({page,context})=>{
  await login(context,page);const today=todayIn('Asia/Bangkok'),date=addDays(today,-1);await postLog(context,{...baseInput,performedAt:new Date(Date.now()-86400000).toISOString()});await summaryPage(page,date,today);
  for(const width of [320,640,1024,1440]){await page.setViewportSize({width,height:800});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);}
  await page.setViewportSize({width:640,height:800});await page.evaluate(()=>document.documentElement.style.zoom='2');expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);await page.evaluate(()=>document.documentElement.style.zoom='');await page.setViewportSize({width:320,height:740});
  await page.addScriptTag({content:await readFile('node_modules/axe-core/axe.min.js','utf8')});const scan=await page.evaluate(async()=>window.axe.run(document.querySelector('main'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}));expect(scan.violations).toEqual([]);await page.screenshot({path:'.local/ui-review/progress-mobile.png',fullPage:true});
  await page.setViewportSize({width:1280,height:900});await page.goto(stack.url+'/app');await expect(page.getByRole('region',{name:'Tiến độ 7 ngày',exact:true}).locator('.progress-totals dd').first()).toHaveText('1');await expect(page.getByRole('region',{name:'Nhật ký gần đây',exact:true}).getByRole('list')).toBeVisible();await page.screenshot({path:'.local/ui-review/progress-dashboard.png',fullPage:true});
  await stack.stopWorkout();await page.goto(stack.url+'/app');const progress=page.getByRole('region',{name:'Tiến độ 7 ngày',exact:true});await expect(progress.locator('.progress-totals dd').first()).toHaveText('1');await expect(page.getByRole('region',{name:'Nhật ký gần đây',exact:true}).getByRole('list')).toBeVisible();await expect(page.getByRole('region',{name:'Lịch dự kiến',exact:true}).getByRole('alert',{name:'Lỗi tập luyện'})).toBeVisible();
  await stack.stopProgress();await page.goto(stack.url+'/app');await expect(page.getByRole('heading',{name:'Tài khoản của bạn'})).toBeVisible();await expect(page.getByRole('region',{name:'Tiến độ 7 ngày',exact:true}).getByRole('alert',{name:'Lỗi tập luyện'})).toContainText('Dịch vụ nhật ký');await page.goto(stack.url+'/');await expect(page.getByRole('region',{name:'Bản đồ cơ thể tương tác'})).toBeVisible();
});
