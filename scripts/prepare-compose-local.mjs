import { execFile } from 'node:child_process';
import { createHash, randomBytes, X509Certificate } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { prepareComposeRagIndex } from './prepare-compose-rag-index.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = resolve(root, '.local/compose');
const services = ['catalog', 'identity', 'notification', 'workout', 'progress', 'pose'];
const roles = [...services, 'web', 'broker', 'mail', 'rag', 'catalog-objects', 'pose-objects'];
const openssl = process.env.OPENSSL_BINARY || 'openssl';
const exec = promisify(execFile);
const caDir = join(directory, 'ca');
const caKey = join(caDir, 'ca.key');
const caCert = join(caDir, 'ca.crt');
const exists = path => access(path).then(() => true, error => {
  if (error.code === 'ENOENT') return false;
  throw error;
});
const secret = () => randomBytes(32).toString('base64url');
const run = args => exec(openssl, args, { cwd: directory, windowsHide: true, timeout: 30000 });
const writeNew = (path, value) => writeFile(path, value, { flag: 'wx', mode: 0o600 });
const saveIfMissing = async (path, value) => {
  if (!await exists(path)) await writeNew(path, value);
};

async function createCertificate(role, kind, authority = { key: caKey, cert: caCert }, stem = kind) {
  const target = join(directory, role, stem);
  const key = target + '.key';
  const cert = target + '.crt';
  if (await exists(key) && await exists(cert)) return;
  if (await exists(key) || await exists(cert)) throw new Error('Incomplete certificate pair for ' + role + '/' + kind);
  const ext = target + '.ext';
  const csr = target + '.csr';
  await saveIfMissing(ext, 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=' +
    (kind === 'server' ? 'serverAuth\nsubjectAltName=DNS:' + role + ',IP:127.0.0.1,DNS:localhost\n' : 'clientAuth\n'));
  await run(['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', csr, '-subj', '/CN=smartgym-' + role + '-' + kind]);
  await run(['x509', '-req', '-in', csr, '-CA', authority.cert, '-CAkey', authority.key, '-set_serial', '0x' + randomBytes(16).toString('hex'),
    '-out', cert, '-days', '365', '-extfile', ext]);
}

const fingerprints = {};
await mkdir(caDir, { recursive: true });
if (!await exists(caKey) && !await exists(caCert)) {
  await run(['req', '-x509', '-newkey', 'rsa:3072', '-nodes', '-keyout', caKey, '-out', caCert,
    '-subj', '/CN=SmartGym Local CA', '-days', '1825', '-addext', 'basicConstraints=critical,CA:TRUE',
    '-addext', 'keyUsage=critical,keyCertSign,cRLSign']);
}
if (!await exists(caKey) || !await exists(caCert)) throw new Error('Incomplete local CA');
const ca = await readFile(caCert);
for (const role of roles) {
  const folder = join(directory, role);
  await mkdir(folder, { recursive: true });
  await createCertificate(role, 'server');
  await createCertificate(role, 'client');
  await saveIfMissing(join(folder, 'ca.crt'), ca);
  fingerprints[role] = [new X509Certificate(await readFile(join(folder, 'client.crt'))).fingerprint256];
}
const identityDir = join(directory, 'identity');
const signing = join(identityDir, 'signing.key');
if (!await exists(signing)) await run(['genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048', '-out', signing]);
await saveIfMissing(join(identityDir, 'delivery.key'), secret());
await saveIfMissing(join(identityDir, 'limiter.key'), secret());
await saveIfMissing(join(directory, 'web', 'authjs-secret'), secret());

