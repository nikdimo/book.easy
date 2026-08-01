import { POST as webUpload } from "@/app/api/upload/route";
import { mobileJson, mobileOptions, requireMobileHost } from "@/lib/mobile-api";

/** Mobile-callable file upload.
 *
 *  This delegates to the web handler rather than reimplementing it. That route does
 *  real security work — magic-byte sniffing so a renamed file cannot slip through on
 *  a spoofed Content-Type, HEIC to JPEG conversion, per-user rate limiting and size
 *  caps — and a second copy of that would be a second thing to get wrong. The only
 *  reason this wrapper exists is CORS: the web route returns a plain NextResponse
 *  with no CORS headers, so the Expo web preview on :8081 cannot post to :3000.
 *
 *  The origin and host checks run first, so an unauthorised caller never reaches the
 *  upload path at all. The web route re-checks the session itself. */
export async function OPTIONS(request: Request) {
  return mobileOptions(request);
}

export async function POST(request: Request) {
  const access = await requireMobileHost(request);
  if ("response" in access) return access.response;

  const response = await webUpload(request);
  const body = await response.json().catch(() => null);
  return mobileJson(request, body, { status: response.status });
}
