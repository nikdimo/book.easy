import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { AppScreen, EmptyNotice, LoadingState, Pill, SectionHeader } from "@/components/ui";
import { useLanguage } from "@/context/language-context";
import {
  AdminListingSummary,
  fetchAdminListings,
  reviewAdminListing,
} from "@/lib/api";
import { colors, radii, spacing } from "@/theme";

type FilterTab = "needs_review" | "all" | "approved" | "suspended";

export default function PendingListingsScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const [listings, setListings] = useState<AdminListingSummary[]>([]);
  const [activeTab, setActiveTab] = useState<FilterTab>("needs_review");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const res = await fetchAdminListings();
      setListings(res.listings);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load listings");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleApprove = async (id: string) => {
    try {
      setProcessingId(id);
      await reviewAdminListing(id, "approve");
      await loadData(true);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to approve listing");
    } finally {
      setProcessingId(null);
    }
  };

  const filtered = listings.filter((item) => {
    if (activeTab === "needs_review") return item.needsReview;
    if (activeTab === "approved") return item.status === "APPROVED" && !item.needsReview;
    if (activeTab === "suspended") return item.status === "SUSPENDED";
    return true;
  });

  const needsReviewCount = listings.filter((l) => l.needsReview).length;

  if (loading) {
    return (
      <AppScreen eyebrow="ADMIN" title="Listing Approvals">
        <LoadingState />
      </AppScreen>
    );
  }

  return (
    <AppScreen
      eyebrow="ADMIN MODERATION"
      title="Listing Approvals"
      subtitle="Inspect and manage host listing submissions."
      onRefresh={() => loadData(true)}
      refreshing={refreshing}
    >
      {/* Back to Admin Hub link */}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.back()}
        style={styles.backButton}
      >
        <Text style={styles.backButtonText}>← {t("Back to Admin Hub")}</Text>
      </Pressable>

      {/* Filter Tabs */}
      <View style={styles.tabContainer}>
        <TabChip
          label={`Needs Review (${needsReviewCount})`}
          active={activeTab === "needs_review"}
          onPress={() => setActiveTab("needs_review")}
        />
        <TabChip
          label="All Listings"
          active={activeTab === "all"}
          onPress={() => setActiveTab("all")}
        />
        <TabChip
          label="Approved"
          active={activeTab === "approved"}
          onPress={() => setActiveTab("approved")}
        />
        <TabChip
          label="Suspended"
          active={activeTab === "suspended"}
          onPress={() => setActiveTab("suspended")}
        />
      </View>

      <SectionHeader title="Listings Queue" count={filtered.length} />

      {error ? (
        <EmptyNotice
          title="Could not load queue"
          description={error}
          onRetry={() => void loadData()}
        />
      ) : filtered.length === 0 ? (
        <EmptyNotice
          title="No listings found"
          description={
            activeTab === "needs_review"
              ? "All submitted properties have been reviewed. Great job!"
              : "No properties match the selected filter."
          }
        />
      ) : (
        <View style={styles.list}>
          {filtered.map((item) => (
            <View key={item.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    {item.needsReview ? (
                      <Pill label="NEEDS REVIEW" tone="warning" />
                    ) : item.status === "APPROVED" ? (
                      <Pill label="APPROVED" tone="success" />
                    ) : (
                      <Pill label={item.status} tone="neutral" />
                    )}
                  </View>
                  <Text style={styles.cardSubtitle}>
                    📍 {item.city} • {t("Host")}: {item.hostName} ({item.hostEmail})
                  </Text>
                </View>
              </View>

              <View style={styles.cardMeta}>
                <Text style={styles.metaPrice}>
                  {item.nightlyRate ? `${item.nightlyRate} ${item.currency}` : "No rate set"} / night
                </Text>
                <Text style={styles.metaBookings}>{item.bookingCount} bookings</Text>
              </View>

              <View style={styles.cardActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({
                      pathname: "/admin/inspect" as any,
                      params: { id: item.id },
                    })
                  }
                  style={({ pressed }) => [styles.inspectButton, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.inspectButtonText}>{t("Inspect Details")}</Text>
                </Pressable>


                {item.needsReview ? (
                  <Pressable
                    accessibilityRole="button"
                    disabled={processingId === item.id}
                    onPress={() => void handleApprove(item.id)}
                    style={({ pressed }) => [
                      styles.approveButton,
                      pressed && { opacity: 0.7 },
                      processingId === item.id && { opacity: 0.5 },
                    ]}
                  >
                    <Text style={styles.approveButtonText}>
                      {processingId === item.id ? t("Approving…") : `✓ ${t("Approve")}`}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      )}
    </AppScreen>
  );
}

function TabChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignSelf: "flex-start",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.md,
  },
  backButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "800",
  },
  tabContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
  },
  chipActive: {
    backgroundColor: colors.ink,
  },
  chipText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "700",
  },
  chipTextActive: {
    color: "#fff",
  },
  list: {
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: spacing.lg,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: spacing.md,
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
  },
  cardSubtitle: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginBottom: spacing.md,
  },
  metaPrice: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800",
  },
  metaBookings: {
    color: colors.muted,
    fontSize: 12,
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  inspectButton: {
    flex: 1,
    height: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  inspectButtonText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
  },
  approveButton: {
    flex: 1,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
  },
  approveButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
});