const issuer = 'https://identity:3002';
const webOrigin = 'https://127.0.0.1:3100';
const certs = (prefix, kind) => Object.fromEntries([
  [prefix + '_KEY_FILE', '/run/secrets/' + kind + '.key'],
  [prefix + '_CERT_FILE', '/run/secrets/' + kind + '.crt'],
  [prefix + '_CA_FILE', '/run/secrets/ca.crt'],
]);
const allow = role => JSON.stringify(fingerprints[role]);
const identityClient = prefix => ({
  [prefix + '_ORIGIN']: issuer, [prefix + '_ISSUER']: issuer, ...certs(prefix + '_TLS', 'client'),
});
const environments = {
  identity: {
    IDENTITY_WEB_ORIGIN: webOrigin, IDENTITY_ISSUER: issuer, IDENTITY_SIGNING_KID: 'smartgym-local',
    IDENTITY_SIGNING_KEY_FILE: '/run/secrets/signing.key', IDENTITY_DELIVERY_KEY_FILE: '/run/secrets/delivery.key',
    IDENTITY_LIMITER_KEY_FILE: '/run/secrets/limiter.key', ...certs('IDENTITY_TLS', 'server'),
    IDENTITY_CALLER_FINGERPRINTS: JSON.stringify({
      bff: fingerprints.web, catalog: fingerprints.catalog, notification: fingerprints.notification,
      workout: fingerprints.workout, progress: fingerprints.progress, pose: fingerprints.pose,
    }),
  },
  catalog: {
    ...certs('CATALOG_ADMIN_TLS', 'server'), ...identityClient('CATALOG_IDENTITY'),
    CATALOG_ADMIN_BFF_FINGERPRINTS: allow('web'),
    CATALOG_REF_FINGERPRINTS: JSON.stringify([...fingerprints.workout, ...fingerprints.progress]),
    CATALOG_MEDIA_FFMPEG: '/usr/bin/ffmpeg', CATALOG_MEDIA_FFPROBE: '/usr/bin/ffprobe',
  },
  workout: {
    ...certs('WORKOUT_TLS', 'server'), ...identityClient('WORKOUT_IDENTITY'), ...certs('WORKOUT_CATALOG_TLS', 'client'),
    WORKOUT_BFF_FINGERPRINTS: allow('web'), WORKOUT_PROGRESS_FINGERPRINTS: allow('progress'), WORKOUT_CATALOG_ORIGIN: 'https://catalog:3101',
  },
  progress: {
    ...certs('PROGRESS_TLS', 'server'), ...identityClient('PROGRESS_IDENTITY'),
    ...certs('PROGRESS_CATALOG_TLS', 'client'), ...certs('PROGRESS_WORKOUT_TLS', 'client'), ...certs('PROGRESS_POSE_TLS', 'client'),
    PROGRESS_BFF_FINGERPRINTS: allow('web'), PROGRESS_CATALOG_ORIGIN: 'https://catalog:3101',
    PROGRESS_WORKOUT_ORIGIN: 'https://workout:3444', PROGRESS_POSE_ORIGIN: 'https://pose:3443',
  },
  pose: {
    ...certs('POSE_TLS', 'server'), ...identityClient('POSE_IDENTITY'),
    POSE_BFF_FINGERPRINTS: allow('web'), POSE_PROGRESS_FINGERPRINTS: allow('progress'), POSE_CONSENT_VERSION: 'pose-v1',
    POSE_FFMPEG: '/usr/bin/ffmpeg', POSE_FFPROBE: '/usr/bin/ffprobe', POSE_TEMP_DIR: '/tmp',
  },
  notification: {
    ...certs('NOTIFICATION_TLS', 'server'), ...certs('NOTIFICATION_IDENTITY', 'client'),
    NOTIFICATION_IDENTITY_ORIGIN: issuer, NOTIFICATION_IDENTITY_ISSUER: issuer, NOTIFICATION_WEB_ORIGIN: webOrigin,
    NOTIFICATION_BFF_FINGERPRINTS: allow('web'), NOTIFICATION_PROBE_FINGERPRINTS: allow('web'),
  },
  web: {
    BFF_WEB_KEY_FILE: '/run/secrets/server.key', BFF_WEB_CERT_FILE: '/run/secrets/server.crt',
    ...certs('BFF_IDENTITY', 'client'), BFF_IDENTITY_ORIGIN: issuer,
    ...certs('BFF_CATALOG_ADMIN', 'client'), BFF_CATALOG_ADMIN_ORIGIN: 'https://catalog:3101',
    ...certs('BFF_WORKOUT', 'client'), BFF_WORKOUT_ORIGIN: 'https://workout:3444',
    ...certs('BFF_PROGRESS', 'client'), BFF_PROGRESS_ORIGIN: 'https://progress:3445',
    ...certs('BFF_NOTIFICATION', 'client'), BFF_NOTIFICATION_ORIGIN: 'https://notification:3003',
    ...certs('BFF_POSE_TLS', 'client'), BFF_POSE_ORIGIN: 'https://pose:3443',
  },
};
const envText = values => Object.entries(values).map(([name, value]) => name + '=' + value).join('\n') + '\n';
for (const [role, values] of Object.entries(environments)) await saveIfMissing(join(directory, role + '.env'), envText(values));
const engineAuthority = { key: join(caDir, 'pose-engine.key'), cert: join(caDir, 'pose-engine.crt') };
if (!await exists(engineAuthority.key) && !await exists(engineAuthority.cert)) {
  await run(['req', '-x509', '-newkey', 'rsa:3072', '-nodes', '-keyout', engineAuthority.key, '-out', engineAuthority.cert,
    '-subj', '/CN=SmartGym Pose Engine CA', '-days', '1825', '-addext', 'basicConstraints=critical,CA:TRUE',
    '-addext', 'keyUsage=critical,keyCertSign,cRLSign']);
}
await mkdir(join(directory, 'pose-engine'), { recursive: true });
await createCertificate('pose-engine', 'server', engineAuthority);
await createCertificate('pose', 'client', engineAuthority, 'engine-client');
await createCertificate('web', 'client', engineAuthority, 'pose-studio-client');
const engineCa = await readFile(engineAuthority.cert);
await saveIfMissing(join(directory, 'pose-engine', 'ca.crt'), engineCa);
await saveIfMissing(join(directory, 'pose', 'engine-ca.crt'), engineCa);
await saveIfMissing(join(directory, 'web', 'pose-studio-ca.crt'), engineCa);
await saveIfMissing(join(directory, 'pose.engine.env'), envText({
  POSE_ENGINE_ORIGIN: 'https://pose-engine:8001',
  POSE_ENGINE_TLS_KEY_FILE: '/run/secrets/engine-client.key',
  POSE_ENGINE_TLS_CERT_FILE: '/run/secrets/engine-client.crt',
  POSE_ENGINE_TLS_CA_FILE: '/run/secrets/engine-ca.crt',
}));
const ragPath = resolve(root, process.env.SMARTGYM_RAG_SOURCE || '../smart-gym-ai/services/kb_rag');
const revisionFiles = ['app.py', 'knowledge.py', 'chatbot.py', 'presentation.py', 'grounding.py', 'observation_chat.py'];
const revision = createHash('sha256').update(Buffer.concat(await Promise.all(
  revisionFiles.map(file => readFile(join(ragPath, 'kb_service', file))),
))).digest('hex').slice(0, 16);
const ragTokenFile = join(directory, 'web', 'rag-token');
await saveIfMissing(ragTokenFile, secret());
await prepareComposeRagIndex(join(ragPath, 'data', 'index'), join(directory, 'rag-index'), join(directory, 'web', 'rag-sources.json'));
await saveIfMissing(join(directory, 'rag.provider.env'), envText({ KB_INTERNAL_TOKEN: (await readFile(ragTokenFile, 'utf8')).trim() }));
await saveIfMissing(join(directory, 'web.rag.env'), envText({
  BFF_RAG_ORIGIN: 'https://rag:8010', BFF_RAG_RUNTIME_REVISION: revision, ...certs('BFF_RAG_TLS', 'client'),
  BFF_RAG_TOKEN_FILE: '/run/secrets/rag-token', BFF_RAG_SOURCES_FILE: '/run/secrets/rag-sources.json',
}));
for (const role of ['catalog', 'pose']) {
  const objects = role + '-objects';
  const folder = join(directory, objects);
  const credentialsFile = join(directory, objects + '.env');
  const access = 'smartgym-' + role + '-' + randomBytes(8).toString('hex');
  await saveIfMissing(credentialsFile, envText({ RUSTFS_ACCESS_KEY: access, RUSTFS_SECRET_KEY: secret() }));
  const credentials = Object.fromEntries((await readFile(credentialsFile, 'utf8')).trim().split(/\r?\n/).map(line => line.split('=')));
  await saveIfMissing(join(folder, 'rustfs_key.pem'), await readFile(join(folder, 'server.key')));
  await saveIfMissing(join(folder, 'rustfs_cert.pem'), await readFile(join(folder, 'server.crt')));
  const endpoint = 'https://' + objects + ':9000';
  const shared = { AWS_ACCESS_KEY_ID: credentials.RUSTFS_ACCESS_KEY, AWS_SECRET_ACCESS_KEY: credentials.RUSTFS_SECRET_KEY,
    NODE_EXTRA_CA_CERTS: '/run/secrets/ca.crt', S3_BOOTSTRAP_ENDPOINT: endpoint, S3_BOOTSTRAP_BUCKET: 'smartgym-' + role + '-private' };
  await saveIfMissing(join(directory, role + '.storage.env'), envText(role === 'catalog' ? {
    ...shared, CATALOG_MEDIA_S3_ENDPOINT: endpoint, CATALOG_MEDIA_BUCKET: shared.S3_BOOTSTRAP_BUCKET,
    CATALOG_MEDIA_REGION: 'us-east-1', CATALOG_MEDIA_CLAMD_HOST: 'clamav', CATALOG_MEDIA_CLAMD_PORT: '3310',
  } : {
    ...shared, POSE_S3_ENDPOINT: endpoint, POSE_S3_BUCKET: shared.S3_BOOTSTRAP_BUCKET, POSE_S3_REGION: 'us-east-1',
  }));
}
const brokerDir = join(directory, 'broker');
const authFile = join(directory, 'broker-credentials.json');
const publishers = {
  identity: 'identity\\.email-action\\.requested\\.v1',
  workout: 'workout\\.occurrence\\.changed\\.v1',
  catalog: 'catalog\\.exercise\\.(published|updated|unpublished)\\.v1',
};
const names = [...Object.keys(publishers), 'notification'];
await saveIfMissing(authFile, JSON.stringify(Object.fromEntries(names.map(name => [name, secret()]))));
const brokerPasswords = JSON.parse(await readFile(authFile, 'utf8'));
const vhost = 'smartgym';
const events = 'smartgym.events.v1';
const topology = { vhosts: [{ name: vhost }], users: [], permissions: [], topic_permissions: [],
  exchanges: [{ name: events, vhost, type: 'topic', durable: true, auto_delete: false, internal: false, arguments: {} }],
  queues: [], bindings: [] };
