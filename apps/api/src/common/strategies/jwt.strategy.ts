import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${configService.get('AUTH0_ISSUER')}.well-known/jwks.json`,
      }),
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      audience: configService.get('AUTH0_AUDIENCE'),
      issuer: configService.get('AUTH0_ISSUER'),
      algorithms: ['RS256'],
    });
  }

  async validate(payload: { sub?: string; email?: string; permissions?: string[]; scope?: string; gty?: string }) {
    if (!payload.sub) {
      throw new UnauthorizedException('Invalid token payload');
    }

    // Fetch user from database to get isActive status and roles
    const user = await this.prisma.user.findUnique({
      where: { externalAuthId: payload.sub },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    // If user exists, return full user data including isActive
    if (user) {
      return {
        id: user.id,
        externalAuthId: user.externalAuthId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isActive: user.isActive,
        roles: user.userRoles.map((ur) => ur.role.name),
        permissions: payload.permissions || payload.scope?.split(' ') || [],
        gty: payload.gty,
      };
    }

    // If user doesn't exist yet, return minimal info for upsert on /me endpoint
    // Note: isActive will be checked after upsert
    return {
      externalAuthId: payload.sub,
      email: payload.email,
      isActive: true, // New users are active by default
      permissions: payload.permissions || payload.scope?.split(' ') || [],
      gty: payload.gty,
    };
  }
}
