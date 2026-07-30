import { NextResponse } from "next/server";
import { clientIpFromHeaders, rateLimit } from "@/lib/rate-limit";
import { unsubscribeEmailMarketing } from "@/lib/services/marketing-consent.service";

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  const form = contentType.includes("form")
    ? await request.formData().catch(() => null)
    : null;
  const token =
    new URL(request.url).searchParams.get("token") ||
    (typeof form?.get("token") === "string" ? String(form.get("token")) : null);
  if (!token || token.length < 20 || token.length > 200) {
    return NextResponse.json({ error: "Invalid unsubscribe link." }, { status: 400 });
  }
  const ip = clientIpFromHeaders(request.headers);
  if (!rateLimit(`marketing-unsubscribe:${ip}`, 30, 60 * 60 * 1000).success) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }
  try {
    await unsubscribeEmailMarketing(token, "one-click-unsubscribe", {
      ip,
      userAgent: request.headers.get("user-agent") || undefined,
    });
  } catch {
    // An unsubscribe endpoint is idempotent from the recipient's perspective.
  }

  const oneClick = form?.get("List-Unsubscribe") === "One-Click";
  if (oneClick || new URL(request.url).searchParams.has("token")) {
    return new NextResponse(null, { status: 204 });
  }
  return NextResponse.redirect(new URL("/unsubscribe/success", request.url), 303);
}
