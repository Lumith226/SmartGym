import { Controller, UseGuards, Get, Param, Query, type CanActivate, type Type } from '@nestjs/common';
import { reject } from '../admin/admin-contract.js';
import type { CatalogFeed } from './catalog-feed.service.js';

export function createCatalogFeedControllers(feed: CatalogFeed, FeedGuard: Type<CanActivate>) {
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

  return { FeedController };
}
