import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthContext } from '@open-ludo/contracts';
import type { AuthenticatedRequest } from './auth.types.js';

export const CurrentAuth = createParamDecorator((_: unknown, context: ExecutionContext): AuthContext => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!request.auth) {
    throw new Error('Auth context not available');
  }

  return request.auth;
});

export const CurrentUserId = createParamDecorator((_: unknown, context: ExecutionContext): string => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!request.userId) {
    throw new Error('User id not available');
  }

  return request.userId;
});
