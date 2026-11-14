import { createProgressApp } from './app.js';
import { loadAuthConfig } from './auth.js';
import { loadCatalogClient } from './modules/logs/catalog-client.js';
import { loadWorkoutClient } from './modules/logs/workout-client.js';
import {loadPoseClient} from './modules/logs/pose-client.js';
import { connectDatabase } from './database.js';
async function main(){
  const port=Number(process.env.PROGRESS_PORT??3445);if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid Progress port');
  const auth=await loadAuthConfig(),catalog=await loadCatalogClient(),workout=await loadWorkoutClient(),pose=await loadPoseClient(),db=connectDatabase();
  let app:Awaited<ReturnType<typeof createProgressApp>>|undefined;
  try{
    if(!(await db.query('SELECT 1 FROM progress_migrations WHERE version=1')).rows.length)throw Error('Migration required');
    app=await createProgressApp(db,auth,catalog,workout,undefined,pose);await app.listen(port,process.env.PROGRESS_HOST??'127.0.0.1');
    let closing=false;const stop=()=>{if(closing)return;closing=true;void app!.close().finally(()=>db.close());};
    process.once('SIGINT',stop);process.once('SIGTERM',stop);console.log('Progress ready');
  }catch(error){await app?.close();await db.close();throw error;}
}
main().catch(()=>{console.error('Progress startup failed; verify config, certificates and schema');process.exitCode=1;});
