import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contactSchema } from "@/lib/validation/contact";
import { sendContactMessageEmail } from "@/lib/email";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const { success } = await rateLimit(`contact:${clientIp(request)}`, {
    limit: 5,
    windowSeconds: 60 * 60,
  });
  if (!success) {
    return NextResponse.json({ error: "Too many messages. Please try again later." }, { status: 429 });
  }

  const parsed = contactSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const contactMessage = await db.contactMessage.create({ data: parsed.data });

  await sendContactMessageEmail(parsed.data);

  return NextResponse.json({ id: contactMessage.id }, { status: 201 });
}
