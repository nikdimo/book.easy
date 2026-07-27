import { db } from "@/lib/db";
import { mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";

export async function OPTIONS(request: Request) {
  return mobileOptions(request);
}

export async function GET(request: Request) {
  const access = await requireMobileUser(request);
  if ("response" in access) return access.response;

  const [notifications, unreadCount] = await Promise.all([
    db.notification.findMany({
      where: { userId: access.user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.notification.count({
      where: { userId: access.user.id, readAt: null },
    }),
  ]);

  return mobileJson(request, {
    unreadCount,
    notifications: notifications.map((notification) => ({
      ...notification,
      createdAt: notification.createdAt.toISOString(),
      readAt: notification.readAt?.toISOString() ?? null,
    })),
  });
}

export async function PATCH(request: Request) {
  const access = await requireMobileUser(request);
  if ("response" in access) return access.response;

  await db.notification.updateMany({
    where: { userId: access.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  return mobileJson(request, { success: true, unreadCount: 0 });
}
