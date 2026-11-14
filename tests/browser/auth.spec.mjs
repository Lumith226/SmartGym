import { createHash, randomUUID } from 'node:crypto';
import {test,expect} from '@playwright/test';
import {startAuthStack} from '../helpers/auth-stack.mjs';
test.use({ignoreHTTPSErrors:true,trace:'off'});
let stack;const password='SmartGym browser password 123!';
test.beforeAll(async()=>{test.setTimeout(180000);stack=await startAuthStack();});
test.afterAll(async()=>{test.setTimeout(90000);await stack?.stop();});
const headers=()=>({Origin:stack.url,'X-SmartGym-CSRF':'1'});
async function setupUser(context,email){
  const created=await context.request.post(stack.url+'/api/v1/auth/register',{headers:headers(),data:{email,password,displayName:'Người tập'}});expect(created.status()).toBe(202);
  const link=await stack.mailLink(email,'verify'),token=new URLSearchParams(new URL(link).hash.slice(1)).get('token');
  expect((await context.request.post(stack.url+'/api/v1/auth/verify-email',{headers:headers(),data:{token}})).status()).toBe(204);
}
async function login(page,email,next='',loginPassword=password){
  await page.goto(stack.url+'/dang-nhap'+next);await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Mật khẩu',{exact:true}).fill(loginPassword);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
}
test('signup, explicit verification, secure session, profile update and logout',async({page,context})=>{
  const email='browser-signup@example.test',shortPassword='GymDemo8';await page.goto(stack.url+'/dang-ky');
  await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Mật khẩu',{exact:true}).fill(shortPassword);await page.getByLabel('Họ và tên').fill('Người tập mới');
  await page.getByRole('button',{name:'Tạo tài khoản',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Nếu địa chỉ hợp lệ'})).toBeVisible();
  await login(page,email,'',shortPassword);await expect(page.getByRole('button',{name:'Tiếp tục với Google'})).toBeDisabled();await expect(page.getByRole('alert',{name:'Lỗi biểu mẫu'})).toContainText('Email chưa được xác minh');expect((await context.cookies()).find(c=>c.name==='__Host-sg_session')).toBeUndefined();
  const link=await stack.mailLink(email,'verify');await page.goto(link);await expect.poll(()=>new URL(page.url()).hash).toBe('');
  expect((await stack.identityDb.query('SELECT status FROM users WHERE email_normalized=$1',[email])).rows[0].status).toBe('PENDING');
  await page.getByRole('button',{name:'Xác nhận địa chỉ email'}).click();await expect(page.getByRole('status').filter({hasText:'Email đã được xác minh'})).toBeVisible();
  expect((await context.cookies()).find(c=>c.name==='__Host-sg_session')).toBeUndefined();
  await page.getByRole('link',{name:'Đăng nhập để tiếp tục'}).click();
  await expect(page).toHaveURL(stack.url+'/dang-nhap');
  await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Mật khẩu',{exact:true}).fill(shortPassword);
  const loginResponse=page.waitForResponse(response=>response.url()===stack.url+'/api/v1/auth/login'&&response.request().method()==='POST',{timeout:10000});
  await page.getByLabel('Mật khẩu',{exact:true}).press('Enter');expect((await loginResponse).status()).toBe(200);
  await expect(page).toHaveURL(stack.url+'/app');await expect(page.getByRole('heading',{name:'Tài khoản của bạn'})).toBeVisible();
  const cookie=(await context.cookies()).find(c=>c.name==='__Host-sg_session');expect(cookie).toMatchObject({secure:true,httpOnly:true,sameSite:'Lax',path:'/'});
  expect(await page.evaluate(()=>document.cookie)).not.toContain('__Host-sg_session');
  const response=await context.request.get(stack.url+'/api/v1/me');expect(response.status()).toBe(200);expect(response.headers()['cache-control']).toBe('no-store');expect(JSON.stringify(await response.json())).not.toContain('accessToken');
  const document=await page.reload();expect(document.headers()['cache-control']).toContain('no-store');expect(await document.text()).not.toContain('accessToken');
  await page.setViewportSize({width:320,height:740});
  const accountMenu = page.getByRole('button', { name: 'Tài khoản và cài đặt' });
  await accountMenu.click();
  await expect(page.getByRole('menuitem', { name: 'Tài khoản của tôi' })).toHaveAttribute('href', '/app');
  await expect(page.getByRole('menuitem', { name: 'Cài đặt thông báo' })).toHaveAttribute('href', '/app/cai-dat/thong-bao');
  await accountMenu.click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(320);
  await page.getByRole('link',{name:'Quản lý hồ sơ',exact:true}).click();
  await expect(page).toHaveURL(stack.url+'/app/ho-so');
  await expect(page.getByText('Email đã xác minh',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(320);
  await page.getByLabel('Tên hiển thị').fill('Người tập đã cập nhật');await page.getByLabel('Múi giờ',{exact:true}).fill('Asia/Ho_Chi_Minh');
  await page.getByRole('button',{name:'Lưu hồ sơ'}).click();await expect(page.getByRole('status').filter({hasText:'Đã lưu hồ sơ'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Người tập đã cập nhật'})).toBeVisible();
  await page.reload();await expect(page.getByLabel('Tên hiển thị')).toHaveValue('Người tập đã cập nhật');
  await expect(page.getByLabel('Múi giờ',{exact:true})).toHaveValue('Asia/Ho_Chi_Minh');
  expect(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length}))).toEqual({local:0,session:0});
  await expect(page.getByRole('button',{name:'Lưu hồ sơ'})).toBeEnabled();
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  await page.screenshot({path:'.local/browser-results/auth-profile.png',fullPage:true});
  await page.getByRole('button',{name:'Đăng xuất',exact:true}).click();await expect(page).toHaveURL(stack.url+'/dang-nhap');expect((await context.cookies()).find(c=>c.name==='__Host-sg_session')).toBeUndefined();
  await page.goto(stack.url+'/app/ho-so');await expect(page).toHaveURL(/\/dang-nhap\?next=/);
});
test('reset link updates password and revokes an existing browser session',async({page,context,browser})=>{
  const email='browser-reset@example.test';await setupUser(context,email);await login(page,email);await expect(page).toHaveURL(stack.url+'/app');
  const second=await browser.newContext({ignoreHTTPSErrors:true});try{
    const resetPage=await second.newPage();await resetPage.goto(stack.url+'/quen-mat-khau');await resetPage.getByLabel('Email',{exact:true}).fill(email);await resetPage.getByRole('button',{name:'Gửi liên kết đặt lại'}).click();await expect(resetPage.getByRole('status').filter({hasText:'Nếu địa chỉ hợp lệ'})).toBeVisible();
    await resetPage.goto(await stack.mailLink(email,'reset'));await expect.poll(()=>new URL(resetPage.url()).hash).toBe('');
    await resetPage.getByLabel('Mật khẩu mới',{exact:true}).fill('New SmartGym password 456!');await resetPage.getByLabel('Nhập lại mật khẩu mới').fill('Does not match password');await resetPage.getByRole('button',{name:'Đặt lại mật khẩu',exact:true}).click();await expect(resetPage.getByRole('alert',{name:'Lỗi biểu mẫu'})).toContainText('chưa khớp');
    await resetPage.getByLabel('Nhập lại mật khẩu mới').fill('New SmartGym password 456!');await resetPage.getByRole('button',{name:'Đặt lại mật khẩu',exact:true}).click();await expect(resetPage.getByRole('status').filter({hasText:'Các phiên cũ đã kết thúc'})).toBeVisible();
    expect((await second.cookies()).find(c=>c.name==='__Host-sg_session')).toBeUndefined();await page.goto(stack.url+'/app');await expect(page).toHaveURL(/\/dang-nhap/);
    await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Mật khẩu',{exact:true}).fill('New SmartGym password 456!');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await expect(page).toHaveURL(stack.url+'/app');
  }finally{await second.close();}
});
test('resend invalidates old action and token is not consumed by opening the page',async({page,context})=>{
  const email='browser-resend@example.test';expect((await context.request.post(stack.url+'/api/v1/auth/register',{headers:headers(),data:{email,password,displayName:'Người tập'}})).status()).toBe(202);
  const old=await stack.mailLink(email,'verify'),after=stack.messages.length;
  const verifyPage=await page.goto(stack.url+'/xac-minh-email');
  expect(verifyPage.headers()['referrer-policy']).toBe('no-referrer');expect(verifyPage.headers()['x-robots-tag']).toContain('noindex');
  await expect(page.getByText('Chưa có liên kết hợp lệ.',{exact:false})).toBeVisible();await page.getByLabel('Email',{exact:true}).fill(email);await page.getByRole('button',{name:'Gửi lại email xác minh'}).click();await expect(page.getByRole('status').filter({hasText:'Nếu địa chỉ hợp lệ'})).toBeVisible();
  const fresh=await stack.mailLink(email,'verify',after);await page.goto(old);await page.getByRole('button',{name:'Xác nhận địa chỉ email'}).click();await expect(page.getByRole('alert',{name:'Lỗi biểu mẫu'})).toContainText('Liên kết đã hết hạn');
  await page.goto(fresh);await page.getByRole('button',{name:'Xác nhận địa chỉ email'}).click();await expect(page.getByRole('status').filter({hasText:'Email đã được xác minh'})).toBeVisible();
  await page.goto(fresh);await expect.poll(()=>new URL(page.url()).hash).toBe('');
  await page.getByRole('button',{name:'Xác nhận địa chỉ email'}).click();await expect(page.getByRole('alert',{name:'Lỗi biểu mẫu'})).toContainText('Liên kết đã hết hạn');
});
test('CSRF, spoofed identity/IP and admin gate are enforced by servers',async({page,context})=>{
  const email='browser-security@example.test';await setupUser(context,email);await login(page,email);await expect(page).toHaveURL(stack.url+'/app');
  expect((await context.request.post(stack.url+'/api/v1/auth/logout',{data:{}})).status()).toBe(403);
  expect((await context.request.post(stack.url+'/api/v1/auth/logout',{headers:{...headers(),Origin:'https://evil.test'},data:{}})).status()).toBe(403);
  expect((await context.request.patch(stack.url+'/api/v1/me',{headers:headers(),data:{roles:['ADMIN']}})).status()).toBe(422);
  expect((await context.request.get(stack.url+'/admin',{headers:{'x-user-role':'ADMIN'}})).status()).toBe(403);
  const user=(await stack.identityDb.query('SELECT id FROM users WHERE email_normalized=$1',[email])).rows[0];await stack.identity.setRole(user.id,'ADMIN',null);
  await page.goto(stack.url+'/admin');await expect(page).toHaveURL(/\/dang-nhap/);await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Mật khẩu',{exact:true}).fill(password);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await expect(page).toHaveURL(stack.url+'/admin');await expect(page.getByRole('heading',{name:'Quản trị nội dung'})).toBeVisible();
  expect((await context.request.post(stack.url+'/internal/v1/identity/sessions/introspect',{headers:headers(),data:{sessionHandle:'a'.repeat(43)}})).status()).toBe(404);
  const spoofed=await context.request.post(stack.url+'/api/v1/auth/login',{headers:{...headers(),'X-SmartGym-Client-IP':'203.0.113.77','X-Forwarded-For':'203.0.113.88'},data:{email,password}});expect(spoofed.status()).toBe(200);
  expect((await stack.identityDb.query('SELECT hits FROM identity_rate_limits WHERE bucket_hash=$1',[stack.keys.bucket('ip:login:203.0.113.77')])).rows.length).toBe(0);
});
test('safe return URL, mobile layout and accessible form errors',async({page,context})=>{
  const email='browser-return@example.test';await setupUser(context,email);await page.setViewportSize({width:320,height:740});
  await login(page,email,'?next=https%3A%2F%2Fevil.test');await expect(page).toHaveURL(stack.url+'/app');await page.getByRole('button',{name:'Đăng xuất',exact:true}).click();await expect(page).toHaveURL(stack.url+'/dang-nhap');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)).toBe(false);
  await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Mật khẩu',{exact:true}).fill('wrong password');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await expect(page.getByRole('alert',{name:'Lỗi biểu mẫu'})).toContainText('Email hoặc mật khẩu chưa đúng');
  await page.getByLabel('Email',{exact:true}).focus();await page.keyboard.press('Tab');await expect(page.getByLabel('Mật khẩu',{exact:true})).toBeFocused();
  await page.screenshot({path:'.local/browser-results/auth-login-mobile.png',fullPage:true});
});
test('admin CMS saves, previews, publishes and removes an exercise with an audit trail', async ({ page, context }) => {
  const email = 'cms-admin@example.test';
  const api = stack.url + '/api/v1/admin/exercises';
  expect((await context.request.get(api)).status()).toBe(401);
  await setupUser(context, email);
  await login(page, email);
  await expect(page).toHaveURL(stack.url + '/app');
  expect((await context.request.get(api, { headers: { 'x-user-role': 'ADMIN' } })).status()).toBe(403);
  const actor = (await stack.identityDb.query('SELECT id FROM users WHERE email_normalized=$1', [email])).rows[0].id;
  await stack.identity.setRole(actor, 'ADMIN', null);
  expect((await context.request.get(api)).status()).toBe(401);
  await login(page, email, '?next=/admin');
  await expect(page.getByRole('heading', { name: 'Tổng quan nội dung' })).toBeVisible();
  expect((await context.request.post(api, { data: {} })).status()).toBe(403);
  expect((await context.request.post(api, { headers: { ...headers(), Origin: 'https://other.test' }, data: {} })).status()).toBe(403);
  expect((await context.request.get(api + '?limit=1&limit=2')).status()).toBe(400);
  expect((await context.request.get(api + '/unknown-action/restore')).status()).toBe(404);

  const cmsNav = page.getByRole('navigation', { name: 'Điều hướng CMS', exact: true });
  await expect(cmsNav.getByRole('link', { name: 'Biến thể', exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 620 });
  await cmsNav.getByRole('link', { name: 'Nhóm cơ', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nhóm cơ', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(620);
  await page.mouse.move(850, 460);
  await page.mouse.wheel(0, 550);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await expect.poll(() => page.locator('.cms-shell header.sticky').evaluate(header => Math.round(header.getBoundingClientRect().top))).toBe(0);
  await page.goto(stack.url + '/admin/noi-dung/exercise-variant');
  await expect(page).toHaveURL(stack.url + '/admin/bai-tap');
  await page.goto(stack.url + '/admin/bai-tap?status=PUBLISHED&sort=name_asc');
  const pages = page.getByRole('navigation', { name: 'Phân trang bài tập' });
  await pages.getByRole('link', { name: 'Trang 2', exact: true }).click();
  await expect(page).toHaveURL(/status=PUBLISHED&sort=name_asc&page=2$/);
  await expect(pages.locator('[aria-current="page"]')).toHaveText('2');
  await expect(page.getByText(/^21–\d+ \/ \d+ bài tập$/)).toBeVisible();
  await page.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await expect(pages.locator('[aria-current="page"]')).toHaveText('1');
  await cmsNav.getByRole('link', { name: 'Thêm bài tập', exact: true }).click();
  await expect(page).toHaveURL(stack.url + '/admin/bai-tap/moi');
  await expect(page.getByRole('heading', { name: 'Thêm bài tập' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Cài đặt bài tập' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gắn ảnh hoặc video' })).toBeVisible();
  await expect(page.locator('[name="exerciseId"], [name="variantIds"]')).toHaveCount(0);
  const basic = page.getByRole('region', { name: 'Thông tin cơ bản' });
  const settings = page.getByRole('region', { name: 'Cài đặt bài tập' });
  await page.setViewportSize({ width: 1440, height: 900 });
  expect((await settings.boundingBox()).x).toBeGreaterThan((await basic.boundingBox()).x);
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await settings.boundingBox()).y).toBeGreaterThan((await basic.boundingBox()).y);
  await page.mouse.move(190, 450);
  await page.mouse.wheel(0, 500);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByLabel('Tên tiếng Việt').fill('Động tác thử trình duyệt');
  await page.getByText('Đường dẫn bài tập', { exact: true }).click();
  await expect(page.getByLabel('Đường dẫn (slug)')).toHaveValue('dong-tac-thu-trinh-duyet');
  await page.getByLabel('Đường dẫn (slug)').fill('cms-browser');
  await page.getByLabel('Tóm tắt', { exact: true }).fill('Bản hướng dẫn đầu tiên.');
  await page.getByRole('group', { name: 'Nhóm cơ chính' }).getByRole('checkbox').first().check();
  await page.getByLabel('Các bước hướng dẫn', { exact: false }).fill('Đứng vững.\nHạ người chậm.');
  await page.getByLabel('Lưu ý kỹ thuật (mỗi mục một dòng)').fill('Giữ lưng trung lập.');
  const english = page.getByRole('region', { name: 'Nội dung tiếng Anh' });
  await expect(english).toBeVisible();
  await expect(page.locator('[name^="profile-de-"], [name^="profile-es-"]')).toHaveCount(0);
  await expect(page.getByText('Vai trò ảnh minh họa')).toHaveCount(0);
  await expect(page.getByText('Chọn từ kho Media')).toHaveCount(0);
  await expect(page.getByLabel('Cơ chế chuyển động')).toBeHidden();
  await expect(page.getByLabel('MET', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Kiểu hình minh họa')).toHaveCount(0);
  await page.getByText('Thông tin kỹ thuật', { exact: false }).click();
  await page.getByLabel('Cơ chế chuyển động').selectOption('compound');
  await expect(page.locator('[name="profile-primaryMuscles"], [name="profile-secondaryMuscles"]')).toHaveCount(0);
  await english.getByLabel('Mô tả (Tiếng Anh)').fill('Bodyweight squat.');
  await page.getByRole('button', { name: 'Tạo bản nháp' }).click();
  await expect(page).toHaveURL(/\/admin\/bai-tap\/exercise_[a-f0-9]{32}/);
  const exerciseId = new URL(page.url()).pathname.split('/').at(-1);
  const savedPath = api + '/' + exerciseId;
  await expect(english.getByLabel('Mô tả (Tiếng Anh)')).toHaveValue('Bodyweight squat.');
  await page.getByRole('button', { name: 'Công bố bài tập' }).click();
  await expect(page.getByLabel('Loại hình tập luyện')).toBeFocused();
  await expect(page.locator('#exercise-error-difficulty')).toContainText('Chọn độ khó');
  await page.getByLabel('Loại hình tập luyện').selectOption('STRENGTH');
  await page.getByLabel('Trọng tâm').selectOption('LOWER_BODY');
  await page.getByLabel('Độ khó (1–5)').selectOption('2');
  await page.getByRole('button', { name: 'Lưu bản nháp' }).click();
  await expect(page.locator('main p[role=status]').filter({ hasText: 'Đã lưu bản nháp.' })).toBeVisible();
  const created = await context.request.get(savedPath);
  const savedDraft = await created.json();
  expect(savedDraft.profile).toEqual({ mechanic: 'compound',
    tips: ['Giữ lưng trung lập.'], translations: { en: { description: 'Bodyweight squat.' } } });
  expect(savedDraft).not.toHaveProperty('levelSets');
  expect(savedDraft).not.toHaveProperty('restSeconds');
  expect((await context.request.patch(savedPath, {
    headers: { ...headers(), 'If-Match': created.headers().etag },
    data: { mediaIds: ['chua_duyet'], poseStyle: 'squat', profile: {
      ...savedDraft.profile, category: 'strength', bodyPart: 'upper_legs', isBodyweight: true, met: 4.5,
      goals: ['strength'], tags: ['squat'], variationGroup: 'squat',
      primaryMuscles: ['quadriceps'], secondaryMuscles: ['gluteus_maximus'],
    } },
  })).status()).toBe(200);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Công bố bài tập' })).toBeEnabled();
  await expect(page.getByText('Media cần được duyệt', { exact: false })).toBeVisible();
  expect((await context.request.get(stack.url + '/bai-tap/cms-browser')).status()).toBe(404);
  const saved = await context.request.get(savedPath);
  expect(saved.headers()['cache-control']).toBe('no-store');
  expect(await saved.text()).not.toContain('accessToken');
  const blocked = await context.request.post(savedPath + '/publish', {
    headers: { ...headers(), 'If-Match': saved.headers().etag, 'Idempotency-Key': crypto.randomUUID() },
  });
  expect(blocked.status()).toBe(422);
  expect((await blocked.json()).code).toBe('MEDIA_NOT_APPROVED');

  await page.getByRole('link', { name: 'Xem trước bản nháp' }).click();
  await expect(page.getByText('Hạ người chậm.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Về trình soạn thảo bài tập' }).click();
  await expect(page).toHaveURL(stack.url + '/admin/bai-tap/' + exerciseId);
  await page.getByRole('button', { name: 'Công bố bài tập' }).click();
  await page.getByRole('button', { name: 'Xác nhận công bố', exact: true }).click();
  await expect(page.locator('#exercise-error-mediaIds')).toContainText('Kiểm tra quyền sử dụng');
  await page.getByRole('button', { name: 'Gỡ chua_duyet', exact: true }).click();
  await page.getByText('Thông tin kỹ thuật', { exact: false }).click();
  await page.getByLabel('Thực hiện từng bên').selectOption('false');
  await page.getByRole('button', { name: 'Lưu bản nháp' }).click();
  await expect(page.locator('main p[role=status]').filter({ hasText: 'Đã lưu bản nháp.' })).toBeVisible();
  expect(await (await context.request.get(savedPath)).json()).toMatchObject({
    poseStyle: 'squat', profile: {
      category: 'strength', bodyPart: 'upper_legs', isBodyweight: true, isUnilateral: false, met: 4.5,
      goals: ['strength'], tags: ['squat'], variationGroup: 'squat',
      primaryMuscles: ['quadriceps'], secondaryMuscles: ['gluteus_maximus'],
    },
  });
  await page.getByRole('button', { name: 'Công bố bài tập' }).click();
  await expect(page.getByRole('button', { name: 'Hủy', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Xác nhận công bố', exact: true }).click();
  await expect(page.locator('main p[role=status]').filter({ hasText: 'Bài tập đã được công bố.' })).toBeVisible();
  const published = await context.request.get(stack.url + '/bai-tap/cms-browser');
  expect(published.status()).toBe(200);
  const publishedHtml = await published.text();
  expect(publishedHtml).toContain('Bản hướng dẫn đầu tiên.');
  expect(publishedHtml).toContain('Giữ lưng trung lập.');

  await page.getByRole('textbox', { name: 'Tóm tắt', exact: true }).fill('Bản hướng dẫn thứ hai.');
  await page.getByText('Đường dẫn bài tập', { exact: true }).click();
  await page.getByLabel('Đường dẫn (slug)').fill('cms-browser-renamed');
  await page.getByRole('button', { name: 'Lưu bản nháp' }).click();
  await expect(page.getByText('Thư viện đang hiển thị bản đã công bố', { exact: false })).toBeVisible();
  expect(await (await context.request.get(stack.url + '/bai-tap/cms-browser')).text()).toContain('Bản hướng dẫn đầu tiên.');
  expect((await context.request.get(stack.url + '/bai-tap/cms-browser-renamed')).status()).toBe(404);
  await page.getByRole('button', { name: 'Công bố bài tập' }).click();
  await page.getByRole('button', { name: 'Xác nhận công bố', exact: true }).click();
  await expect(page.locator('main p[role=status]').filter({ hasText: 'Bài tập đã được công bố.' })).toBeVisible();
  const alias = await context.request.get(stack.url + '/bai-tap/cms-browser', { maxRedirects: 0 });
  expect(alias.status()).toBe(308);
  expect(alias.headers().location).toBe('/bai-tap/cms-browser-renamed');
  expect(await (await context.request.get(stack.url + '/bai-tap/cms-browser')).text()).toContain('Bản hướng dẫn thứ hai.');
  const sitemap = await context.request.get(stack.url + '/sitemap.xml');
  const xml = await sitemap.text();
  expect(xml).toContain(`/bai-tap/cms-browser-renamed</loc>`);
  expect(xml).not.toContain(`/bai-tap/cms-browser</loc>`);
  await page.getByRole('button', { name: 'Gỡ công bố', exact: true }).click();
  await page.getByLabel('Lý do gỡ công bố').fill('Cần rà soát nội dung.');
  await page.getByRole('button', { name: 'Xác nhận gỡ', exact: true }).click();
  await expect(page.locator('main p[role=status]').filter({ hasText: 'Bài tập đã được gỡ khỏi thư viện.' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Nhật ký quản trị' }).getByText('Cần rà soát nội dung.')).toBeVisible();
  expect((await context.request.get(stack.url + '/bai-tap/cms-browser')).status()).toBe(404);
  expect((await context.request.get(stack.url + '/bai-tap/cms-browser-renamed')).status()).toBe(404);
  expect(await (await context.request.get(stack.url + '/sitemap.xml')).text()).not.toContain('/bai-tap/cms-browser-renamed</loc>');
  await cmsNav.getByRole('link', { name: 'Kho bài tập', exact: true }).click();
  await page.getByLabel('Tìm bài tập').fill('dong tac thu trinh duyet');
  await page.getByRole('combobox', { name: /^Trạng thái/ }).selectOption('ARCHIVED');
  await page.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Danh sách bài tập' }).getByRole('link', { name: 'Động tác thử trình duyệt', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Động tác thử trình duyệt', exact: true }).click();
  await page.getByRole('button', { name: 'Khôi phục bài thành bản nháp' }).click();
  await expect(page.locator('main p[role=status]').filter({ hasText: 'Đã khôi phục bản nháp.' })).toBeVisible();
  expect((await context.request.get(stack.url + '/bai-tap/cms-browser')).status()).toBe(404);
  await page.goto(stack.url + '/admin/bai-tap?q=dong+tac+thu+trinh+duyet');
  const remove = page.getByRole('button', { name: 'Xóa Động tác thử trình duyệt', exact: true });
  await expect(page.getByRole('table', { name: 'Danh sách bài tập' }).getByText('Động tác thử trình duyệt')).toBeVisible();
  await expect(remove).toHaveCount(0);
  const current = await context.request.get(savedPath);
  expect((await context.request.post(savedPath + '/unpublish', {
    headers: { ...headers(), 'If-Match': current.headers().etag, 'Idempotency-Key': randomUUID() },
    data: { reason: 'Kết thúc kiểm thử' },
  })).status()).toBe(200);
  await page.goto(stack.url + '/admin/bai-tap?q=dong+tac+thu+trinh+duyet&status=ARCHIVED');
  await remove.click();
  const confirmation = page.getByRole('dialog', { name: 'Xóa bài tập?' });
  await confirmation.getByRole('button', { name: 'Hủy', exact: true }).click();
  await expect(remove).toBeVisible();
  await remove.click();
  await confirmation.getByRole('button', { name: 'Xóa bài tập', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã xóa bài tập: Động tác thử trình duyệt' })).toBeVisible();
  await expect(remove).toHaveCount(0);
  expect((await context.request.get(savedPath)).status()).toBe(404);
});

test('two editor tabs preserve unsaved input on 412 until the admin reloads the revision', async ({ page, context }) => {
  const email = 'cms-conflict@example.test';
  await setupUser(context, email);
  const actor = (await stack.identityDb.query('SELECT id FROM users WHERE email_normalized=$1', [email])).rows[0].id;
  await stack.identity.setRole(actor, 'ADMIN', null);
  await login(page, email);
  await expect(page).toHaveURL(stack.url + '/app');
  const path = stack.url + '/admin/bai-tap/bodyweight_squat';
  const other = await context.newPage();
  try {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto(path);
    await other.goto(path);
    await page.getByLabel('Tóm tắt', { exact: true }).fill('Nội dung ở tab đến sau.');
    await other.getByLabel('Tóm tắt', { exact: true }).fill('Nội dung đã lưu ở tab đầu.');
    await other.getByRole('button', { name: 'Lưu bản nháp' }).click();
    await expect(other.getByText('Đã lưu bản nháp.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Lưu bản nháp' }).click();
    await expect(page.getByRole('alert', { name: 'Lỗi quản trị' })).toContainText('Nội dung đang nhập vẫn được giữ');
    await expect(page.getByLabel('Tóm tắt', { exact: true })).toHaveValue('Nội dung ở tab đến sau.');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await page.getByRole('button', { name: 'Bỏ nội dung đang nhập và tải phiên bản mới' }).click();
    await expect(page.getByLabel('Tóm tắt', { exact: true })).toHaveValue('Nội dung đã lưu ở tab đầu.');
    await page.screenshot({ path: '.local/browser-results/admin-editor-mobile.png', fullPage: true });
  } finally { await other.close(); }
});

test('CMS exercise list handles bulk publication, partial failures and row status actions', async ({ page, context }) => {
  const email = 'cms-bulk@example.test';
  await setupUser(context, email);
  const actor = (await stack.identityDb.query('SELECT id FROM users WHERE email_normalized=$1', [email])).rows[0].id;
  await stack.identity.setRole(actor, 'ADMIN', null);
  await login(page, email, '?next=/admin');
  await expect(page.getByRole('heading', { name: 'Tổng quan nội dung' })).toBeVisible();
  const api = stack.url + '/api/v1/admin/exercises';
  for (const [id, label, ready] of [['a', 'A', true], ['b', 'B', true], ['c', 'C', false]]) {
    const response = await context.request.post(api, {
      headers: { ...headers(), 'Idempotency-Key': randomUUID() },
      data: { id: 'bulk_' + id, slug: 'bulk-' + id, nameVi: 'Thao tác nhóm ' + label,
        summary: 'Kiểm thử thao tác từ danh sách.', instructions: ['Đứng thẳng.'],
        primaryMuscleIds: ['quadriceps'], equipmentIds: [],
        ...(ready ? { workoutType: 'STRENGTH', focusArea: 'LOWER_BODY', difficulty: 2 } : {}) },
    });
    expect(response.status()).toBe(201);
  }
  await page.goto(stack.url + '/admin/bai-tap?q=' + encodeURIComponent('Thao tác nhóm'));
  const all = page.getByRole('checkbox', { name: 'Chọn tất cả bài trên trang' });
  await all.check();
  await page.getByRole('button', { name: 'Công bố (3)', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận công bố', exact: true }).click();
  await expect(page.getByText('Thành công 2 bài · Chưa xử lý được 1 bài')).toBeVisible();
  await expect(page.getByText('Chọn loại hình, trọng tâm và độ khó trước khi công bố.', { exact: false })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Chọn Thao tác nhóm C' })).toBeChecked();
  await all.check();
  await page.getByRole('button', { name: 'Gỡ công bố (2)', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const confirm = dialog.getByRole('button', { name: 'Xác nhận gỡ công bố', exact: true });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel('Lý do gỡ công bố').fill('Cập nhật nội dung.');
  await confirm.click();
  const row = page.getByRole('row').filter({ hasText: 'Thao tác nhóm A' });
  await expect(row.getByText('Đã gỡ')).toBeVisible();
  await row.getByRole('button', { name: 'Khôi phục bản nháp Thao tác nhóm A' }).click();
  await dialog.getByRole('button', { name: 'Xác nhận khôi phục bản nháp' }).click();
  await expect(row.getByText('Bản nháp', { exact: true })).toBeVisible();
  expect((await (await context.request.get(api + '/bulk_b')).json()).status).toBe('ARCHIVED');
  const draftRow = page.getByRole('row').filter({ hasText: 'Thao tác nhóm C' });
  await expect(draftRow.getByRole('button', { name: 'Lưu trữ bản nháp Thao tác nhóm C' })).toHaveAttribute('title', 'Lưu trữ bản nháp');
  await draftRow.getByRole('link', { name: 'Mở Thao tác nhóm C' }).click();
  await page.getByRole('button', { name: 'Lưu trữ bản nháp', exact: true }).click();
  await page.getByLabel('Lý do lưu trữ').fill('Bản nháp không còn dùng.');
  await page.getByRole('button', { name: 'Xác nhận lưu trữ', exact: true }).click();
  await expect(page.getByText('Đã lưu trữ bản nháp.', { exact: true }).first()).toBeVisible();
  expect((await context.request.get(stack.url + '/bai-tap/bulk-c')).status()).toBe(404);
  await page.getByRole('button', { name: 'Xóa bài tập', exact: true }).click();
  await dialog.getByRole('button', { name: 'Xóa bài tập', exact: true }).click();
  await expect(page).toHaveURL(stack.url + '/admin/bai-tap?status=ARCHIVED');
  await expect.poll(async () => (await context.request.get(api + '/bulk_c')).status()).toBe(404);
  await page.goto(stack.url + '/admin/bai-tap?q=' + encodeURIComponent('Thao tác nhóm'));
  await all.check();
  await page.getByRole('button', { name: 'Xóa (1)', exact: true }).click();
  await expect(dialog.getByText('Thao tác nhóm B', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Thao tác nhóm A', { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Xác nhận xóa', exact: true }).click();
  await expect(page.getByText('Thành công 1 bài', { exact: true })).toBeVisible();
  expect((await context.request.get(api + '/bulk_b')).status()).toBe(404);
  expect((await context.request.get(api + '/bulk_a')).status()).toBe(200);
});

test('revoking ADMIN blocks save from an open CMS tab and preserves the draft', async ({ page, context }) => {
  const email = 'cms-revoked@example.test';
  await setupUser(context, email);
  const actor = (await stack.identityDb.query('SELECT id FROM users WHERE email_normalized=$1', [email])).rows[0].id;
  const activeAdmins = (await stack.identityDb.query("SELECT count(*)::int AS n FROM users WHERE role='ADMIN' AND status='ACTIVE'")).rows[0].n;
  if (!activeAdmins) {
    const backup = 'cms-backup@example.test';
    await setupUser(context, backup);
    const id = (await stack.identityDb.query('SELECT id FROM users WHERE email_normalized=$1', [backup])).rows[0].id;
    await stack.identity.setRole(id, 'ADMIN', null);
  }
  await stack.identity.setRole(actor, 'ADMIN', null);
  await login(page, email);
  await expect(page).toHaveURL(stack.url + '/app');
  const editor = stack.url + '/admin/bai-tap/bodyweight_squat';
  await page.goto(editor);
  const summary = page.getByLabel('Tóm tắt', { exact: true });
  const original = await summary.inputValue();
  await summary.fill('Tab cũ không được ghi bản nháp này.');
  await stack.identity.setRole(actor, 'USER', null);
  const response = page.waitForResponse(res => res.request().method() === 'PATCH' && res.url().endsWith('/api/v1/admin/exercises/bodyweight_squat'));
  await page.getByRole('button', { name: 'Lưu bản nháp' }).click();
  expect((await response).status()).toBe(401);
  await expect(page.getByRole('alert', { name: 'Lỗi quản trị' })).toBeVisible();
  await expect(summary).toHaveValue('Tab cũ không được ghi bản nháp này.');
  await login(page, email);
  await expect(page).toHaveURL(stack.url + '/app');
  expect((await context.request.get(stack.url + '/api/v1/admin/exercises/bodyweight_squat')).status()).toBe(403);
  await stack.identity.setRole(actor, 'ADMIN', null);
  await login(page, email);
  await expect(page).toHaveURL(stack.url + '/app');
  await page.goto(editor);
  await expect(page.getByLabel('Tóm tắt', { exact: true })).toHaveValue(original);
});

test('CMS BFF validates content and revision routes with the real Catalog', async ({ page, context }) => {
  const email = 'cms-revisions@example.test';
  await setupUser(context, email);
  const actor = (await stack.identityDb.query('SELECT id FROM users WHERE email_normalized=$1', [email])).rows[0].id;
  await stack.identity.setRole(actor, 'ADMIN', null);
  await login(page, email);
  await expect(page).toHaveURL(stack.url + '/app');
  const base = stack.url + '/api/v1/admin';
  const id = 'bff_revision_eq';
  const collection = base + '/content/equipment';
  const revisions = base + '/revisions/equipment/' + id;
  const data = { nameVi: 'Dụng cụ bản đầu', slug: 'bff-revision-eq' };
  const create = await context.request.post(collection, {
    headers: { ...headers(), 'Idempotency-Key': randomUUID() }, data: { id, contentType: 'equipment', data },
  });
  expect(create.status()).toBe(201);
  expect(create.headers()['cache-control']).toBe('no-store');
  const first = create.headers().etag;
  const update = await context.request.patch(collection + '/' + id, {
    headers: { ...headers(), 'If-Match': first }, data: { contentType: 'equipment', data: { ...data, nameVi: 'Dụng cụ đã sửa' } },
  });
  expect(update.status()).toBe(200);
  expect((await context.request.get(revisions + '/0')).status()).toBe(404);
  expect((await context.request.get(base + '/content/exercise')).status()).toBe(404);
  expect((await context.request.get(revisions + '/1')).status()).toBe(200);
  const history = await context.request.get(revisions);
  expect(history.status()).toBe(200);
  expect((await history.json()).items.map(item => item.version)).toEqual([2, 1]);
  const restore = await context.request.post(revisions + '/restore', {
    headers: { ...headers(), 'If-Match': update.headers().etag, 'Idempotency-Key': randomUUID() },
    data: { version: 1, reason: 'Khôi phục bản nháp để kiểm tra BFF.' },
  });
  expect(restore.status()).toBe(200);
  expect(await restore.json()).toMatchObject({ sourceVersion: 1, action: 'RESTORE_REVISION', data: { id, data } });
  const draft = await context.request.get(collection + '/' + id);
  expect(await draft.json()).toMatchObject({ id, status: 'DRAFT', data });
});

test('CMS manages support drafts and restores history from the admin UI', async ({ page, context }) => {
  const email = 'cms-support-ui@example.test';
  await setupUser(context, email);
  const actor = (await stack.identityDb.query('SELECT id FROM users WHERE email_normalized=$1', [email])).rows[0].id;
  await stack.identity.setRole(actor, 'ADMIN', null);
  await login(page, email);
  await expect(page).toHaveURL(stack.url + '/app');
  await page.goto(stack.url + '/admin');
  const nav = page.getByRole('navigation', { name: 'Điều hướng CMS', exact: true });
  for (const name of ['Nhóm cơ', 'Media', 'Dụng cụ']) {
    await nav.getByRole('link', { name, exact: true }).click();
    await expect(page.getByRole('heading', { name: name === 'Media' ? 'Thư viện media' : name, exact: true })).toBeVisible();
    await expect(page.getByText('Đang tải nội dung…')).toHaveCount(0);
    await expect(page.getByRole('alert').filter({ hasText: /Không thể|gián đoạn/ })).toHaveCount(0);
  }
  await page.getByRole('link', { name: 'Thêm dụng cụ' }).click();
  await page.getByLabel('Mã nội dung').fill('ui_revision_eq');
  await page.getByLabel('Tên tiếng Việt').fill('Dụng cụ giao diện gốc');
  await page.getByLabel('Đường dẫn (slug)').fill('ui-revision-eq');
  await page.getByRole('button', { name: 'Tạo bản nháp' }).click();
  await expect(page.getByRole('heading', { name: 'Dụng cụ giao diện gốc' })).toBeVisible();
  const other = await context.newPage();
  try {
    await other.goto(page.url());
    await other.getByLabel('Tên tiếng Việt').fill('Bản nhập ở tab cũ');
    await page.getByLabel('Tên tiếng Việt').fill('Dụng cụ giao diện mới');
    await page.getByRole('button', { name: 'Lưu bản nháp' }).click();
    await expect(page.getByText('Đã lưu bản nháp.', { exact: true })).toBeVisible();
    await other.getByRole('button', { name: 'Lưu bản nháp' }).click();
    await expect(other.getByRole('alert', { name: 'Lỗi quản trị' })).toContainText('Nội dung đang nhập vẫn được giữ');
    await expect(other.getByLabel('Tên tiếng Việt')).toHaveValue('Bản nhập ở tab cũ');
    await other.getByRole('button', { name: 'Bỏ nội dung đang nhập và tải phiên bản mới' }).click();
    await expect(other.getByLabel('Tên tiếng Việt')).toHaveValue('Dụng cụ giao diện mới');
  } finally { await other.close(); }
  await page.getByRole('button', { name: 'Xem lịch sử' }).click();
  await page.getByText('Xem nội dung phiên bản 1', { exact: true }).click();
  await expect(page.getByRole('region', { name: 'Lịch sử phiên bản' }).getByText('Dụng cụ giao diện gốc', { exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: 'So sánh phiên bản 1' }).check();
  await page.getByRole('checkbox', { name: 'So sánh phiên bản 2' }).check();
  const comparison = page.getByRole('region', { name: 'So sánh phiên bản' });
  await expect(comparison.getByText('Dụng cụ giao diện gốc', { exact: true })).toBeVisible();
  await expect(comparison.getByText('Dụng cụ giao diện mới', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Khôi phục phiên bản 1', exact: true }).click();
  await page.getByLabel('Lý do khôi phục').fill('Khôi phục tên đã duyệt cho bản nháp.');
  await page.getByRole('button', { name: 'Xác nhận khôi phục', exact: true }).click();
  await expect(page.getByLabel('Tên tiếng Việt')).toHaveValue('Dụng cụ giao diện gốc');
  await expect(page.getByText('Đã khôi phục thành bản nháp.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Công bố', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận công bố', exact: true }).click();
  await expect(page.getByText('Đã công bố nội dung.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Lưu trữ', exact: true }).click();
  await page.getByLabel('Lý do lưu trữ').fill('Kết thúc ca kiểm thử.');
  await page.getByRole('button', { name: 'Xác nhận lưu trữ', exact: true }).click();
  await expect(page.getByText('Đã lưu trữ nội dung.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Khôi phục bản nháp', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận khôi phục bản nháp', exact: true }).click();
  await expect(page.getByText('Đã khôi phục bản nháp.', { exact: true })).toBeVisible();
});

test('CMS uploads and verifies media in private storage', async ({ page, context }) => {
  test.skip(process.env.CMS_TEST_TOOLS !== 'true', 'Requires local SeaweedFS, ClamAV and FFmpeg fixture');
  const email = 'cms-media-ui@example.test';
  await setupUser(context, email);
  const actor = (await stack.identityDb.query('SELECT id FROM users WHERE email_normalized=$1', [email])).rows[0].id;
  await stack.identity.setRole(actor, 'ADMIN', null);
  await login(page, email);
  await expect(page).toHaveURL(stack.url + '/app');
  await page.goto(stack.url + '/admin/noi-dung/media?tao=1');
  await page.getByLabel('Tệp ảnh hoặc video').setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: stack.mediaPng });
  await page.getByRole('button', { name: 'Tải tệp lên' }).click();
  await expect(page.getByText('Tệp sẵn sàng gắn vào bản nháp.')).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Dùng tệp này' }).click();
  await page.getByRole('button', { name: 'Tạo liên kết xem trước' }).click();
  const link = page.getByRole('link', { name: 'Mở bản xem trước riêng' });
  await expect(link).toBeVisible();
  const previewUrl = await link.getAttribute('href');
  expect((await context.request.get(previewUrl)).ok()).toBe(true);
  const unsigned = new URL(previewUrl); unsigned.search = '';
  expect((await context.request.get(unsigned.href)).status()).toBe(403);
  await expect(page.getByLabel('Mã nội dung')).toHaveCount(0);
  await expect(page.getByLabel('URL nguồn')).toHaveCount(0);
  await page.getByLabel('Ghi công').fill('Fixture kiểm thử SmartGym');
  await page.getByLabel('Mô tả thay thế').fill('Ảnh kiểm thử nội bộ');
  await page.getByRole('button', { name: 'Tạo bản nháp' }).click();
  await expect(page.getByRole('heading', { name: 'Ảnh kiểm thử nội bộ' })).toBeVisible();
  await expect(page.getByLabel('Quyền công bố')).toHaveValue('APPROVED');

  const base = stack.url + '/api/v1/admin';
  const pictureId = new URL(page.url()).searchParams.get('id');
  expect(pictureId).toMatch(/^media_/);
  const picturePath = base + '/content/media/' + pictureId;
  const etag = async path => (await context.request.get(path)).headers().etag;
  const command = (match = undefined) => ({ ...headers(), 'Idempotency-Key': randomUUID(), ...(match && { 'If-Match': match }) });
  expect((await context.request.post(picturePath + '/publish', { headers: command(await etag(picturePath)) })).status()).toBe(200);

  const videoBytes = stack.mediaWebm;
  const reserved = await context.request.post(base + '/media-uploads', { headers: command(), data: {
    mime: 'video/webm', sizeBytes: videoBytes.length, sha256: createHash('sha256').update(videoBytes).digest('hex'),
  } });
  expect(reserved.status()).toBe(201);
  const grant = await reserved.json();
  const stored = await fetch(grant.putUrl, { method: 'PUT', headers: grant.requiredHeaders, body: videoBytes, signal: AbortSignal.timeout(10000) });
  expect(stored.ok).toBe(true);
  const uploadPath = base + '/media-uploads/' + grant.uploadId;
  expect((await context.request.post(uploadPath + '/complete', { headers: command() })).status()).toBe(202);
  await expect.poll(async () => (await (await context.request.get(uploadPath)).json()).status, { timeout: 15000 }).toBe('READY');
  const videoAsset = await context.request.post(base + '/content/media', { headers: command(), data: { id: 'browser_fixture_video', contentType: 'media', data: {
    kind: 'VIDEO', uploadId: grant.uploadId, sourceUri: 'https://example.test/fixture.webm', credit: 'Fixture kiểm thử SmartGym',
    licenseRef: 'internal-test-only', altText: 'Video kiểm thử nội bộ', rightsStatus: 'APPROVED',
  } } });
  expect(videoAsset.status()).toBe(201);
  expect((await context.request.post(base + '/content/media/browser_fixture_video/publish', { headers: command(videoAsset.headers().etag) })).status()).toBe(200);
  const draft = await context.request.post(base + '/exercises', { headers: command(), data: {
    id: 'browser_media_exercise', slug: 'browser-media-exercise', nameVi: 'Bài tập fixture media', summary: 'Bài kiểm tra hiển thị media.',
    workoutType: 'STRENGTH', focusArea: 'LOWER_BODY', difficulty: 2,
    primaryMuscleIds: ['quadriceps'], equipmentIds: [], instructions: ['Đứng thẳng và giữ thăng bằng.'], mediaIds: ['browser_fixture_video', pictureId],
    imageRoles: { main: pictureId },
  } });
  expect(draft.status()).toBe(201);
  const draftPath = base + '/exercises/browser_media_exercise';
  const variantPath = base + '/content/exercise-variant/browser_fixture_variant';
  const variant = await context.request.post(base + '/content/exercise-variant', { headers: command(), data: {
    id: 'browser_fixture_variant', contentType: 'exercise-variant',
    data: { exerciseId: 'browser_media_exercise', nameVi: 'Biến thể kiểm thử', notes: 'Thực hiện chậm.' },
  } });
  expect(variant.status()).toBe(201);
  expect((await context.request.post(variantPath + '/publish', { headers: command(variant.headers().etag) })).status()).toBe(200);
  const withVariant = await context.request.patch(draftPath, {
    headers: command(draft.headers().etag), data: { variantIds: ['browser_fixture_variant'] },
  });
  expect(withVariant.status()).toBe(200);
  await page.goto(stack.url + '/admin/noi-dung/media');
  const mediaGrid = page.getByRole('list', { name: 'Danh sách media' });
  await expect(mediaGrid.getByRole('img', { name: 'Ảnh kiểm thử nội bộ' })).toBeVisible();
  const videoTile = mediaGrid.getByRole('listitem').filter({ hasText: 'Video kiểm thử nội bộ' });
  await videoTile.getByRole('button', { name: 'Xem video' }).click();
  await expect(videoTile.locator('video')).toBeVisible();
  const editor = stack.url + '/admin/bai-tap/browser_media_exercise';
  await page.goto(editor);
  await page.getByRole('button', { name: 'Gắn ảnh hoặc video' }).click();
  const dialog = page.getByRole('dialog', { name: 'Thêm ảnh hoặc video' });
  await dialog.getByLabel('Tệp ảnh hoặc video').setInputFiles({ name: 'fixture-truc-tiep.png', mimeType: 'image/png', buffer: stack.mediaPng });
  await dialog.getByRole('button', { name: 'Tải tệp lên' }).click();
  await dialog.getByRole('button', { name: 'Gắn vào bài tập' }).click({ timeout: 15000 });
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(editor);
  await expect(page.getByRole('button', { name: 'Gỡ fixture-truc-tiep' })).toBeVisible();
  await page.getByRole('button', { name: 'Lưu bản nháp' }).click();
  await expect(page.locator('main p[role=status]').filter({ hasText: 'Đã lưu bản nháp.' })).toBeVisible();
  expect((await (await context.request.get(draftPath)).json()).imageRoles).toEqual({ main: pictureId });
  await page.goto(stack.url + '/admin/bai-tap/browser_media_exercise/xem-truoc');
  await expect(page.getByText('Biến thể kiểm thử', { exact: true })).toHaveCount(0);
  await page.getByRole('figure').filter({ hasText: 'Ảnh kiểm thử nội bộ' }).getByRole('button', { name: 'Mở ảnh minh họa' }).click();
  await expect.poll(() => page.getByRole('img', { name: 'Ảnh kiểm thử nội bộ' }).evaluate(element => element.naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('figure').filter({ hasText: 'fixture-truc-tiep' }).getByRole('button', { name: 'Mở ảnh minh họa' }).click();
  await expect.poll(() => page.getByRole('img', { name: 'fixture-truc-tiep' }).evaluate(element => element.naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Mở video minh họa' }).click();
  await expect.poll(() => page.locator('video').evaluate(element => element.readyState)).toBeGreaterThanOrEqual(1);
  expect((await context.request.post(draftPath + '/publish', { headers: command(await etag(draftPath)) })).status()).toBe(200);

  const videoRequests = [];
  page.on('request', request => { if (request.url().includes('/api/v1/media/browser_fixture_video/')) videoRequests.push(request.url()); });
  const detail = stack.url + '/bai-tap/browser-media-exercise';
  await page.goto(detail);
  await expect(page).toHaveURL(detail);
  await expect(page.getByRole('heading', { name: 'Cách thực hiện', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Nhóm cơ và dụng cụ' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Tập với Pose AI' })).toHaveCount(0);
  await expect(page.getByText('MediaPipe Pose Ready')).toHaveCount(0);
  await expect(page.getByText('Biến thể kiểm thử', { exact: true })).toHaveCount(0);
  const image = page.getByRole('img', { name: 'Ảnh kiểm thử nội bộ' });
  await image.scrollIntoViewIfNeeded();
  await expect.poll(() => image.evaluate(element => element.naturalWidth)).toBeGreaterThan(0);
  const imageUrl = await image.getAttribute('src');
  await expect(page.getByRole('img', { name: 'fixture-truc-tiep' })).toBeVisible();
  expect(videoRequests).toHaveLength(0);
  await expect(page.locator('video')).toHaveCount(0);
  const videoResponse = page.waitForResponse(res => res.url().includes('/api/v1/media/browser_fixture_video/'));
  await page.getByRole('button', { name: 'Mở video minh họa' }).click();
  expect([200, 206]).toContain((await videoResponse).status());
  await expect.poll(() => page.locator('video').evaluate(element => element.readyState)).toBeGreaterThanOrEqual(1);
  expect((await context.request.patch(picturePath, { headers: command(await etag(picturePath)), data: {
    contentType: 'media', data: { rightsStatus: 'REJECTED' },
  } })).status()).toBe(200);
  expect((await context.request.get(imageUrl)).status()).toBe(404);
  await expect(page.getByText('Đứng thẳng và giữ thăng bằng.')).toBeVisible();
  await page.reload();
  await expect(image).toHaveCount(0);
  const exercisePath = base + '/exercises/browser_media_exercise';
  expect((await context.request.post(exercisePath + '/unpublish', { headers: command(await etag(exercisePath)), data: { reason: 'Kết thúc fixture media.' } })).status()).toBe(200);
});

test('CMS validates and applies KB drafts, filters audit and downloads the public export', async ({ page, context }) => {
  test.skip(process.env.CMS_TEST_TOOLS !== 'true', 'Requires the registered KB fixture');
  const email = 'cms-import-ui@example.test';
  await setupUser(context, email);
  const actor = (await stack.identityDb.query('SELECT id FROM users WHERE email_normalized=$1', [email])).rows[0].id;
  await stack.identity.setRole(actor, 'ADMIN', null);
  await login(page, email);
  await expect(page).toHaveURL(stack.url + '/app');
  const revision = await stack.publication();
  await page.goto(stack.url + '/admin/nhap-xuat');
  await page.getByLabel('Phiên bản gói').fill(stack.importFixture.sourceRevision);
  await page.getByLabel('SHA-256 manifest').fill(stack.importFixture.manifestSha256);
  await page.getByRole('button', { name: 'Kiểm tra gói KB' }).click();
  await expect(page.getByText('Sẵn sàng · 1 bản ghi đạt · 0 lỗi')).toBeVisible();
  const item = stack.url + '/api/v1/admin/content/equipment/browser_import_eq';
  expect((await context.request.get(item)).status()).toBe(404);
  await page.getByRole('button', { name: 'Áp dụng vào bản nháp' }).click();
  await page.getByRole('button', { name: 'Xác nhận áp dụng' }).click();
  await expect(page.getByText('Đã áp dụng · 1 bản ghi đạt · 0 lỗi')).toBeVisible();
  expect(await (await context.request.get(item)).json()).toMatchObject({ status: 'DRAFT' });
  expect(await stack.publication()).toBe(revision);
  await page.getByLabel('Phiên bản công bố').fill(revision);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tải bản xuất JSON' }).click();
  expect((await download).suggestedFilename()).toBe(`smartgym-${revision}.json`);
  await expect(page.getByText('SHA-256 bản xuất')).toBeVisible();
  await page.getByRole('link', { name: 'Nhật ký thay đổi', exact: true }).click();
  await page.getByLabel('Loại nội dung').selectOption('import');
  await page.getByLabel('Mã người thực hiện').fill(actor);
  await page.getByLabel('Từ ngày (UTC)').fill('2000-01-01');
  await page.getByLabel('Đến hết ngày (UTC)').fill('2099-12-31');
  await page.getByRole('button', { name: 'Lọc nhật ký' }).click();
  await expect(page.getByText('Áp dụng gói vào bản nháp', { exact: true })).toBeVisible();
  await expect(page.getByText('Kiểm tra gói KB', { exact: true })).toBeVisible();
});

test('Identity outage fails private access closed while public Catalog remains usable',async({page,context})=>{
  const email='browser-outage@example.test';await setupUser(context,email);await login(page,email);await expect(page).toHaveURL(stack.url+'/app');
  await stack.stopIdentity();await page.goto(stack.url+'/app');await expect(page.getByRole('heading',{name:'Kết nối tài khoản đang gián đoạn'})).toBeVisible();
  expect((await context.request.post(stack.url+'/api/v1/auth/login',{headers:headers(),data:{email:'offline@example.test',password}})).status()).toBe(503);
  await page.goto(stack.url);await expect(page.getByRole('heading',{name:'Tìm bài tập phù hợp với bạn'})).toBeVisible();await expect(page.locator('article')).toHaveCount(20);
});
