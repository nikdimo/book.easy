import { auth } from "@/lib/auth";
import { markUserNotificationRead } from "@/lib/services/notification.service";

export async function PATCH(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id } = await context.params;
  const found = await markUserNotificationRead(session.user.id, id);
  return found
    ? Response.json({ success: true })
    : Response.json({ error: "Notification not found" }, { status: 404 });
}
