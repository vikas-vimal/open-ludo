import jwt from 'jsonwebtoken';
import { vi } from 'vitest';
import { AuthService } from '../src/auth/auth.service.js';

describe('AuthService', () => {
  const usersService = {
    ensureUserFromAuth: vi.fn(),
    mergeGuestIntoRegistered: vi.fn(),
    getById: vi.fn(),
  };

  let service: AuthService;

  beforeEach(() => {
    usersService.ensureUserFromAuth.mockReset();
    usersService.mergeGuestIntoRegistered.mockReset();
    usersService.getById.mockReset();
    usersService.ensureUserFromAuth.mockImplementation(async (auth: { userKind: 'guest' | 'registered' }) => ({
      id: auth.userKind === 'guest' ? 'guest-db-user' : 'registered-db-user',
      coinBalance: 1000,
    }));
    usersService.mergeGuestIntoRegistered.mockResolvedValue({ merged: true });
    usersService.getById.mockResolvedValue({
      id: 'registered-db-user',
      displayName: 'Sam',
      kind: 'registered',
      email: 'sam@example.com',
      coinBalance: 1400,
      avatarKey: 'pawn_blue',
    });
    service = new AuthService(usersService as never);
  });

  it('creates guest token and bootstraps wallet', async () => {
    const result = await service.createGuest('Anaya');

    expect(result.user.displayName).toBe('Anaya');
    expect(result.user.coinBalance).toBe(1000);
    expect(typeof result.accessToken).toBe('string');
    expect(usersService.ensureUserFromAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        userKind: 'guest',
        displayName: 'Anaya',
        tokenIssuer: 'guest',
      }),
    );
  });

  it('authenticates guest token into normalized auth context', async () => {
    const guest = await service.createGuest('Aisha');
    const authenticated = await service.authenticateToken(guest.accessToken);

    expect(authenticated.userId).toBe('guest-db-user');
    expect(authenticated.auth.userKind).toBe('guest');
    expect(authenticated.auth.tokenIssuer).toBe('guest');
    expect(authenticated.auth.displayName).toBe('Aisha');
  });

  it('authenticates supabase token into normalized auth context', async () => {
    const token = jwt.sign(
      {
        sub: 'supa-user-123',
        email: 'sam@example.com',
        user_metadata: { name: 'Sam' },
      },
      process.env.SUPABASE_JWT_SECRET!,
      {
        algorithm: 'HS256',
        issuer: process.env.SUPABASE_JWT_ISSUER,
        audience: process.env.SUPABASE_JWT_AUDIENCE,
      },
    );

    const authenticated = await service.authenticateToken(token);
    expect(authenticated.auth.userKind).toBe('registered');
    expect(authenticated.auth.subjectId).toBe('supa-user-123');
    expect(authenticated.auth.displayName).toBe('Sam');
    expect(authenticated.auth.email).toBe('sam@example.com');
    expect(authenticated.auth.tokenIssuer).toBe('supabase');
  });

  it('throws INVALID_TOKEN when token is invalid', async () => {
    try {
      await service.authenticateToken('not-a-token');
      throw new Error('Expected authenticateToken to throw');
    } catch (error) {
      const response = (error as { getResponse: () => { code?: string } }).getResponse();
      expect(response.code).toBe('INVALID_TOKEN');
    }
  });

  it('upgrades guest session into registered account and preserves merged balance', async () => {
    const guest = await service.createGuest('Aisha');
    const upgraded = await service.upgradeGuestToRegistered(
      'registered-db-user',
      {
        subjectId: 'supa-user-123',
        userKind: 'registered',
        displayName: 'Sam',
        tokenIssuer: 'supabase',
      },
      guest.accessToken,
    );

    expect(usersService.mergeGuestIntoRegistered).toHaveBeenCalledWith('guest-db-user', 'registered-db-user');
    expect(upgraded.merged).toBe(true);
    expect(upgraded.user.coinBalance).toBe(1400);
    expect(upgraded.user.avatarKey).toBe('pawn_blue');
  });

  it('returns merged=false when guest was already upgraded', async () => {
    usersService.mergeGuestIntoRegistered.mockResolvedValueOnce({ merged: false });
    const guest = await service.createGuest('Aisha');

    const upgraded = await service.upgradeGuestToRegistered(
      'registered-db-user',
      {
        subjectId: 'supa-user-123',
        userKind: 'registered',
        displayName: 'Sam',
        tokenIssuer: 'supabase',
      },
      guest.accessToken,
    );

    expect(upgraded.merged).toBe(false);
  });
});
