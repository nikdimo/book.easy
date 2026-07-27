import { db } from "@/lib/db";
import { mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";

export async function OPTIONS(request: Request) {
  return mobileOptions(request);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const access = await requireMobileUser(request);
  if ("response" in access) return access.response;

  const { id } = await context.params;
  const result = await db.notification.updateMany({
    where: { id, userId: access.user.id },
    data: { readAt: new Date() },
  });
  if (result.count === 0) {
    return mobileJson(request, { error: "Notification not found" }, { status: 404 });
  }

  return mobileJson(request, { success: true });
}
