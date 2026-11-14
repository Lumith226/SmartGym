import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { authenticateAdmin, type AdminConfig, type AdminRequest } from './admin-auth.js';

export function createAdminGuard(config: AdminConfig) {
  class AdminGuard implements CanActivate {
    async canActivate(context: ExecutionContext) {
      const req = context.switchToHttp().getRequest<AdminRequest>();
      req.actor = await authenticateAdmin(req, config);
      return true;
    }
  }

  return AdminGuard;
}
