import { useCallback, useEffect, useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AppScreen, EmptyNotice, LoadingState, Pill } from "@/components/ui";
import { useLanguage } from "@/context/language-context";
import {
  apiFetch,
  BookingSummary,
  BookingsResponse,
  formatDate,
  resolveIntlLocale,
} from "@/lib/api";
import { colors, radii, spacing } from "@/theme";

const statusLabels: Record<string, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
  CANCELLED_BY_GUEST: "Cancelled by Guest",
  CANCELLED_BY_HOST: "Cancelled by Host",
  CANCELLED_BY_ADMIN: "Cancelled by Admin",
  COMPLETED: "Completed",
};

export default function BookingsScreen() {
  const { locale, t } = useLanguage();
  const [data, setData] = useState<BookingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await apiFetch<BookingsResponse>("/api/mobile/v1/bookings"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load bookings");
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function updateBooking(
    booking: BookingSummary,
    action: "confirm" | "reject" | "cancel"
  ) {
    if ((action === "cancel" || action === "reject") && !reason.trim()) return;
    try {
      setBusyId(booking.id);
      await apiFetch(`/api/mobile/v1/bookings/${booking.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          action,
          reason: action === "cancel" || action === "reject" ? reason.trim() : undefined,
        }),
      });
      setCancelId(null);
      setRejectId(null);
      setReason("");
      await load();
    } catch (caught) {
      Alert.alert(
        t("Could not update booking"),
        caught instanceof Error ? caught.message : t("Try again.")
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppScreen eyebrow="" title="Booking Requests" onRefresh={load}>
      {!data && !error ? <LoadingState /> : null}
      {error ? <EmptyNotice title="Bookings unavailable" description={error} onRetry={load} /> : null}
      {data?.bookings.length === 0 ? (
        <EmptyNotice
          title="No bookings yet"
          description="Bookings will appear here when guests request to stay at your listings."
        />
      ) : null}
      <View style={styles.list}>
        {data?.bookings.map((booking) => (
          <View key={booking.id} style={styles.card}>
            {booking.imageUrl ? (
              <Image
                accessibilityLabel={booking.listingTitle}
                alt={booking.listingTitle}
                source={{ uri: booking.imageUrl }}
                style={styles.image}
              />
            ) : null}
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{booking.listingTitle}</Text>
                <Text style={styles.city}>{booking.city}</Text>
              </View>
              <Pill
                label={statusLabels[booking.status] ?? booking.status}
                tone={booking.status === "CONFIRMED" ? "success" : "neutral"}
              />
            </View>

            <View style={styles.details}>
              <Detail label="Guest" value={booking.guestName} />
              <Detail label="Reference" value={booking.reference} />
              <Detail
                label="Dates"
                value={`${formatDate(booking.checkIn, locale)} – ${formatDate(booking.checkOut, locale)}`}
              />
              <Detail label="Guests" value={String(booking.guestCount)} />
              {booking.status === "PENDING" ? (
                <Detail
                  label="Respond by"
                  value={new Intl.DateTimeFormat(resolveIntlLocale(locale), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(booking.responseDueAt))}
                />
              ) : null}
              <Detail
                label="Total"
                value={new Intl.NumberFormat(resolveIntlLocale(locale), {
                  style: "currency",
                  currency: "EUR",
                }).format(booking.totalPrice)}
                strong
              />
            </View>

            {booking.guestNote ? (
              <View style={styles.note}>
                <Text style={styles.noteText}>“{booking.guestNote}”</Text>
              </View>
            ) : null}

            {booking.status === "PENDING" && rejectId !== booking.id ? (
              <View style={styles.actions}>
                <ActionButton
                  disabled={busyId === booking.id}
                  label={t("Confirm")}
                  onPress={() =>
                    Alert.alert(
                      t("Confirm booking"),
                      t("Accept this request and reserve these dates for the guest?"),
                      [
                        { text: t("Not yet"), style: "cancel" },
                        {
                          text: t("Confirm"),
                          onPress: () => void updateBooking(booking, "confirm"),
                        },
                      ]
                    )
                  }
                />
                <ActionButton
                  disabled={busyId === booking.id}
                  label={t("Reject")}
                  onPress={() => {
                    setRejectId(booking.id);
                    setReason("");
                  }}
                  secondary
                />
              </View>
            ) : null}

            {booking.status === "PENDING" && rejectId === booking.id ? (
              <View style={styles.cancelForm}>
                <Text style={styles.warning}>
                  {t("Tell the guest why you cannot accept this request. A reason is required.")}
                </Text>
                <TextInput
                  multiline
                  onChangeText={setReason}
                  placeholder={t("Decline reason (required)")}
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                  value={reason}
                />
                <View style={styles.actions}>
                  <ActionButton
                    destructive
                    disabled={busyId === booking.id || !reason.trim()}
                    label={t("Decline request")}
                    onPress={() => void updateBooking(booking, "reject")}
                  />
                  <ActionButton
                    label={t("Keep request")}
                    onPress={() => {
                      setRejectId(null);
                      setReason("");
                    }}
                    secondary
                  />
                </View>
              </View>
            ) : null}

            {booking.status === "CONFIRMED" && cancelId !== booking.id ? (
              <Pressable
                accessibilityLabel={t("Cancel booking")}
                accessibilityRole="button"
                onPress={() => {
                  setCancelId(booking.id);
                  setReason("");
                }}
                style={styles.cancelTrigger}
              >
                <Text style={styles.cancelTriggerText}>{t("Cancel booking")}</Text>
              </Pressable>
            ) : null}

            {booking.status === "CONFIRMED" && cancelId === booking.id ? (
              <View style={styles.cancelForm}>
                <Text style={styles.warning}>
                  {t("Cancelling a confirmed booking should only be used for emergencies. A reason is required.")}
                </Text>
                <TextInput
                  onChangeText={setReason}
                  placeholder={t("Reason (required)")}
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                  value={reason}
                />
                <View style={styles.actions}>
                  <ActionButton
                    destructive
                    disabled={busyId === booking.id || !reason.trim()}
                    label={t("Confirm cancellation")}
                    onPress={() => void updateBooking(booking, "cancel")}
                  />
                  <ActionButton
                    label={t("Keep booking")}
                    onPress={() => {
                      setCancelId(null);
                      setReason("");
                    }}
                    secondary
                  />
                </View>
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </AppScreen>
  );
}

function Detail({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  const { t } = useLanguage();
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{t(label)}: </Text>
      <Text style={[styles.detailValue, strong && { fontWeight: "800" }]}>{value}</Text>
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  secondary = false,
  destructive = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        secondary && styles.buttonSecondary,
        destructive && styles.buttonDestructive,
        disabled && { opacity: 0.4 },
      ]}
    >
      <Text style={[styles.buttonText, secondary && styles.buttonSecondaryText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: 150,
    borderRadius: radii.md,
    marginBottom: spacing.md,
    backgroundColor: colors.surfaceAlt,
  },
  header: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  title: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  city: { color: colors.muted, fontSize: 12, marginTop: 3 },
  details: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.lg },
  detail: { minWidth: "45%", flexGrow: 1, flexDirection: "row", flexWrap: "wrap" },
  detailLabel: { color: colors.muted, fontSize: 12 },
  detailValue: { color: colors.ink, fontSize: 12 },
  note: { backgroundColor: colors.surfaceAlt, borderRadius: 7, padding: spacing.sm, marginTop: spacing.md },
  noteText: { color: colors.inkSoft, fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  button: {
    minHeight: 38,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.ink,
    backgroundColor: colors.ink,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonSecondary: { backgroundColor: colors.surface, borderColor: colors.borderStrong },
  buttonDestructive: { backgroundColor: colors.danger, borderColor: colors.danger },
  buttonText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  buttonSecondaryText: { color: colors.ink },
  cancelTrigger: { alignSelf: "flex-start", marginTop: spacing.sm, paddingVertical: spacing.sm },
  cancelTriggerText: { color: colors.danger, fontSize: 11, fontWeight: "700" },
  cancelForm: { marginTop: spacing.sm, gap: spacing.sm },
  warning: { color: colors.danger, fontSize: 11, lineHeight: 17 },
  input: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    color: colors.ink,
    fontSize: 12,
  },
});
