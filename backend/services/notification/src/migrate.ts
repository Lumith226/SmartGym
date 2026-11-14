import { readFile,readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Database,connectDatabase } from './database.js';
export async function migrate(db:Database){
  const directory=new URL('../migrations/',import.meta.url);
  const files=(await readdir(directory)).filter(f=>/^\d{3}_[a-z0-9_]+\.sql$/.test(f)).sort();
  const migrations=await Promise.all(files.map(async file=>{const sql=await readFile(new URL(file,directory),'utf8');return{version:Number(file.slice(0,3)),sql,checksum:createHash('sha256').update(sql).digest('hex')};}));
  if(!migrations.length||migrations.some((m,i)=>m.version!==i+1))throw new Error('Invalid migration sequence');
  await db.transaction(async client=>{
    await client.query('SELECT pg_advisory_xact_lock(75001)');
    const exists=(await client.query<{present:string|null}>("SELECT to_regclass('public.notification_migrations')::text AS present")).rows[0].present;
    const applied=exists?(await client.query<{version:number;checksum:string}>('SELECT version,checksum FROM notification_migrations ORDER BY version')).rows:[];
    for(const[i,row]of applied.entries())if(row.version!==i+1||row.checksum!==migrations[i]?.checksum)throw new Error('Notification migration checksum mismatch');
    for(const m of migrations.slice(applied.length)){await client.query(m.sql);await client.query('INSERT INTO notification_migrations(version,checksum) VALUES($1,$2)',[m.version,m.checksum]);}
  });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const db=connectDatabase();migrate(db).finally(()=>db.close()).catch(()=>{console.error('Notification migration failed');process.exitCode=1;});
}
