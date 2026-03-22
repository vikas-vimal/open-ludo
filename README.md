# Open Ludo (Phase 1 Foundation)

Phase 1 implementation of the lobby + realtime foundation:
- `pnpm + turbo` monorepo
- `Next.js` web app (`apps/web`)
- `NestJS + Socket.IO + Prisma` API (`apps/api`)
- shared contracts package (`packages/contracts`)

## Quick Start

1. Use Node `24.x`:
```bash
node -v
```

2. Install dependencies:
```bash
COREPACK_HOME=/tmp/corepack pnpm install
```

3. Create env files:
```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

4. Generate Prisma client and run migrations:
```bash
COREPACK_HOME=/tmp/corepack pnpm --filter @open-ludo/api prisma:generate
COREPACK_HOME=/tmp/corepack pnpm --filter @open-ludo/api prisma:migrate
```

5. Run services in two terminals:
```bash
./scripts/dev-api.sh
./scripts/dev-web.sh
```

Web app: `http://localhost:3000`  
API: `http://localhost:8080`

## Implemented Phase 1 Features

- Guest auth (`POST /v1/auth/guest`) with short-lived guest JWT
- Supabase token verification for registered users
- Wallet bootstrap (1000 coins) for first-time identity creation
- Room creation, join, lobby fetch, ready toggle, start stub
- 6-char uppercase room code system
- Socket.IO lobby events:
  - `join_room`, `leave_room`, `set_ready`
  - `player_joined`, `player_left`, `room_state`, `host_transferred`, `error`
- Host transfer when host disconnects
- Lobby UI with share link, QR code, host controls
- Reconnect path by rejoining room on socket connect

## REST API (Phase 1)

- `POST /v1/auth/guest`
- `GET /v1/auth/me`
- `POST /v1/rooms`
- `POST /v1/rooms/:code/join`
- `GET /v1/rooms/:code`
- `POST /v1/rooms/:code/ready`
- `POST /v1/rooms/:code/start`

Error responses follow:
```json
{ "code": "ROOM_NOT_FOUND", "message": "Room does not exist." }
```

## Scripts

- Root:
  - `COREPACK_HOME=/tmp/corepack pnpm dev`
  - `COREPACK_HOME=/tmp/corepack pnpm build`
  - `COREPACK_HOME=/tmp/corepack pnpm test`
  - `COREPACK_HOME=/tmp/corepack pnpm typecheck`
  - `COREPACK_HOME=/tmp/corepack pnpm check:deps-exact`
- Helper scripts:
  - `scripts/dev-api.sh`
  - `scripts/dev-web.sh`
  - `scripts/build-api.sh`
  - `scripts/build-web.sh`

## Deployment Notes

- `apps/web` -> Vercel
  - Required env: `NEXT_PUBLIC_API_URL`, optional Supabase public envs
- `apps/api` -> Render or Railway
  - Required env: all keys from `apps/api/.env.example`
  - Ensure Postgres + Redis URLs are reachable
- Supabase
  - Use project JWT secret and issuer values in API env
  - Configure OAuth redirect URL to web origin

## Tests

Current backend tests include:
- room code format/normalization
- host transfer election utility
- auth normalization (guest + supabase)
- room service workflow scenarios (create/join/ready/disconnect transfer)
