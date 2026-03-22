-- Friendship graph (mutual via canonical pair userAId/userBId)
CREATE TABLE "Friendship" (
  "id" TEXT NOT NULL,
  "userAId" TEXT NOT NULL,
  "userBId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Friendship_userAId_userBId_key" ON "Friendship"("userAId", "userBId");
CREATE INDEX "Friendship_userAId_createdAt_idx" ON "Friendship"("userAId", "createdAt");
CREATE INDEX "Friendship_userBId_createdAt_idx" ON "Friendship"("userBId", "createdAt");

ALTER TABLE "Friendship"
ADD CONSTRAINT "Friendship_userAId_fkey"
FOREIGN KEY ("userAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Friendship"
ADD CONSTRAINT "Friendship_userBId_fkey"
FOREIGN KEY ("userBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Single-use friend invite links
CREATE TABLE "FriendInvite" (
  "id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "inviterUserId" TEXT NOT NULL,
  "consumedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "consumedAt" TIMESTAMP(3),
  CONSTRAINT "FriendInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FriendInvite_token_key" ON "FriendInvite"("token");
CREATE INDEX "FriendInvite_inviterUserId_createdAt_idx" ON "FriendInvite"("inviterUserId", "createdAt");
CREATE INDEX "FriendInvite_consumedByUserId_idx" ON "FriendInvite"("consumedByUserId");

ALTER TABLE "FriendInvite"
ADD CONSTRAINT "FriendInvite_inviterUserId_fkey"
FOREIGN KEY ("inviterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FriendInvite"
ADD CONSTRAINT "FriendInvite_consumedByUserId_fkey"
FOREIGN KEY ("consumedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