for (const name of names) {
  const salt = randomBytes(4);
  const hash = createHash('sha256').update(salt).update(brokerPasswords[name]).digest();
  topology.users.push({ name, password_hash: Buffer.concat([salt, hash]).toString('base64'),
    hashing_algorithm: 'rabbit_password_hashing_sha256', tags: [] });
  topology.permissions.push({ user: name, vhost, configure: '^$', write: publishers[name] ? '^smartgym\\.events\\.v1$' : '^$',
    read: name === 'notification' ? '^smartgym\\.notification\\.(email|workout)\\.v1$' : '^$' });
  if (publishers[name]) topology.topic_permissions.push({ user: name, vhost, exchange: events, write: '^' + publishers[name] + '$', read: '^$' });
}
for (const [kind, queueBase, routingKeys] of [
  ['email', 'smartgym.notification.email', ['identity.email-action.requested.v1']],
  ['workout', 'smartgym.notification.workout', ['workout.occurrence.changed.v1']],
  ['catalog', 'smartgym.rag.catalog', ['catalog.exercise.published.v1', 'catalog.exercise.updated.v1', 'catalog.exercise.unpublished.v1']],
]) {
  const dlx = 'smartgym.' + kind + '.dlx.v1';
  const queue = queueBase + '.v1';
  const dead = queueBase + '.dlq.v1';
  topology.exchanges.push({ name: dlx, vhost, type: 'direct', durable: true, auto_delete: false, internal: false, arguments: {} });
  topology.queues.push(
    { name: queue, vhost, durable: true, auto_delete: false, arguments: { 'x-queue-type': 'quorum',
      'x-dead-letter-exchange': dlx, 'x-dead-letter-routing-key': 'rejected' } },
    { name: dead, vhost, durable: true, auto_delete: false, arguments: { 'x-queue-type': 'quorum' } },
  );
  for (const [source, destination, routing_key] of [[dlx, dead, 'rejected'], ...routingKeys.map(key => [events, queue, key])]) {
    topology.bindings.push({ source, vhost, destination, destination_type: 'queue', routing_key, arguments: {} });
  }
}
await saveIfMissing(join(brokerDir, 'definitions.json'), JSON.stringify(topology));
for (const name of names) {
  const values = { [name.toUpperCase() + '_AMQP_URL']: 'amqps://' + name + ':' + brokerPasswords[name] + '@broker:5671/' + vhost,
    AMQP_CA_FILE: '/run/secrets/ca.crt' };
  if (name === 'notification') Object.assign(values, {
    SMTP_HOST: 'mail', SMTP_PORT: '1025', SMTP_FROM: 'smartgym@smartgym.test', SMTP_SECURE: 'false', SMTP_CA_FILE: '/run/secrets/ca.crt',
  });
  await saveIfMissing(join(directory, name + '.infrastructure.env'), envText(values));
}
const database = { SMARTGYM_WEB_ORIGIN: webOrigin };
for (const name of services) {
  const password = secret();
  database[name.toUpperCase() + '_DB_PASSWORD'] = password;
  database[name.toUpperCase() + '_DATABASE_URL'] = 'postgresql://smartgym_' + name + ':' + password + '@' + name + '-db:5432/smartgym_' + name;
}
await saveIfMissing(join(root, '.env'), envText(database));
console.log('Created missing local Compose credentials and internal service configuration.');
console.log('Review the RAG source registry before enabling citation responses.');
