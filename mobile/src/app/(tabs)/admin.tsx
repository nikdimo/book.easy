import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { AppScreen, EmptyNotice, LoadingState, SectionHeader } from "@/components/ui";
import { useLanguage } from "@/context/language-context";
import { AdminStats, fetchAdminStats } from "@/lib/api";
import { colors, radii, spacing } from "@/theme";

export default function AdminScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const res = await fetchAdminStats();
      setStats(res.stats);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load admin stats");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (loading) {
    return (
      <AppScreen eyebrow="PLATFORM" title="Admin Hub">
        <LoadingState />
      </AppScreen>
    );
  }

  if (error || !stats) {
    return (
      <AppScreen eyebrow="PLATFORM" title="Admin Hub">
        <EmptyNotice
          title="Could not load admin stats"
          description={error || "An error occurred while fetching platform stats."}
          onRetry={() => void loadData()}
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen
      eyebrow="PLATFORM CONTROL"
      title="Admin Hub"
      subtitle="Overview of properties, pending reviews, users, and bookings."
      onRefresh={() => loadData(true)}
      refreshing={refreshing}
    >
      {/* Alert Banner if Pending Listings */}
      {stats.pendingListings > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/admin/pending-listings" as any)}
          style={({ pressed }) => [styles.alertCard, pressed && { opacity: 0.8 }]}
        >
          <View style={styles.alertBadge}>
            <Text style={styles.alertBadgeText}>{stats.pendingListings}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.alertTitle}>{t("Pending Review Listings")}</Text>
            <Text style={styles.alertSubtitle}>
              {t("Listings are waiting for admin inspection & approval")}
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      ) : null}

      <SectionHeader title="Platform Stats" />
      <View style={styles.grid}>
        <StatCard
          label="Pending Review"
          value={stats.pendingListings}
          accent={stats.pendingListings > 0 ? colors.warm : colors.muted}
          highlight={stats.pendingListings > 0}
          onPress={() => router.push("/admin/pending-listings" as any)}
        />
        <StatCard
          label="Approved Listings"
          value={stats.approvedListings}
          accent={colors.success}
          onPress={() => router.push("/admin/pending-listings" as any)}
        />
        <StatCard
          label="Total Users"
          value={stats.totalUsers}
          subtext={`${stats.totalHosts} hosts`}
          onPress={() => router.push("/admin/users" as any)}
        />
        <StatCard
          label="Total Bookings"
          value={stats.totalBookings}
          subtext={`${stats.pendingBookings} pending`}
        />
      </View>

      <SectionHeader title="Admin Workflows" />
      <View style={styles.workflowList}>
        <WorkflowCard
          title="Listing Approvals Queue"
          subtitle="Review submitted host properties and decide on approval or suspension."
          icon="📋"
          badge={stats.pendingListings > 0 ? `${stats.pendingListings} pending` : undefined}
          onPress={() => router.push("/admin/pending-listings" as any)}
        />
        <WorkflowCard
          title="User & Host Management"
          subtitle="Inspect registered platform users, view activity, and manage account statuses."
          icon="👥"
          badge={`${stats.totalUsers} accounts`}
          onPress={() => router.push("/admin/users" as any)}
        />
      </View>

    </AppScreen>
  );
}

function StatCard({
  label,
  value,
  subtext,
  accent,
  highlight,
  onPress,
}: {
  label: string;
  value: number;
  subtext?: string;
  accent?: string;
  highlight?: boolean;
  onPress?: () => void;
}) {
  const { t } = useLanguage();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.statCard,
        highlight && styles.statCardHighlight,
        pressed && onPress ? { opacity: 0.75 } : null,
      ]}
    >
      <Text style={[styles.statValue, accent ? { color: accent } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{t(label)}</Text>
      {subtext ? <Text style={styles.statSubtext}>{subtext}</Text> : null}
    </Pressable>
  );
}

function WorkflowCard({
  title,
  subtitle,
  icon,
  badge,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: string;
  badge?: string;
  onPress: () => void;
}) {
  const { t } = useLanguage();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.workflowCard, pressed && { opacity: 0.7 }]}
    >
      <View style={styles.workflowIconBox}>
        <Text style={{ fontSize: 22 }}>{icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
          <Text style={styles.workflowTitle}>{t(title)}</Text>
          {badge ? (
            <View style={styles.workflowBadge}>
              <Text style={styles.workflowBadgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.workflowSubtitle}>{t(subtitle)}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  statCard: {
    flex: 1,
    minWidth: 150,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  statCardHighlight: {
    borderColor: colors.warm,
    backgroundColor: colors.warmSoft,
  },
  statValue: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  statLabel: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
    marginTop: spacing.xs,
  },
  statSubtext: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  alertCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.ink,
    borderRadius: radii.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  alertBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.warm,
    alignItems: "center",
    justifyContent: "center",
  },
  alertBadgeText: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900",
  },
  alertTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
  alertSubtitle: {
    color: "#B7C2C5",
    fontSize: 12,
    marginTop: 2,
  },
  chevron: {
    color: colors.muted,
    fontSize: 24,
  },
  workflowList: {
    gap: spacing.md,
  },
  workflowCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: spacing.lg,
  },
  workflowIconBox: {
    width: 48,
    height: 48,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  workflowTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
  },
  workflowSubtitle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  workflowBadge: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  workflowBadgeText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "800",
  },
});
