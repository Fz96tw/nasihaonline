import { NextResponse, type NextRequest } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { db } from "@/lib/db";
import { Role } from "@/lib/generated/prisma/enums";

const KNOWN_ROLES = new Set<string>(Object.values(Role));

function roleFromMetadata(publicMetadata: Record<string, unknown>): Role {
  const role = publicMetadata.role;
  return typeof role === "string" && KNOWN_ROLES.has(role)
    ? (role as Role)
    : Role.applicant;
}

/**
 * Keeps Nasiha's local `User` row in sync with Clerk, the source of truth
 * for credentials/session state. This route is intentionally exempt from
 * the CSRF check in middleware.ts (server-to-server, Svix-signed, no
 * browser session involved) and Clerk auth (it authenticates itself).
 */
export async function POST(request: NextRequest) {
  let event;
  try {
    event = await verifyWebhook(request);
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  switch (event.type) {
    case "user.created":
    case "user.updated": {
      const { id, email_addresses, primary_email_address_id, public_metadata } =
        event.data;
      const primaryEmail =
        email_addresses.find((e) => e.id === primary_email_address_id) ??
        email_addresses[0];

      if (!primaryEmail) {
        return NextResponse.json(
          { error: "User has no email address" },
          { status: 400 },
        );
      }

      await db.user.upsert({
        where: { clerkUserId: id },
        create: {
          clerkUserId: id,
          email: primaryEmail.email_address,
          role: roleFromMetadata(public_metadata),
        },
        update: {
          email: primaryEmail.email_address,
          role: roleFromMetadata(public_metadata),
        },
      });
      break;
    }
    case "user.deleted": {
      if (event.data.id) {
        await db.user
          .delete({ where: { clerkUserId: event.data.id } })
          .catch(() => undefined);
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
