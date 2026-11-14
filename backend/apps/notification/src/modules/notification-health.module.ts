import { Module } from '@nestjs/common';
import { Database } from '../database.js';
import { NotificationConfig } from '../config.js';
import { HealthController } from './notification-health.controller.js';

export function createNotificationHealthModule(db: Database, config: Pick<NotificationConfig, 'probeFingerprints'>, consumerReady: () => boolean) {
  @Module({ controllers: [HealthController], providers: [{ provide: 'DATABASE', useValue: db }, { provide: 'NOTIFICATION_HEALTH_CONFIG', useValue: config }, { provide: 'NOTIFICATION_CONSUMER_READY', useValue: consumerReady }] })
  class NotificationHealthModule {}

  return NotificationHealthModule;
}
