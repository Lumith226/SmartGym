const { readFileSync, statSync } = require('node:fs');
const { get } = require('node:https');
const { get: httpGet } = require('node:http');

const [mode, target, credential = 'self'] = process.argv.slice(2);
if (mode === 'worker') {
  const path = '/tmp/smartgym-worker-ready';
  const maxAge = Number(target) * 1000;
  process.exit(Date.now() - statSync(path).mtimeMs <= maxAge ? 0 : 1);
} else {
  const url = new URL(target);
  const tls = '/run/secrets';
  const read = name => readFileSync(tls + '/' + name);
  const options = url.protocol === 'http:' ? {} : {
    ca: read('ca.crt'),
    ...(credential === 'self' ? { key: read('client.key'), cert: read('client.crt') } : {}),
  };
  const req = (url.protocol === 'http:' ? httpGet : get)(url, options, res => {
    res.resume();
    res.once('end', () => process.exit(res.statusCode === 200 ? 0 : 1));
  });
  req.setTimeout(3000, () => req.destroy());
  req.on('error', () => process.exit(1));
}
