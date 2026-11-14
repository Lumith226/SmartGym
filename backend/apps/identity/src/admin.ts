import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDatabase } from './database.js';
import { loadConfig } from './config.js';
import { Identity } from './modules/accounts/identity.service.js';

// Explicit operator command. Database/secret access is the authorization boundary; never expose as HTTP.
async function main() {
  const [id, role, actor] = process.argv.slice(2), uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
  if (!uuid.test(id ?? '') || !['USER','ADMIN'].includes(role) || !(actor === 'operator' || uuid.test(actor ?? ''))) throw new Error('Usage: admin <userId> USER|ADMIN <actorId|operator>');
  const config = await loadConfig(), database = connectDatabase();
  try {
    const identity = new Identity(database, { keys: config.keys, webOrigin: config.webOrigin }); await identity.initialize();
    await identity.setRole(id, role as 'USER' | 'ADMIN', actor === 'operator' ? null : actor);
    console.log('Role updated with audit; active sessions revoked when changed');
  } finally { await database.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => { console.error('Role update refused; verify arguments, account status and last-admin protection'); process.exitCode = 1; });
