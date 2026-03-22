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

export type PlayerColor = 'RED' | 'GREEN' | 'YELLOW' | 'BLUE';
export type TurnPhase = 'await_roll' | 'await_move' | 'finished';

export type ValidMove = {
  tokenIndex: number;
  targetProgress: number;
};

export type DiceState = {
  value: number | null;
  rolledAt?: string;
  isAuto: boolean;
};

export type PlayerGameState = {
  userId: string;
  displayName: string;
  color: PlayerColor;
  tokens: number[];
  finishedRank?: number;
};

export type PlacementEntry = {
  userId: string;
  displayName: string;
  color: PlayerColor;
  place: number;
};

export type GameState = {
  roomCode: string;
  status: 'playing' | 'finished';
  players: PlayerGameState[];
  economy: {
    entryFee: number;
    pot: number;
    participantUserIds: string[];
    skippedUserIds: string[];
  };
  currentTurnIndex: number;
  turnPhase: TurnPhase;
  dice: DiceState;
  validMoves: ValidMove[];
  finishedOrder: string[];
  turnDeadlineAt?: string;
  lastUpdatedAt: string;
};

export type GameStatePayload = {
  roomCode: string;
  state: GameState;
};

export type GameEndPayload = {
  roomCode: string;
  state: GameState;
  placements: PlacementEntry[];
  winnerUserId: string;
  pot: number;
  entryFee: number;
};

export type ApiErrorCode =
  | 'AUTH_REQUIRED'
  | 'INVALID_TOKEN'
  | 'REGISTERED_REQUIRED'
  | 'INVALID_NAME'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'ALREADY_IN_ROOM'
  | 'NOT_HOST'
  | 'INVALID_ROOM_CODE'
  | 'INVALID_MAX_PLAYERS'
  | 'ROOM_NOT_WAITING'
  | 'ROOM_NOT_PLAYING'
  | 'GAME_NOT_STARTED'
  | 'TURN_NOT_YOURS'
  | 'INVALID_MOVE'
  | 'NO_VALID_MOVE'
  | 'NOT_ENOUGH_FUNDED_PLAYERS'
  | 'UPGRADE_NOT_ALLOWED'
  | 'GUEST_TOKEN_REQUIRED'
  | 'GUEST_ALREADY_UPGRADED'
  | 'PROFILE_INVALID_AVATAR'
  | 'INVITE_INVALID'
  | 'INVITE_ALREADY_USED'
  | 'INVITE_SELF'
  | 'CHAT_NOT_AVAILABLE'
  | 'CHAT_INVALID_MESSAGE';

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
    avatarKey?: string;
  };
};

export type UpgradeGuestRequest = {
  guestAccessToken: string;
};

export type UpgradeGuestResponse = {
  user: {
    id: string;
    displayName: string;
    coinBalance: number;
    kind: UserKind;
    email?: string;
    avatarKey?: string;
  };
  merged: boolean;
};

export type ProfileRank = 'BRONZE' | 'SILVER' | 'GOLD' | 'DIAMOND';

export type ProfileStats = {
  gamesPlayed: number;
  wins: number;
  winRate: number;
};

export type ProfileFriendEntry = {
  id: string;
  displayName: string;
  avatarKey: string;
  rank: ProfileRank;
  coinBalance: number;
};

export type ProfileHistoryEntry = {
  settlementId: string;
  roomCode: string;
  entryFee: number;
  pot: number;
  place: number | null;
  settledAt: string;
};

export type GetMyProfileResponse = {
  profile: {
    id: string;
    displayName: string;
    avatarKey: string;
    kind: UserKind;
    email?: string;
    coinBalance: number;
    rank: ProfileRank;
    stats: ProfileStats;
    history: ProfileHistoryEntry[];
    friends: ProfileFriendEntry[];
  };
};

export type UpdateMyProfileRequest = {
  displayName?: string;
  avatarKey?: string;
};

export type UpdateMyProfileResponse = GetMyProfileResponse;

export type CreateFriendInviteResponse = {
  token: string;
  inviteUrl: string;
};

export type AcceptFriendInviteResponse = {
  friend: ProfileFriendEntry;
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
  start_game: (payload: { roomCode: string }) => void;
  roll_dice: (payload: { roomCode: string }) => void;
  move_token: (payload: { roomCode: string; tokenIndex: number }) => void;
  send_chat: (payload: { roomCode: string; message: string }) => void;
};

export type ChatMessagePayload = {
  roomCode: string;
  messageId: string;
  senderUserId: string;
  senderDisplayName: string;
  message: string;
  createdAt: string;
};

export type ServerToClientEvents = {
  player_joined: (payload: RoomState) => void;
  player_left: (payload: RoomState) => void;
  room_state: (payload: RoomState) => void;
  host_transferred: (payload: RoomState) => void;
  state_update: (payload: GameStatePayload) => void;
  game_end: (payload: GameEndPayload) => void;
  chat_message: (payload: ChatMessagePayload) => void;
  error: (payload: ApiErrorResponse) => void;
};

export type WsEventMap = {
  clientToServer: ClientToServerEvents;
  serverToClient: ServerToClientEvents;
};
