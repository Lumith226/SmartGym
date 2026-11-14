import {createHash} from 'node:crypto';
import type {Database,SqlClient} from '../../database.js';
import {fingerprint,iso} from '../admin/admin-store.js';
import {reject} from '../admin/admin-contract.js';
import {validFeed} from './feed-contract.js';
type Head=Record<string,unknown>&{revision:string;aggregate_version:string;created_at:Date};
type Exercise=Record<string,unknown>&{id:string;nameVi:string;summary:string;instructions:string[];commonMistakes?:string[];publishedRevision:string};
type Snapshot={revision:string;aggregateVersion:number;publishedAt:string;exercises:Exercise[];sources:unknown[];tombstones:unknown[]};
const sourceId=(id:string)=>'ex_'+createHash('sha256').update(id).digest('hex');
async function head(db:SqlClient){const row=(await db.query<Head>('SELECT revision,aggregate_version,created_at FROM publication_revisions ORDER BY aggregate_version DESC LIMIT 1')).rows[0];if(!row)reject(503,'CATALOG_NOT_BOOTSTRAPPED');return row;}
async function mediaVisible(db:SqlClient,ids?:string[]){
  const rows=await db.query(`SELECT 1 FROM revision_media p JOIN exercises e ON e.id=p.exercise_id AND e.current_published_version=p.version
    LEFT JOIN support_revisions r ON r.media_id=p.media_id AND r.version=p.support_version
    LEFT JOIN media_uploads u ON u.id=r.upload_id LEFT JOIN media_assets m ON m.id=p.media_id
    WHERE e.lifecycle='PUBLISHED' AND ($1::text[] IS NULL OR e.id=ANY($1::text[])) AND
    (u.id IS NULL OR u.revoked_at IS NOT NULL OR u.status<>'READY' OR u.verified_at IS NULL OR
      u.object_version IS DISTINCT FROM r.object_version OR r.document->>'rightsStatus' IS DISTINCT FROM 'APPROVED' OR m.lifecycle IS DISTINCT FROM 'PUBLISHED') LIMIT 1`,[ids??null]);
  return rows.rows.length===0;
}
export class CatalogFeed{
  constructor(private readonly db:Database){}
  async head(){return this.db.transaction(async db=>{
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    const h=await head(db);if(!await mediaVisible(db))reject(503,'CATALOG_VISIBILITY_UNAVAILABLE');
    const result={revision:h.revision,aggregateVersion:Number(h.aggregate_version),publishedAt:iso(h.created_at)};
    if(!validFeed('CatalogHead',result))reject(503,'CATALOG_FEED_UNAVAILABLE');return result;
  });}
  async snapshot(revision:string){
    if(!/^[A-Za-z0-9._-]{1,120}$/.test(revision)||revision==='head')reject(400,'BAD_REQUEST');
    for(let attempt=0;attempt<3;attempt++)try{return await this.capture(revision);}catch(error){
      const failure=error as {code?:string;constraint?:string};if(failure.code!=='40001'&&failure.constraint!=='catalog_feed_snapshots_pkey')throw error;
    }
    reject(503,'CATALOG_FEED_UNAVAILABLE');
  }
  private async capture(revision:string){
    return this.db.transaction(async db=>{
      await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await db.query('SELECT pg_advisory_xact_lock(73002)');const h=await head(db);
      const cached=(await db.query<{publication:Snapshot;sha256:string;expired:boolean}>('SELECT publication,sha256,expires_at<=now() AS expired FROM catalog_feed_snapshots WHERE revision=$1',[revision])).rows[0];
      if(cached){
        if(cached.expired&&h.revision!==revision)reject(410,'SNAPSHOT_EXPIRED');
        if(!validFeed('CatalogSnapshot',cached.publication)||fingerprint(cached.publication)!==cached.sha256)reject(503,'CATALOG_FEED_UNAVAILABLE');
        const invalid=await db.query(`SELECT 1 FROM jsonb_to_recordset($1::jsonb) AS x(id text,"publishedRevision" text)
          LEFT JOIN exercises e ON e.id=x.id LEFT JOIN exercise_revisions r ON r.exercise_id=e.id AND r.version=e.current_published_version
          WHERE e.lifecycle IS DISTINCT FROM 'PUBLISHED' OR r.document->>'publishedRevision' IS DISTINCT FROM x."publishedRevision" LIMIT 1`,[JSON.stringify(cached.publication.exercises)]);
        if(invalid.rows.length||!await mediaVisible(db,cached.publication.exercises.map(e=>e.id)))reject(410,'SNAPSHOT_WITHDRAWN');return cached.publication;
      }
      if(h.revision!==revision){const known=(await db.query('SELECT 1 FROM publication_revisions WHERE revision=$1',[revision])).rows.length;reject(known?410:404,known?'SNAPSHOT_NOT_RETAINED':'NOT_FOUND');}
      if(!await mediaVisible(db))reject(410,'SNAPSHOT_WITHDRAWN');
      const exercises=(await db.query<{document:Exercise}>(`SELECT r.document FROM exercises e JOIN exercise_revisions r ON r.exercise_id=e.id AND r.version=e.current_published_version
        WHERE e.lifecycle='PUBLISHED' ORDER BY e.id LIMIT 50001`)).rows.map(r=>r.document);
      const sources=exercises.map(e=>{const body=[e.summary,...e.instructions,...(e.commonMistakes??[])].join('\n\n');return {sourceId:sourceId(e.id),exerciseId:e.id,title:e.nameVi,
        bodyMarkdown:body,sourceRef:'catalog:'+e.id+':'+e.publishedRevision,digestSha256:createHash('sha256').update(body).digest('hex'),publicationStatus:'PUBLISHED'};});
      const tombstones=(await db.query<{exercise_id:string;reason:string}>(`SELECT exercise_id,reason FROM (
        SELECT DISTINCT ON(exercise_id) exercise_id,action,coalesce(reason,'ARCHIVED') AS reason
        FROM publication_revisions p WHERE exercise_id IS NOT NULL ORDER BY exercise_id,aggregate_version DESC) latest
        WHERE action='catalog.exercise.unpublished.v1' ORDER BY exercise_id LIMIT 50001`)).rows
        .map(e=>({exerciseId:e.exercise_id,sourceIds:[sourceId(e.exercise_id)],reason:e.reason}));
      const publication={revision,aggregateVersion:Number(h.aggregate_version),publishedAt:iso(h.created_at),exercises,sources,tombstones};
      if(!validFeed('CatalogSnapshot',publication)||Buffer.byteLength(JSON.stringify(publication))>16*1024*1024)reject(503,'CATALOG_FEED_UNAVAILABLE');
      await db.query('INSERT INTO catalog_feed_snapshots(revision,publication,sha256) VALUES($1,$2,$3)',[revision,JSON.stringify(publication),fingerprint(publication)]);return publication;
    });
  }
}
