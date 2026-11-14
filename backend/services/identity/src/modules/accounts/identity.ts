import { randomUUID } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import { Database, SqlClient } from '../../database.js';
import { hashPassword, verifyPassword, isLegacyPasswordHash, hashSecret, opaqueSecret, IdentityKeys } from './crypto.js';
import { correlationId } from '../../request-context.js';

const DAY = 86400000;
export function denied(code: string, status: number): never { throw new HttpException({ code }, status); }
type User = Record<string, unknown> & { id: string; email: string; display_name: string; time_zone: string;
  role: string; status: string; email_verified_at: Date | null; created_at: Date; version: number };
type Action = Record<string, unknown> & { id: string; user_id: string; purpose: string; encrypted_delivery_secret: string | null;
  expires_at: Date; used_at: Date | null; superseded_at: Date | null };
export interface IdentityOptions { keys: IdentityKeys; webOrigin: string; now?: () => Date }

export class Identity {
  private readonly dummy: Promise<string>;
  readonly now: () => Date;
  constructor(readonly database: Database, readonly options: IdentityOptions) {
    this.now = options.now ?? (() => new Date());
    this.dummy = hashPassword(opaqueSecret());
  }
  async initialize() { await this.dummy; }
  private profile(user: User) {
    return { id: user.id, email: user.email, displayName: user.display_name, timeZone: user.time_zone,
      roles: [user.role], emailVerified: !!user.email_verified_at, createdAt: new Date(user.created_at).toISOString() };
  }
  async limit(scope: string, identifier: string, max: number) {
    const now = this.now(), hash = this.options.keys.bucket(scope + ':' + identifier);
    // One atomic upsert per bucket, shared across all service replicas. No raw identifier stored.
    const result = await this.database.query<{ hits: number }>(
      `INSERT INTO identity_rate_limits(bucket_hash,window_started_at,hits) VALUES($1,$2,1)
       ON CONFLICT(bucket_hash) DO UPDATE SET
         hits=CASE WHEN identity_rate_limits.window_started_at<=$2::timestamptz-interval '15 minutes' THEN 1 ELSE identity_rate_limits.hits+1 END,
         window_started_at=CASE WHEN identity_rate_limits.window_started_at<=$2::timestamptz-interval '15 minutes' THEN $2 ELSE identity_rate_limits.window_started_at END
       RETURNING hits`, [hash, now]);
    if (result.rows[0].hits > max) denied('RATE_LIMITED', 429);
  }
  private async audit(client: SqlClient, user: User, action: string, at: Date, actor: string | null = user.id) {
    await client.query('INSERT INTO identity_audit(id,actor_id,target_user_id,action,outcome,version,at,correlation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [randomUUID(), actor, user.id, action, 'SUCCESS', user.version, at, correlationId()]);
  }
  private async createAction(client: SqlClient, userId: string, purpose: string, now: Date) {
    await client.query(`UPDATE email_actions SET superseded_at=$3,encrypted_delivery_secret=NULL
      WHERE user_id=$1 AND purpose=$2 AND used_at IS NULL AND superseded_at IS NULL`, [userId, purpose, now]);
    const id = randomUUID(), token = opaqueSecret(), expires = new Date(now.getTime() + (purpose === 'VERIFY_EMAIL' ? DAY : 30 * 60000));
    const encrypted = this.options.keys.encrypt(token, id + ':' + purpose);
    await client.query(`INSERT INTO email_actions(id,user_id,purpose,token_hash,encrypted_delivery_secret,expires_at,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [id, userId, purpose, hashSecret(token), encrypted, expires, now]);
    const eventId = randomUUID(), requestId = correlationId();
    const envelope = { id: eventId, type: 'identity.email-action.requested.v1', producer: 'identity', schemaVersion: 1,
      aggregateId: id, aggregateVersion: 1, occurredAt: now.toISOString(), correlationId: requestId,
      data: { deliveryRef: id, purpose, expiresAt: expires.toISOString() } };
    await client.query(`INSERT INTO outbox_events(event_id,type,schema_version,aggregate_id,aggregate_version,occurred_at,correlation_id,payload,available_at)
      VALUES($1,$2,1,$3,1,$4,$5,$6::jsonb,$4)`, [eventId, envelope.type, id, now, requestId, JSON.stringify(envelope)]);
  }
  async register(body: Record<string, string>) {
    const email = body.email.toLowerCase(), encoded = await hashPassword(body.password), now = this.now();
    await this.database.transaction(async client => {
      const inserted = await client.query<User>(`INSERT INTO users(id,email,email_normalized,display_name,created_at,updated_at)
        VALUES($1,$2,$2,$3,$4,$4) ON CONFLICT(email_normalized) DO NOTHING RETURNING *`, [randomUUID(), email, body.displayName.trim(), now]);
      const user = inserted.rows[0];
      if (!user) return;
      await client.query('INSERT INTO credentials(user_id,password_hash,password_changed_at) VALUES($1,$2,$3)', [user.id, encoded, now]);
      await this.createAction(client, user.id, 'VERIFY_EMAIL', now);
      await this.audit(client, user, 'REGISTER', now);
    });
  }
  async requestEmail(email: string, purpose: 'VERIFY_EMAIL' | 'RESET_PASSWORD') {
    await this.database.transaction(async client => {
      const { rows } = await client.query<User>('SELECT * FROM users WHERE email_normalized=$1 FOR UPDATE', [email.toLowerCase()]);
      const user = rows[0];
      if (!user || user.status === 'DISABLED' || (purpose === 'VERIFY_EMAIL' ? user.status !== 'PENDING' : user.status !== 'ACTIVE')) return;
      await this.createAction(client, user.id, purpose, this.now());
    });
  }
  async consume(token: string, purpose: 'VERIFY_EMAIL' | 'RESET_PASSWORD', password?: string) {
    const tokenHash = hashSecret(token);
    const candidate = (await this.database.query<Action>('SELECT * FROM email_actions WHERE token_hash=$1 AND purpose=$2', [tokenHash, purpose])).rows[0];
    if (!candidate) denied('ACTION_EXPIRED', 410);
    const encoded = password === undefined ? undefined : await hashPassword(password);
    await this.database.transaction(async client => {
      // All operations lock user before action/session, including reset, login and role changes.
      const user = (await client.query<User>('SELECT * FROM users WHERE id=$1 FOR UPDATE', [candidate.user_id])).rows[0];
      const action = (await client.query<Action>('SELECT * FROM email_actions WHERE id=$1 FOR UPDATE', [candidate.id])).rows[0];
      const now = this.now();
      if (!user || user.status === 'DISABLED' || !action || action.used_at || action.superseded_at ||
        new Date(action.expires_at) <= now || (purpose === 'VERIFY_EMAIL' ? user.status !== 'PENDING' : user.status !== 'ACTIVE')) denied('ACTION_EXPIRED', 410);
      await client.query('UPDATE email_actions SET used_at=$2,encrypted_delivery_secret=NULL WHERE id=$1', [action.id, now]);
      if (purpose === 'VERIFY_EMAIL') {
        await client.query("UPDATE users SET status='ACTIVE',email_verified_at=$2,updated_at=$2,version=version+1 WHERE id=$1", [user.id, now]);
      } else {
        await client.query('UPDATE credentials SET password_hash=$2,password_changed_at=$3,credential_version=credential_version+1 WHERE user_id=$1', [user.id, encoded, now]);
        await client.query('UPDATE sessions SET revoked_at=$2 WHERE user_id=$1 AND revoked_at IS NULL', [user.id, now]);
        await client.query('UPDATE users SET updated_at=$2,version=version+1 WHERE id=$1', [user.id, now]);
      }
      user.version++;
      await this.audit(client, user, purpose, now);
    });
  }
  async login(body: Record<string, string>, previous?: string) {
    const row = (await this.database.query<User & { password_hash: string | null; credential_version: number }>(
      'SELECT u.*,c.password_hash,c.credential_version FROM users u JOIN credentials c ON c.user_id=u.id WHERE email_normalized=$1', [body.email.toLowerCase()])).rows[0];
    const valid = await verifyPassword(body.password, row?.password_hash ?? await this.dummy);
    if (!row?.password_hash || !valid) denied('INVALID_CREDENTIALS', 401);
    const upgradedHash = isLegacyPasswordHash(row.password_hash) ? await hashPassword(body.password) : undefined;
    return this.database.transaction(async client => {
      const user = (await client.query<User>('SELECT * FROM users WHERE id=$1 FOR UPDATE', [row.id])).rows[0];
      const current = (await client.query<{ credential_version: number }>('SELECT credential_version FROM credentials WHERE user_id=$1', [row.id])).rows[0];
      if (current.credential_version !== row.credential_version || user.status === 'DISABLED') denied('INVALID_CREDENTIALS', 401);
      if (user.status !== 'ACTIVE' || !user.email_verified_at) denied('EMAIL_UNVERIFIED', 403);
      if (upgradedHash) await client.query('UPDATE credentials SET password_hash=$2 WHERE user_id=$1 AND password_hash=$3', [row.id, upgradedHash, row.password_hash]);
      return this.openSession(client, user, current.credential_version, 'LOGIN', previous);
    });
  }
  async loginWithGoogle(body: Record<string, string>, previous?: string) {
    const email = body.email.toLowerCase(), now = this.now();
    return this.database.transaction(async client => {
      const inserted = await client.query<User>(`INSERT INTO users(id,email,email_normalized,display_name,google_subject,status,email_verified_at,created_at,updated_at)
        VALUES($1,$2,$2,$3,$4,'ACTIVE',$5,$5,$5) ON CONFLICT DO NOTHING RETURNING *`,
      [randomUUID(), email, body.displayName.trim(), body.subject, now]);
      const created = inserted.rows[0];
      if (created) {
        await client.query('INSERT INTO credentials(user_id,password_changed_at) VALUES($1,$2)', [created.id, now]);
        await this.audit(client, created, 'REGISTER_GOOGLE', now);
        return this.openSession(client, created, 1, 'LOGIN_GOOGLE', previous);
      }
      const user = (await client.query<User>('SELECT * FROM users WHERE google_subject=$1 FOR UPDATE', [body.subject])).rows[0];
      if (!user) denied('GOOGLE_EMAIL_EXISTS', 409);
      if (user.status !== 'ACTIVE' || user.email !== email) denied('INVALID_CREDENTIALS', 401);
      const current = (await client.query<{ credential_version: number }>('SELECT credential_version FROM credentials WHERE user_id=$1', [user.id])).rows[0];
      return this.openSession(client, user, current.credential_version, 'LOGIN_GOOGLE', previous);
    });
  }
  private async openSession(client: SqlClient, user: User, version: number, action: string, previous?: string) {
    const now = this.now(), handle = opaqueSecret(), expires = new Date(now.getTime() + 7 * DAY);
    if (previous) await client.query('UPDATE sessions SET revoked_at=$3 WHERE user_id=$1 AND secret_hash=$2 AND revoked_at IS NULL', [user.id, hashSecret(previous), now]);
    await client.query(`INSERT INTO sessions(id,user_id,secret_hash,expires_at,last_seen_at,created_at,credential_version)
      VALUES($1,$2,$3,$4,$5,$5,$6)`, [randomUUID(), user.id, hashSecret(handle), expires, now, version]);
    await this.audit(client, user, action, now);
    return { profile: this.profile(user), handle };
  }
  private async session<T>(handle: string | undefined, action: (client: SqlClient, user: User, expires: Date) => Promise<T>): Promise<T> {
    if (!handle || !/^[A-Za-z0-9_-]{43}$/.test(handle)) denied('UNAUTHENTICATED', 401);
    return this.database.transaction(async client => {
      const hash = hashSecret(handle!);
      const candidate = (await client.query<{ user_id: string }>('SELECT user_id FROM sessions WHERE secret_hash=$1', [hash])).rows[0];
      if (!candidate) denied('UNAUTHENTICATED', 401);
      const user = (await client.query<User>('SELECT * FROM users WHERE id=$1 FOR UPDATE', [candidate.user_id])).rows[0];
      const session = (await client.query<{ id: string; expires_at: Date; last_seen_at: Date; revoked_at: Date | null; credential_version: number; current_version: number }>(
        'SELECT s.*,c.credential_version AS current_version FROM sessions s JOIN credentials c ON c.user_id=s.user_id WHERE s.secret_hash=$1 FOR UPDATE OF s', [hash])).rows[0];
      const now = this.now();
      if (!user || user.status !== 'ACTIVE' || !user.email_verified_at || !session || session.revoked_at ||
        new Date(session.expires_at) <= now || new Date(session.last_seen_at).getTime() + DAY <= now.getTime() ||
        session.credential_version !== session.current_version) denied('UNAUTHENTICATED', 401);
      await client.query('UPDATE sessions SET last_seen_at=$2 WHERE id=$1', [session.id, now]);
      return action(client, user, new Date(session.expires_at));
    });
  }
  getMe(handle?: string) { return this.session(handle, async (_client, user) => this.profile(user)); }
  introspect(handle: string) { return this.session(handle, async (_client, user, expires) => this.options.keys.assertion(user.id, user.role, this.now(), expires)); }
  updateMe(handle: string | undefined, body: Record<string, string>) {
    return this.session(handle, async (client, user) => {
      const now = this.now();
      const updated = (await client.query<User>(`UPDATE users SET display_name=coalesce($2,display_name),time_zone=coalesce($3,time_zone),updated_at=$4,version=version+1 WHERE id=$1 RETURNING *`,
        [user.id, body.displayName?.trim() ?? null, body.timeZone ?? null, now])).rows[0];
      await this.audit(client, updated, 'PROFILE_UPDATED', now);
      return this.profile(updated);
    });
  }
  async logout(handle?: string) {
    if (handle && /^[A-Za-z0-9_-]{43}$/.test(handle)) await this.database.query('UPDATE sessions SET revoked_at=$2 WHERE secret_hash=$1 AND revoked_at IS NULL', [hashSecret(handle), this.now()]);
  }
  async resolveDelivery(id: string) {
    return this.database.transaction(async client => {
      const action = (await client.query<Action>('SELECT * FROM email_actions WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!action) denied('NOT_FOUND', 404);
      if (action.used_at || action.superseded_at || new Date(action.expires_at) <= this.now() || !action.encrypted_delivery_secret) denied('ACTION_EXPIRED', 410);
      const user = (await client.query<User>('SELECT * FROM users WHERE id=$1', [action.user_id])).rows[0];
      if (!user || user.status === 'DISABLED') denied('ACTION_EXPIRED', 410);
      const token = this.options.keys.decrypt(action.encrypted_delivery_secret!, action.id + ':' + action.purpose);
      const route = action.purpose === 'VERIFY_EMAIL' ? '/xac-minh-email' : '/dat-lai-mat-khau';
      return { deliveryRef: id, purpose: action.purpose, recipient: user.email,
        actionUrl: this.options.webOrigin + route + '#token=' + token, expiresAt: new Date(action.expires_at).toISOString() };
    });
  }
  async contact(id: string) {
    const user = (await this.database.query<User>("SELECT * FROM users WHERE id=$1 AND status='ACTIVE'", [id])).rows[0];
    if (!user || !user.email_verified_at) denied('NOT_FOUND', 404);
    return { userId: user.id, email: user.email, emailVerified: true, timeZone: user.time_zone };
  }
  async cleanup() {
    const now = this.now();
    await this.database.query('UPDATE email_actions SET encrypted_delivery_secret=NULL WHERE expires_at<=$1 AND encrypted_delivery_secret IS NOT NULL', [now]);
    await this.database.query("DELETE FROM identity_rate_limits WHERE window_started_at<$1::timestamptz-interval '1 day'", [now]);
  }
  async setRole(id: string, role: 'USER' | 'ADMIN', actorId: string | null) {
    await this.database.transaction(async client => {
      await client.query('SELECT pg_advisory_xact_lock(74002)');
      const user = (await client.query<User>("SELECT * FROM users WHERE id=$1 AND status='ACTIVE' FOR UPDATE", [id])).rows[0];
      if (!user) denied('NOT_FOUND', 404);
      if (user.role === role) return;
      if (user.role === 'ADMIN' && role === 'USER') {
        const admins = await client.query("SELECT id FROM users WHERE role='ADMIN' AND status='ACTIVE'");
        if (admins.rows.length <= 1) denied('LAST_ADMIN', 409);
      }
      const now = this.now();
      await client.query('UPDATE users SET role=$2,version=version+1,updated_at=$3 WHERE id=$1', [id, role, now]);
      await client.query('UPDATE sessions SET revoked_at=$2 WHERE user_id=$1 AND revoked_at IS NULL', [id, now]);
      user.version++;
      await this.audit(client, user, 'ROLE_' + role, now, actorId);
    });
  }
}
