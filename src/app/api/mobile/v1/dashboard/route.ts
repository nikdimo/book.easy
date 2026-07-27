import { getHostDashboardStats } from "@/lib/services/listing.service";
import { mobileJson, mobileOptions, requireMobileHost } from "@/lib/mobile-api";

export async function OPTIONS(request: Request) {
  return mobileOptions(request);
}

export async function GET(request: Request) {
  const access = await requireMobileHost(request);
  if ("response" in access) return access.response;

  const stats = await getHostDashboardStats(access.user.id);
  return mobileJson(request, { stats });
}
