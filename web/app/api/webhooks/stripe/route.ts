import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { DonationFrequency } from "@/lib/generated/prisma/enums";
import { autoSubmitFriendApplication } from "@/lib/friend-application";

/**
 * The only place a Donation row is ever created (PRD §4.14 AC3/AC6) — never
 * at checkout-session creation (app/api/donations/route.ts). Only a
 * checkout.session.completed event with payment_status "paid" writes a
 * record, so an abandoned, failed, or cancelled checkout never produces
 * one. Signature-verified (mirrors app/api/webhooks/clerk/route.ts's Svix
 * pattern) and exempt from the CSRF check + session auth in middleware.ts
 * for the same reason: server-to-server, self-authenticating.
 */
export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SIGNING_SECRET;
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    if (!signature || !secret) throw new Error("Missing signature or webhook secret");
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    if (session.payment_status === "paid") {
      const metadata = session.metadata ?? {};
      const frequency =
        metadata.frequency === DonationFrequency.recurring
          ? DonationFrequency.recurring
          : DonationFrequency.one_time;
      const userId = metadata.userId?.trim();

      try {
        await db.donation.create({
          data: {
            donorName: metadata.donorName ?? "Anonymous",
            donorEmail: metadata.donorEmail ?? session.customer_email ?? "",
            userId: userId ? userId : null,
            amountCents: session.amount_total ?? 0,
            currency: session.currency ?? "usd",
            frequency,
            recognitionConsent: metadata.recognitionConsent === "true",
            emailUpdatesOptIn: metadata.emailUpdatesOptIn === "true",
            note: metadata.note || null,
            stripeCheckoutSessionId: session.id,
            stripeSubscriptionId:
              typeof session.subscription === "string" ? session.subscription : null,
          },
        });

        // Only reached once per checkout session (a retried webhook delivery
        // for the same session hits the P2002 duplicate branch below and
        // never re-enters this block), so this can't double-submit on
        // Stripe's at-least-once retries. Failures here are swallowed in
        // their own try/catch — separate from the Donation duplicate-P2002
        // handling below — so a problem submitting the application can
        // never be mistaken for a duplicate-donation retry, or block the
        // webhook's success response for a donation that already recorded.
        if (metadata.friendApplicationOptIn === "true") {
          const donorEmail = metadata.donorEmail ?? session.customer_email ?? "";
          if (donorEmail) {
            try {
              await autoSubmitFriendApplication({
                donorName: metadata.donorName ?? "",
                donorEmail,
                emailUpdatesOptIn: metadata.emailUpdatesOptIn === "true",
              });
            } catch (error) {
              console.error("[stripe webhook] Failed to auto-submit Friend application", error);
            }
          }
        }
      } catch (error) {
        // Stripe retries webhook delivery; a duplicate event for a session
        // we've already recorded (unique stripeCheckoutSessionId) is
        // expected and not an error — anything else should surface.
        const isDuplicate =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          (error as { code?: string }).code === "P2002";
        if (!isDuplicate) throw error;
      }
    }
  }

  return NextResponse.json({ received: true });
}
