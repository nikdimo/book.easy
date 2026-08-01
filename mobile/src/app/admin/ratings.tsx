import { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import {
  AppScreen,
  EmptyNotice,
  LoadingState,
  Pill,
  Segmented,
  SoftButton,
} from "@/components/ui";
import { LabeledInput } from "@/components/listing/labeled-input";
import { useLanguage } from "@/context/language-context";
import { useApiError } from "@/lib/use-api-error";
import { apiFetch, formatDate } from "@/lib/api";
import { colors, radii, spacing, type } from "@/theme";

interface AdminReview {
  id: string;
  status: string;
  comment: string;
  submittedAt: string | null;
  author: { id: string; name: string | null } | null;
  subjectUser: { id: string; name: string | null } | null;
  listing: { id: string; title: string } | null;
  averageRating: number | null;
  unread: boolean;
}

export default function AdminRatingsScreen() {
  const describeError = useApiError();
  const { locale, t } = useLanguage();
  const [reviews, setReviews] = useState<AdminReview[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const result = await apiFetch<{ reviews: AdminReview[] }>(
        "/api/mobile/v1/admin/ratings"
      );
      setReviews(result.reviews);
    } catch (caught) {
      setError(describeError(caught, "Could not load reviews"));
    }
  }, [describeError]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function moderate(
    review: AdminReview,
    action: "APPROVE" | "REJECT" | "HIDE" | "RESTORE"
  ) {
    // The server refuses a rejection with no reason; asking here means the admin
    // never loses their click to a validation error.
    if (action === "REJECT" && !note.trim()) return;
    try {
      setBusy(true);
      await apiFetch("/api/mobile/v1/admin/ratings", {
        method: "POST",
        body: JSON.stringify({
          reviewId: review.id,
          action,
          note: action === "REJECT" ? note.trim() : undefined,
        }),
      });
      setRejecting(null);
      setNote("");
      await load();
    } catch (caught) {
      Alert.alert(
        t("Could not moderate"),
        caught instanceof Error ? caught.message : t("Try again.")
      );
    } finally {
      setBusy(false);
    }
  }

  const all = reviews ?? [];
  const pending = all.filter((review) => review.status === "PENDING_ADMIN");
  const visible = filter === "pending" ? pending : all;

  return (
    <AppScreen
      title="Ratings"
      onRefresh={load}
      sticky={
        reviews ? (
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: "pending", label: "Awaiting review", count: pending.length },
              { value: "all", label: "All", count: all.length },
            ]}
          />
        ) : null
      }
    >
      {!reviews && !error ? <LoadingState /> : null}
      {error ? (
        <EmptyNotice
          icon="alert"
          title="Reviews unavailable"
          description={error}
          onRetry={load}
        />
      ) : null}
      {reviews && visible.length === 0 ? (
        <EmptyNotice
          icon="confirmed"
          title={filter === "pending" ? "Nothing to moderate" : "No reviews"}
          description="Guest reviews appear here for approval."
        />
      ) : null}

      <View style={styles.list}>
        {visible.map((review) => (
          <View key={review.id} style={styles.card}>
            <View style={styles.top}>
              <Text style={styles.rating}>
                {review.averageRating != null ? review.averageRating.toFixed(1) : "—"}
              </Text>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={styles.who}>
                  {review.author?.name ?? t("Unknown")}
                  {review.listing ? ` · ${review.listing.title}` : ""}
                </Text>
                <Text style={styles.date}>
                  {review.submittedAt ? formatDate(review.submittedAt, locale) : ""}
                </Text>
              </View>
              <Pill
                label={review.status.replaceAll("_", " ")}
                tone={
                  review.status === "APPROVED"
                    ? "success"
                    : review.status === "PENDING_ADMIN"
                      ? "warning"
                      : "neutral"
                }
              />
            </View>

            {review.comment ? (
              <Text style={styles.comment}>“{review.comment}”</Text>
            ) : null}

            {rejecting === review.id ? (
              <View style={styles.rejectForm}>
                <LabeledInput
                  label={t("Reason for the author")}
                  hint={t("Required. The author sees this.")}
                  multiline
                  value={note}
                  onChangeText={setNote}
                />
                <View style={styles.actions}>
                  <SoftButton
                    label="Cancel"
                    tone="neutral"
                    onPress={() => {
                      setRejecting(null);
                      setNote("");
                    }}
                  />
                  <SoftButton
                    label="Confirm rejection"
                    tone="danger"
                    disabled={busy || !note.trim()}
                    onPress={() => void moderate(review, "REJECT")}
                  />
                </View>
              </View>
            ) : (
              <View style={styles.actions}>
                {review.status !== "APPROVED" ? (
                  <SoftButton
                    icon="check"
                    label="Approve"
                    disabled={busy}
                    onPress={() => void moderate(review, "APPROVE")}
                  />
                ) : null}
                {review.status !== "REJECTED" ? (
                  <SoftButton
                    label="Reject"
                    tone="danger"
                    disabled={busy}
                    onPress={() => {
                      setRejecting(review.id);
                      setNote("");
                    }}
                  />
                ) : null}
                {review.status === "APPROVED" ? (
                  <SoftButton
                    icon="hide"
                    label="Hide"
                    tone="neutral"
                    disabled={busy}
                    onPress={() => void moderate(review, "HIDE")}
                  />
                ) : null}
                {review.status === "HIDDEN" ? (
                  <SoftButton
                    icon="preview"
                    label="Restore"
                    tone="neutral"
                    disabled={busy}
                    onPress={() => void moderate(review, "RESTORE")}
                  />
                ) : null}
              </View>
            )}
          </View>
        ))}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  card: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  top: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  rating: { ...type.title, color: colors.ink, minWidth: 44 },
  who: { ...type.bodyStrong, color: colors.ink },
  date: { ...type.caption, color: colors.muted, marginTop: 2 },
  comment: { ...type.meta, color: colors.inkSoft },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  rejectForm: { gap: spacing.md },
});
