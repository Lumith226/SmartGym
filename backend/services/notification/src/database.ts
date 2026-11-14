import { Pool } from 'pg';
export interface SqlClient {query<T extends Record<string,unknown>=Record<string,unknown>>(sql:string,values?:unknown[]):Promise<{rows:T[]}>}
export interface Database extends SqlClient {transaction<T>(action:(client:SqlClient)=>Promise<T>):Promise<T>;close():Promise<void>}
export function connectDatabase(connectionString=process.env.NOTIFICATION_DATABASE_URL):Database {
  if(!connectionString)throw new Error('NOTIFICATION_DATABASE_URL required');
  const pool=new Pool({connectionString,max:10,connectionTimeoutMillis:3000,statement_timeout:5000,idle_in_transaction_session_timeout:5000});
  return {query:(sql,values)=>pool.query(sql,values),async transaction(action){
    const client=await pool.connect();try{await client.query('BEGIN');const result=await action(client);await client.query('COMMIT');return result;}
    catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  },close:()=>pool.end()};
}
