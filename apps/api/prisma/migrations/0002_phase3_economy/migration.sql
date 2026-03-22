-- Create enums
CREATE TYPE "WalletTransactionKind" AS ENUM ('ENTRY_FEE', 'PAYOUT');
CREATE TYPE "MatchSettlementStatus" AS ENUM ('PENDING', 'SETTLED');

-- Create tables
CREATE TABLE "MatchSettlement" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "entryFee" INTEGER NOT NULL,
  "pot" INTEGER NOT NULL,
  "participantUserIds" JSONB NOT NULL,
  "skippedUserIds" JSONB NOT NULL,
  "winnerUserId" TEXT,
  "status" "MatchSettlementStatus" NOT NULL DEFAULT 'PENDING',
  "settledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MatchSettlement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WalletTransaction" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "settlementId" TEXT NOT NULL,
  "kind" "WalletTransactionKind" NOT NULL,
  "amount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- Unique indexes
CREATE UNIQUE INDEX "MatchSettlement_roomId_key" ON "MatchSettlement"("roomId");
CREATE UNIQUE INDEX "WalletTransaction_settlementId_userId_kind_key" ON "WalletTransaction"("settlementId", "userId", "kind");

-- Non-unique indexes
CREATE INDEX "MatchSettlement_status_idx" ON "MatchSettlement"("status");
CREATE INDEX "WalletTransaction_userId_createdAt_idx" ON "WalletTransaction"("userId", "createdAt");
CREATE INDEX "WalletTransaction_settlementId_createdAt_idx" ON "WalletTransaction"("settlementId", "createdAt");

-- Foreign keys
ALTER TABLE "MatchSettlement"
ADD CONSTRAINT "MatchSettlement_roomId_fkey"
FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MatchSettlement"
ADD CONSTRAINT "MatchSettlement_winnerUserId_fkey"
FOREIGN KEY ("winnerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WalletTransaction"
ADD CONSTRAINT "WalletTransaction_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WalletTransaction"
ADD CONSTRAINT "WalletTransaction_settlementId_fkey"
FOREIGN KEY ("settlementId") REFERENCES "MatchSettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
