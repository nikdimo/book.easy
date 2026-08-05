import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendTransactionalEmail } from "@/lib/email";
import { communicationSupportEmail } from "@/lib/communication-brand.server";
import { clientIpFromHeaders, rateLimit } from "@/lib/rate-limit";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().max(320),
  category: z.enum(["GENERAL", "BOOKING", "HOSTING", "TECHNICAL", "OTHER"]),
  subject: z.string().trim().min(2).max(160).regex(/^[^\r\n]+$/),
  message: z.string().trim().min(10).max(5000),
  website: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 12_000) {
    return NextResponse.json({ error: "Message is too large." }, { status: 413 });
  }
  const ip = clientIpFromHeaders(request.headers);
  if (!rateLimit(`contact:${ip}`, 5, 60 * 60 * 1000).success) {
    return NextResponse.json({ error: "Too many messages. Please try again later." }, { status: 429 });
  }

  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Please complete all fields correctly." }, { status: 400 });
  }
  if (body.data.website) return NextResponse.json({ message: "Thank you. Your message has been sent." });

  const session = await auth();
  const email = body.data.email.trim().toLowerCase();
  const sessionEmail = session?.user?.email?.trim().toLowerCase();
  const contactData = { ...body.data };
  delete contactData.website;
  const contact = await db.contactMessage.create({
    data: {
      ...contactData,
      email,
      userId: sessionEmail === email ? session?.user?.id : undefined,
    },
  });

  // The database is the durable source of truth. Email is notification transport;
  // a temporary SMTP outage must not make the visitor resubmit and create duplicates.
  const deliveries = await Promise.allSettled([
    sendTransactionalEmail({
      to: communicationSupportEmail(),
      sender: "support",
      replyTo: email,
      subject: `[Linger Homes contact] ${body.data.subject}`,
      text: `New contact message (${contact.id})\n\nFrom: ${body.data.name} <${email}>\nCategory: ${body.data.category}\nSubject: ${body.data.subject}\n\n${body.data.message}`,
    }),
    sendTransactionalEmail({
      to: email,
      subject: "We received your message",
      text: `Hi ${body.data.name},\n\nThank you for contacting Linger Homes. We received your message and will get back to you as soon as possible.\n\nYour subject: ${body.data.subject}`,
    }),
  ]);
  if (deliveries.some((delivery) => delivery.status === "rejected")) {
    console.error("[contact] email notification failed", { contactId: contact.id });
  }

  return NextResponse.json({ message: "Thank you. Your message has been sent." });
}
