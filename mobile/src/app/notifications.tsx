import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppScreen, EmptyNotice } from "@/components/ui";
import { useNotifications } from "@/context/notification-context";
import { useLanguage } from "@/context/language-context";
import { Icon, type IconName } from "@/components/icon";
import { formatRelativeTime } from "@/lib/api";
import { colors, radii, spacing, type } from "@/theme";

const icons: Record<string, IconName> = {
  BOOKING_REQUEST: "bookingRequest",
  BOOKING_CONFIRMED: "confirmed",
  BOOKING_REJECTED: "rejected",
  BOOKING_CANCELLED: "cancelled",
  CHAT_MESSAGE: "chat",
  SUPPORT_MESSAGE: "support",
  CASE_SUBMITTED: "report",
  CASE_UPDATED: "updated",
  SYSTEM: "info",
};

export default function NotificationsScreen() {
  const {
    notifications,
    unreadCount,
    refreshNotifications,
    markAllRead,
    openNotification,
  } = useNotifications();
  const { locale, t } = useLanguage();

  return (
    <AppScreen
      title="Notifications"
      subtitle="Booking updates and new messages in one place."
      action={
        unreadCount > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void markAllRead()}
            style={styles.readAll}
          >
            <Text style={styles.readAllText}>{t("Mark all read")}</Text>
          </Pressable>
        ) : null
      }
      onRefresh={refreshNotifications}
    >
      {notifications.length === 0 ? (
        <EmptyNotice
          title="You're all caught up"
          description="Booking and chat notifications will appear here."
        />
      ) : (
        <View style={styles.list}>
          {notifications.map((notification) => (
            <Pressable
              accessibilityLabel={`${notification.title}. ${notification.body}`}
              accessibilityRole="button"
              key={notification.id}
              onPress={() => void openNotification(notification)}
              style={({ pressed }) => [
                styles.item,
                !notification.readAt && styles.unread,
                pressed && { opacity: 0.68 },
              ]}
            >
              <View style={[styles.icon, !notification.readAt && styles.iconUnread]}>
                <Icon
                  color={notification.readAt ? colors.muted : colors.primary}
                  name={icons[notification.type] ?? "info"}
                  size={17}
                />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.itemTop}>
                <Text style={styles.title}>{t(notification.title)}</Text>
                  {!notification.readAt ? <View style={styles.dot} /> : null}
                </View>
                <Text style={styles.body}>{notification.body}</Text>
                <Text style={styles.time}>
                  {formatRelativeTime(notification.createdAt, locale, t)}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  readAll: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    backgroundColor: colors.primarySoft,
  },
  readAllText: { ...type.label, color: colors.primaryDark },
  list: { gap: spacing.sm },
  item: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  unread: { borderColor: colors.primarySoft, backgroundColor: colors.primarySoft },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  iconUnread: { backgroundColor: colors.primarySoft },
  itemTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { ...type.bodyStrong, flex: 1, color: colors.ink },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger },
  body: { ...type.meta, color: colors.inkSoft, marginTop: 4 },
  time: { ...type.caption, color: colors.muted, marginTop: spacing.sm },
});
