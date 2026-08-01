import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import {
  AppScreen,
  EmptyNotice,
  LoadingState,
  Pill,
  PrimaryButton,
  SectionHeader,
  Segmented,
} from "@/components/ui";
import { useLanguage } from "@/context/language-context";
import { Icon, type IconName } from "@/components/icon";
import {
  apiFetch,
  formatDate,
  ListingSummary,
  ListingsResponse,
  openControlPanel,
  resolveIntlLocale,
} from "@/lib/api";
import { colors, radii, spacing, fonts, type } from "@/theme";
import { confirmAction } from "@/lib/confirm";
import { useApiError } from "@/lib/use-api-error";

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
  const describeError = useApiError();
  const { locale, t } = useLanguage();
  const [data, setData] = useState<ListingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "live" | "drafts">("all");

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await apiFetch<ListingsResponse>("/api/mobile/v1/listings"));
    } catch (caught) {
      setError(describeError(caught, "Could not load properties"));
    }
  }, [describeError]);

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

  const drafts = data?.drafts ?? [];
  const listings = data?.listings ?? [];
  const live = listings.filter((listing) => listing.status === "APPROVED");
  const visibleListings = filter === "live" ? live : listings;
  const showDrafts = filter === "all" || filter === "drafts";
  const showListings = filter !== "drafts";

  return (
    <AppScreen
      title="Listings"
      onRefresh={load}
      action={
        <PrimaryButton
          compact
          icon="add"
          label="New"
          onPress={() => router.push("/new-listing")}
        />
      }
      sticky={
        data ? (
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All", count: listings.length + drafts.length },
              { value: "live", label: "Live", count: live.length },
              { value: "drafts", label: "Drafts", count: drafts.length },
            ]}
          />
        ) : null
      }
    >
      {!data && !error ? <LoadingState /> : null}
      {error ? (
        <EmptyNotice
          icon="alert"
          title="Listings unavailable"
          description={error}
          onRetry={load}
        />
      ) : null}

      {showDrafts && drafts.length ? (
        <>
          <SectionHeader title="In-progress drafts" count={drafts.length} />
          <View style={styles.list}>
            {drafts.map((draft) => (
              <View key={draft.id} style={styles.rowCard}>
                <View style={{ flex: 1 }}>
                  <View style={styles.titleLine}>
                    <Text numberOfLines={1} style={styles.title}>{draft.title}</Text>
                    <Pill label="Draft" />
                  </View>
                  {draft.step ? (
                    <Text style={styles.strongMeta}>
                      {t("Stopped at Step {step} of {total}: {title}", {
                        step: draft.step.position,
                        total: draft.step.total,
                        title: t(draft.step.title),
                      })}
                    </Text>
                  ) : null}
                  <Text style={styles.meta}>
                    {t("Last edited")} {formatDate(draft.updatedAt, locale)}
                  </Text>
                </View>
                <View style={styles.rowActions}>
                  <SmallButton
                    label={t("Continue")}
                    onPress={() =>
                      router.push({
                        pathname: "/new-listing",
                        params: { draft: draft.id },
                      })
                    }
                  />
                  <IconButton
                    accessibilityLabel={t("Delete draft")}
                    destructive
                    disabled={busyId === draft.id}
                    icon="trash"
                    onPress={() => deleteDraft(draft.id, draft.title)}
                  />
                </View>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {showListings && visibleListings.length ? (
        <SectionHeader title="Published" count={visibleListings.length} />
      ) : null}
      {data && visibleListings.length === 0 && (!showDrafts || drafts.length === 0) ? (
        <EmptyNotice
          title={filter === "all" ? "No listings yet" : "Nothing here"}
          description={
            filter === "all"
              ? "Create your first listing to start receiving bookings."
              : "Try a different filter."
          }
          actionLabel={filter === "all" ? "Create Listing" : "Show all"}
          onRetry={
            filter === "all"
              ? () => router.push("/new-listing")
              : () => setFilter("all")
          }
        />
      ) : null}
      <View style={styles.list}>
        {(showListings ? visibleListings : []).map((listing) => (
          <View key={listing.id} style={styles.rowCard}>
            <Pressable
              accessibilityLabel={`${t("Edit")}: ${listing.title}`}
              accessibilityRole="button"
              onPress={() =>
                router.push({ pathname: "/listing/[id]", params: { id: listing.id } })
              }
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
                onPress={() =>
                router.push({ pathname: "/listing/[id]", params: { id: listing.id } })
              }
              />
              <IconButton
                accessibilityLabel={t("Calendar")}
                icon="bookings"
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
                    icon="preview"
                    onPress={() => void openControlPanel(`/properties/${listing.slug}`)}
                  />
                  <IconButton
                    accessibilityLabel={t("Hide from site")}
                    disabled={busyId === listing.id}
                    icon="hide"
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
                icon="trash"
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
  icon,
  onPress,
  destructive = false,
  disabled = false,
}: {
  accessibilityLabel: string;
  icon: IconName;
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
      <Icon color={destructive ? colors.danger : colors.ink} name={icon} size={16} />
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
  primaryText: { color: "#fff", fontSize: 12, fontFamily: fonts.bold },
  list: { gap: spacing.md },
  rowCard: {
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  titleLine: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { ...type.bodyStrong, flexShrink: 1, color: colors.ink },
  strongMeta: { ...type.meta, color: colors.ink, marginTop: 6 },
  meta: { ...type.meta, color: colors.muted, marginTop: 4 },
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
  smallButtonText: { color: colors.ink, fontSize: 11, fontFamily: fonts.bold },
  iconButton: {
    width: 38,
    height: 38,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  iconText: { color: colors.ink, fontSize: 15, fontFamily: fonts.bold },
  destructiveButton: { borderColor: "#EAC1C1", backgroundColor: "#FFF8F8" },
  destructiveText: { color: colors.danger, fontSize: 20 },
});
