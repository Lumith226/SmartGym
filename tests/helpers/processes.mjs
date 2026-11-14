import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export function startProcess(args, cwd, env) {
  const child = spawn(process.execPath, args, {
    cwd: resolve(cwd), env: { ...process.env, ...env }, windowsHide: true,
  });
  let output = '';
  let failure;
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  child.once('error', error => { failure = error; });
  return {
    child,
    async waitFor(url) {
      for (let attempt = 0; attempt < 150; attempt++) {
        if (failure) throw failure;
        if (child.exitCode !== null || child.signalCode !== null) throw new Error(output);
        try {
          if ((await fetch(url, { signal: AbortSignal.timeout(500) })).ok) return;
        } catch {}
        await delay(100);
      }
      throw new Error('Service startup deadline exceeded: ' + output);
    },
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null || failure) return;
      await new Promise((resolve, reject) => {
        child.once('exit', resolve);
        child.once('error', reject);
        child.kill();
      });
    },
  };
}
