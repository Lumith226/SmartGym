const { test } = require('node:test');
const assert = require('node:assert/strict');
const https = require('node:https');
const { readFile, writeFile } = require('node:fs/promises');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createServer } = require('node:net');
const { join } = require('node:path');
const { randomBytes, generateKeyPairSync, createPublicKey, verify } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { PGlite } = require('@electric-sql/pglite');
const Ajv2020 = require('ajv/dist/2020').default;
const addFormats = require('ajv-formats');
const { createTestTls } = require('./tls.cjs');

test('Identity lifecycle, mTLS and HTTP contracts', { timeout: 120000 }, async t => {
  const { migrate } = await import('../dist/migrate.js');
  const { createApp } = await import('../dist/app.js');
  const { Identity } = await import('../dist/modules/accounts/identity.js');
  const { IdentityKeys, hashPassword, verifyPassword } = await import('../dist/modules/accounts/crypto.js');
  const network = process.env.IDENTITY_TEST_DATABASE_URL ? (await import('../dist/database.js')).connectDatabase(process.env.IDENTITY_TEST_DATABASE_URL) : null;
  const pg = network ?? new PGlite();
  let fail = false, failOutbox = false;
  const wrap = client => ({ query: async (sql, values) => {
    if (failOutbox && sql.includes('INSERT INTO outbox_events')) throw new Error('Private outbox failure');
    if (!values && !network) return (await client.exec(sql)).at(-1) ?? { rows: [] };
    return client.query(sql, values);
  } });
  const database = {
    query: (...args) => { if (fail) throw new Error('Private database credentials'); return pg.query(...args); },
    transaction: action => { if (fail) throw new Error('Private database credentials'); return network ? network.transaction(client => action(wrap(client))) : pg.transaction(client => action(wrap(client))); },
    close: () => pg.close(),
  };
  t.after(() => database.close());
  await migrate(database); await migrate(database);
  const tls = await createTestTls(); t.after(tls.stop);
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const previous = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const previousJwk = { ...previous.publicKey.export({ format: 'jwk' }), kid: 'old-test', alg: 'RS256', use: 'sig' };
  const keys = new IdentityKeys(pair.privateKey.export({ type: 'pkcs8', format: 'pem' }), 'test-key', 'https://identity.test', randomBytes(32), randomBytes(32), [previousJwk]);
  let time = new Date('2026-11-07T12:00:00.000Z');
  const config = { keys, callers: tls.callers, tls: { ...tls.clients.server, ca: tls.ca }, webOrigin: 'https://web.test' };
  const { app, identity } = await createApp(database, config, () => new Date(time));
  await app.listen(0, '127.0.0.1'); t.after(() => app.close());
  const port = app.getHttpServer().address().port;
  function call(path, { method='GET', body, caller='bff', headers={}, raw, targetPort=port }={}) {
    return new Promise((resolve, reject) => {
      const client = caller ? tls.clients[caller] : {};
      const request = https.request({ hostname:'127.0.0.1', port:targetPort, path, method, ca:tls.ca, ...client, agent:false,
        headers: { 'content-type':'application/json', origin:config.webOrigin, 'x-smartgym-csrf':'1','x-smartgym-client-ip':'192.0.2.1', ...headers }, timeout:5000 }, response => {
        let text=''; response.setEncoding('utf8'); response.on('data',chunk => text+=chunk);
        response.on('end',() => resolve({ status:response.statusCode, headers:response.headers, text, body:text ? JSON.parse(text) : undefined }));
      });
      request.on('error', reject); request.on('timeout',() => request.destroy(new Error('Request timeout')));
      request.end(raw ?? (body === undefined ? undefined : JSON.stringify(body)));
    });
  }
  const spec = JSON.parse(await readFile(join(__dirname,'../../../../docs/api/openapi.yaml'),'utf8'));
  const eventSpec = JSON.parse(await readFile(join(__dirname,'../../../../docs/api/events.yaml'),'utf8'));
  const ajv = new Ajv2020({ strict:false, allErrors:true }); addFormats(ajv);
  ajv.addSchema({ $id:'identity-contract', components:spec.components });
  const check = (name, value) => { const validator=ajv.getSchema('identity-contract#/components/schemas/'+name); assert.equal(validator(value),true,JSON.stringify(validator.errors)); };
  const success = async (path, options, status, schema) => { const res=await call(path,options); assert.equal(res.status,status,res.text); assert.equal(res.headers['cache-control'],'no-store'); if(schema)check(schema,res.body); return res; };
  const error = async (path, options, status, code) => { const res=await success(path,options,status,'Problem'); if(code)assert.equal(res.body.code,code); assert.equal(res.headers['set-cookie'],undefined); return res; };
  const password='SmartGym password 123!';
  async function register(email, extra={}) { return success('/api/v1/auth/register',{method:'POST',body:{email,password,displayName:'Người tập',...extra}},202); }
  async function action(email,purpose='VERIFY_EMAIL') {
    const row=(await database.query('SELECT a.id FROM email_actions a JOIN users u ON u.id=a.user_id WHERE u.email_normalized=$1 AND purpose=$2 AND used_at IS NULL AND superseded_at IS NULL ORDER BY a.created_at DESC',[email.toLowerCase(),purpose])).rows[0];
    const response=await success('/internal/v1/identity/email-deliveries/'+row.id,{caller:'notification'},200,'EmailDelivery');
    return { id:row.id, token:new URLSearchParams(new URL(response.body.actionUrl).hash.slice(1)).get('token'), delivery:response.body };
  }
  async function verifyEmail(email) { const a=await action(email); await success('/api/v1/auth/verify-email',{method:'POST',body:{token:a.token}},204); return a; }
  async function login(email, pwd=password, headers={}) {
    const result=await success('/api/v1/auth/login',{method:'POST',body:{email,password:pwd},headers},200,'Profile');
    const value=result.headers['set-cookie'][0];
    assert.match(value,/^__Host-sg_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800$/);
    assert.equal(JSON.stringify(result.body).includes('accessToken'),false);
    return { cookie:value.split(';')[0], handle:value.split(';')[0].split('=')[1], profile:result.body };
  }
  let a,b;
  await t.test('mTLS rejects missing/unknown certificates and enforces operation ACL',async () => {
    await assert.rejects(call('/health/live',{caller:null}));
    await error('/health/live',{caller:'unknown'},403,'SERVICE_FORBIDDEN');
    await success('/health/ready',{},200);
    await error('/internal/v1/identity/email-deliveries/00000000-0000-4000-8000-000000000001',{},403,'SERVICE_FORBIDDEN');
    await error('/internal/v1/identity/sessions/introspect',{caller:'notification',method:'POST',body:{sessionHandle:'a'.repeat(43)}},403);
    await error('/api/v1/auth/register',{caller:'catalog',method:'POST',body:{}},403);
    await error('/internal/v1/identity/jwks',{caller:'catalog',method:'POST',body:{}},404);
    await error('/api/v1/auth/register',{method:'POST',body:{},headers:{origin:'https://evil.test'}},403,'CSRF_REJECTED');
    await error('/api/v1/auth/login',{method:'POST',body:{},headers:{'x-smartgym-csrf':'0'}},403);
    await error('/api/v1/auth/login',{method:'POST',body:{},headers:{'x-smartgym-client-ip':'spoofed'}},400);
  });
  await t.test('strict inputs, password hashing and neutral registration without role escalation',async () => {
    await error('/api/v1/auth/register',{method:'POST',body:{email:'bad',password,displayName:'A'}},422);
    await error('/api/v1/auth/register',{method:'POST',body:{email:'a@example.test',password,displayName:'A',role:'ADMIN'}},422);
    await error('/api/v1/auth/login',{method:'POST',raw:'{broken'},400);
    await error('/api/v1/auth/register',{method:'POST',body:{email:'a@example.test',password:'short',displayName:'A'}},422);
    const registration=await register('A@example.test'); await register('a@example.test');
    const created=(await database.query("SELECT correlation_id FROM identity_audit WHERE action='REGISTER'")).rows[0];
    assert.equal(created.correlation_id,registration.headers['x-request-id']);
    assert.equal((await database.query('SELECT * FROM users')).rows.length,1);
    const saved=(await database.query('SELECT password_hash FROM credentials')).rows[0].password_hash;
    assert.match(saved,/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/); assert.equal(await verifyPassword(password,saved),true);
    assert.equal(await verifyPassword('wrong',saved),false);
    await error('/api/v1/auth/login',{method:'POST',body:{email:'a@example.test',password:'wrong'}},401,'INVALID_CREDENTIALS');
    await error('/api/v1/auth/login',{method:'POST',body:{email:'unknown@example.test',password}},401,'INVALID_CREDENTIALS');
    await error('/api/v1/auth/login',{method:'POST',body:{email:'a@example.test',password}},403,'EMAIL_UNVERIFIED');
  });
  await t.test('resend supersedes old link; concurrent verification consumes exactly once',async () => {
    const old=await action('a@example.test');
    await success('/api/v1/auth/verification-requests',{method:'POST',body:{email:'a@example.test'}},202);
    await success('/api/v1/auth/verification-requests',{method:'POST',body:{email:'nobody@example.test'}},202);
    await error('/api/v1/auth/verify-email',{method:'POST',body:{token:old.token}},410);
    await error('/internal/v1/identity/email-deliveries/'+old.id,{caller:'notification'},410);
    const current=await action('a@example.test');
    const responses=await Promise.all([1,2].map(() => call('/api/v1/auth/verify-email',{method:'POST',body:{token:current.token}})));
    assert.deepEqual(responses.map(r=>r.status).sort(),[204,410]);
    const secret=(await database.query('SELECT encrypted_delivery_secret FROM email_actions WHERE id=$1',[current.id])).rows[0]; assert.equal(secret.encrypted_delivery_secret,null);
    await error('/api/v1/auth/verify-email',{method:'POST',body:{token:current.token}},410);
    a=await login('a@example.test');
  });
  await t.test('owner-scoped profile and RSA assertion/current JWKS rotation',async () => {
    await register('b@example.test'); await verifyEmail('b@example.test'); b=await login('b@example.test');
    const me=await success('/api/v1/me',{headers:{cookie:a.cookie}},200,'Profile'); assert.equal(me.body.id,a.profile.id);
    await error('/api/v1/me',{method:'PATCH',headers:{cookie:a.cookie},body:{id:b.profile.id,displayName:'Oops'}},422);
    await error('/api/v1/me',{method:'PATCH',headers:{cookie:a.cookie},body:{timeZone:'Invalid/Timezone'}},422);
    await success('/api/v1/me',{method:'PATCH',headers:{cookie:a.cookie},body:{displayName:'Tên mới',timeZone:'Asia/Ho_Chi_Minh'}},200,'Profile');
    assert.equal((await success('/api/v1/me',{headers:{cookie:b.cookie}},200)).body.displayName,'Người tập');
    await error('/api/v1/me',{headers:{'x-user-id':a.profile.id,'x-user-role':'ADMIN'}},401);
    const assertion=(await success('/internal/v1/identity/sessions/introspect',{method:'POST',body:{sessionHandle:a.handle}},200,'IdentityAssertion')).body;
    const jwks=(await success('/internal/v1/identity/jwks',{caller:'catalog'},200,'Jwks')).body; assert.equal(jwks.keys.length,2);
    const [head,payload,signature]=assertion.accessToken.split('.'), claims=JSON.parse(Buffer.from(payload,'base64url'));
    assert.equal(claims.iss,'https://identity.test'); assert.equal(claims.aud,'smartgym-api'); assert.equal(claims.sub,a.profile.id); assert.deepEqual(claims.roles,['USER']); assert.equal(claims.exp-claims.iat,300);
    assert.equal(verify('RSA-SHA256',Buffer.from(head+'.'+payload),createPublicKey({key:jwks.keys[0],format:'jwk'}),Buffer.from(signature,'base64url')),true);
    assert.equal(verify('RSA-SHA256',Buffer.from(head+'.'+payload+'tampered'),pair.publicKey,Buffer.from(signature,'base64url')),false);
    assert.equal(JSON.stringify(jwks).includes('"d"'),false);
    await error('/internal/v1/identity/users/'+a.profile.id+'/notification-contact',{},403);
    await success('/internal/v1/identity/users/'+a.profile.id+'/notification-contact',{caller:'notification'},200,'NotificationContact');
  });
  await t.test('opaque event envelope, encrypted delivery and atomic outbox rollback',async () => {
    const eventValidator=ajv.compile(eventSpec);
    for(const row of (await database.query('SELECT payload FROM outbox_events')).rows) {
      assert.equal(eventValidator(row.payload),true,JSON.stringify(eventValidator.errors));
      assert.equal(JSON.stringify(row.payload).includes('@'),false); assert.equal(JSON.stringify(row.payload).includes('token'),false);
    }
    failOutbox=true;
    await error('/api/v1/auth/register',{method:'POST',body:{email:'rollback@example.test',password,displayName:'Rollback'}},503);
    failOutbox=false;
    assert.equal((await database.query('SELECT id FROM users WHERE email_normalized=$1',['rollback@example.test'])).rows.length,0);
    const ciphertext=keys.encrypt('secret-token','delivery-A:VERIFY_EMAIL');
    assert.equal(keys.decrypt(ciphertext,'delivery-A:VERIFY_EMAIL'),'secret-token');
    assert.throws(()=>keys.decrypt(ciphertext,'delivery-B:VERIFY_EMAIL'));
    assert.equal(ciphertext.includes('secret-token'),false);
  });
  await t.test('reset is single use, invalidates old password/all sessions, no automatic session',async () => {
    await success('/api/v1/auth/password-reset-requests',{method:'POST',body:{email:'a@example.test'}},202);
    const reset=await action('a@example.test','RESET_PASSWORD');
    await error('/api/v1/auth/verify-email',{method:'POST',body:{token:reset.token}},410);
    const responses=await Promise.all([1,2].map(()=>call('/api/v1/auth/password-reset',{method:'POST',body:{token:reset.token,newPassword:'New secure password 456!'}})));
    assert.deepEqual(responses.map(r=>r.status).sort(),[204,410]);
    const result=responses.find(r=>r.status===204);
    assert.match(result.headers['set-cookie'][0],/Max-Age=0/);
    await error('/api/v1/me',{headers:{cookie:a.cookie}},401);
    await error('/internal/v1/identity/sessions/introspect',{method:'POST',body:{sessionHandle:a.handle}},401);
    await error('/api/v1/auth/login',{method:'POST',body:{email:'a@example.test',password}},401);
    await error('/api/v1/auth/password-reset',{method:'POST',body:{token:reset.token,newPassword:password}},410);
    a=await login('a@example.test','New secure password 456!');
    await success('/api/v1/me',{headers:{cookie:b.cookie}},200);
  });
  await t.test('password reset expires at 30 minutes and delivery references become unavailable',async () => {
    await success('/api/v1/auth/password-reset-requests',{method:'POST',body:{email:'b@example.test'}},202);
    const reset=await action('b@example.test','RESET_PASSWORD');
    time=new Date(time.getTime()+30*60000);
    await error('/api/v1/auth/password-reset',{method:'POST',body:{token:reset.token,newPassword:'Expired reset password 12!'}},410);
    await error('/internal/v1/identity/email-deliveries/'+reset.id,{caller:'notification'},410);
  });
  await t.test('login racing reset cannot leave an old-credential session active',async () => {
    await register('race@example.test'); await verifyEmail('race@example.test');
    await success('/api/v1/auth/password-reset-requests',{method:'POST',body:{email:'race@example.test'}},202);
    const reset=await action('race@example.test','RESET_PASSWORD');
    const [loginResult,resetResult]=await Promise.all([
      call('/api/v1/auth/login',{method:'POST',body:{email:'race@example.test',password}}),
      call('/api/v1/auth/password-reset',{method:'POST',body:{token:reset.token,newPassword:'Race new password 789!'}}),
    ]);
    assert.equal(resetResult.status,204,resetResult.text); assert.ok([200,401].includes(loginResult.status),loginResult.text);
    if(loginResult.status===200) await error('/api/v1/me',{headers:{cookie:loginResult.headers['set-cookie'][0].split(';')[0]}},401);
    await login('race@example.test','Race new password 789!');
  });
  await t.test('role changes revoke sessions; last ADMIN cannot be demoted',async () => {
    await identity.setRole(b.profile.id,'ADMIN',null);
    await error('/api/v1/me',{headers:{cookie:b.cookie}},401);
    b=await login('b@example.test'); assert.deepEqual(b.profile.roles,['ADMIN']);
    await assert.rejects(identity.setRole(b.profile.id,'USER',null),e=>e.getStatus()===409);
    await identity.setRole(a.profile.id,'ADMIN',b.profile.id); a=await login('a@example.test','New secure password 456!');
    const changed=await success('/internal/v1/identity/sessions/introspect',{method:'POST',body:{sessionHandle:a.handle}},200); assert.deepEqual(changed.body.roles,['ADMIN']);
    await identity.setRole(b.profile.id,'USER',a.profile.id);
    const audits=(await database.query("SELECT action FROM identity_audit WHERE action LIKE 'ROLE_%'")).rows; assert.equal(audits.length,3);
  });
  await t.test('absolute and idle session expiry; expired encrypted tokens scrubbed',async () => {
    await register('expired@example.test'); const pending=await action('expired@example.test');
    time=new Date(time.getTime()+DAY());
    await error('/api/v1/me',{headers:{cookie:a.cookie}},401);
    await error('/api/v1/auth/verify-email',{method:'POST',body:{token:pending.token}},410);
    await identity.cleanup(); assert.equal((await database.query('SELECT encrypted_delivery_secret FROM email_actions WHERE id=$1',[pending.id])).rows[0].encrypted_delivery_secret,null);
    a=await login('a@example.test','New secure password 456!');
    // Keep idle time fresh; absolute expiry remains enforced.
    for(let i=0;i<7;i++) { time=new Date(time.getTime()+DAY()-1000); await success('/api/v1/me',{headers:{cookie:a.cookie}},200); }
    time=new Date(time.getTime()+10000); await error('/api/v1/me',{headers:{cookie:a.cookie}},401);
    function DAY(){return 86400000;}
  });
  await t.test('shared limiter is atomic across replicas and logout is replay-safe',async () => {
    const other=new Identity(database,{keys,webOrigin:config.webOrigin,now:()=>new Date(time)}); await other.initialize();
    const results=await Promise.all(Array.from({length:12},(_,i)=>(i%2?other:identity).limit('test-shared','192.0.2.99',10).then(()=>200,e=>e.getStatus())));
    assert.equal(results.filter(s=>s===200).length,10); assert.equal(results.filter(s=>s===429).length,2);
    for(let i=0;i<10;i++)await call('/api/v1/auth/login',{method:'POST',body:{email:'blocked@example.test',password:'wrong'}});
    const limited=await error('/api/v1/auth/login',{method:'POST',body:{email:'blocked@example.test',password:'wrong'}},429); assert.equal(limited.headers['retry-after'],'900');
    a=await login('a@example.test','New secure password 456!');
    await success('/api/v1/auth/logout',{method:'POST',headers:{cookie:a.cookie}},204);
    await success('/api/v1/auth/logout',{method:'POST',headers:{cookie:a.cookie}},204);
    await error('/api/v1/me',{headers:{cookie:a.cookie}},401);
    const bucket=(await database.query('SELECT bucket_hash FROM identity_rate_limits LIMIT 1')).rows[0].bucket_hash; assert.match(bucket,/^[a-f0-9]{64}$/);
  });
  await t.test('database faults fail closed without leaking details; liveness stays available',async () => {
    fail=true;
    const response=await error('/health/ready',{},503,'SERVICE_UNAVAILABLE'); assert.equal(response.text.includes('Private'),false);
    await success('/health/live',{},200);
    await error('/api/v1/me',{headers:{cookie:a.cookie}},503);
    fail=false;
  });
  await t.test('disabled accounts cannot authenticate or introspect existing sessions',async () => {
    const active=await login('race@example.test','Race new password 789!');
    await database.query("UPDATE users SET status='DISABLED' WHERE id=$1",[active.profile.id]);
    await error('/api/v1/auth/login',{method:'POST',body:{email:'race@example.test',password:'Race new password 789!'}},401);
    await error('/api/v1/me',{headers:{cookie:active.cookie}},401);
    await error('/internal/v1/identity/sessions/introspect',{method:'POST',body:{sessionHandle:active.handle}},401);
  });
  await t.test('migration history rejects changed checksum and readiness requires schema',async () => {
    const checksum=(await database.query('SELECT checksum FROM identity_migrations WHERE version=1')).rows[0].checksum;
    await database.query('UPDATE identity_migrations SET checksum=$1 WHERE version=1',['changed']);
    await assert.rejects(migrate(database),/checksum/);
    await database.query('UPDATE identity_migrations SET checksum=$1 WHERE version=1',[checksum]);
    await migrate(database);
  });
  await t.test('real PostgreSQL role cannot connect to another service database',async tt => {
    if(!process.env.IDENTITY_TEST_FORBIDDEN_DATABASE_URL) { tt.skip('ACL check requires dedicated PostgreSQL databases/roles from test:postgres'); return; }
    const forbidden=(await import('../dist/database.js')).connectDatabase(process.env.IDENTITY_TEST_FORBIDDEN_DATABASE_URL);
    try { await assert.rejects(forbidden.query('SELECT 1'),e=>e.code==='42501'); } finally {await forbidden.close();}
  });
  await t.test('configured migration/start entrypoints run as a separate process',async tt => {
    if(!network) { tt.skip('Separate pg entrypoints require IDENTITY_TEST_DATABASE_URL'); return; }
    const signingPath=join(tls.directory,'signing.pem'), deliveryPath=join(tls.directory,'delivery.key'), limiterPath=join(tls.directory,'limiter.key');
    await writeFile(signingPath,pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
    await writeFile(deliveryPath,randomBytes(32).toString('base64url'),{mode:0o600});
    await writeFile(limiterPath,randomBytes(32).toString('base64url'),{mode:0o600});
    const socket=createServer(); await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
    const targetPort=socket.address().port; await new Promise(resolve=>socket.close(resolve));
    const env={...process.env, IDENTITY_DATABASE_URL:process.env.IDENTITY_TEST_DATABASE_URL, HOST:'127.0.0.1',PORT:String(targetPort),
      IDENTITY_WEB_ORIGIN:config.webOrigin,IDENTITY_ISSUER:'https://identity.test',IDENTITY_SIGNING_KID:'entrypoint-test',
      IDENTITY_SIGNING_KEY_FILE:signingPath,IDENTITY_DELIVERY_KEY_FILE:deliveryPath,IDENTITY_LIMITER_KEY_FILE:limiterPath,
      IDENTITY_TLS_KEY_FILE:join(tls.directory,'server.key'),IDENTITY_TLS_CERT_FILE:join(tls.directory,'server.crt'),IDENTITY_TLS_CA_FILE:join(tls.directory,'ca.crt'),
      IDENTITY_CALLER_FINGERPRINTS:JSON.stringify(tls.callers)};
    delete env.IDENTITY_PREVIOUS_JWKS_FILE;
    await promisify(execFile)(process.execPath,['dist/migrate.js'],{cwd:join(__dirname,'..'),env,windowsHide:true,timeout:10000});
    const child=spawn(process.execPath,['dist/main.js'],{cwd:join(__dirname,'..'),env,windowsHide:true,stdio:'ignore'});
    const exited=new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});
    try {
      const deadline=Date.now()+10000; let ready=false;
      while(Date.now()<deadline && child.exitCode===null) {
        try { const response=await call('/health/ready',{targetPort}); if(response.status===200){ready=true;break;} } catch {}
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      assert.equal(ready,true,'Independent configured Identity process did not become ready');
      const jwks=await call('/internal/v1/identity/jwks',{caller:'catalog',targetPort}); assert.equal(jwks.status,200); assert.equal(jwks.body.keys[0].kid,'entrypoint-test');
    } finally { if(child.exitCode===null && child.signalCode===null)child.kill(); await exited; }
  });
  await t.test('Google identity is restricted to BFF and keeps a stable account without claiming existing emails', async () => {
    const path = '/internal/v1/identity/google-login';
    const body = { subject: 'fixture-google-subject', email: 'google-fixture@gmail.com', displayName: 'Google Demo' };
    await error(path, { method: 'POST', body, caller: 'catalog' }, 403, 'SERVICE_FORBIDDEN');
    const first = await success(path, { method: 'POST', body }, 200, 'Profile');
    assert.deepEqual(first.body.roles, ['USER']);
    assert.equal(first.body.emailVerified, true);
    const cookie = first.headers['set-cookie'][0].split(';')[0];
    await success('/api/v1/me', { headers: { cookie } }, 200, 'Profile');
    const second = await success(path, { method: 'POST', body, headers: { cookie } }, 200, 'Profile');
    assert.equal(second.body.id, first.body.id);
    await error('/api/v1/me', { headers: { cookie } }, 401, 'UNAUTHENTICATED');
    await error(path, { method: 'POST', body: { ...body, subject: 'other-subject' } }, 409, 'GOOGLE_EMAIL_EXISTS');
    await error(path, { method: 'POST', body: { ...body, email: 'changed@gmail.com' } }, 401, 'INVALID_CREDENTIALS');
    await register('existing-password@example.test');
    await error(path, { method: 'POST', body: { ...body, subject: 'new-subject', email: 'existing-password@example.test' } }, 409, 'GOOGLE_EMAIL_EXISTS');
  });
  await t.test('Argon2id local benchmark (not a deployment load gate)',async () => {
    const start=performance.now(); for(let i=0;i<5;i++)await hashPassword(password);
    t.diagnostic('Argon2id 19MiB/t2/p1 sequential mean '+((performance.now()-start)/5).toFixed(1)+' ms on '+process.version+' '+process.platform+'/'+process.arch);
  });
});
