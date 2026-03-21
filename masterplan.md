# 🎲 Open Ludo — App Masterplan

> A free, casual, web-based multiplayer Ludo game built for friends and family.
> Designed for a solo developer, optimized for fast delivery and real fun.

---

## 1. App Overview & Objectives

**Open Ludo** is a browser-based, real-time multiplayer Ludo game where friends and family can play together instantly — no app download required. Players can create a private room, share a link or QR code (perfect for WhatsApp groups), and start playing within seconds.

The goal is simple: bring the classic Ludo board game experience online with a polished, mobile-friendly feel, virtual coins for bragging rights, and just enough social features (profiles, friends, chat) to keep people coming back.

**Core Objectives:**
- Zero-friction game start (guest play, no signup required)
- Seamless room sharing via link & QR code
- Reliable real-time multiplayer (the #1 technical priority)
- Fun virtual economy (coins, ranks) without any real money
- Lightweight, performant on mobile browsers

---

## 2. Target Audience

- **Primary:** Friend groups and families who want to play Ludo together remotely
- **Secondary:** Casual players looking for a quick, fun browser game
- **Geography:** South Asia focus initially (India, Pakistan, Bangladesh) where Ludo is deeply cultural, but globally accessible
- **Device profile:** Mobile-first users on Android browsers; desktop as secondary

---

## 3. Core Features & Functionality

### 3.1 Room System
- Host creates a room and gets a shareable link + QR code
- Guests join via link, QR scan, or friend invite link
- Host selects player count (2, 3, or 4 players)
- Lobby shows connected players with ready status
- Host controls game start
- Host transfer if original host disconnects

### 3.2 Gameplay
- Standard Ludo rules (4 tokens per player, safe zones, kill mechanic, entry on 6, bonus turn on 6 or kill)
- Server-authoritative game engine (server validates all moves — clients never decide)
- Dice roll with timeout fallback (auto-roll after 20s inactivity)
- Turn indicator clearly visible at all times
- Valid move highlighting after dice roll
- Reconnection support (player can rejoin mid-game and restore state)

### 3.3 Virtual Coin Economy
- Every player starts with 1,000 coins (guests get temporary coins; registered users keep theirs)
- Entry fee per match: 100 coins per player
- Winner takes the full pot
- Coins are purely virtual — no real money involved
- Coin balance visible in-game and on profile

### 3.4 In-Game Chat
- Text chat visible to all players in the room
- Chat persists during the match
- Basic profanity filtering (simple word list check)

### 3.5 User Identity
- **Guest mode:** Enter a display name → play instantly (no data saved)
- **Registered accounts:** Google OAuth or email/password login
- Registered users get: persistent coin balance, match history, profile, friends list, rank

### 3.6 Player Profile
- Display name + avatar (selectable from preset set, no uploads for MVP)
- Stats: games played, wins, win rate
- Current virtual rank (based on coins / win rate)
- Coin balance

### 3.7 Friends System
- Share a unique friend invite link
- Recipient clicks link → friend request auto-sent on login
- Friends list visible on profile
- Quick "invite to room" from friends list (future phase)

---

## 4. High-Level Technical Stack Recommendations

### Frontend
**Recommended: Next.js (App Router) + Tailwind CSS**

Next.js gives you server-side rendering for fast initial loads, built-in routing, and seamless deployment on Vercel's free tier. Tailwind keeps styling fast and consistent.

- **State management:** Zustand (lightweight, perfect for game state)
- **Real-time:** Socket.io-client
- **QR Code:** A lightweight client-side QR generation library

### Backend
**Recommended: NestJS (Node.js)**

NestJS provides a clean, modular architecture that scales well as a solo developer. It has first-class WebSocket (Socket.io) support and integrates naturally with the rest of the stack.

- **WebSockets:** Socket.io (via NestJS Gateway)
- **REST API:** NestJS controllers (room creation, auth, profile)
- **ORM:** Prisma (type-safe, great DX)

### Database
**Recommended: PostgreSQL (via Supabase free tier)**

PostgreSQL for persistent data (users, matches, transactions). Supabase provides a generous free tier and also handles Auth out of the box, saving significant solo-dev time.

### In-Memory / Real-Time State
**Recommended: Redis (via Upstash free tier)**

Redis handles ephemeral game state (board positions, turn data) and pub/sub for multi-instance WebSocket sync. Upstash offers serverless Redis with a free tier suitable for MVP.

### Hosting
| Layer | Platform | Cost |
|-------|----------|------|
| Frontend | Vercel | Free |
| Backend | Railway or Render | Free tier |
| Database | Supabase | Free tier |
| Redis | Upstash | Free tier |

> ⚠️ Free tiers have cold-start latency (especially backend). For a real-time game, consider upgrading the backend to a paid tier ($5–7/month) once you have real users.

### Auth
**Recommended: Supabase Auth**

Handles Google OAuth + email/password out of the box. Saves weeks of solo dev time vs. rolling your own.

---

## 5. Conceptual Data Model

```
User
├── id
├── email
├── displayName
├── avatarId
├── coinBalance
├── createdAt
└── isGuest (boolean)

Room
├── id (short, shareable code)
├── hostId → User
├── maxPlayers (2-4)
├── status (waiting | playing | finished)
└── createdAt

Match
├── id
├── roomId → Room
├── players[] → User
├── winnerId → User
├── startedAt
└── finishedAt

GameState (Redis — ephemeral)
├── roomId
├── board (token positions per player)
├── currentTurn (playerId)
├── diceValue
└── status

Transaction
├── id
├── playerId → User
├── matchId → Match
├── amount (positive = credit, negative = debit)
├── type (entry | win | bonus)
└── createdAt

Friendship
├── requesterId → User
├── addresseeId → User
└── status (pending | accepted)

ChatMessage
├── id
├── roomId → Room
├── senderId → User
├── content
└── sentAt
```

---

## 6. User Interface Design Principles

- **Mobile-first layout:** All primary actions reachable by thumb in the bottom 60% of screen
- **Minimal chrome:** The board takes center stage — UI controls are compact and unobtrusive
- **Clear turn communication:** Always obvious whose turn it is (color coding + name indicator)
- **Fast feedback:** Dice roll, token move, and kill events all have lightweight visual/audio cues
- **WhatsApp-friendly sharing:** Room link + QR code prominently displayed in lobby
- **Offline-aware:** Show clear "reconnecting..." state when connection drops

### Key Screens
1. **Home** — Enter name (guest) or login, create/join room
2. **Room Lobby** — Players list, QR code, share link, start button (host)
3. **Game Board** — Full-screen board, chat drawer, dice, turn indicator, coin pot
4. **Win Screen** — Celebration, coin update, play again option
5. **Profile** — Avatar, stats, coins, rank, friends list

---

## 7. Security Considerations

- **Server is source of truth:** All game logic (dice rolls, move validation, coin transactions) runs server-side only. The client only sends intent (e.g., "I want to move token 2") and receives validated state updates.
- **Atomic coin transactions:** Coin deductions and rewards use database transactions to prevent double-spend or double-reward bugs.
- **Idempotency keys:** Match settlement (paying out winner) uses idempotent operations to handle server restarts safely.
- **Guest session tokens:** Guests get a short-lived signed token (JWT) so they can reconnect to their game after a refresh without a full account.
- **Rate limiting:** API endpoints (room create, join) rate-limited per IP to prevent abuse.
- **Basic chat moderation:** Profanity filter on chat messages server-side before broadcast.
- **No client trust:** Move validity, turn order, and coin logic are never determined by the client.

---

## 8. Development Phases & Milestones

### Phase 1 — Foundation (Days 1–5)
**Goal:** Create room, join via link/QR, see each other in lobby

- [ ] Project setup (Next.js + NestJS + Supabase + Upstash)
- [ ] Guest identity (name entry + session token)
- [ ] Room creation API + unique room code generation
- [ ] Join room via link and QR code
- [ ] WebSocket gateway: join_room, player_joined, player_left events
- [ ] Lobby screen with player list and host controls
- [ ] Host transfer on disconnect

---

### Phase 2 — Game Engine (Days 6–11)
**Goal:** Fully playable Ludo match

- [ ] Server-side Ludo engine (token positions, move validation, safe zones, kills)
- [ ] Dice roll system (server-authoritative, timeout fallback)
- [ ] Turn management (rotation, bonus turn on 6/kill)
- [ ] WebSocket events: roll_dice, move_token, state_update, game_end
- [ ] Board UI (grid-based, color-coded tokens)
- [ ] Valid move highlighting
- [ ] Win detection and end screen

---

### Phase 3 — Coins & Economy (Days 12–14)
**Goal:** Virtual stakes system

- [ ] Wallet model in DB
- [ ] Entry fee deduction on game start
- [ ] Winner payout with atomic transaction
- [ ] Coin balance display in-game and on profile
- [ ] Starting coin grant for new users

---

### Phase 4 — Auth & Profiles (Days 15–18)
**Goal:** Persistent identity

- [ ] Supabase Auth integration (Google OAuth + email)
- [ ] Guest → registered account upgrade (preserve session coins)
- [ ] Player profile screen (avatar, stats, rank, coins)
- [ ] Match history storage
- [ ] Basic rank system (Bronze → Silver → Gold → Diamond based on coins)

---

### Phase 5 — Social & Chat (Days 19–22)
**Goal:** Make it feel alive

- [ ] In-game text chat (WebSocket broadcast per room)
- [ ] Basic profanity filter
- [ ] Friend invite link generation
- [ ] Friends list on profile

---

### Phase 6 — Stability & Polish (Days 23–28)
**Goal:** Production-ready for real users

- [ ] Reconnection handling (restore game state on rejoin)
- [ ] Disconnect mid-game handling (auto-forfeit after timeout)
- [ ] Room stuck state recovery
- [ ] Mobile UX polish (thumb-friendly controls, bottom action bar)
- [ ] Lightweight dice animation
- [ ] Token move animation
- [ ] Sound effects (optional toggle)
- [ ] Error states and loading states throughout

---

## 9. Potential Challenges & Solutions

| Challenge | Solution |
|-----------|----------|
| Race conditions in turn handling | Use Redis atomic operations (SETNX) for turn lock |
| Double reward bug | Idempotency key on match settlement + DB transaction |
| Player disconnect mid-game | Grace period (60s) before forfeit; state preserved in Redis |
| Room stuck in "playing" forever | Server-side game watchdog: auto-end abandoned rooms after inactivity |
| Sync issues across clients | Server always broadcasts full state update, not deltas |
| Free tier cold starts causing latency | Keep-alive ping on backend; warn users on reconnect |
| Guest coin persistence | Short-lived JWT carries guest coin balance for session duration |
| Chat abuse | Server-side profanity filter + future report mechanism |

---

## 10. Future Expansion Possibilities

Once the MVP is solid and has real users, these are natural next steps:

- **Tournaments:** Bracket-style competitions with bigger coin pools
- **Spectator mode:** Watch a game in progress
- **Custom avatars:** Upload or mint profile pictures
- **Animated themes:** Board skins and token styles
- **Mobile app:** Wrap the PWA in Capacitor for app store distribution
- **Public matchmaking:** Join random public rooms (not just friends)
- **Voice chat:** Quick in-game voice using a lightweight WebRTC solution
- **Rematch system:** Instant rematch with same players after a game ends
- **Daily challenges:** Bonus coin events to drive retention
- **Real money mode:** If regulations allow in target markets, introduce a paid tier with payment processing

---

## 11. Solo Developer Notes

Building this alone is very doable in ~4 weeks if you stay disciplined about scope. A few personal recommendations:

- **Build Phase 1 & 2 first, show nobody yet.** Get the core game working before adding any social layer.
- **Don't perfect the board UI early.** A simple grid board is fine for Phase 2. Polish comes last.
- **Supabase Auth will save you days.** Don't roll your own auth.
- **Redis on Upstash is serverless** — no always-on process to manage.
- **Test with real phones early.** WebSocket behavior on mobile browsers (especially background tab handling) is tricky and you want to find issues early.
- **Use a single monorepo** for frontend + backend to keep things simple while solo.

---

*Generated with Open Ludo planning session — ready to build! 🚀*
