import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppScreen, EmptyNotice } from "@/components/ui";
import { useNotifications } from "@/context/notification-context";
import { useLanguage } from "@/context/language-context";
import { formatRelativeTime } from "@/lib/api";
import { colors, radii, spacing } from "@/theme";

const icons: Record<string, string> = {
  BOOKING_REQUEST: "B",
  BOOKING_CONFIRMED: "✓",
  BOOKING_REJECTED: "×",
  BOOKING_CANCELLED: "!",
  CHAT_MESSAGE: "C",
  SUPPORT_MESSAGE: "S",
  CASE_SUBMITTED: "R",
  CASE_UPDATED: "U",
  SYSTEM: "i",
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
      eyebrow="ACTIVITY"
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
                <Text style={[styles.iconText, !notification.readAt && styles.iconTextUnread]}>
                  {icons[notification.type] ?? "i"}
                </Text>
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
  readAllText: { color: colors.primaryDark, fontSize: 11, fontWeight: "800" },
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
  unread: { borderColor: "#B8D5DA", backgroundColor: "#F4FAFB" },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  iconUnread: { backgroundColor: colors.primary },
  iconText: { color: colors.ink, fontSize: 14, fontWeight: "900" },
  iconTextUnread: { color: "#fff" },
  itemTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { flex: 1, color: colors.ink, fontSize: 14, fontWeight: "900" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger },
  body: { color: colors.inkSoft, fontSize: 13, lineHeight: 19, marginTop: 4 },
  time: { color: colors.muted, fontSize: 10, marginTop: spacing.sm },
});
