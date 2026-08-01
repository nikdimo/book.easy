import { useCallback, useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Image, StyleSheet, Text, View } from "react-native";
import {
  AppScreen,
  EmptyNotice,
  ListRow,
  LoadingState,
  Pill,
} from "@/components/ui";
import { useLanguage } from "@/context/language-context";
import { useApiError } from "@/lib/use-api-error";
import {
  absoluteMediaUrl,
  apiFetch,
  formatDate,
  resolveIntlLocale,
} from "@/lib/api";
import { colors, radii, spacing, type } from "@/theme";

interface BookingDetail {
  id: string;
  reference: string;
  status: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  guestNote: string | null;
  totalPrice: number;
  nightlyRate: number;
  cleaningFee: number;
  createdAt: string;
  responseDueAt: string | null;
  cancellationReason: string | null;
  guest: { id: string; name: string | null; email: string | null };
  listing: {
    id: string;
    title: string;
    city: string;
    country: string;
    imageUrl: string | null;
  };
  conversationId: string | null;
}

/** Read-only detail. Confirm/reject/cancel stay on the Bookings list, where the
 *  required-reason forms already live — duplicating those flows here would mean two
 *  places to keep the reason rules correct. */
export default function BookingDetailScreen() {
  const describeError = useApiError();
  const { locale, t } = useLanguage();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      const result = await apiFetch<{ booking: BookingDetail }>(
        `/api/mobile/v1/bookings/${encodeURIComponent(id)}`
      );
      setBooking(result.booking);
    } catch (caught) {
      setError(describeError(caught, "Could not load this booking"));
    }
  }, [describeError, id]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  function money(value: number) {
    return new Intl.NumberFormat(resolveIntlLocale(locale), {
      style: "currency",
      currency: "EUR",
    }).format(value);
  }

  const nights =
    booking &&
    Math.max(
      1,
      Math.round(
        (new Date(booking.checkOut).getTime() - new Date(booking.checkIn).getTime()) /
          86_400_000
      )
    );

  return (
    <AppScreen title={booking?.guest.name ?? "Booking"} onRefresh={load}>
      {!booking && !error ? <LoadingState /> : null}
      {error ? (
        <EmptyNotice
          icon="alert"
          title="Booking unavailable"
          description={error}
          onRetry={load}
        />
      ) : null}

      {booking ? (
        <View style={styles.stack}>
          <View style={styles.badges}>
            <Pill
              label={booking.status.replaceAll("_", " ")}
              tone={
                booking.status === "CONFIRMED"
                  ? "success"
                  : booking.status === "PENDING"
                    ? "warning"
                    : "neutral"
              }
            />
            <Pill label={booking.reference} />
          </View>

          <View style={styles.card}>
            <View style={styles.listingRow}>
              {booking.listing.imageUrl ? (
                <Image
                  alt=""
                  source={{ uri: absoluteMediaUrl(booking.listing.imageUrl) }}
                  style={styles.thumb}
                />
              ) : null}
              <View style={{ flex: 1 }}>
                <Text numberOfLines={2} style={styles.listingTitle}>
                  {booking.listing.title}
                </Text>
                <Text style={styles.meta}>
                  {booking.listing.city}, {booking.listing.country}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <Row label={t("Check in")} value={formatDate(booking.checkIn, locale)} />
            <Row label={t("Check out")} value={formatDate(booking.checkOut, locale)} />
            <Row
              label={t("Nights")}
              value={`${nights} · ${booking.guestCount} ${t(
                booking.guestCount === 1 ? "guest" : "guests"
              )}`}
            />
            {booking.responseDueAt && booking.status === "PENDING" ? (
              <Row
                label={t("Respond by")}
                value={formatDate(booking.responseDueAt, locale)}
                tone="warn"
              />
            ) : null}
          </View>

          <View style={styles.card}>
            <Row label={t("Nightly rate")} value={money(booking.nightlyRate)} />
            <Row label={t("Cleaning fee")} value={money(booking.cleaningFee)} />
            <Row label={t("Total")} value={money(booking.totalPrice)} strong />
          </View>

          {booking.guestNote ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t("Guest note")}</Text>
              <Text style={styles.body}>“{booking.guestNote}”</Text>
            </View>
          ) : null}

          {booking.cancellationReason ? (
            <View style={[styles.card, styles.cancelled]}>
              <Text style={styles.cardTitle}>{t("Cancellation reason")}</Text>
              <Text style={styles.body}>{booking.cancellationReason}</Text>
            </View>
          ) : null}

          {booking.conversationId ? (
            <ListRow
              icon="chat"
              label="Open conversation"
              onPress={() =>
                router.push({
                  pathname: "/chat/[id]",
                  params: { id: booking.conversationId as string },
                })
              }
            />
          ) : null}
          <ListRow
            icon="listings"
            label="Open listing"
            onPress={() =>
              router.push({
                pathname: "/listing/[id]",
                params: { id: booking.listing.id },
              })
            }
          />
        </View>
      ) : null}
    </AppScreen>
  );
}

function Row({
  label,
  value,
  strong = false,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "warn";
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[
          styles.rowValue,
          strong && styles.rowValueStrong,
          tone === "warn" && { color: colors.warm },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  card: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  cancelled: { borderColor: colors.dangerSoft, backgroundColor: colors.dangerSoft },
  cardTitle: { ...type.label, color: colors.inkSoft },
  listingRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
  },
  listingTitle: { ...type.bodyStrong, color: colors.ink },
  meta: { ...type.caption, color: colors.muted, marginTop: 2 },
  body: { ...type.body, color: colors.ink },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  rowLabel: { ...type.meta, color: colors.muted },
  rowValue: { ...type.meta, color: colors.ink },
  rowValueStrong: { ...type.bodyStrong, color: colors.ink },
});
