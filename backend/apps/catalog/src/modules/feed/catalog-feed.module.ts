import { Module, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { AdminConfig, AdminRequest } from '../admin/admin-auth.js';
import { reject } from '../admin/admin-contract.js';
import type { CatalogFeed } from './catalog-feed.service.js';
import { createCatalogFeedControllers } from './catalog-feed.controller.js';

export function createCatalogFeedModule(feed: CatalogFeed, config: AdminConfig) {
  class FeedGuard implements CanActivate {
    canActivate(context: ExecutionContext) {
      const req = context.switchToHttp().getRequest<AdminRequest>();
      if (!req.socket.encrypted || !req.socket.authorized) reject(401, 'SERVICE_UNAUTHENTICATED');
      if (!config.ragFingerprints?.includes(req.socket.getPeerCertificate().fingerprint256)) reject(403, 'SERVICE_FORBIDDEN');
      return true;
    }
  }

  const { FeedController } = createCatalogFeedControllers(feed, FeedGuard);

  @Module({ controllers: [FeedController], providers: [FeedGuard] })
  class CatalogFeedModule {}

  return CatalogFeedModule;
}
