-- CreateEnum
CREATE TYPE "DonationFrequency" AS ENUM ('one_time', 'recurring');

-- CreateTable
CREATE TABLE "donations" (
    "id" TEXT NOT NULL,
    "donorName" TEXT NOT NULL,
    "donorEmail" TEXT NOT NULL,
    "userId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "frequency" "DonationFrequency" NOT NULL,
    "recognitionConsent" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "stripeCheckoutSessionId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "donations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "donations_stripeCheckoutSessionId_key" ON "donations"("stripeCheckoutSessionId");

-- AddForeignKey
ALTER TABLE "donations" ADD CONSTRAINT "donations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
