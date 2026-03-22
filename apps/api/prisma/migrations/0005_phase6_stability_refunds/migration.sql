-- Add refund kind to wallet ledger enum
ALTER TYPE "WalletTransactionKind" ADD VALUE 'REFUND';

-- Add cancellation status to settlement enum
ALTER TYPE "MatchSettlementStatus" ADD VALUE 'CANCELLED';

-- Track cancellation metadata for watchdog recoveries
ALTER TABLE "MatchSettlement"
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "cancelledReason" TEXT;
