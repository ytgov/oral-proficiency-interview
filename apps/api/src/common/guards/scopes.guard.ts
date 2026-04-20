import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SCOPES_KEY } from '../decorators/scopes.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class ScopesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredScopes = this.reflector.getAllAndOverride<string[]>(SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredScopes || requiredScopes.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // Any valid M2M token (client-credentials grant) passes the JWT validation
    // for signature, audience, issuer, and expiry. Trust it for scope-protected
    // routes without requiring Auth0-side permission grants.
    if (user.gty === 'client-credentials') {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (requiredRoles && user.roles) {
      const hasRole = requiredRoles.some((role) => user.roles.includes(role));
      if (hasRole) {
        return true;
      }
    }

    if (!user.permissions || !Array.isArray(user.permissions)) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'Insufficient permissions',
        error: 'FORBIDDEN',
        requiredScopes,
      });
    }

    const hasScope = requiredScopes.some((scope) => user.permissions.includes(scope));

    if (!hasScope) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'Insufficient permissions',
        error: 'FORBIDDEN',
        requiredScopes,
      });
    }

    return true;
  }
}
