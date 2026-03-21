import type { AuthContext } from '@open-ludo/contracts';
import type { Request } from 'express';

export type AuthenticatedRequest = Request & {
  auth?: AuthContext;
  userId?: string;
};
