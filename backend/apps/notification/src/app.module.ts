import { Module, type CanActivate, type DynamicModule, type Type } from '@nestjs/common';
import type { Database } from './database.js';
import type { NotificationConfig } from './config.js';
import type { Notifications } from './modules/inbox/notifications.service.js';
import { createNotificationInboxModule } from './modules/inbox/inbox.module.js';
import { createNotificationHealthModule } from './modules/notification-health.module.js';

@Module({})
export class NotificationModule {
  static register(db: Database, config: Pick<NotificationConfig, 'probeFingerprints' | 'auth'>, consumerReady: () => boolean, notifications: Notifications, OwnerGuard: Type<CanActivate>): DynamicModule {
    return {
      module: NotificationModule,
      imports: [
        createNotificationHealthModule(db, config, consumerReady),
        ...(config.auth ? [createNotificationInboxModule(notifications, OwnerGuard)] : []),
      ],
    };
  }
}
