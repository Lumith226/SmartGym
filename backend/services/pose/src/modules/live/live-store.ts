import { createHash, randomUUID } from 'node:crypto';
import type { Database } from '../../database.js';
import { iso, modelOf, reject, valid } from '../../contract.js';
import { command } from '../analysis/jobs.js';

export const LIVE = { protocol: 'smartgym.pose.v1', maxFps: 10, maxFrameBytes: 262144, maxWidth: 640, maxHeight: 480 } as const;
type LiveInput = { exerciseId: string; consentVersion: string };
export type LiveRow = Record<string, unknown> & { id: string; owner_id: string; exercise_id: string; model_sha256: string;
  config_version: string; consent_version: string; status: string; expires_at: Date; connection_token: string; summary?: unknown };
export type Rep = { sequence: number; endedAtMs: number };

export class LiveStore {
  constructor(readonly db: Database, readonly consent: string) {}

  async create(owner: string, input: LiveInput, key: string) {
    const model = modelOf(input.exerciseId);
    if (input.consentVersion !== this.consent) reject(422, 'CONSENT_VERSION_UNSUPPORTED');
    const id = await command(this.db, owner, 'live-create', key, input, async db => {
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,73013))', [owner]);
      await db.query(`UPDATE pose_live_sessions SET status=CASE WHEN expires_at<=now() THEN 'EXPIRED' ELSE 'FAILED' END,
        connection_token=NULL,lease_until=NULL WHERE owner_id=$1 AND status IN ('READY','ACTIVE')
        AND (expires_at<=now() OR lease_until<=now())`, [owner]);
      const id = randomUUID();
      const row = await db.query(`INSERT INTO pose_live_sessions(id,owner_id,exercise_id,model_sha256,config_version,consent_version,status,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,'READY',now()+interval '5 minutes') ON CONFLICT DO NOTHING RETURNING id`,
        [id, owner, input.exerciseId, model.sha256, model.schemaVersion, input.consentVersion]);
      if (!row.rows.length) reject(409, 'LIVE_SESSION_LIMIT');
      return id;
    });
    return this.get(owner, id);
  }

  async get(owner: string, id: string) {
    const row = (await this.db.query<LiveRow>(`SELECT s.*,r.summary,CASE
        WHEN s.status IN ('READY','ACTIVE') AND s.expires_at<=now() THEN 'EXPIRED'
        WHEN s.status='ACTIVE' AND s.lease_until<=now() THEN 'FAILED' ELSE s.status END AS state
      FROM pose_live_sessions s LEFT JOIN pose_results r ON r.live_session_id=s.id AND r.expires_at>now()
      WHERE s.id=$1 AND s.owner_id=$2`, [id, owner])).rows[0];
    if (!row) reject(404, 'NOT_FOUND');
    if (row.state === 'COMPLETED' && !row.summary) reject(410, 'RESULT_EXPIRED');
    return { id: row.id, exerciseId: row.exercise_id, status: row.state,
      streamPath: `/api/v1/pose/live-sessions/${row.id}/stream`, maxFps: LIVE.maxFps,
      maxFrameBytes: LIVE.maxFrameBytes, expiresAt: iso(row.expires_at), ...(row.summary ? { result: row.summary } : {}) };
  }

  claim(owner: string, id: string) {
    return this.db.transaction(async db => {
      const current = (await db.query<LiveRow & { expired: boolean }>(`SELECT *,expires_at<=now() AS expired
        FROM pose_live_sessions WHERE owner_id=$1 AND id=$2 FOR UPDATE`, [owner, id])).rows[0];
      if (!current) reject(404, 'NOT_FOUND');
      if (current.expired || current.status === 'EXPIRED') reject(410, 'LIVE_SESSION_EXPIRED');
      if (current.status !== 'READY') reject(409, 'LIVE_SESSION_UNAVAILABLE');
      const model = modelOf(current.exercise_id);
      if (current.consent_version !== this.consent || current.model_sha256 !== model.sha256 || current.config_version !== model.schemaVersion) reject(409, 'LIVE_SESSION_CONFIG_CHANGED');
      return (await db.query<LiveRow>(`UPDATE pose_live_sessions SET status='ACTIVE',connection_token=$2,
        expires_at=now()+interval '15 minutes',lease_until=now()+interval '30 seconds' WHERE id=$1 RETURNING *`, [id, randomUUID()])).rows[0];
    });
  }

  async heartbeat(row: LiveRow) {
    return (await this.db.query(`UPDATE pose_live_sessions SET lease_until=now()+interval '30 seconds'
      WHERE id=$1 AND status='ACTIVE' AND connection_token=$2 AND expires_at>now() AND lease_until>now() RETURNING id`, [row.id, row.connection_token])).rows.length > 0;
  }

  async fail(row: LiveRow) {
    await this.db.query(`UPDATE pose_live_sessions SET status=CASE WHEN expires_at<=now() THEN 'EXPIRED' ELSE 'FAILED' END,
      connection_token=NULL,lease_until=NULL WHERE id=$1 AND status='ACTIVE' AND connection_token=$2`, [row.id, row.connection_token]);
  }

  finish(row: LiveRow, count: number | null, reps: Rep[], raw: Record<string, unknown> | null) {
    return this.db.transaction(async db => {
      const active = (await db.query(`UPDATE pose_live_sessions SET status='COMPLETED',connection_token=NULL,lease_until=NULL
        WHERE id=$1 AND status='ACTIVE' AND connection_token=$2 AND lease_until>now() AND expires_at>now() RETURNING id`, [row.id, row.connection_token])).rows.length;
      if (!active) reject(409, 'LIVE_SESSION_UNAVAILABLE');
      const id = randomUUID(), completedAt = new Date(), expiresAt = new Date(+completedAt + 30 * 86400000);
      const summary = { id, source: 'LIVE', exerciseId: row.exercise_id, modelVersion: 'ST-GCNpp-V4', configVersion: row.config_version,
        repCount: count, repCountStatus: count === null ? 'UNAVAILABLE' : 'AVAILABLE', reps,
        formStatus: raw ? 'ASSESSED' : 'INSUFFICIENT_EVIDENCE',
        limitations: ['Kết quả phản ánh các khung hình đã xử lý trong phiên.', 'Nhãn chỉ áp dụng cho đoạn quan sát được.'],
        completedAt: iso(completedAt), expiresAt: iso(expiresAt) };
      if (!valid('PoseResult', summary)) throw new Error('Invalid live summary');
      const sourceHash = createHash('sha256').update('smartgym.pose.live:' + row.id).digest('hex');
      await db.query(`INSERT INTO pose_results(id,live_session_id,owner_id,summary,raw_model_result,source_sha256,model_sha256,schema_version,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [id,row.id,row.owner_id,JSON.stringify(summary),
        raw ? JSON.stringify({ ...raw, source: { live_session_sha256: sourceHash }, model_provenance: { model_sha256: row.model_sha256 } }) : null,
        sourceHash,row.model_sha256,row.config_version,expiresAt]);
      return id;
    });
  }
}
