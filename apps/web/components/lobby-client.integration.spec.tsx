import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Socket } from 'socket.io-client';

vi.mock('../lib/api', () => {
  class MockApiClientError extends Error {
    public readonly code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }

  return {
    ApiClientError: MockApiClientError,
    api: {
      createGuest: vi.fn(),
      getMe: vi.fn(),
      upgradeGuest: vi.fn(),
      createRoom: vi.fn(),
      joinRoom: vi.fn(),
      getRoom: vi.fn(),
      setReady: vi.fn(),
      startRoom: vi.fn(),
      getMyProfile: vi.fn(),
      updateMyProfile: vi.fn(),
      createFriendInvite: vi.fn(),
      acceptFriendInvite: vi.fn(),
    },
  };
});

vi.mock('../lib/auth-store', () => ({
  readToken: vi.fn(),
  saveSession: vi.fn(),
}));

vi.mock('../lib/socket', () => ({
  createLobbySocket: vi.fn(),
}));

import { api } from '../lib/api';
import { readToken } from '../lib/auth-store';
import { createLobbySocket } from '../lib/socket';
import { LobbyClient } from './lobby-client';

type Listener = (...args: unknown[]) => void;

class MockLobbySocket {
  public readonly io = {
    on: (event: string, callback: Listener) => {
      const listeners = this.ioListeners.get(event) ?? [];
      listeners.push(callback);
      this.ioListeners.set(event, listeners);
    },
    removeAllListeners: () => {
      this.ioListeners.clear();
    },
  };

  public connected = false;
  public readonly emit = vi.fn();
  public readonly removeAllListeners = vi.fn(() => {
    this.listeners.clear();
  });
  public readonly disconnect = vi.fn(() => {
    this.connected = false;
    this.trigger('disconnect', 'io client disconnect');
  });
  public readonly connect = vi.fn(() => {
    this.connected = true;
    this.trigger('connect');
  });

  private readonly listeners = new Map<string, Listener[]>();
  private readonly ioListeners = new Map<string, Listener[]>();

  on(event: string, callback: Listener): void {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(callback);
    this.listeners.set(event, listeners);
  }

  trigger(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args);
    }
  }
}

describe('LobbyClient integration', () => {
  const mockedApi = vi.mocked(api);
  const mockedReadToken = vi.mocked(readToken);
  const mockedCreateLobbySocket = vi.mocked(createLobbySocket);
  let socket: MockLobbySocket;

  beforeEach(() => {
    vi.clearAllMocks();

    socket = new MockLobbySocket();
    mockedCreateLobbySocket.mockReturnValue(socket as unknown as Socket);
    mockedReadToken.mockReturnValue('test-token');

    mockedApi.getMe.mockResolvedValue({
      user: {
        id: 'u1',
        displayName: 'Vikki',
        coinBalance: 1000,
        kind: 'guest',
      },
    });

    mockedApi.joinRoom.mockResolvedValue({
      room: {
        room: {
          id: 'room-1',
          code: 'ABC123',
          hostUserId: 'u1',
          status: 'waiting',
          maxPlayers: 4,
          createdAt: '2026-03-23T10:00:00.000Z',
        },
        players: [
          {
            userId: 'u1',
            displayName: 'Vikki',
            isHost: true,
            isReady: false,
            joinedAt: '2026-03-23T10:00:00.000Z',
            isConnected: true,
          },
        ],
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders a shaped ludo track board in lobby mode', async () => {
    render(createElement(LobbyClient, { roomCode: 'ABC123' }));

    await waitFor(() => {
      expect(mockedApi.joinRoom).toHaveBeenCalledWith('ABC123', 'test-token');
      expect(socket.connect).toHaveBeenCalledTimes(1);
    });

    const startCell = screen.getByTestId('track-cell-0');
    const greenStartCell = screen.getByTestId('track-cell-13');
    const yellowStartCell = screen.getByTestId('track-cell-26');
    const blueStartCell = screen.getByTestId('track-cell-39');

    expect(startCell).toHaveStyle({ gridRowStart: '7', gridColumnStart: '2' });
    expect(greenStartCell).toHaveStyle({ gridRowStart: '2', gridColumnStart: '9' });
    expect(yellowStartCell).toHaveStyle({ gridRowStart: '9', gridColumnStart: '14' });
    expect(blueStartCell).toHaveStyle({ gridRowStart: '14', gridColumnStart: '7' });
    expect(screen.getByText('Match not started yet. This is the live board layout.')).toBeInTheDocument();
  });

  it('does not show fatal API error text for non-API socket transport errors', async () => {
    render(createElement(LobbyClient, { roomCode: 'ABC123' }));

    await waitFor(() => {
      expect(socket.connect).toHaveBeenCalledTimes(1);
    });

    socket.trigger('error', new Error('transport failed'));

    await waitFor(() => {
      expect(screen.getByText('transport failed. Reconnecting...')).toBeInTheDocument();
    });
    expect(screen.queryByText('Unexpected socket error.')).not.toBeInTheDocument();
    expect(screen.getByTestId('track-cell-0')).toBeInTheDocument();
  });

  it('still surfaces API-shaped socket errors to the user', async () => {
    render(createElement(LobbyClient, { roomCode: 'ABC123' }));

    await waitFor(() => {
      expect(socket.connect).toHaveBeenCalledTimes(1);
    });

    socket.trigger('error', {
      code: 'CHAT_NOT_AVAILABLE',
      message: 'Chat is available only while a match is in progress.',
    });

    await waitFor(() => {
      expect(screen.getByText('Chat is available only during active matches for room members.')).toBeInTheDocument();
    });
  });
});
