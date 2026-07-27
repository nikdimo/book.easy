import { PropsWithChildren, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useNotifications } from "@/context/notification-context";
import { useLanguage } from "@/context/language-context";
import { LanguageSelector } from "@/components/language-selector";
import { colors, radii, spacing } from "@/theme";

export function AppScreen({
  eyebrow,
  title,
  subtitle,
  action,
  onRefresh,
  refreshing = false,
  children,
}: PropsWithChildren<{
  eyebrow: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
}>) {
  const router = useRouter();
  const { unreadCount } = useNotifications();
  const { t } = useLanguage();
  return (
    <ScrollView
      contentContainerStyle={styles.screen}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        ) : undefined
      }
    >
      <View style={styles.workspaceBar}>
        <Text style={styles.workspaceLabel}>{t("Hosting dashboard").toUpperCase()}</Text>
        <View style={styles.workspaceActions}>
          <LanguageSelector compact />
          <Pressable
            accessibilityLabel={`${t("Notifications")}, ${unreadCount} ${t("unread")}`}
            accessibilityRole="button"
            onPress={() => router.push("/notifications")}
            style={({ pressed }) => [styles.bellButton, pressed && { opacity: 0.65 }]}
          >
            <Text style={styles.bellIcon}>🔔</Text>
            {unreadCount > 0 ? (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {unreadCount > 99 ? "99+" : unreadCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          {eyebrow ? <Text style={styles.eyebrow}>{t(eyebrow)}</Text> : null}
          <Text style={styles.pageTitle}>{t(title)}</Text>
          {subtitle ? <Text style={styles.subtitle}>{t(subtitle)}</Text> : null}
        </View>
        {action}
      </View>
      {children}
    </ScrollView>
  );
}

export function SectionHeader({ title, count }: { title: string; count?: number }) {
  const { t } = useLanguage();
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{t(title)}</Text>
      {typeof count === "number" ? (
        <View style={styles.count}>
          <Text style={styles.countText}>{count}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function LoadingState() {
  const { t } = useLanguage();
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.loadingText}>{t("Loading")}…</Text>
    </View>
  );
}

export function EmptyNotice({
  title,
  description,
  actionLabel = "Try again",
  onRetry,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onRetry?: () => void;
}) {
  const { t } = useLanguage();
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Text style={styles.emptyIconText}>◇</Text>
      </View>
      <Text style={styles.emptyTitle}>{t(title)}</Text>
      <Text style={styles.emptyDescription}>{t(description)}</Text>
      {onRetry ? (
        <Pressable style={styles.emptyButton} onPress={onRetry}>
          <Text style={styles.emptyButtonText}>{t(actionLabel)}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Pill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "success" | "warning";
}) {
  const { t } = useLanguage();
  const toneStyle = {
    neutral: [colors.surfaceAlt, colors.inkSoft],
    success: [colors.successSoft, colors.success],
    warning: [colors.warmSoft, colors.warm],
  }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: toneStyle[0] }]}>
      <Text style={[styles.pillText, { color: toneStyle[1] }]}>{t(label)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: spacing.xl,
    paddingTop: 52,
    paddingBottom: 56,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
  },
  workspaceBar: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  },
  workspaceLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  workspaceActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  bellButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  bellIcon: { fontSize: 18 },
  notificationBadge: {
    position: "absolute",
    right: -5,
    top: -5,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: colors.danger,
    borderWidth: 2,
    borderColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  notificationBadgeText: { color: "#fff", fontSize: 9, fontWeight: "900" },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: "900", letterSpacing: 1.6 },
  pageTitle: {
    color: colors.ink,
    fontSize: 29,
    lineHeight: 35,
    fontWeight: "900",
    letterSpacing: -0.7,
    marginTop: spacing.sm,
  },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: spacing.sm },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: "900" },
  count: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 7,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: { color: colors.muted, fontSize: 11, fontWeight: "900" },
  loading: { minHeight: 180, alignItems: "center", justifyContent: "center", gap: spacing.md },
  loadingText: { color: colors.muted, fontSize: 13 },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: spacing.xl,
    minHeight: 220,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyIconText: { color: colors.primary, fontSize: 24, fontWeight: "900" },
  emptyTitle: { color: colors.ink, fontSize: 17, fontWeight: "900", marginTop: spacing.md },
  emptyDescription: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  emptyButton: {
    backgroundColor: colors.ink,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    marginTop: spacing.lg,
  },
  emptyButtonText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  pill: { borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 6 },
  pillText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
});
