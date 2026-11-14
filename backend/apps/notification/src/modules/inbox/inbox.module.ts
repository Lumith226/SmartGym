import { CanActivate, Module, type Type } from '@nestjs/common';
import { Notifications } from './notifications.service.js';
import { createNotificationInboxControllers } from './inbox.controller.js';

export function createNotificationInboxModule(notifications: Notifications, OwnerGuard: Type<CanActivate>) {
  const { InboxController } = createNotificationInboxControllers(notifications, OwnerGuard);

  @Module({ controllers: [InboxController], providers: [OwnerGuard] })
  class NotificationInboxModule {}

  return NotificationInboxModule;
}
