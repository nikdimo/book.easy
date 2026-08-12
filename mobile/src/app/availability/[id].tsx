import { useCallback, useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import {
  AppScreen,
  EmptyNotice,
  LoadingState,
  PrimaryButton,
} from "@/components/ui";
import {
  ListingWorkspaceNav,
  type ListingWorkspaceDestination,
} from "@/components/listing-workspace-nav";
import {
  AvailabilityCalendar,
  type CalendarLens,
} from "@/components/availability-calendar";
import { PromotionsPanel } from "@/components/listing/promotions-panel";
import { LabeledInput } from "@/components/listing/labeled-input";
import { AvailabilityResponse, apiFetch, openControlPanel } from "@/lib/api";
import { useLanguage } from "@/context/language-context";
import { useApiError } from "@/lib/use-api-error";
import { Icon } from "@/components/icon";
import { colors, radii, spacing, type } from "@/theme";

/** One calendar, three lenses.
 *
 *  The calendar component stays mounted across lens changes, so the selected date
 *  range carries from Availability to Pricing to Promotions — which is the point of
 *  the web workspace. Only the action panel beneath the month grid swaps. */
export default function AvailabilityScreen() {
  const router = useRouter();
  const describeError = useApiError();
  const params = useLocalSearchParams<{
    id?: string | string[];
    lens?: string | string[];
  }>();
  const id = firstParam(params.id);
  const initialLens = calendarLensFromParam(firstParam(params.lens));
  const [data, setData] = useState<AvailabilityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lens, setLens] = useState<CalendarLens>(initialLens);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      setData(
        await apiFetch<AvailabilityResponse>(
          `/api/mobile/v1/listings/${id}/availability`
        )
      );
    } catch (caught) {
      setError(describeError(caught, "Could not load calendar"));
    }
  }, [describeError, id]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  function selectWorkspace(destination: ListingWorkspaceDestination) {
    if (!id) return;
    if (destination === "listing") {
      router.replace({ pathname: "/listing/[id]", params: { id } });
      return;
    }
    setLens(destination);
  }

  const title =
    lens === "availability"
      ? "Availability"
      : lens === "pricing"
        ? "Pricing"
        : "Promotions";

  return (
    <View style={styles.screen}>
      <AppScreen
        title={title}
        subtitle={data?.listing.title}
        onRefresh={load}
        action={
          data ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Preview"
              onPress={() => void openControlPanel(`/properties/${data.listing.slug}`)}
              style={({ pressed }) => [styles.previewButton, pressed && { opacity: 0.6 }]}
            >
              <Icon color={colors.ink} name="preview" size={19} />
            </Pressable>
          ) : null
        }
      >
        {!data && !error ? <LoadingState /> : null}
        {error ? (
          <EmptyNotice
            icon="alert"
            title="Calendar unavailable"
            description={error}
            onRetry={load}
          />
        ) : null}
        {data && data.listing.baseNightlyRate == null ? (
          <EmptyNotice
            icon="alert"
            title="Listing pricing is missing"
            description="Add a nightly rate on the listing before managing the calendar."
          />
        ) : null}

        {data?.listing.baseNightlyRate != null && id ? (
          <>
            {lens === "pricing" ? (
              <DefaultPricing listingId={id} data={data} reload={load} />
            ) : null}

            <AvailabilityCalendar
              data={data}
              listingId={id}
              reload={load}
              lens={lens}
              promotionsPanel={(selection) => (
                <PromotionsPanel
                  listingId={id}
                  promotions={data.promotions}
                  cleaningFee={data.listing.cleaningFee}
                  maxNights={data.listing.maxNights}
                  currency={data.listing.currency}
                  selection={selection}
                  reload={load}
                  onManagePricing={() => setLens("pricing")}
                />
              )}
            />
          </>
        ) : null}
      </AppScreen>
      <ListingWorkspaceNav active={lens} onSelect={selectWorkspace} />
    </View>
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function calendarLensFromParam(value: string | undefined): CalendarLens {
  return value === "pricing" || value === "promotions" ? value : "availability";
}

/** The listing-wide fallback price, distinct from a date-specific override. Shown
 *  only on the pricing lens so the difference between "every night" and "these
 *  nights" stays obvious. */
function DefaultPricing({
  listingId,
  data,
  reload,
}: {
  listingId: string;
  data: AvailabilityResponse;
  reload: () => Promise<void>;
}) {
  const { t } = useLanguage();
  const [rate, setRate] = useState(String(data.listing.baseNightlyRate ?? ""));
  const [fee, setFee] = useState(String(data.listing.cleaningFee ?? 0));
  const [nights, setNights] = useState(String(data.listing.minNights ?? 1));
  const [busy, setBusy] = useState(false);

  const changed =
    rate !== String(data.listing.baseNightlyRate ?? "") ||
    fee !== String(data.listing.cleaningFee ?? 0) ||
    nights !== String(data.listing.minNights ?? 1);

  async function save() {
    if (busy || !changed) return;
    try {
      setBusy(true);
      await apiFetch(`/api/mobile/v1/listings/${listingId}/availability`, {
        method: "POST",
        body: JSON.stringify({
          action: "saveDefaultPricing",
          baseNightlyRate: Number(rate),
          cleaningFee: Number(fee),
          minNights: Number(nights),
        }),
      });
      await reload();
    } catch (caught) {
      Alert.alert(
        t("Could not save pricing"),
        caught instanceof Error ? caught.message : t("Try again.")
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t("Standard pricing")}</Text>
      <Text style={styles.cardHint}>
        {t("Applies to every night without a date-specific price.")}
      </Text>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <LabeledInput
            label={`${t("Base price")} (${data.listing.currency})`}
            keyboardType="decimal-pad"
            value={rate}
            onChangeText={setRate}
          />
        </View>
        <View style={{ flex: 1 }}>
          <LabeledInput
            label={`${t("Cleaning fee")} (${data.listing.currency})`}
            keyboardType="decimal-pad"
            value={fee}
            onChangeText={setFee}
          />
        </View>
      </View>
      <LabeledInput
        label={t("Minimum stay")}
        keyboardType="number-pad"
        value={nights}
        onChangeText={setNights}
      />
      <PrimaryButton
        label={t(busy ? "Saving…" : "Save standard pricing")}
        disabled={!changed || busy}
        onPress={() => void save()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  previewButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
  },
  cardTitle: { ...type.section, color: colors.ink },
  cardHint: { ...type.caption, color: colors.muted, marginTop: -spacing.sm },
  row: { flexDirection: "row", gap: spacing.md },
});
