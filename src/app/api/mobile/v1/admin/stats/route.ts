import { mobileJson, mobileOptions, requireMobileAdmin } from "@/lib/mobile-api";
import { getAdminDashboardStats } from "@/lib/services/admin.service";

export async function OPTIONS(request: Request) {
  return mobileOptions(request);
}

export async function GET(request: Request) {
  const access = await requireMobileAdmin(request);
  if ("response" in access) return access.response;

  const stats = await getAdminDashboardStats();
  return mobileJson(request, { stats });
}
