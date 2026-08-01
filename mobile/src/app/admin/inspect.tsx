import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AppScreen, EmptyNotice, LoadingState, Pill, SectionHeader } from "@/components/ui";
import { useLanguage } from "@/context/language-context";
import {
  absoluteMediaUrl,
  AdminListingDetail,
  fetchAdminListingDetail,
  reviewAdminListing,
} from "@/lib/api";
import { colors, radii, spacing, fonts } from "@/theme";

export default function ListingInspectScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const listingId = params.id;
  const { t } = useLanguage();

  const [detail, setDetail] = useState<AdminListingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [suspendModalOpen, setSuspendModalOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");

  const loadData = useCallback(async () => {
    if (!listingId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetchAdminListingDetail(listingId);
      setDetail(res.listing);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load listing details");
    } finally {
      setLoading(false);
    }
  }, [listingId]);

  useEffect(() => {
    const timer = setTimeout(() => void loadData(), 0);
    return () => clearTimeout(timer);
  }, [loadData]);

  const handleApprove = async () => {
    if (!listingId) return;
    try {
      setActionLoading(true);
      await reviewAdminListing(listingId, "approve");
      await loadData();
      alert("Listing approved successfully!");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to approve listing");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSuspend = async () => {
    if (!listingId || !suspendReason.trim()) {
      alert("Please provide a reason for suspension.");
      return;
    }
    try {
      setActionLoading(true);
      await reviewAdminListing(listingId, "suspend", suspendReason.trim());
      setSuspendModalOpen(false);
      setSuspendReason("");
      await loadData();
      alert("Listing suspended.");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to suspend listing");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <AppScreen eyebrow="ADMIN" title="Inspect Listing">
        <LoadingState />
      </AppScreen>
    );
  }

  if (error || !detail) {
    return (
      <AppScreen eyebrow="ADMIN" title="Inspect Listing">
        <EmptyNotice
          title="Could not load details"
          description={error || "Listing not found"}
          onRetry={() => void loadData()}
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen eyebrow="ADMIN REVIEW" title={detail.title}>
      {/* Back Button */}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.back()}
        style={styles.backButton}
      >
        <Icon color={colors.ink} name="back" size={14} />
            <Text style={styles.backButtonText}>{t("Back to Queue")}</Text>
      </Pressable>

      {/* Status & NeedsReview Badges */}
      <View style={styles.badgeRow}>
        {detail.needsReview ? (
          <Pill label="NEEDS REVIEW" tone="warning" />
        ) : null}
        <Pill
          label={detail.status}
          tone={
            detail.status === "APPROVED"
              ? "success"
              : detail.status === "SUSPENDED"
              ? "warning"
              : "neutral"
          }
        />
        <Text style={styles.propertyType}>{detail.propertyType}</Text>
      </View>

      {/* Photo Carousel Preview */}
      {detail.images.length > 0 ? (
        <ScrollView horizontal pagingEnabled style={styles.gallery}>
          {detail.images.map((img) => (
            <Image
              key={img.id}
              alt={img.caption ?? detail.title}
              source={{ uri: absoluteMediaUrl(img.url) }}
              style={styles.galleryImage}
              resizeMode="cover"
            />
          ))}
        </ScrollView>
      ) : (
        <View style={styles.noImagesBox}>
          <Text style={styles.noImagesText}>No photos uploaded</Text>
        </View>
      )}

      {/* Host Information Card */}
      <SectionHeader title="Host Profile" />
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>{detail.host.name || "Unnamed Host"}</Text>
        <Text style={styles.infoDetail}>{detail.host.email}</Text>
      </View>

      {/* Specs & Pricing Card */}
      <SectionHeader title="Property Details & Rates" />
      <View style={styles.infoCard}>
        <Text style={styles.infoDetail}>
          {detail.address}, {detail.city}, {detail.country}
        </Text>
        <Text style={styles.infoDetail}>
          Max Guests: {detail.maxGuests} • Bedrooms: {detail.bedrooms} • Beds: {detail.beds} • Bathrooms: {detail.bathrooms}
        </Text>
        <Text style={[styles.infoTitle, { marginTop: spacing.sm }]}>
          Base Nightly Rate: {detail.nightlyRate ? `${detail.nightlyRate} ${detail.currency}` : "Not set"}
        </Text>
      </View>

      {/* Description */}
      <SectionHeader title="Description" />
      <View style={styles.infoCard}>
        <Text style={styles.descriptionText}>{detail.description || "No description provided."}</Text>
      </View>

      {/* Amenities */}
      {detail.amenities.length > 0 ? (
        <>
          <SectionHeader title="Amenities" />
          <View style={styles.amenitiesGrid}>
            {detail.amenities.map((a, i) => (
              <View key={i} style={styles.amenityTag}>
                <Icon color={colors.success} name="check" size={12} />
                <Text style={styles.amenityTagText}>{a}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {/* Moderation Note if present */}
      {detail.moderationNote ? (
        <View style={styles.moderationCard}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Icon color={colors.warm} name="alert" size={14} />
              <Text style={styles.moderationTitle}>Moderation Note:</Text>
            </View>
          <Text style={styles.moderationText}>{detail.moderationNote}</Text>
        </View>
      ) : null}

      {/* Action Controls */}
      <SectionHeader title="Moderation Action" />
      <View style={styles.actionRow}>
        {detail.needsReview || detail.status !== "APPROVED" ? (
          <Pressable
            accessibilityRole="button"
            disabled={actionLoading}
            onPress={() => void handleApprove()}
            style={({ pressed }) => [
              styles.approveBtn,
              pressed && { opacity: 0.7 },
              actionLoading && { opacity: 0.5 },
            ]}
          >
            {actionLoading ? null : <Icon color="#fff" name="check" size={15} />}
            <Text style={styles.approveBtnText}>
              {actionLoading ? "Processing…" : "Approve Listing"}
            </Text>
          </Pressable>
        ) : null}

        {detail.status === "APPROVED" ? (
          <Pressable
            accessibilityRole="button"
            disabled={actionLoading}
            onPress={() => setSuspendModalOpen(true)}
            style={({ pressed }) => [
              styles.suspendBtn,
              pressed && { opacity: 0.7 },
              actionLoading && { opacity: 0.5 },
            ]}
          >
            <Icon color="#fff" name="hide" size={15} />
            <Text style={styles.suspendBtnText}>Suspend Listing</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Suspension Modal */}
      <Modal visible={suspendModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Suspend Property</Text>
            <Text style={styles.modalSubtitle}>
              Please state the reason for suspending this property. The host will be notified.
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g., Incomplete address, misleading photos, policy violation"
              placeholderTextColor={colors.muted}
              multiline
              value={suspendReason}
              onChangeText={setSuspendReason}
            />
            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setSuspendModalOpen(false)}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={actionLoading}
                onPress={() => void handleSuspend()}
                style={styles.modalConfirmBtn}
              >
                <Text style={styles.modalConfirmText}>
                  {actionLoading ? "Processing…" : "Confirm Suspension"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignSelf: "flex-start",
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  backButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontFamily: fonts.bold,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  propertyType: {
    color: colors.muted,
    fontSize: 12,
    fontFamily: fonts.semiBold,
    marginLeft: spacing.xs,
  },
  gallery: {
    height: 220,
    borderRadius: radii.xl,
    marginBottom: spacing.md,
  },
  galleryImage: {
    width: 320,
    height: 220,
    borderRadius: radii.xl,
    marginRight: spacing.sm,
    backgroundColor: colors.surfaceAlt,
  },
  noImagesBox: {
    height: 140,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.xl,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  noImagesText: {
    color: colors.muted,
    fontSize: 14,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: spacing.lg,
  },
  infoTitle: {
    color: colors.ink,
    fontSize: 15,
    fontFamily: fonts.bold,
  },
  infoDetail: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  descriptionText: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 21,
  },
  amenitiesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  amenityTag: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: "row",
    gap: spacing.sm
  },
  amenityTagText: {
    color: colors.ink,
    fontSize: 12,
    fontFamily: fonts.semiBold,
  },
  moderationCard: {
    backgroundColor: "#FFF6F6",
    borderWidth: 1,
    borderColor: "#F2C9C9",
    borderRadius: radii.xl,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  moderationTitle: {
    color: colors.danger,
    fontSize: 13,
    fontFamily: fonts.bold,
  },
  moderationText: {
    color: colors.ink,
    fontSize: 13,
    marginTop: 4,
  },
  actionRow: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  approveBtn: {
    height: 50,
    backgroundColor: colors.success,
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.sm
  },
  approveBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: fonts.bold,
  },
  suspendBtn: {
    height: 50,
    backgroundColor: "#FFF6F6",
    borderWidth: 1,
    borderColor: "#F2C9C9",
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  suspendBtnText: {
    color: colors.danger,
    fontSize: 15,
    fontFamily: fonts.bold,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  modalContent: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.xl,
  },
  modalTitle: {
    color: colors.ink,
    fontSize: 18,
    fontFamily: fonts.bold,
  },
  modalSubtitle: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 4,
    marginBottom: spacing.md,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    minHeight: 80,
    textAlignVertical: "top",
    color: colors.ink,
    fontSize: 14,
    marginBottom: spacing.lg,
  },
  modalActions: {
    flexDirection: "row",
    gap: spacing.md,
  },
  modalCancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancelText: {
    color: colors.ink,
    fontSize: 13,
    fontFamily: fonts.semiBold,
  },
  modalConfirmBtn: {
    flex: 1,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  modalConfirmText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: fonts.bold,
  },
});
