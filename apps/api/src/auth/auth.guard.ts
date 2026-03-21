import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ApiException } from '../common/errors.js';
import { AuthService } from './auth.service.js';
import type { AuthenticatedRequest } from './auth.types.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers['authorization'];

    if (!header || typeof header !== 'string' || !header.startsWith('Bearer ')) {
      throw new ApiException('AUTH_REQUIRED', 'Bearer token is required.', 401);
    }

    const token = header.slice('Bearer '.length).trim();
    const authenticated = await this.authService.authenticateToken(token);
    request.auth = authenticated.auth;
    request.userId = authenticated.userId;

    return true;
  }
}
