import { NextResponse } from "next/server";
import { clientIpFromHeaders, rateLimit } from "@/lib/rate-limit";
import { confirmEmailMarketingConsent } from "@/lib/services/marketing-consent.service";

export async function POST(request: Request) {
  const form = await request.formData();
  const token = form.get("token");
  if (typeof token !== "string" || token.length < 20 || token.length > 200) {
    return NextResponse.redirect(new URL("/marketing/confirmed?error=invalid", request.url), 303);
  }
  const ip = clientIpFromHeaders(request.headers);
  if (!rateLimit(`marketing-confirm:${ip}`, 20, 60 * 60 * 1000).success) {
    return NextResponse.redirect(new URL("/marketing/confirmed?error=rate", request.url), 303);
  }
  try {
    await confirmEmailMarketingConsent(token, "email-confirmation-page", {
      ip,
      userAgent: request.headers.get("user-agent") || undefined,
    });
    return NextResponse.redirect(new URL("/marketing/confirmed", request.url), 303);
  } catch {
    return NextResponse.redirect(new URL("/marketing/confirmed?error=invalid", request.url), 303);
  }
}
