import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Controller, Get, Inject, Req, HttpException } from '@nestjs/common';
import { TLSSocket } from 'node:tls';
import { Database } from '../database.js';
import { NotificationConfig } from '../config.js';

const selfProbeFingerprint = process.env.SMARTGYM_SELF_PROBE === 'true'
  ? new X509Certificate(readFileSync('/run/secrets/client.crt')).fingerprint256 : undefined;

@Controller('health')
export class HealthController {
  constructor(
    @Inject('DATABASE') private readonly db: Database,
    @Inject('NOTIFICATION_HEALTH_CONFIG') private readonly config: Pick<NotificationConfig, 'probeFingerprints'>,
    @Inject('NOTIFICATION_CONSUMER_READY') private readonly consumerReady: () => boolean,
  ) {}

  private authorize(request: { socket: TLSSocket }) {
    const socket = request.socket;
    if (process.env.SMARTGYM_SELF_PROBE === 'true' && socket.authorized && socket.remoteAddress === '127.0.0.1' &&
        socket.getPeerCertificate().fingerprint256 === selfProbeFingerprint) return;
    if (!socket.authorized || !this.config.probeFingerprints.includes(socket.getPeerCertificate().fingerprint256)) {
      throw new HttpException({ code: 'SERVICE_FORBIDDEN' }, 403);
    }
  }
  @Get('live') live(@Req() req: { socket: TLSSocket }) {
    this.authorize(req);
    return { status: 'alive' };
  }

  @Get('ready') async ready(@Req() req: { socket: TLSSocket }) {
    this.authorize(req);
    try {
      const result = await this.db.query('SELECT version FROM notification_migrations WHERE version=2');
      if (!result.rows.length || !this.consumerReady()) throw new Error('Dependency unavailable');
      return { status: 'ready' };
    } catch {
      throw new HttpException({ code: 'SERVICE_UNAVAILABLE' }, 503);
    }
  }
}
