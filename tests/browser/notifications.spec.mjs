import {test,expect} from '@playwright/test';import {randomUUID} from 'node:crypto';import {readFile,mkdir} from 'node:fs/promises';
import {startAuthStack} from '../helpers/auth-stack.mjs';
import {ReminderInbox,ReminderWorker} from '../../backend/apps/notification/dist/modules/inbox/reminders.js';
test.use({ignoreHTTPSErrors:true,trace:'off'});let stack;const password='SmartGym notifications browser 123!';
test.beforeAll(async()=>{test.setTimeout(180000);stack=await startAuthStack({notifications:true,workout:true});});test.afterAll(async()=>{test.setTimeout(90000);await stack?.stop();});
const headers=()=>({Origin:stack.url,'X-SmartGym-CSRF':'1'});
async function login(context,page){const email='inbox-'+randomUUID()+'@example.test';expect((await context.request.post(stack.url+'/api/v1/auth/register',{headers:headers(),data:{email,password,displayName:'Người nhận thông báo'}})).status()).toBe(202);
  const token=new URLSearchParams(new URL(await stack.mailLink(email,'verify')).hash.slice(1)).get('token');expect((await context.request.post(stack.url+'/api/v1/auth/verify-email',{headers:headers(),data:{token}})).status()).toBe(204);expect((await context.request.post(stack.url+'/api/v1/auth/login',{headers:headers(),data:{email,password}})).status()).toBe(200);
  const me=await(await context.request.get(stack.url+'/api/v1/me')).json();await page.goto(stack.url+'/app');return {email,id:me.id??me.userId};}
function event(owner){const id=randomUUID();return{id:randomUUID(),type:'workout.occurrence.changed.v1',producer:'workout',schemaVersion:1,occurredAt:new Date().toISOString(),aggregateId:id,aggregateVersion:1,correlationId:randomUUID(),data:{occurrenceId:id,userId:owner,status:'SCHEDULED',startAt:new Date(Date.now()+30*60000).toISOString(),endAt:new Date(Date.now()+90*60000).toISOString(),timeZone:'Asia/Bangkok'}};}
async function seed(owner,count=1){const inbox=new ReminderInbox(stack.notificationDb),worker=new ReminderWorker(stack.notificationDb,{contact:async()=>{throw Error('Not used for in-app fixture');}},{sendReminder:async()=>{throw Error('No email should be enabled');}});const events=[];
  for(let i=0;i<count;i++){const e=event(owner);await inbox.accept(Buffer.from(JSON.stringify(e)));events.push(e);}while(await worker.tick()){}
  return {events,notices:(await stack.notificationDb.query('SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC,id DESC',[owner])).rows};}
