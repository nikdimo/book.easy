import { NotificationList } from "@/components/communication/notification-list";
import { requireUserPage } from "@/lib/auth-helpers";
import { listUserNotifications } from "@/lib/services/notification.service";
import { getT, T } from "@/lib/i18n/t";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const t = await getT();
  const user = await requireUserPage("/account/notifications");
  const notifications = await listUserNotifications(user.id, 100);
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold"><T t={t} k="notifications.title" source="Notifications" /></h1>
      <p className="mb-6 mt-1 text-muted-foreground">
        <T t={t} k="notifications.subheading" source="Booking activity, messages, reports, and account updates." />
      </p>
      <NotificationList initial={notifications} />
    </div>
  );
}
