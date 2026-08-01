import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import {
  AppScreen,
  EmptyNotice,
  ListRow,
  LoadingState,
  SectionHeader,
  StatTile,
} from "@/components/ui";
import { useLanguage } from "@/context/language-context";
import { AdminStats, fetchAdminStats, openControlPanel } from "@/lib/api";
import { colors, radii, spacing, fonts } from "@/theme";

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
    const timer = setTimeout(() => void loadData(), 0);
    return () => clearTimeout(timer);
  }, [loadData]);

  if (loading) {
    return (
      <AppScreen title="Admin Hub">
        <LoadingState />
      </AppScreen>
    );
  }

  if (error || !stats) {
    return (
      <AppScreen title="Admin Hub">
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
      title="Admin"
      subtitle="Platform overview and moderation queues."
      onRefresh={() => loadData(true)}
      refreshing={refreshing}
    >
      {/* Alert Banner if Pending Listings */}
      {stats.pendingListings > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/admin/pending-listings" as Href)}
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
          <Icon color={colors.muted} name="forward" size={16} />
        </Pressable>
      ) : null}

      <View style={styles.grid}>
        <StatTile
          icon="pending"
          label="To review"
          value={stats.pendingListings}
          accent={stats.pendingListings > 0 ? colors.warm : undefined}
          onPress={() => router.push("/admin/pending-listings" as Href)}
        />
        <StatTile
          icon="confirmed"
          label="Approved"
          value={stats.approvedListings}
          accent={colors.success}
          onPress={() => router.push("/admin/pending-listings" as Href)}
        />
        <StatTile
          icon="users"
          label="Users"
          value={stats.totalUsers}
          onPress={() => router.push("/admin/users" as Href)}
        />
        <StatTile icon="bookings" label="Bookings" value={stats.totalBookings} />
      </View>

      <SectionHeader title="Moderation" />
      <ListRow
        icon="listings"
        label="Listing approvals"
        detail={stats.pendingListings > 0 ? String(stats.pendingListings) : undefined}
        onPress={() => router.push("/admin/pending-listings" as Href)}
      />
      <ListRow
        icon="users"
        label="Users and hosts"
        detail={String(stats.totalUsers)}
        onPress={() => router.push("/admin/users" as Href)}
      />

      <SectionHeader title="Platform" />
      {/* These live on the web control panel only. Linking out is honest — a
          native shell over endpoints that do not exist would be worse. */}
      <ListRow
        icon="report"
        label="Reports and cases"
        onPress={() => void openControlPanel("/admin/cases")}
      />
      <ListRow
        icon="chat"
        label="Communications"
        onPress={() => void openControlPanel("/admin/communications")}
      />
      <ListRow
        icon="confirmed"
        label="Ratings and reviews"
        onPress={() => void openControlPanel("/admin/ratings")}
      />
      <ListRow
        icon="info"
        label="Audit log"
        onPress={() => void openControlPanel("/admin/audit-log")}
      />
      <ListRow
        icon="more"
        label="Platform settings"
        onPress={() => void openControlPanel("/admin/settings")}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", gap: spacing.sm },
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
    fontFamily: fonts.bold,
  },
  alertTitle: {
    color: "#fff",
    fontSize: 15,
    fontFamily: fonts.bold,
  },
  alertSubtitle: {
    color: "#B7C2C5",
    fontSize: 12,
    marginTop: 2,
  },
});
