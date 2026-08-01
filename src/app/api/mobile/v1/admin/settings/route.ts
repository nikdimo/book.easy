import { getMarketplaceSettings } from "@/lib/services/marketplace-settings.service";
import { updateMarketplaceSettings } from "@/lib/actions/marketplace-settings.actions";
import { mobileJson, mobileOptions, requireMobileAdmin } from "@/lib/mobile-api";

/** Platform settings. Saving goes through the same action the web settings page
 *  posts to, which owns the cache invalidation — the settings read is an
 *  unstable_cache, so writing around the action would leave the site serving stale
 *  values for up to five minutes. Admin-only. */
export async function OPTIONS(request: Request) {
  return mobileOptions(request);
}

export async function GET(request: Request) {
  const access = await requireMobileAdmin(request);
  if ("response" in access) return access.response;

  return mobileJson(request, { settings: await getMarketplaceSettings() });
}

export async function PUT(request: Request) {
  const access = await requireMobileAdmin(request);
  if ("response" in access) return access.response;

  const body = (await request.json().catch(() => null)) as {
    featuredMarketEnabled?: boolean;
    featuredCity?: string;
    featuredCountry?: string;
  } | null;
  if (!body) {
    return mobileJson(request, { error: "Invalid settings" }, { status: 400 });
  }

  const result = await updateMarketplaceSettings({
    featuredMarketEnabled: Boolean(body.featuredMarketEnabled),
    featuredCity: body.featuredCity ?? "",
    featuredCountry: body.featuredCountry ?? "",
  });
  if (result && "error" in result && result.error) {
    return mobileJson(request, { error: result.error }, { status: 400 });
  }
  return mobileJson(request, { success: true });
}
