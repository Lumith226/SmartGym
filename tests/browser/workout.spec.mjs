import { test,expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { startAuthStack } from '../helpers/auth-stack.mjs';
import { localInstant,addDays,todayIn } from '../../frontend/app/workout/time.ts';
test.use({ignoreHTTPSErrors:true,trace:'off'});
let stack;const password='SmartGym workout browser 123!';
test.beforeAll(async()=>{test.setTimeout(180000);stack=await startAuthStack({workout:true});});
test.afterAll(async()=>{test.setTimeout(90000);await stack?.stop();});
const headers=()=>({Origin:stack.url,'X-SmartGym-CSRF':'1'});
async function login(context,page){
  const email='workout-'+randomUUID()+'@example.test';
  expect((await context.request.post(stack.url+'/api/v1/auth/register',{headers:headers(),data:{email,password,displayName:'Người tập lịch'}})).status()).toBe(202);
  const token=new URLSearchParams(new URL(await stack.mailLink(email,'verify')).hash.slice(1)).get('token');
  expect((await context.request.post(stack.url+'/api/v1/auth/verify-email',{headers:headers(),data:{token}})).status()).toBe(204);
  expect((await context.request.post(stack.url+'/api/v1/auth/login',{headers:headers(),data:{email,password}})).status()).toBe(200);
  await page.goto(stack.url+'/app');return email;
}
const planBody={name:'Chương trình lịch',exercises:[{exerciseId:'bodyweight_squat',sets:3,targetReps:12}]};
async function createPlan(context){const r=await context.request.post(stack.url+'/api/v1/workout-plans',{headers:{...headers(),'Idempotency-Key':randomUUID()},data:planBody});expect(r.status()).toBe(201);return r.json();}
async function createRule(context,plan,change={}){const r=await context.request.post(stack.url+'/api/v1/workout-schedules',{headers:{...headers(),'Idempotency-Key':randomUUID()},data:{planId:plan.id,timeZone:'Asia/Bangkok',startDate:addDays(todayIn('Asia/Bangkok'),1),startLocalTime:'18:00',durationMinutes:60,recurrence:'ONCE',...change}});expect(r.status()).toBe(201);return r.json();}

test('planner creates ordered targets, persists changes, keeps a stale draft and archives',async({page,context})=>{
  await login(context,page);await page.goto(stack.url+'/app/chuong-trinh/moi');
  await page.getByLabel('Tìm bài tập',{exact:true}).fill('squat');await page.getByRole('button',{name:'Tìm bài',exact:true}).click();
  await page.getByRole('button',{name:'Thêm Squat không tạ',exact:true}).click();
  const first=page.getByRole('list',{name:'Bài trong chương trình'}).locator('li').first();await first.getByLabel('Số rep mỗi set').fill('15');
  await page.getByLabel('Tìm bài tập',{exact:true}).fill('push');await page.getByRole('button',{name:'Tìm bài',exact:true}).click();
  const choices=page.getByRole('region',{name:'Chọn bài từ thư viện'}).getByRole('button',{name:/^Thêm /});await choices.first().click();
  const second=page.getByRole('list',{name:'Bài trong chương trình'}).locator('li').nth(1);
  await second.getByLabel('Loại mục tiêu').selectOption('duration');await second.getByLabel('Thời lượng mỗi set (giây)').fill('45');
  await page.getByRole('button',{name:'Đưa bài 2 lên',exact:true}).focus();await page.keyboard.press('Enter');await page.getByLabel('Tên chương trình',{exact:true}).fill('Toàn thân buổi sáng');
  await page.getByRole('button',{name:'Lưu chương trình',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Đã lưu chương trình.'})).toBeVisible();
  const href=await page.getByRole('link',{name:'Mở chương trình đã lưu'}).getAttribute('href');await page.goto(stack.url+href);
  await expect(page.getByLabel('Tên chương trình',{exact:true})).toHaveValue('Toàn thân buổi sáng');
  const rows=page.getByRole('list',{name:'Bài trong chương trình'}).locator('li');await expect(rows.nth(0).getByLabel('Thời lượng mỗi set (giây)')).toHaveValue('45');await expect(rows.nth(1).getByLabel('Số rep mỗi set')).toHaveValue('15');
  const id=href.split('/').at(-1);const current=await context.request.get(stack.url+'/api/v1/workout-plans/'+id);const data=await current.json();
  expect((await context.request.put(stack.url+'/api/v1/workout-plans/'+id,{headers:{...headers(),'If-Match':current.headers().etag},data:{name:'Tên ở tab khác',exercises:data.exercises.map(({exerciseNameVi,...x})=>x)}})).status()).toBe(200);
  await page.getByLabel('Tên chương trình',{exact:true}).fill('Bản nháp đang giữ');await page.getByRole('button',{name:'Lưu chương trình',exact:true}).click();
  await expect(page.getByRole('alert',{name:'Lỗi tập luyện'})).toContainText('Dữ liệu đã thay đổi');await expect(page.getByLabel('Tên chương trình',{exact:true})).toHaveValue('Bản nháp đang giữ');
  await page.getByRole('button',{name:'Tải phiên bản mới',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Quay lại'}).click();
  await expect(page.getByRole('button',{name:'Tải phiên bản mới',exact:true})).toBeFocused();
  await page.getByRole('button',{name:'Tải phiên bản mới',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Xác nhận'}).click();
  await expect(page.getByLabel('Tên chương trình',{exact:true})).toHaveValue('Tên ở tab khác');
  await page.getByRole('button',{name:'Lưu trữ chương trình',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Xác nhận'}).click();await expect(page.getByRole('status')).toContainText('Đã lưu trữ');
  await page.goto(stack.url+'/app/chuong-trinh?status=ARCHIVED');await expect(page.getByRole('list',{name:'Danh sách chương trình'})).toContainText('Tên ở tab khác');
});

test('weekly planner explains overlaps, retains input, converts zones and moves or cancels a session',async({page,context})=>{
  await login(context,page);const plan=await createPlan(context),date=addDays(todayIn('Asia/Bangkok'),1);
  await page.goto(stack.url+'/app/lich?'+new URLSearchParams({date,zone:'Asia/Bangkok',planId:plan.id}));
  const form=page.getByRole('form',{name:'Quy tắc lịch tập'});
  await form.getByLabel('Kiểu lịch').selectOption('WEEKLY');
  for(const day of ['Thứ hai','Thứ ba','Thứ tư','Thứ năm','Thứ sáu','Thứ bảy','Chủ nhật'])await form.getByLabel(day,{exact:true}).check();
  await form.getByRole('button',{name:'Tạo lịch',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Đã tạo lịch.'})).toBeVisible();
  await expect(page.getByRole('list',{name:'Danh sách buổi tập'}).locator(':scope > li')).toHaveCount(7);
  await form.getByLabel('Thời lượng buổi (phút)').fill('30');await form.getByRole('button',{name:'Tạo lịch',exact:true}).click();
  await expect(page.getByRole('alert',{name:'Lỗi tập luyện'})).toContainText('chồng với một buổi');await expect(form.getByLabel('Thời lượng buổi (phút)')).toHaveValue('30');
  // Resolve conflict while keeping the failed form, then navigate after saving.
  await form.getByLabel('Giờ bắt đầu địa phương').fill('20:00');await form.getByRole('button',{name:'Tạo lịch',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Đã tạo lịch.'})).toBeVisible();
  await page.getByLabel('Múi giờ hiển thị',{exact:true}).fill('UTC');await page.getByRole('button',{name:'Xem lịch',exact:true}).click();
  const agenda=page.getByRole('list',{name:'Danh sách buổi tập'});await expect(agenda).toContainText('11:00');await expect(agenda).toContainText('UTC');
  await agenda.getByRole('link').first().click();const detail=page.getByRole('form',{name:'Dời buổi tập'});await detail.getByLabel('Ngày giờ mới').fill(date+'T19:15');
  await detail.getByRole('button',{name:'Lưu giờ mới'}).click();await expect(page.getByRole('alert',{name:'Lỗi tập luyện'})).toContainText('chồng với một buổi');await expect(detail.getByLabel('Ngày giờ mới')).toHaveValue(date+'T19:15');
  await detail.getByLabel('Ngày giờ mới').fill(date+'T19:00');await detail.getByRole('button',{name:'Lưu giờ mới'}).click();await expect(page.getByRole('status').filter({hasText:'Đã dời buổi tập.'})).toBeVisible();
  await page.getByRole('button',{name:'Hủy buổi này',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Xác nhận'}).click();
  await expect(page.getByRole('status').filter({hasText:'Đã hủy buổi tập.'})).toBeVisible();await expect(page.getByRole('form',{name:'Dời buổi tập'})).toHaveCount(0);
});

test('rule edits retain a stale draft and whole cancellation prevents plan archival until resolved',async({page,context})=>{
  await login(context,page);const plan=await createPlan(context),rule=await createRule(context,plan);
  await page.goto(stack.url+'/app/lich?scheduleId='+rule.id);const form=page.getByRole('form',{name:'Quy tắc lịch tập'});
  await form.getByLabel('Giờ bắt đầu địa phương').fill('19:00');await form.getByRole('button',{name:'Lưu quy tắc',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Đã cập nhật lịch.'})).toBeVisible();
  await form.getByLabel('Thời lượng buổi (phút)').fill('45');await form.getByRole('button',{name:'Lưu quy tắc',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Đã cập nhật lịch.'})).toBeVisible();
  const current=await context.request.get(stack.url+'/api/v1/workout-schedules/'+rule.id);const data=await current.json();
  const {id,status,version,projectionConflicts,...input}=data;
  expect((await context.request.put(stack.url+'/api/v1/workout-schedules/'+id,{headers:{...headers(),'If-Match':current.headers().etag},data:{...input,startLocalTime:'21:00'}})).status()).toBe(200);
  await form.getByLabel('Giờ bắt đầu địa phương').fill('20:00');await form.getByRole('button',{name:'Lưu quy tắc',exact:true}).click();await expect(page.getByRole('alert',{name:'Lỗi tập luyện'})).toContainText('Dữ liệu đã thay đổi');await expect(form.getByLabel('Giờ bắt đầu địa phương')).toHaveValue('20:00');
  page.once('dialog',dialog=>dialog.accept());await page.goto(stack.url+'/app/chuong-trinh/'+plan.id);await expect(page.getByLabel('Tên chương trình')).toHaveValue(plan.name);
  await page.getByRole('button',{name:'Lưu trữ chương trình',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Xác nhận'}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('còn lịch đang hoạt động');
  await page.getByRole('dialog').getByRole('button',{name:'Quay lại'}).click();await page.goto(stack.url+'/app/lich');
  await page.getByRole('button',{name:'Hủy cả lịch',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Xác nhận'}).click();await expect(page.getByText('Chưa có lịch đang hoạt động.',{exact:true})).toBeVisible();
  await page.goto(stack.url+'/app/chuong-trinh/'+plan.id);await expect(page.getByLabel('Tên chương trình')).toHaveValue(plan.name);await page.getByRole('button',{name:'Lưu trữ chương trình',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Xác nhận'}).click();await expect(page.getByRole('status')).toContainText('Đã lưu trữ');
});

test('Workout BFF enforces CSRF, ownership, no-store, preconditions and session revocation',async({page,context,browser})=>{
  await login(context,page);const plan=await createPlan(context),rule=await createRule(context,plan);const base=stack.url+'/api/v1/workout-';
  const occurrence=(await (await context.request.get(base+'occurrences?'+new URLSearchParams({from:localInstant(rule.startDate+'T00:00',rule.timeZone).toString(),to:localInstant(addDays(rule.startDate,1)+'T00:00',rule.timeZone).toString()}))).json()).items[0];
  for(const [path,method,data] of [['plans/'+plan.id,'PUT',planBody],['schedules/'+rule.id,'PUT',rule],['occurrences/'+occurrence.id+'/cancel','POST',undefined]]){
    const result=await context.request.fetch(base+path,{method,data,headers:{Origin:'https://evil.test','X-SmartGym-CSRF':'1'}});expect(result.status()).toBe(403);
  }
  expect((await context.request.delete(base+'plans/'+plan.id,{headers:headers()})).status()).toBe(428);
  expect((await context.request.get(base+'occurrences')).status()).toBe(400);
  expect((await context.request.get(base+'plans?limit=1&limit=2')).status()).toBe(400);
  expect((await context.request.get(base+'plans?target=https://evil.test')).status()).toBe(400);
  expect((await context.request.post(base+'plans',{headers:{...headers(),'Idempotency-Key':randomUUID()},data:{...planBody,ownerUserId:randomUUID()}})).status()).toBe(422);
  const stranger=await browser.newContext({ignoreHTTPSErrors:true});try{
    const page2=await stranger.newPage();await login(stranger,page2);
    for(const path of ['plans/'+plan.id,'schedules/'+rule.id,'occurrences/'+occurrence.id])expect((await stranger.request.get(base+path)).status()).toBe(404);
  }finally{await stranger.close();}
  const response=await context.request.get(base+'plans/'+plan.id);expect(response.headers()['cache-control']).toBe('no-store');expect(response.headers()['set-cookie']).toBeUndefined();expect(JSON.stringify(await response.json())).not.toMatch(/accessToken|eyJ/);
  await page.goto(stack.url+'/app/chuong-trinh/'+plan.id);await expect(page.getByLabel('Tên chương trình')).toHaveValue(plan.name);
  await context.request.post(stack.url+'/api/v1/auth/logout',{headers:headers(),data:{}});
  await page.getByLabel('Tên chương trình').fill('Bản nháp sau hết phiên');await page.getByRole('button',{name:'Lưu chương trình',exact:true}).click();await expect(page.getByRole('alert',{name:'Lỗi tập luyện'})).toContainText('Phiên đã hết hiệu lực');await expect(page.getByLabel('Tên chương trình')).toHaveValue('Bản nháp sau hết phiên');
});

test('mobile, week layout, projection conflict, accessibility and Workout fault isolation',async({page,context})=>{
  await login(context,page);const plan=await createPlan(context),rule=await createRule(context,plan);const date=rule.startDate;
  await stack.workoutDb.query("INSERT INTO schedule_conflicts(schedule_id,occurrence_key,local_date,starts_at,ends_at,code) VALUES($1,$2,$3,$4,$5,'SCHEDULE_OVERLAP')",[rule.id,date+'T20:00',date,localInstant(date+'T20:00',rule.timeZone).toString(),localInstant(date+'T21:00',rule.timeZone).toString()]);
  await page.setViewportSize({width:320,height:740});await page.goto(stack.url+'/app/lich?'+new URLSearchParams({date,zone:rule.timeZone,view:'week'}));await expect(page.getByText('Buổi chưa tạo vì chồng lịch',{exact:true})).toBeVisible();
  for(const width of [320,640,1024,1440]){await page.setViewportSize({width,height:800});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);}
  await page.setViewportSize({width:640,height:800});await page.evaluate(()=>document.documentElement.style.zoom='2');expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);await page.evaluate(()=>document.documentElement.style.zoom='');await page.setViewportSize({width:320,height:740});
  await page.addScriptTag({content:await readFile('node_modules/axe-core/axe.min.js','utf8')});const results=await page.evaluate(async()=>window.axe.run(document.querySelector('main'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}));expect(results.violations).toEqual([]);
  await page.screenshot({path:'.local/browser-results/workout-calendar-mobile.png',fullPage:true});
  await stack.stopWorkout();await page.goto(stack.url+'/app/chuong-trinh');await expect(page.getByRole('alert',{name:'Lỗi tập luyện'})).toContainText('Dịch vụ tập luyện đang gián đoạn');
  await page.goto(stack.url+'/');await expect(page.getByRole('heading',{name:'Tìm bài tập phù hợp với bạn'})).toBeVisible();
});
