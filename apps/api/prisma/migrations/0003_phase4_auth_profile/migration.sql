-- Alter user profile fields
ALTER TABLE "User"
ADD COLUMN "avatarKey" TEXT NOT NULL DEFAULT 'pawn_red';

-- Extend settlement history payload
ALTER TABLE "MatchSettlement"
ADD COLUMN "placementsJson" JSONB;

-- Track idempotent guest->registered merges
CREATE TABLE "AccountMerge" (
  "id" TEXT NOT NULL,
  "guestUserId" TEXT NOT NULL,
  "registeredUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountMerge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountMerge_guestUserId_key" ON "AccountMerge"("guestUserId");
CREATE INDEX "AccountMerge_registeredUserId_createdAt_idx" ON "AccountMerge"("registeredUserId", "createdAt");

ALTER TABLE "AccountMerge"
ADD CONSTRAINT "AccountMerge_guestUserId_fkey"
FOREIGN KEY ("guestUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AccountMerge"
ADD CONSTRAINT "AccountMerge_registeredUserId_fkey"
FOREIGN KEY ("registeredUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
