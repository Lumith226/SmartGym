import { Body, CanActivate, Controller, Get, Headers, Param, Post, Req, Res, UseGuards, type Type } from '@nestjs/common';
import { reject } from '../../contract.js';
import type { EngineHttp } from '../../engine.js';
import { LiveStore } from './live-store.js';
import { body, id, key, type Request, type Response } from '../pose-http.js';

export function createPoseLiveControllers(live: LiveStore, engine: EngineHttp | undefined, Guard: Type<CanActivate>) {
  @Controller()
  @UseGuards(Guard)
  class PoseLiveController {
    @Post('api/v1/pose/live-sessions')
    async createLive(@Req() req: Request, @Body() value: unknown, @Headers('idempotency-key') operationKey: unknown,
      @Res({ passthrough: true }) res: Response) {
      if (!engine) reject(503, 'POSE_LIVE_DISABLED');
      const result = await live.create(req.actor, body('PoseLiveCreate', value), key(operationKey));
      res.setHeader('Location', '/api/v1/pose/live-sessions/' + result.id);
      return result;
    }

    @Get('api/v1/pose/live-sessions/:id')
    getLive(@Req() req: Request, @Param('id') value: string) { return live.get(req.actor, id(value)); }
  }

  return { PoseLiveController };
}