const rows=page=>page.getByRole('list',{name:'Danh sách thông báo'}).locator(':scope > li');
test('inbox empty/loading, true badge, pagination, read and owner boundary through real BFF/API',async({context,page,browser})=>{
  const owner=await login(context,page);await page.goto(stack.url+'/app/thong-bao');await expect(page.getByText('Tổng chưa đọc: 0',{exact:false})).toBeVisible();await expect(page.getByText('Chưa có thông báo trong trang này.',{exact:false})).toBeVisible();
  const {notices}=await seed(owner.id,12);await page.getByRole('button',{name:'Làm mới thông báo',exact:true}).click();await expect(rows(page)).toHaveCount(10);await expect(page.getByText('Tổng chưa đọc: 12',{exact:false})).toBeVisible();
  await page.getByRole('link',{name:'Trang tiếp',exact:true}).click();await expect(rows(page)).toHaveCount(2);await page.getByRole('link',{name:'Về trang đầu',exact:true}).click();await expect(rows(page)).toHaveCount(10);
  await rows(page).first().getByRole('button',{name:/Đánh dấu đã đọc:/}).click();await expect(page.getByText('Tổng chưa đọc: 11',{exact:false})).toBeVisible();await expect(rows(page).first().getByText('Đã đọc',{exact:false})).toBeVisible();
  await page.getByRole('link',{name:'Chưa đọc',exact:true}).click();await expect(page.getByText('Tổng chưa đọc: 11',{exact:false})).toBeVisible();await expect(rows(page)).toHaveCount(10);
  await page.goto(stack.url+'/app');await expect(page.getByRole('link',{name:'Thông báo, 11 chưa đọc',exact:true})).toBeVisible();
  const other=await browser.newContext({ignoreHTTPSErrors:true}),otherPage=await other.newPage();try{await login(other,otherPage);expect((await other.request.put(stack.url+'/api/v1/notifications/'+notices[0].id+'/read',{headers:headers()})).status()).toBe(404);expect((await(await other.request.get(stack.url+'/api/v1/notifications')).json()).unreadCount).toBe(0);}finally{await other.close();}
});
test('preferences defaults, validation, stale draft preservation and explicit reload',async({context,page})=>{
  await login(context,page);await page.goto(stack.url+'/app/cai-dat/thong-bao');const app=page.getByLabel('Nhận nhắc trong ứng dụng',{exact:true}),email=page.getByLabel('Nhận nhắc qua email',{exact:true}),lead=page.getByLabel('Báo trước buổi tập (phút)',{exact:true});
  await expect(app).toBeChecked();await expect(email).not.toBeChecked();await expect(lead).toHaveValue('60');await lead.fill('4');await page.getByRole('button',{name:'Lưu tùy chọn',exact:true}).click();expect(await lead.evaluate(e=>e.validity.rangeUnderflow)).toBe(true);
  await lead.fill('15');await app.uncheck();await page.getByRole('button',{name:'Lưu tùy chọn',exact:true}).click();await expect(page.getByText('Đã lưu tùy chọn nhắc lịch.',{exact:true})).toBeVisible();await page.reload();await expect(app).not.toBeChecked();await expect(lead).toHaveValue('15');
  const remote=await context.request.get(stack.url+'/api/v1/notification-preferences');expect((await context.request.put(stack.url+'/api/v1/notification-preferences',{headers:{...headers(),'If-Match':remote.headers().etag},data:{reminderInAppEnabled:true,reminderEmailEnabled:false,leadMinutes:90}})).status()).toBe(200);
  await lead.fill('30');await page.getByRole('button',{name:'Lưu tùy chọn',exact:true}).click();await expect(page.getByRole('alert',{name:'Lỗi thông báo'})).toContainText('Cấu hình đã thay đổi');await expect(lead).toHaveValue('30');
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Tải cấu hình trên server',exact:true}).click();await expect(lead).toHaveValue('90');await expect(app).toBeChecked();
});
test('API opt-out updates pending reminders and leaves reset email usable',async({context,page})=>{
  const owner=await login(context,page),e=event(owner.id);await new ReminderInbox(stack.notificationDb).accept(Buffer.from(JSON.stringify(e)));
  await page.goto(stack.url+'/app/cai-dat/thong-bao');await page.getByLabel('Nhận nhắc trong ứng dụng',{exact:true}).uncheck();await page.getByRole('button',{name:'Lưu tùy chọn',exact:true}).click();await expect(page.getByText('Đã lưu tùy chọn nhắc lịch.',{exact:true})).toBeVisible();
  expect((await stack.notificationDb.query('SELECT status FROM delivery_jobs WHERE source_ref=$1',[e.aggregateId])).rows.every(j=>j.status==='CANCELED')).toBe(true);
  const after=stack.messages.length;expect((await context.request.post(stack.url+'/api/v1/auth/password-reset-requests',{headers:headers(),data:{email:owner.email}})).status()).toBe(202);expect(await stack.mailLink(owner.email,'reset',after)).toContain('/dat-lai-mat-khau#token=');
});
test('BFF checks CSRF/queries/body, no token exposure, expired session preserves preference input',async({context,page})=>{
  await login(context,page);const pref='/api/v1/notification-preferences';const current=await context.request.get(stack.url+pref);const data={reminderInAppEnabled:true,reminderEmailEnabled:false,leadMinutes:20};
  expect((await context.request.put(stack.url+pref,{headers:{Origin:'https://evil.test','X-SmartGym-CSRF':'1','If-Match':current.headers().etag},data})).status()).toBe(403);
  expect((await context.request.get(stack.url+'/api/v1/notifications?unreadOnly=true&unreadOnly=false')).status()).toBe(400);expect((await context.request.put(stack.url+pref,{headers:{...headers(),'If-Match':current.headers().etag},data:{...data,userId:randomUUID()}})).status()).toBe(422);
  expect((await current.text()).includes('accessToken')).toBe(false);await page.goto(stack.url+'/app/cai-dat/thong-bao');await page.getByLabel('Báo trước buổi tập (phút)',{exact:true}).fill('25');
  expect((await context.request.post(stack.url+'/api/v1/auth/logout',{headers:headers(),data:{}})).status()).toBe(204);await page.getByRole('button',{name:'Lưu tùy chọn',exact:true}).click();await expect(page.getByRole('alert',{name:'Lỗi thông báo'})).toContainText('Phiên đã hết hiệu lực');await expect(page.getByLabel('Báo trước buổi tập (phút)',{exact:true})).toHaveValue('25');
});
test('refresh keeps cached items on error and pauses while hidden; unmount removes polling',async({context,page})=>{
  const owner=await login(context,page);await seed(owner.id,1);await page.goto(stack.url+'/app/thong-bao');await expect(rows(page)).toHaveCount(1);
  await page.route('**/api/v1/notifications?*',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'NOTIFICATION_UNAVAILABLE'})}));
  await page.getByRole('button',{name:'Làm mới thông báo',exact:true}).click();await expect(page.getByRole('alert',{name:'Lỗi thông báo'})).toBeVisible();await expect(rows(page)).toHaveCount(1);await page.unroute('**/api/v1/notifications?*');
  let requests=0;page.on('request',r=>{if(new URL(r.url()).pathname==='/api/v1/notifications')requests++;});
  await page.clock.install();await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));});
  await page.clock.runFor(31000);expect(requests).toBe(0);
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});document.dispatchEvent(new Event('visibilitychange'));});await expect.poll(()=>requests).toBe(1);await expect(page.getByRole('alert',{name:'Lỗi thông báo'})).toHaveCount(0);
  await page.goto(stack.url+'/app/cai-dat/thong-bao');await expect(page.getByRole('form',{name:'Tùy chọn nhắc lịch'})).toBeVisible();const before=requests;await page.clock.runFor(31000);expect(requests).toBe(before);
});
test('expired session while marking read clears cached inbox immediately',async({context,page})=>{
  const owner=await login(context,page);await seed(owner.id,1);await page.goto(stack.url+'/app/thong-bao');await expect(rows(page)).toHaveCount(1);
  expect((await context.request.post(stack.url+'/api/v1/auth/logout',{headers:headers(),data:{}})).status()).toBe(204);
  await page.getByRole('button',{name:/Đánh dấu đã đọc:/}).click();await expect(page.getByRole('alert',{name:'Lỗi thông báo'})).toContainText('Phiên đã hết hiệu lực');await expect(rows(page)).toHaveCount(0);await expect(page.getByRole('link',{name:'Đăng nhập lại ở tab mới'})).toBeVisible();
});
test('sent notification retains history and opens the current canceled Workout occurrence',async({context,page})=>{
  const owner=await login(context,page),start=new Date(Date.now()+30*60000).toISOString();
  const plan=await context.request.post(stack.url+'/api/v1/workout-plans',{headers:{...headers(),'Idempotency-Key':randomUUID()},data:{name:'Lịch từ thông báo',exercises:[{exerciseId:'bodyweight_squat',sets:3,targetReps:10}]}});expect(plan.status()).toBe(201);
  const rule=await context.request.post(stack.url+'/api/v1/workout-schedules',{headers:{...headers(),'Idempotency-Key':randomUUID()},data:{planId:(await plan.json()).id,timeZone:'UTC',startDate:start.slice(0,10),startLocalTime:start.slice(11,16),durationMinutes:60,recurrence:'ONCE'}});expect(rule.status()).toBe(201);
  const id=(await rule.json()).id,row=(await stack.workoutDb.query('SELECT * FROM workout_occurrences WHERE schedule_id=$1',[id])).rows[0];
  const e=event(owner.id);e.aggregateId=row.id;e.data={occurrenceId:row.id,userId:owner.id,status:row.status,startAt:row.starts_at.toISOString(),endAt:row.ends_at.toISOString(),timeZone:row.time_zone};
  const inbox=new ReminderInbox(stack.notificationDb);await inbox.accept(Buffer.from(JSON.stringify(e)));await new ReminderWorker(stack.notificationDb,{contact:async()=>{throw Error('No email expected');}},{sendReminder:async()=>{throw Error('No email expected');}}).tick();
  const current=await context.request.get(stack.url+'/api/v1/workout-occurrences/'+row.id);expect((await context.request.post(stack.url+'/api/v1/workout-occurrences/'+row.id+'/cancel',{headers:{...headers(),'If-Match':current.headers().etag},data:{}})).status()).toBe(204);
  await inbox.accept(Buffer.from(JSON.stringify({...e,id:randomUUID(),aggregateVersion:2,data:{...e.data,status:'CANCELED'}})));
  await page.goto(stack.url+'/app/thong-bao');await expect(rows(page)).toHaveCount(1);await rows(page).first().getByRole('link',{name:'Xem buổi tập hiện tại',exact:true}).click();await expect(page.getByText('Đã hủy',{exact:true})).toBeVisible();await expect(page.getByRole('form',{name:'Dời buổi tập'})).toHaveCount(0);
});
test('keyboard, responsive 320–1440/zoom and axe; outage keeps library usable and badge honest',async({context,page})=>{
  const owner=await login(context,page);await seed(owner.id,1);await page.goto(stack.url+'/app/thong-bao');await expect(rows(page)).toHaveCount(1);
  for(const width of [320,640,1024,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);}
  await page.setViewportSize({width:640,height:900});await page.evaluate(()=>document.documentElement.style.zoom='2');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);await page.evaluate(()=>document.documentElement.style.zoom='');
  await page.getByRole('button',{name:/Đánh dấu đã đọc:/}).focus();await page.keyboard.press('Enter');await expect(page.getByText('Tổng chưa đọc: 0',{exact:false})).toBeVisible();
  const axe=await readFile('node_modules/axe-core/axe.min.js','utf8');await page.addScriptTag({content:axe});expect((await page.evaluate(async()=>window.axe.run(document.querySelector('main')))).violations).toEqual([]);
  await mkdir('.local/ui-review',{recursive:true});await page.setViewportSize({width:320,height:900});await page.screenshot({path:'.local/ui-review/notifications-mobile.png',fullPage:true});
  await page.goto(stack.url+'/app/cai-dat/thong-bao');await expect(page.getByRole('form',{name:'Tùy chọn nhắc lịch'})).toBeVisible();await page.addScriptTag({content:axe});expect((await page.evaluate(async()=>window.axe.run(document.querySelector('main')))).violations).toEqual([]);
  await stack.stopNotification();await page.goto(stack.url+'/app/thong-bao');await expect(page.getByRole('alert',{name:'Lỗi thông báo'})).toBeVisible();await page.goto(stack.url+'/app');await expect(page.getByText('Chưa tải được số thông báo.',{exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Thông báo',exact:true})).toBeVisible();await page.goto(stack.url+'/');await expect(page.getByRole('heading',{level:1})).toBeVisible();
});
