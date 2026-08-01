import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import {
  AppScreen,
  EmptyNotice,
  ListRow,
  LoadingState,
  PrimaryButton,
  SectionHeader,
  StatTile,
} from "@/components/ui";
import { useLanguage } from "@/context/language-context";
import { useAuth } from "@/context/auth-context";
import { useApiError } from "@/lib/use-api-error";
import { apiFetch, DashboardResponse } from "@/lib/api";
import { colors, spacing } from "@/theme";

export default function DashboardScreen() {
  const describeError = useApiError();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await apiFetch<DashboardResponse>("/api/mobile/v1/dashboard"));
    } catch (caught) {
      setError(describeError(caught, "Could not load dashboard"));
    }
  }, [describeError]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  // First name only. "Welcome back, Aleksandar Dimitrievski" wraps to two lines on a
  // narrow phone and pushes the metrics down for no benefit.
  const firstName = user?.name?.trim().split(/\s+/)[0];

  return (
    <AppScreen
      title={firstName ? `${t("Hi")}, ${firstName}` : t("Home")}
      subtitle="Here is what needs you today."
      onRefresh={load}
    >
      {!data && !error ? <LoadingState /> : null}
      {error ? (
        <EmptyNotice
          icon="alert"
          title="Dashboard unavailable"
          description={error}
          onRetry={load}
        />
      ) : null}

      {data ? (
        <>
          {/* One row of four, not a 2×2 grid of tall cards. The old layout filled
              the viewport with four numbers before anything actionable appeared. */}
          <View style={styles.stats}>
            <StatTile
              icon="listings"
              label="Listings"
              value={data.stats.listings}
              onPress={() => router.push("/(tabs)/listings")}
            />
            <StatTile
              icon="pending"
              label="Pending"
              value={data.stats.pendingBookings}
              accent={data.stats.pendingBookings > 0 ? colors.warm : undefined}
              onPress={() => router.push("/(tabs)/bookings")}
            />
            <StatTile
              icon="confirmed"
              label="Confirmed"
              value={data.stats.confirmedBookings}
              accent={colors.success}
              onPress={() => router.push("/(tabs)/bookings")}
            />
            <StatTile
              icon="bookings"
              label="Total"
              value={data.stats.totalBookings}
              onPress={() => router.push("/(tabs)/bookings")}
            />
          </View>

          <View style={styles.cta}>
            <PrimaryButton
              icon="add"
              label="Create a listing"
              onPress={() => router.push("/new-listing")}
            />
          </View>

          <SectionHeader title="Manage" />
          <ListRow
            icon="listings"
            label="Listings and drafts"
            onPress={() => router.push("/(tabs)/listings")}
          />
          <ListRow
            icon="bookings"
            label="Booking requests"
            detail={
              data.stats.pendingBookings > 0
                ? String(data.stats.pendingBookings)
                : undefined
            }
            onPress={() => router.push("/(tabs)/bookings")}
          />
          <ListRow
            icon="inbox"
            label="Messages"
            onPress={() => router.push("/(tabs)/inbox")}
          />
          <ListRow
            icon="bell"
            label="Notifications"
            onPress={() => router.push("/notifications")}
          />
        </>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", gap: spacing.sm },
  cta: { marginTop: spacing.lg },
});
