import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { donationSchema } from "@/lib/validation/donation";
import { rateLimit } from "@/lib/rate-limit";
import { DonationFrequency } from "@/lib/generated/prisma/enums";

function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/**
 * Creates a Stripe Checkout Session and returns its URL — it does NOT write
 * a Donation row. The row is only ever created by the webhook
 * (app/api/webhooks/stripe/route.ts) once Stripe confirms the payment
 * actually succeeded, so an abandoned/failed/cancelled checkout produces no
 * record (PRD §4.14 AC6). All donor-supplied fields travel to the webhook
 * via session metadata, since this endpoint never touches the database.
 */
export async function POST(request: Request) {
  const { success } = await rateLimit(`donations:${clientIp(request)}`, {
    limit: 10,
    windowSeconds: 60 * 60,
  });
  if (!success) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const parsed = donationSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { donorName, donorEmail, amount, frequency, recognitionConsent, emailUpdatesOptIn, note } =
    parsed.data;

  // Best-effort attribution only — a logged-in donor's userId rides along
  // in metadata purely so /admin/donations can show "linked member", never
  // read by any Knowledge Hours/tier code path (PRD §4.14 AC4).
  const sessionUser = await getSessionUser();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const amountCents = Math.round(amount * 100);
  const isRecurring = frequency === DonationFrequency.recurring;

  const metadata: Record<string, string> = {
    donorName,
    donorEmail,
    frequency,
    recognitionConsent: String(recognitionConsent),
    emailUpdatesOptIn: String(emailUpdatesOptIn),
    note,
    userId: sessionUser?.id ?? "",
  };

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: isRecurring ? "subscription" : "payment",
    customer_email: donorEmail,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: amountCents,
          product_data: { name: isRecurring ? "NASIHA recurring donation" : "NASIHA donation" },
          ...(isRecurring ? { recurring: { interval: "month" as const } } : {}),
        },
      },
    ],
    metadata,
    subscription_data: isRecurring ? { metadata } : undefined,
    success_url: `${appUrl}/donate?success=1`,
    cancel_url: `${appUrl}/donate?canceled=1`,
  });

  if (!checkoutSession.url) {
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 502 });
  }

  return NextResponse.json({ url: checkoutSession.url });
}
