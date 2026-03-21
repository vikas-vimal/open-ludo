export type UserKind = 'guest' | 'registered';

export type AuthContext = {
  subjectId: string;
  userKind: UserKind;
  displayName: string;
  email?: string;
  tokenIssuer: 'guest' | 'supabase';
};

export type RoomStatus = 'waiting' | 'playing' | 'finished';

export type RoomPlayer = {
  userId: string;
  displayName: string;
  isHost: boolean;
  isReady: boolean;
  joinedAt: string;
  isConnected: boolean;
};

export type Room = {
  id: string;
  code: string;
  hostUserId: string;
  status: RoomStatus;
  maxPlayers: 2 | 3 | 4;
  createdAt: string;
};

export type RoomState = {
  room: Room;
  players: RoomPlayer[];
};

export type ApiErrorCode =
  | 'AUTH_REQUIRED'
  | 'INVALID_TOKEN'
  | 'INVALID_NAME'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'ALREADY_IN_ROOM'
  | 'NOT_HOST'
  | 'INVALID_ROOM_CODE'
  | 'INVALID_MAX_PLAYERS'
  | 'ROOM_NOT_WAITING';

export type ApiErrorResponse = {
  code: ApiErrorCode;
  message: string;
};

export type CreateGuestRequest = {
  displayName: string;
};

export type CreateGuestResponse = {
  accessToken: string;
  expiresAt: string;
  user: {
    id: string;
    displayName: string;
    coinBalance: number;
    kind: 'guest';
  };
};

export type GetMeResponse = {
  user: {
    id: string;
    displayName: string;
    coinBalance: number;
    kind: UserKind;
    email?: string;
  };
};

export type CreateRoomRequest = {
  maxPlayers: 2 | 3 | 4;
};

export type CreateRoomResponse = {
  room: RoomState;
};

export type JoinRoomResponse = {
  room: RoomState;
};

export type SetReadyRequest = {
  ready: boolean;
};

export type StartRoomResponse = {
  room: RoomState;
};

export type ClientToServerEvents = {
  join_room: (payload: { roomCode: string }) => void;
  leave_room: (payload: { roomCode: string }) => void;
  set_ready: (payload: { roomCode: string; ready: boolean }) => void;
};

export type ServerToClientEvents = {
  player_joined: (payload: RoomState) => void;
  player_left: (payload: RoomState) => void;
  room_state: (payload: RoomState) => void;
  host_transferred: (payload: RoomState) => void;
  error: (payload: ApiErrorResponse) => void;
};

export type WsEventMap = {
  clientToServer: ClientToServerEvents;
  serverToClient: ServerToClientEvents;
};
