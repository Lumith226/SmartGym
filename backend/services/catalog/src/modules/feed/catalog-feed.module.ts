import { Controller, Module, UseGuards, Get, Param, Query, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { AdminConfig, AdminRequest } from '../admin/admin-auth.js';
import { reject } from '../admin/admin-contract.js';
import type { CatalogFeed } from './feed.js';

export function createCatalogFeedModule(feed: CatalogFeed, config: AdminConfig) {
  class FeedGuard implements CanActivate {
    canActivate(context: ExecutionContext) {
      const req = context.switchToHttp().getRequest<AdminRequest>();
      if (!req.socket.encrypted || !req.socket.authorized) reject(401, 'SERVICE_UNAUTHENTICATED');
      if (!config.ragFingerprints?.includes(req.socket.getPeerCertificate().fingerprint256)) reject(403, 'SERVICE_FORBIDDEN');
      return true;
    }
  }

  @Controller('internal/v1/catalog/snapshots')
  @UseGuards(FeedGuard)
  class FeedController {
    @Get('head')
    head(@Query() query: Record<string, unknown>) {
      if (Object.keys(query).length) reject(400, 'BAD_REQUEST');
      return feed.head();
    }

    @Get(':revision')
    snapshot(@Param('revision') revision: string, @Query() query: Record<string, unknown>) {
      if (Object.keys(query).length) reject(400, 'BAD_REQUEST');
      return feed.snapshot(revision);
    }
  }

  @Module({ controllers: [FeedController], providers: [FeedGuard] })
  class CatalogFeedModule {}

  return CatalogFeedModule;
}
