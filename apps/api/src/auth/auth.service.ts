import { HttpStatus, Injectable } from '@nestjs/common';
import type { AuthContext, CreateGuestResponse, UpgradeGuestResponse } from '@open-ludo/contracts';
import jwt, { JsonWebTokenError, JwtPayload } from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { ApiException } from '../common/errors.js';
import { getEnv } from '../common/env.js';
import { UsersService } from '../users/users.service.js';

const GUEST_ISSUER = 'open-ludo-guest';

type GuestClaims = JwtPayload & {
  sub: string;
  kind: 'guest';
  displayName: string;
};

type SupabaseClaims = JwtPayload & {
  sub: string;
  email?: string;
  user_metadata?: {
    full_name?: string;
    name?: string;
    preferred_username?: string;
  };
};

@Injectable()
export class AuthService {
  constructor(private readonly usersService: UsersService) {}

  async createGuest(displayName: string): Promise<CreateGuestResponse> {
    const trimmed = displayName.trim();
    if (trimmed.length < 2 || trimmed.length > 24) {
      throw new ApiException('INVALID_NAME', 'Display name must be between 2 and 24 characters.');
    }

    const env = getEnv();
    const subjectId = `guest_${randomUUID()}`;
    const expiresAt = new Date(Date.now() + env.GUEST_JWT_EXPIRES_SECONDS * 1000);

    const accessToken = jwt.sign(
      {
        kind: 'guest',
        displayName: trimmed,
      },
      env.GUEST_JWT_SECRET,
      {
        algorithm: 'HS256',
        subject: subjectId,
        issuer: GUEST_ISSUER,
        expiresIn: env.GUEST_JWT_EXPIRES_SECONDS,
      },
    );

    const auth: AuthContext = {
      subjectId,
      userKind: 'guest',
      displayName: trimmed,
      tokenIssuer: 'guest',
    };

    const user = await this.usersService.ensureUserFromAuth(auth);

    return {
      accessToken,
      expiresAt: expiresAt.toISOString(),
      user: {
        id: user.id,
        displayName: trimmed,
        coinBalance: user.coinBalance,
        kind: 'guest',
      },
    };
  }

  async authenticateToken(token: string): Promise<{ auth: AuthContext; userId: string }> {
    try {
      return await this.authenticateGuestToken(token);
    } catch (error) {
      if (!(error instanceof JsonWebTokenError)) {
        throw error;
      }
    }

    try {
      const supabaseClaims = this.verifySupabaseToken(token);
      const auth: AuthContext = {
        subjectId: supabaseClaims.sub,
        userKind: 'registered',
        displayName: this.extractDisplayName(supabaseClaims),
        email: supabaseClaims.email,
        tokenIssuer: 'supabase',
      };
      const user = await this.usersService.ensureUserFromAuth(auth);
      return { auth, userId: user.id };
    } catch {
      throw new ApiException('INVALID_TOKEN', 'Authentication token is invalid.', HttpStatus.UNAUTHORIZED);
    }
  }

  async authenticateGuestToken(token: string): Promise<{ auth: AuthContext; userId: string }> {
    const guestClaims = this.verifyGuestToken(token);
    const auth: AuthContext = {
      subjectId: guestClaims.sub,
      userKind: 'guest',
      displayName: guestClaims.displayName,
      tokenIssuer: 'guest',
    };
    const user = await this.usersService.ensureUserFromAuth(auth);
    return { auth, userId: user.id };
  }

  async upgradeGuestToRegistered(
    registeredUserId: string,
    registeredAuth: AuthContext,
    guestAccessToken: string,
  ): Promise<UpgradeGuestResponse> {
    if (registeredAuth.userKind !== 'registered') {
      throw new ApiException('UPGRADE_NOT_ALLOWED', 'Guest sessions can only upgrade into registered accounts.', 409);
    }

    let guestAuthResult: { auth: AuthContext; userId: string };
    try {
      guestAuthResult = await this.authenticateGuestToken(guestAccessToken);
    } catch {
      throw new ApiException('GUEST_TOKEN_REQUIRED', 'A valid guest token is required.', HttpStatus.UNAUTHORIZED);
    }

    if (guestAuthResult.userId === registeredUserId) {
      throw new ApiException('UPGRADE_NOT_ALLOWED', 'Guest and registered identities cannot be the same user.', 409);
    }

    const merge = await this.usersService.mergeGuestIntoRegistered(guestAuthResult.userId, registeredUserId);
    const user = await this.usersService.getById(registeredUserId);
    if (!user) {
      throw new ApiException('INVALID_TOKEN', 'Authenticated user not found', HttpStatus.UNAUTHORIZED);
    }

    return {
      merged: merge.merged,
      user: {
        id: user.id,
        displayName: user.displayName,
        coinBalance: user.coinBalance,
        kind: user.kind,
        email: user.email ?? undefined,
        avatarKey: user.avatarKey,
      },
    };
  }

  private verifyGuestToken(token: string): GuestClaims {
    const env = getEnv();
    const decoded = jwt.verify(token, env.GUEST_JWT_SECRET, {
      issuer: GUEST_ISSUER,
      algorithms: ['HS256'],
    });

    if (typeof decoded === 'string') {
      throw new JsonWebTokenError('Guest token payload is not an object');
    }

    if (decoded.kind !== 'guest' || typeof decoded.displayName !== 'string' || typeof decoded.sub !== 'string') {
      throw new JsonWebTokenError('Guest token claims are missing');
    }

    return decoded as GuestClaims;
  }

  private verifySupabaseToken(token: string): SupabaseClaims {
    const env = getEnv();
    const decoded = jwt.verify(token, env.SUPABASE_JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: env.SUPABASE_JWT_ISSUER,
      audience: env.SUPABASE_JWT_AUDIENCE,
    });

    if (typeof decoded === 'string' || typeof decoded.sub !== 'string') {
      throw new JsonWebTokenError('Supabase token claims are missing');
    }

    return decoded as SupabaseClaims;
  }

  private extractDisplayName(claims: SupabaseClaims): string {
    const fromMeta =
      claims.user_metadata?.full_name ??
      claims.user_metadata?.name ??
      claims.user_metadata?.preferred_username;

    if (fromMeta && fromMeta.trim().length > 0) {
      return fromMeta.slice(0, 24);
    }

    if (claims.email && claims.email.includes('@')) {
      const prefix = claims.email.split('@')[0] ?? 'Player';
      return prefix.slice(0, 24);
    }

    return 'Player';
  }
}
