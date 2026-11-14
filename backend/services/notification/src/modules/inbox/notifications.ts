import {createHash} from 'node:crypto';
import type {Database} from '../../database.js';
import {reject,uuid,valid,type PreferencesInput} from '../../contracts.js';
import {ReminderPreferences} from './reminders.js';

type Row=Record<string,unknown>&{id:string;kind:string;occurrence_id:string;created_at:Date;read_at:Date|null;render_data:{title:string;message:string};cursor_at:string};
export class Notifications{
  readonly preferences:ReminderPreferences;
  constructor(private readonly db:Database,private readonly now=()=>new Date()){this.preferences=new ReminderPreferences(db,now);}
  async list(owner:string,query:Record<string,unknown>){
    if(Object.keys(query).some(k=>!['unreadOnly','limit','cursor'].includes(k)))reject(400,'BAD_REQUEST');
    const rawLimit=query.limit??'20';
    if(typeof rawLimit!=='string'||!/^[1-9][0-9]{0,2}$/.test(rawLimit)||Number(rawLimit)>100)reject(400,'BAD_REQUEST');
    const limit=Number(rawLimit),rawUnread=query.unreadOnly??'false';if(rawUnread!=='true'&&rawUnread!=='false')reject(400,'BAD_REQUEST');
    const unread=rawUnread==='true',scope=createHash('sha256').update(JSON.stringify([owner,unread,limit])).digest('hex');
    let cursor:{scope:string;at:string;id:string}|undefined;
    if(query.cursor!==undefined){try{
      if(typeof query.cursor!=='string'||!/^[A-Za-z0-9_-]{1,1024}$/.test(query.cursor))throw Error();
      cursor=JSON.parse(Buffer.from(query.cursor,'base64url').toString('utf8'));
      if(!cursor||cursor.scope!==scope||typeof cursor.id!=='string'||!uuid.test(cursor.id)||typeof cursor.at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(cursor.at)||!Number.isFinite(Date.parse(cursor.at))||Object.keys(cursor).sort().join(',')!=='at,id,scope')throw Error();
    }catch{reject(400,'INVALID_CURSOR');}}
    const result=(await this.db.query<{page:Row[];unread_count:string}>(`WITH page AS (
      SELECT id,kind,occurrence_id,created_at,read_at,render_data,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at
      FROM notifications WHERE user_id=$1 AND (NOT $2::boolean OR read_at IS NULL)
        AND ($3::timestamptz IS NULL OR (created_at,id)<($3::timestamptz,$4::uuid))
      ORDER BY created_at DESC,id DESC LIMIT $5)
      SELECT coalesce((SELECT jsonb_agg(page ORDER BY created_at DESC,id DESC) FROM page),'[]'::jsonb) AS page,
        (SELECT count(*)::text FROM notifications WHERE user_id=$1 AND read_at IS NULL) AS unread_count`,
    [owner,unread,cursor?.at??null,cursor?.id??null,limit+1])).rows[0];
    const rows=result.page,items=rows.slice(0,limit).map(row=>({id:row.id,kind:row.kind,title:row.render_data.title,message:row.render_data.message,occurrenceId:row.occurrence_id,
      createdAt:new Date(row.created_at).toISOString(),readAt:row.read_at?new Date(row.read_at).toISOString():null}));
    const last=rows[limit-1],data={items,unreadCount:Number(result.unread_count),nextCursor:rows.length>limit?Buffer.from(JSON.stringify({scope,at:last.cursor_at,id:last.id})).toString('base64url'):null};
    if(!valid('NotificationPage',data))reject(503,'NOTIFICATION_UNAVAILABLE');return data;
  }
  async read(owner:string,id:string){
    if(!uuid.test(id))reject(400,'BAD_REQUEST');
    if(!(await this.db.query('UPDATE notifications SET read_at=coalesce(read_at,$3) WHERE user_id=$1 AND id=$2 RETURNING id',[owner,id,this.now()])).rows.length)reject(404,'NOT_FOUND');
  }
  async getPreferences(owner:string){return this.document(await this.preferences.get(owner));}
  async updatePreferences(owner:string,input:unknown,version:number){
    try{return this.document(await this.preferences.update(owner,input as PreferencesInput,version));}
    catch(error){if(error instanceof Error&&error.message==='PREFERENCE_VERSION_CONFLICT')reject(412,'VERSION_MISMATCH');if(error instanceof Error&&error.message==='Invalid reminder preferences')reject(422,'VALIDATION_ERROR');throw error;}
  }
  private document(row:Record<string,unknown>){return {reminderInAppEnabled:row.reminder_in_app_enabled,reminderEmailEnabled:row.reminder_email_enabled,leadMinutes:row.lead_minutes,version:row.version};}
}
