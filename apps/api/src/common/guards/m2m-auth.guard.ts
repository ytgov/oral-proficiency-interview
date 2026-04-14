import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

/**
 * Route-level guard that enforces Auth0 M2M (client-credentials) authentication.
 * Apply with @UseGuards(M2MAuthGuard) on specific endpoints.
 */
@Injectable()
export class M2MAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    if (user.gty !== 'client-credentials') {
      throw new ForbiddenException('This endpoint requires machine-to-machine authentication');
    }

    return true;
  }
}
