import { relativeRedirect } from "@/lib/http/relative-redirect";
import { clientIpFromHeaders, rateLimit } from "@/lib/rate-limit";
import { confirmEmailMarketingConsent } from "@/lib/services/marketing-consent.service";

export async function POST(request: Request) {
  const form = await request.formData();
  const token = form.get("token");
  if (typeof token !== "string" || token.length < 20 || token.length > 200) {
    return relativeRedirect("/marketing/confirmed?error=invalid", 303);
  }
  const ip = clientIpFromHeaders(request.headers);
  if (!rateLimit(`marketing-confirm:${ip}`, 20, 60 * 60 * 1000).success) {
    return relativeRedirect("/marketing/confirmed?error=rate", 303);
  }
  try {
    await confirmEmailMarketingConsent(token, "email-confirmation-page", {
      ip,
      userAgent: request.headers.get("user-agent") || undefined,
    });
    return relativeRedirect("/marketing/confirmed", 303);
  } catch {
    return relativeRedirect("/marketing/confirmed?error=invalid", 303);
  }
}
