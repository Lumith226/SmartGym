import { CanActivate, Module, type Type } from '@nestjs/common';
import { Logs } from './logs.service.js';
import { createProgressLogsControllers } from './logs.controller.js';

export function createProgressLogsModule(logs: Logs, OwnerGuard: Type<CanActivate>) {
  const { ControllerLogs, PoseImportController } = createProgressLogsControllers(logs, OwnerGuard);

  @Module({ controllers: [ControllerLogs, PoseImportController], providers: [OwnerGuard] })
  class ProgressLogsModule {}

  return ProgressLogsModule;
}
