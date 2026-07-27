import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { AppScreen, EmptyNotice, LoadingState, Pill, SectionHeader } from "@/components/ui";
import { useLanguage } from "@/context/language-context";
import {
  apiFetch,
  formatDate,
  ListingSummary,
  ListingsResponse,
  openControlPanel,
  resolveIntlLocale,
} from "@/lib/api";
import { colors, radii, spacing } from "@/theme";
import { confirmAction } from "@/lib/confirm";

const stepTitles = [
  "Property type",
  "Location",
  "Property details",
  "Amenities",
  "Photos",
  "Description",
  "Pricing",
];

const statusLabels: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_REVIEW: "Pending Review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  UNPUBLISHED: "Unpublished",
  SUSPENDED: "Suspended",
  ARCHIVED: "Archived",
};

export default function ListingsScreen() {
  const { locale, t } = useLanguage();
  const [data, setData] = useState<ListingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await apiFetch<ListingsResponse>("/api/mobile/v1/listings"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load properties");
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  function deleteDraft(id: string, title: string) {
    confirmAction(
      t("Delete draft"),
      `${t("Delete")} “${title}”?`,
      { cancel: t("Cancel"), confirm: t("Delete") },
      () => {
        void (async () => {
          try {
            setBusyId(id);
            await apiFetch(`/api/mobile/v1/drafts/${id}`, { method: "DELETE" });
            await load();
          } catch (caught) {
            Alert.alert(t("Could not delete draft"), caught instanceof Error ? caught.message : t("Try again."));
          } finally {
            setBusyId(null);
          }
        })();
      },
      true
    );
  }

  async function listingAction(listing: ListingSummary, action: "unpublish" | "delete") {
    try {
      setBusyId(listing.id);
      await apiFetch(`/api/mobile/v1/listings/${listing.id}`, {
        method: action === "delete" ? "DELETE" : "PATCH",
        ...(action === "unpublish"
          ? { body: JSON.stringify({ action: "unpublish" }) }
          : {}),
      });
      await load();
    } catch (caught) {
      Alert.alert(
        t(action === "delete" ? "Could not delete listing" : "Could not hide listing"),
        caught instanceof Error ? caught.message : t("Try again.")
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppScreen
      eyebrow=""
      title="My Listings"
      onRefresh={load}
      action={
        <Pressable
          accessibilityRole="button"
          style={styles.primaryButton}
          onPress={() => router.push("/new-listing")}
        >
          <Text style={styles.primaryText}>{t("New Listing")}</Text>
        </Pressable>
      }
    >
      {!data && !error ? <LoadingState /> : null}
      {error ? <EmptyNotice title="Listings unavailable" description={error} onRetry={load} /> : null}

      {data?.drafts.length ? (
        <>
          <SectionHeader title="In-progress drafts" count={data.drafts.length} />
          <View style={styles.list}>
            {data.drafts.map((draft) => (
              <View key={draft.id} style={styles.rowCard}>
                <View style={{ flex: 1 }}>
                  <View style={styles.titleLine}>
                    <Text numberOfLines={1} style={styles.title}>{draft.title}</Text>
                    <Pill label="Draft" />
                  </View>
                  <Text style={styles.strongMeta}>
                    {t("Stopped at Step")} {draft.currentStep + 1} {t("of")} 7:{" "}
                    {t(stepTitles[draft.currentStep])}
                  </Text>
                  <Text style={styles.meta}>
                    {t("Last edited")} {formatDate(draft.updatedAt, locale)}
                  </Text>
                </View>
                <View style={styles.rowActions}>
                  <SmallButton
                    label={t("Continue")}
                    onPress={() =>
                      void openControlPanel(`/host/listings/new?draft=${draft.id}`)
                    }
                  />
                  <IconButton
                    accessibilityLabel={t("Delete draft")}
                    destructive
                    disabled={busyId === draft.id}
                    label="×"
                    onPress={() => deleteDraft(draft.id, draft.title)}
                  />
                </View>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {data ? <SectionHeader title="My Listings" count={data.listings.length} /> : null}
      {data && data.listings.length === 0 && data.drafts.length === 0 ? (
        <EmptyNotice
          title="No listings yet"
          description="Create your first listing to start receiving bookings."
          actionLabel="Create Listing"
          onRetry={() => router.push("/new-listing")}
        />
      ) : null}
      <View style={styles.list}>
        {data?.listings.map((listing) => (
          <View key={listing.id} style={styles.rowCard}>
            <Pressable
              accessibilityLabel={`${t("Edit")}: ${listing.title}`}
              accessibilityRole="button"
              onPress={() => void openControlPanel(`/host/listings/${listing.id}/edit`)}
              style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.6 }]}
            >
              <View style={styles.titleLine}>
                <Text numberOfLines={1} style={styles.title}>{listing.title}</Text>
                <Pill
                  label={statusLabels[listing.status] ?? listing.status}
                  tone={listing.status === "APPROVED" ? "success" : "neutral"}
                />
              </View>
              <Text style={styles.meta}>
                {listing.city}
                {listing.nightlyRate != null
                  ? ` · ${new Intl.NumberFormat(resolveIntlLocale(locale), {
                      style: "currency",
                      currency: listing.currency,
                      maximumFractionDigits: 0,
                    }).format(listing.nightlyRate)}/${t("night")}`
                  : ""}
                {` · ${listing.bookingCount} ${t(listing.bookingCount === 1 ? "booking" : "bookings")}`}
              </Text>
            </Pressable>
            <View style={styles.rowActions}>
              <SmallButton
                label={t("Edit")}
                onPress={() => void openControlPanel(`/host/listings/${listing.id}/edit`)}
              />
              <IconButton
                accessibilityLabel={t("Calendar")}
                label="◇"
                onPress={() =>
                  router.push({
                    pathname: "/availability/[id]",
                    params: { id: listing.id },
                  })
                }
              />
              {listing.status === "APPROVED" ? (
                <>
                  <IconButton
                    accessibilityLabel={t("Preview")}
                    label="↗"
                    onPress={() => void openControlPanel(`/properties/${listing.slug}`)}
                  />
                  <IconButton
                    accessibilityLabel={t("Hide from site")}
                    disabled={busyId === listing.id}
                    label="◉"
                    onPress={() =>
                      confirmAction(
                        t("Hide from site"),
                        `${t("Hide")} “${listing.title}” ${t("from the site?")}`,
                        { cancel: t("Cancel"), confirm: t("Hide") },
                        () => void listingAction(listing, "unpublish")
                      )
                    }
                  />
                </>
              ) : null}
              <IconButton
                accessibilityLabel={t("Delete")}
                destructive
                disabled={busyId === listing.id}
                label="×"
                onPress={() =>
                  confirmAction(
                    t("Delete"),
                    `${t("Delete")} “${listing.title}”?`,
                    { cancel: t("Cancel"), confirm: t("Delete") },
                    () => void listingAction(listing, "delete"),
                    true
                  )
                }
              />
            </View>
          </View>
        ))}
      </View>
    </AppScreen>
  );
}

function SmallButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.smallButton}>
      <Text style={styles.smallButtonText}>{label}</Text>
    </Pressable>
  );
}

function IconButton({
  accessibilityLabel,
  label,
  onPress,
  destructive = false,
  disabled = false,
}: {
  accessibilityLabel: string;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.iconButton, destructive && styles.destructiveButton, disabled && { opacity: 0.4 }]}
    >
      <Text style={[styles.iconText, destructive && styles.destructiveText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  primaryButton: {
    minHeight: 42,
    borderRadius: radii.md,
    backgroundColor: colors.ink,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  list: { gap: spacing.sm },
  rowCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.md,
  },
  titleLine: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { flexShrink: 1, color: colors.ink, fontSize: 14, fontWeight: "800" },
  strongMeta: { color: colors.ink, fontSize: 12, fontWeight: "700", marginTop: 5 },
  meta: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  rowActions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
  smallButton: {
    minHeight: 38,
    minWidth: 66,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  smallButtonText: { color: colors.ink, fontSize: 11, fontWeight: "800" },
  iconButton: {
    width: 38,
    height: 38,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  iconText: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  destructiveButton: { borderColor: "#EAC1C1", backgroundColor: "#FFF8F8" },
  destructiveText: { color: colors.danger, fontSize: 20 },
});
