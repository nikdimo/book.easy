import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppScreen, EmptyNotice, LoadingState } from "@/components/ui";
import { useLanguage } from "@/context/language-context";
import { apiFetch, DashboardResponse } from "@/lib/api";
import { colors, radii, spacing } from "@/theme";

export default function DashboardScreen() {
  const { t } = useLanguage();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await apiFetch<DashboardResponse>("/api/mobile/v1/dashboard"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load dashboard");
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <AppScreen
      eyebrow=""
      title="Host Dashboard"
      onRefresh={load}
      action={
        <Pressable style={styles.createButton} onPress={() => router.push("/new-listing")}>
          <Text style={styles.createText}>{t("Create Listing")}</Text>
        </Pressable>
      }
    >
      {!data && !error ? <LoadingState /> : null}
      {error ? <EmptyNotice title="Dashboard unavailable" description={error} onRetry={load} /> : null}
      {data ? (
        <View style={styles.grid}>
          <StatCard
            icon="⌂"
            label="My Listings"
            value={data.stats.listings}
            onPress={() => router.push("/(tabs)/listings")}
          />
          <StatCard
            icon="◷"
            label="Pending Requests"
            value={data.stats.pendingBookings}
            onPress={() => router.push("/(tabs)/bookings")}
          />
          <StatCard
            icon="✓"
            label="Confirmed"
            value={data.stats.confirmedBookings}
            onPress={() => router.push("/(tabs)/bookings")}
          />
          <StatCard
            icon="◇"
            label="Total Bookings"
            value={data.stats.totalBookings}
            onPress={() => router.push("/(tabs)/bookings")}
          />
        </View>
      ) : null}
    </AppScreen>
  );
}

function StatCard({
  icon,
  label,
  value,
  onPress,
}: {
  icon: string;
  label: string;
  value: number;
  onPress: () => void;
}) {
  const { t } = useLanguage();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.cardTop}>
        <Text style={styles.label}>{t(label)}</Text>
        <Text style={styles.icon}>{icon}</Text>
      </View>
      <Text style={styles.value}>{value}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  createButton: {
    minHeight: 42,
    borderRadius: radii.md,
    backgroundColor: colors.ink,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  createText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  card: {
    width: "47%",
    minWidth: 140,
    flexGrow: 1,
    minHeight: 116,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  label: { flex: 1, color: colors.muted, fontSize: 12, fontWeight: "700" },
  icon: { color: colors.muted, fontSize: 16 },
  value: { color: colors.ink, fontSize: 31, fontWeight: "900", marginTop: spacing.lg },
  pressed: { opacity: 0.7 },
});
