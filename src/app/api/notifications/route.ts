import { auth } from "@/lib/auth";
import {
  getUnreadNotificationCount,
  listUserNotifications,
  markAllUserNotificationsRead,
} from "@/lib/services/notification.service";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  const [notifications, unreadCount] = await Promise.all([
    listUserNotifications(session.user.id, 30),
    getUnreadNotificationCount(session.user.id),
  ]);
  return Response.json({ notifications, unreadCount });
}

export async function PATCH() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  await markAllUserNotificationsRead(session.user.id);
  return Response.json({ success: true, unreadCount: 0 });
}
