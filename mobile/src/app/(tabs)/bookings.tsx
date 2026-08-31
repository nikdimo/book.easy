import { useCallback, useEffect, useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import {
  AppScreen,
  EmptyNotice,
  LoadingState,
  Pill,
  Segmented,
} from "@/components/ui";
import { useLanguage } from "@/context/language-context";
import {
  apiFetch,
  BookingAcceptance,
  BookingPaymentDecision,
  BookingSummary,
  BookingsResponse,
  formatDate,
  resolveIntlLocale,
} from "@/lib/api";
import { colors, radii, spacing, fonts, type } from "@/theme";
import { useApiError } from "@/lib/use-api-error";

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
  const describeError = useApiError();
  const { locale, t } = useLanguage();
  const [data, setData] = useState<BookingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  // The acceptance question, open on one booking at a time. `null` acceptance means
  // the answers are still loading; a failure closes the panel with an alert rather
  // than accepting on a guess.
  const [acceptId, setAcceptId] = useState<string | null>(null);
  const [acceptance, setAcceptance] = useState<BookingAcceptance | null>(null);
  const [reason, setReason] = useState("");
  const [filter, setFilter] = useState<"pending" | "confirmed" | "all">("pending");

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await apiFetch<BookingsResponse>("/api/mobile/v1/bookings"));
    } catch (caught) {
      setError(describeError(caught, "Could not load bookings"));
    }
  }, [describeError]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function updateBooking(
    booking: BookingSummary,
    action: "reject" | "cancel"
  ) {
    if (!reason.trim()) return;
    try {
      setBusyId(booking.id);
      await apiFetch(`/api/mobile/v1/bookings/${booking.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action, reason: reason.trim() }),
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

  /**
   * Opens the payment question. The answers come from the server, so the phone can
   * never offer one the service would refuse — a stay with nothing left to collect gets
   * "no instructions needed" alone, and a bank transfer never gets it at all.
   */
  async function openAccept(booking: BookingSummary) {
    setRejectId(null);
    setCancelId(null);
    setAcceptId(booking.id);
    setAcceptance(null);
    try {
      const result = await apiFetch<{
        booking: { acceptance: BookingAcceptance | null };
      }>(`/api/mobile/v1/bookings/${booking.id}`);
      if (!result.booking.acceptance) throw new Error(t("Try again."));
      setAcceptance(result.booking.acceptance);
    } catch (caught) {
      setAcceptId(null);
      Alert.alert(
        t("Could not update booking"),
        caught instanceof Error ? caught.message : t("Try again.")
      );
    }
  }

  /** Accepts with the decision the host just chose. Never with a default. */
  async function acceptBooking(
    booking: BookingSummary,
    decision: BookingPaymentDecision,
    options: BookingAcceptance
  ) {
    try {
      setBusyId(booking.id);
      const response = await apiFetch<{ warning?: string | null }>(
        `/api/mobile/v1/bookings/${booking.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            action: "confirm",
            decision,
            // The phone has no composer, so a send-now sends the details this host
            // already reviewed and saved, resolved on the server. They never travel
            // to the device and back.
            ...(decision === "SEND_NOW"
              ? { useSavedInstructions: true, dueDate: options.dueDate }
              : {}),
          }),
        }
      );
      setAcceptId(null);
      setAcceptance(null);
      if (response.warning) {
        // The booking did update; the warning is about the follow-up send. Calling the
        // whole acceptance a failure invites a second tap against an already-confirmed
        // booking and obscures the action-list recovery path.
        Alert.alert(t("Confirmed"), response.warning);
      }
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

  const bookings = data?.bookings ?? [];
  const pending = bookings.filter((booking) => booking.status === "PENDING");
  const confirmed = bookings.filter((booking) => booking.status === "CONFIRMED");
  const visible =
    filter === "pending" ? pending : filter === "confirmed" ? confirmed : bookings;

  return (
    <AppScreen
      title="Bookings"
      onRefresh={load}
      sticky={
        data ? (
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: "pending", label: "Pending", count: pending.length },
              { value: "confirmed", label: "Confirmed", count: confirmed.length },
              { value: "all", label: "All", count: bookings.length },
            ]}
          />
        ) : null
      }
    >
      {!data && !error ? <LoadingState /> : null}
      {error ? (
        <EmptyNotice
          icon="alert"
          title="Bookings unavailable"
          description={error}
          onRetry={load}
        />
      ) : null}
      {data && visible.length === 0 ? (
        <EmptyNotice
          icon="bookings"
          title={filter === "all" ? "No bookings yet" : "Nothing to review"}
          description={
            filter === "all"
              ? "Bookings will appear here when guests request to stay at your listings."
              : "Requests needing a decision will show up here."
          }
        />
      ) : null}
      <View style={styles.list}>
        {visible.map((booking) => (
          <View key={booking.id} style={styles.card}>
            <Pressable
              accessibilityLabel={`${t("Open booking")}: ${booking.guestName}`}
              accessibilityRole="button"
              onPress={() =>
                router.push({ pathname: "/booking/[id]", params: { id: booking.id } })
              }
            >
            {/* Guest and dates lead, because that is what a host scans for. The
                listing, reference and party size follow on one quiet line — the
                old six-row label/value table ran a full screen per booking. */}
            <View style={styles.header}>
              {booking.imageUrl ? (
                <Image
                  alt=""
                  source={{ uri: booking.imageUrl }}
                  style={styles.thumb}
                />
              ) : null}
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={styles.title}>
                  {booking.guestName}
                </Text>
                <Text style={styles.dates}>
                  {formatDate(booking.checkIn, locale)} –{" "}
                  {formatDate(booking.checkOut, locale)}
                </Text>
              </View>
              <Pill
                label={statusLabels[booking.status] ?? booking.status}
                tone={
                  booking.status === "CONFIRMED"
                    ? "success"
                    : booking.status === "PENDING"
                      ? "warning"
                      : "neutral"
                }
              />
            </View>
            </Pressable>

            <Text numberOfLines={1} style={styles.meta}>
              {booking.listingTitle}
              {" · "}
              {booking.guestCount}{" "}
              {t(booking.guestCount === 1 ? "guest" : "guests")}
              {" · "}
              {booking.reference}
            </Text>

            <View style={styles.priceRow}>
              <Text style={styles.price}>
                {new Intl.NumberFormat(resolveIntlLocale(locale), {
                  style: "currency",
                  currency: "EUR",
                }).format(booking.totalPrice)}
              </Text>
              {booking.status === "PENDING" ? (
                <Text style={styles.respondBy}>
                  {t("Respond by")}{" "}
                  {new Intl.DateTimeFormat(resolveIntlLocale(locale), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(booking.responseDueAt))}
                </Text>
              ) : null}
            </View>

            {booking.guestNote ? (
              <View style={styles.note}>
                <Text style={styles.noteText}>“{booking.guestNote}”</Text>
              </View>
            ) : null}

            {booking.status === "PENDING" &&
            rejectId !== booking.id &&
            acceptId !== booking.id ? (
              <View style={styles.actions}>
                <ActionButton
                  disabled={busyId === booking.id}
                  label={t("Confirm")}
                  onPress={() => void openAccept(booking)}
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

            {/* Accepting is one decision about money, not a yes/no. The host picks it
                here; the server refuses an acceptance that arrives without one. */}
            {booking.status === "PENDING" && acceptId === booking.id ? (
              <View style={styles.cancelForm}>
                <Text style={styles.panelTitle}>{t("Payment instructions")}</Text>
                {!acceptance ? (
                  <Text style={styles.panelHint}>{t("Loading")}</Text>
                ) : (
                  <>
                    <Text style={styles.panelHint}>
                      {t("Guest chose")}:{" "}
                      {acceptance.paymentMethodLabel
                        ? t(acceptance.paymentMethodLabel)
                        : t("Payment method not recorded")}
                      {acceptance.amountDue !== null
                        ? " · " +
                          new Intl.NumberFormat(resolveIntlLocale(locale), {
                            style: "currency",
                            currency: acceptance.currency,
                          }).format(acceptance.amountDue)
                        : ""}
                    </Text>

                    {acceptance.allowedDecisions.includes("SEND_NOW") &&
                    acceptance.canSendNow ? (
                      <View style={styles.decision}>
                        <ActionButton
                          disabled={busyId === booking.id}
                          label={t("Accept and send payment request")}
                          onPress={() =>
                            void acceptBooking(booking, "SEND_NOW", acceptance)
                          }
                        />
                        <Text style={styles.panelHint}>
                          {t(
                            "Review the private details below and send them with the booking total and reference."
                          )}
                        </Text>
                        {acceptance.savedInstructionsPreview ? (
                          <View style={styles.note}>
                            <Text style={styles.noteText}>
                              {acceptance.savedInstructionsPreview}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    ) : null}

                    {acceptance.allowedDecisions.includes("SEND_LATER") ? (
                      <View style={styles.decision}>
                        <ActionButton
                          disabled={busyId === booking.id}
                          label={t("Accept and send later")}
                          onPress={() =>
                            void acceptBooking(booking, "SEND_LATER", acceptance)
                          }
                          secondary
                        />
                        <Text style={styles.panelHint}>
                          {t(
                            "The booking is accepted now and remains in your action list until instructions are sent."
                          )}
                        </Text>
                      </View>
                    ) : null}

                    {acceptance.allowedDecisions.includes("NO_INSTRUCTIONS") ? (
                      <View style={styles.decision}>
                        <ActionButton
                          disabled={busyId === booking.id}
                          label={t("No instructions needed")}
                          onPress={() =>
                            void acceptBooking(booking, "NO_INSTRUCTIONS", acceptance)
                          }
                          secondary
                        />
                        <Text style={styles.panelHint}>
                          {t(
                            "Use this for cash at the property or an arrangement you will make directly."
                          )}
                        </Text>
                      </View>
                    ) : null}
                  </>
                )}
                <ActionButton
                  label={t("Not yet")}
                  onPress={() => {
                    setAcceptId(null);
                    setAcceptance(null);
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
  list: { gap: spacing.md },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  // A 52pt thumbnail instead of a 150pt hero. The photo identifies the listing;
  // it does not need to be the biggest thing on the card.
  thumb: {
    width: 52,
    height: 52,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
  },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  title: { ...type.bodyStrong, color: colors.ink },
  dates: { ...type.meta, color: colors.muted, marginTop: 2 },
  meta: { ...type.caption, color: colors.muted, marginTop: spacing.md },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  price: { ...type.section, color: colors.ink },
  respondBy: { ...type.caption, color: colors.warm, flexShrink: 1, textAlign: "right" },
  details: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.lg },
  detail: { minWidth: "45%", flexGrow: 1, flexDirection: "row", flexWrap: "wrap" },
  detailLabel: { ...type.meta, color: colors.muted },
  detailValue: { ...type.meta, color: colors.ink },
  note: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  noteText: { ...type.meta, color: colors.inkSoft },
  panelTitle: { ...type.bodyStrong, color: colors.ink },
  panelHint: { ...type.caption, color: colors.muted, lineHeight: 16 },
  decision: { gap: spacing.sm, marginTop: spacing.sm },
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
  buttonText: { color: "#fff", fontSize: 11, fontFamily: fonts.bold },
  buttonSecondaryText: { color: colors.ink },
  cancelTrigger: { alignSelf: "flex-start", marginTop: spacing.sm, paddingVertical: spacing.sm },
  cancelTriggerText: { color: colors.danger, fontSize: 11, fontFamily: fonts.semiBold },
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
