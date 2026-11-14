import { CanActivate, Module, type Type } from '@nestjs/common';
import type { EngineHttp } from '../../engine.js';
import { LiveStore } from './live-store.js';
import { createPoseLiveControllers } from './pose-live.controller.js';

export function createPoseLiveModule(live: LiveStore, engine: EngineHttp | undefined, Guard: Type<CanActivate>) {
  const { PoseLiveController } = createPoseLiveControllers(live, engine, Guard);

  @Module({ controllers: [PoseLiveController], providers: [Guard] })
  class PoseLiveModule {}

  return PoseLiveModule;
}
