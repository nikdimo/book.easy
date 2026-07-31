import { mobileJson, mobileOptions, requireMobileAdmin } from "@/lib/mobile-api";
import { getAllUsersForAdmin } from "@/lib/services/admin.service";
import { deactivateUser, reactivateUser } from "@/lib/actions/admin.actions";

export async function OPTIONS(request: Request) {
  return mobileOptions(request);
}

export async function GET(request: Request) {
  const access = await requireMobileAdmin(request);
  if ("response" in access) return access.response;

  const users = await getAllUsersForAdmin();

  const formatted = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    isHost: u.isHost,
    isActive: u.isActive,
    image: u.image,
    listingsCount: u._count?.listings ?? 0,
    bookingsCount: u._count?.bookings ?? 0,
    createdAt: u.createdAt.toISOString(),
  }));

  return mobileJson(request, { users: formatted });
}

export async function POST(request: Request) {
  const access = await requireMobileAdmin(request);
  if ("response" in access) return access.response;

  const body = await request.json().catch(() => ({}));
  const { userId, isActive } = body as { userId?: string; isActive?: boolean };

  if (!userId || typeof isActive !== "boolean") {
    return mobileJson(request, { error: "Invalid parameters" }, { status: 400 });
  }

  const res = isActive
    ? await reactivateUser(userId)
    : await deactivateUser(userId);

  if (res && "error" in res && res.error) {
    return mobileJson(request, { error: res.error }, { status: 400 });
  }

  return mobileJson(request, { success: true });
}
