import type { Database } from '../../database.js';
import { lockOwner } from './schedules.service.js';
import { ownedSchedule, reconcile } from './schedule-changes.service.js';
import { fingerprint } from '../plans/plans.service.js';

export class ScheduleMaterializer {
  constructor(private readonly db: Database, private readonly now = () => new Date()) {}

  async tick(limit = 20) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw Error('Invalid projection batch size');
    const now = this.now();
    const rows = (await this.db.query<{ id: string; owner_user_id: string }>(`SELECT id,owner_user_id FROM workout_schedules
      WHERE status='ACTIVE' AND next_projection_at<=$1 ORDER BY next_projection_at,id LIMIT $2`, [now, limit])).rows;
    let processed = 0, failed = 0;
    for (const item of rows) {
      try {
        const applied = await this.db.transaction(async db => {
          await lockOwner(db, item.owner_user_id);
          const row = await ownedSchedule(db, item.owner_user_id, item.id);
          if (row.status !== 'ACTIVE' || (row.next_projection_at as Date).getTime() > now.getTime()) return false;
          await reconcile(db, row, now, false);
          const current = await ownedSchedule(db, item.owner_user_id, item.id);
          if (fingerprint(row.conflicts) !== fingerprint(current.conflicts))
            await db.query('UPDATE workout_schedules SET version=version+1,updated_at=now() WHERE id=$1', [row.id]);
          await db.query(`UPDATE workout_schedules SET last_projected_at=$2,next_projection_at=$2::timestamptz+interval '1 minute',projection_error=NULL WHERE id=$1`, [row.id, now]);
          return true;
        });
        if (applied) processed++;
      } catch {
        failed++;
        // Keep a durable failure and backoff so one bad schedule does not starve other owners.
        await this.db.query(`UPDATE workout_schedules SET next_projection_at=$2::timestamptz+interval '1 minute',projection_error='PROJECTION_FAILED'
          WHERE id=$1 AND status='ACTIVE' AND next_projection_at<=$2`, [item.id, now]);
      }
    }
    return { processed, failed };
  }
}
