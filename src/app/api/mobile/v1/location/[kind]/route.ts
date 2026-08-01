import { mobileJson, mobileOptions, requireMobileHost } from "@/lib/mobile-api";
import { handleLocationRequest } from "@/lib/services/location-requests";

/** Mobile-callable location lookups. These mirror /api/location/* one-for-one and
 *  share their validation, rate limiting and services via handleLocationRequest —
 *  the wrappers exist only because the web routes emit no CORS headers, so the Expo
 *  web preview cannot reach them. No business logic lives here. */
const KINDS = {
  autocomplete: "autocomplete",
  reverse: "reverse",
  "place-details": "place-details",
  streetview: "street-view",
} as const;

type RouteContext = { params: Promise<{ kind: string }> };

export async function OPTIONS(request: Request) {
  return mobileOptions(request);
}

export async function POST(request: Request, { params }: RouteContext) {
  const { kind } = await params;
  const resolved = KINDS[kind as keyof typeof KINDS];
  if (!resolved) {
    return mobileJson(request, { error: "Unknown location lookup" }, { status: 404 });
  }

  // Host access, matching requireHostForLocation on the web side. Admins are
  // included because requireMobileHost admits them, and an admin editing a listing
  // needs the same lookups a host does.
  const access = await requireMobileHost(request);
  if ("response" in access) return access.response;

  const body = await request.json().catch(() => null);
  const result = await handleLocationRequest(access.user.id, resolved, body);
  return mobileJson(request, result.body, { status: result.status });
}
