import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { clientIpFromHeaders, rateLimit } from "@/lib/rate-limit";
import {
  normalizeMarketingEmail,
  requestEmailMarketingConsent,
} from "@/lib/services/marketing-consent.service";

const schema = z.object({
  email: z.email().max(320),
  audience: z.enum(["GUEST", "HOST"]),
  consent: z.literal(true),
});

export async function POST(request: Request) {
  const session = await auth();
  const ip = clientIpFromHeaders(request.headers);
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { error: "Enter a valid email and actively accept the marketing consent." },
      { status: 400 }
    );
  }
  const email = normalizeMarketingEmail(body.data.email);
  const sessionEmail = session?.user?.email
    ? normalizeMarketingEmail(session.user.email)
    : null;
  const ipLimit = rateLimit(`marketing-subscribe-ip:${ip}`, 10, 60 * 60 * 1000);
  const emailLimit = rateLimit(
    `marketing-subscribe-email:${email}`,
    3,
    60 * 60 * 1000
  );
  if (!ipLimit.success || !emailLimit.success) {
    return NextResponse.json(
      { error: "Too many confirmation requests. Please try again later." },
      { status: 429 }
    );
  }

  await requestEmailMarketingConsent({
    email,
    // A signed-in visitor may deliberately subscribe a different address. Only
    // bind the durable marketing identity to the account when the addresses match.
    userId: sessionEmail === email ? session?.user?.id : undefined,
    audience: body.data.audience,
    source: "public-newsletter-form",
    metadata: {
      ip,
      userAgent: request.headers.get("user-agent") || undefined,
      referrer: request.headers.get("referer") || undefined,
    },
  });
  // Deliberately generic to avoid disclosing whether an address is registered.
  return NextResponse.json({
    message: "Check your inbox and confirm your subscription within 48 hours.",
  });
}
