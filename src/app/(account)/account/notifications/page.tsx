import { NotificationList } from "@/components/communication/notification-list";
import { requireUserPage } from "@/lib/auth-helpers";
import { listUserNotifications } from "@/lib/services/notification.service";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireUserPage("/account/notifications");
  const notifications = await listUserNotifications(user.id, 100);
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold">Notifications</h1>
      <p className="mb-6 mt-1 text-muted-foreground">
        Booking activity, messages, reports, and account updates.
      </p>
      <NotificationList initial={notifications} />
    </div>
  );
}
