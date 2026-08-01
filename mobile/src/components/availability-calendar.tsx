import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import {
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  AvailabilityResponse,
  apiFetch,
  formatDate,
  resolveIntlLocale,
} from "@/lib/api";
import { useLanguage } from "@/context/language-context";
import { Pill } from "@/components/ui";
import { colors, radii, spacing, type } from "@/theme";
import { confirmAction } from "@/lib/confirm";
import { formatLocalizedDate } from "@/lib/date-locale";

type ActivityFilter = "ALL" | "MANUAL_BLOCK" | "BOOKING_HOLD" | "CUSTOM_PRICE";

function toYmd(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function fromYmd(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function addDays(value: string, days: number): string {
  const date = fromYmd(value);
  date.setDate(date.getDate() + days);
  return toYmd(date);
}

function eachDay(start: string, endExclusive: string, limit = 800): string[] {
  const result: string[] = [];
  for (let key = start; key < endExclusive && result.length < limit; key = addDays(key, 1)) {
    result.push(key);
  }
  return result;
}

function isoYmd(value: string): string {
  return value.slice(0, 10);
}

function monthCells(month: Date): Array<{ key: string; day: number } | null> {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0, 12).getDate();
  const cells: Array<{ key: string; day: number } | null> = Array(first.getDay()).fill(null);
  for (let day = 1; day <= lastDay; day += 1) {
    const date = new Date(month.getFullYear(), month.getMonth(), day, 12);
    cells.push({ key: toYmd(date), day });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

interface PriceRange {
  id: string;
  start: string;
  end: string;
  rate: number;
  days: number;
}

export type CalendarLens = "availability" | "pricing" | "promotions";

export function AvailabilityCalendar({
  data,
  listingId,
  reload,
  lens = "availability",
  promotionsPanel,
}: {
  data: AvailabilityResponse;
  listingId: string;
  reload: () => Promise<void>;
  lens?: CalendarLens;
  /** Rendered in place of the availability/pricing actions on the promotions lens.
   *  Injected rather than built here so this file stays about dates. */
  promotionsPanel?: (selection: { start: string; end: string }) => React.ReactNode;
}) {
  const { locale, t } = useLanguage();
  const today = toYmd(new Date());
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [price, setPrice] = useState("");
  const [priceOpen, setPriceOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<ActivityFilter>("ALL");
  const baseRate = data.listing.baseNightlyRate ?? 0;

  const { manualKeys, bookingKeys, priceByKey } = useMemo(() => {
    const manual = new Set<string>();
    const booking = new Set<string>();
    const prices = new Map<string, number>();
    const horizon = addDays(today, 550);
    for (const block of data.blocks) {
      for (const key of eachDay(isoYmd(block.startDate), isoYmd(block.endDate))) {
        if (key > horizon) break;
        (block.blockType === "MANUAL_BLOCK" ? manual : booking).add(key);
      }
    }
    for (const row of data.prices) prices.set(isoYmd(row.date), row.nightlyRate);
    return { manualKeys: manual, bookingKeys: booking, priceByKey: prices };
  }, [data.blocks, data.prices, today]);

  const selectedKeys = useMemo(
    () => (start && end ? eachDay(start, end) : start ? [start] : []),
    [end, start]
  );
  const selectedStats = useMemo(() => {
    const rates = new Set(selectedKeys.map((key) => priceByKey.get(key) ?? baseRate));
    return {
      totalDays: selectedKeys.length,
      manualDays: selectedKeys.filter((key) => manualKeys.has(key)).length,
      bookingDays: selectedKeys.filter((key) => bookingKeys.has(key)).length,
      customPriceDays: selectedKeys.filter((key) => priceByKey.has(key)).length,
      uniformRate: rates.size === 1 ? [...rates][0] : null,
    };
  }, [baseRate, bookingKeys, manualKeys, priceByKey, selectedKeys]);

  const priceRanges = useMemo(() => {
    const sorted = [...data.prices]
      .map((row) => ({ key: isoYmd(row.date), rate: row.nightlyRate }))
      .sort((a, b) => a.key.localeCompare(b.key));
    const ranges: PriceRange[] = [];
    for (const row of sorted) {
      const last = ranges.at(-1);
      if (last && last.rate === row.rate && addDays(last.end, 1) === row.key) {
        last.end = row.key;
        last.days += 1;
      } else {
        ranges.push({
          id: row.key,
          start: row.key,
          end: row.key,
          rate: row.rate,
          days: 1,
        });
      }
    }
    return ranges;
  }, [data.prices]);

  const exceptions = (() => {
    const blockRows = data.blocks.map((block) => ({
      id: block.id,
      kind: block.blockType as "MANUAL_BLOCK" | "BOOKING_HOLD",
      title: block.blockType === "MANUAL_BLOCK" ? "Manual block" : "Booking hold",
      badge: block.blockType === "MANUAL_BLOCK" ? "Blocked" : "Booked",
      start: isoYmd(block.startDate),
      end: addDays(isoYmd(block.endDate), -1),
      detail:
        block.blockType === "MANUAL_BLOCK"
          ? block.reason || "No reason provided"
          : block.booking
            ? `${block.booking.guest.name} · ${block.booking.status.replaceAll("_", " ")}`
            : "Reserved dates",
    }));
    const priceRows = priceRanges.map((range) => ({
      id: `price-${range.id}`,
      kind: "CUSTOM_PRICE" as const,
      title: "Custom price",
      badge: "Price override",
      start: range.start,
      end: range.end,
      detail: `${formatMoney(range.rate)} / ${t("night")} · ${range.days} ${t("days")}`,
    }));
    return [...blockRows, ...priceRows].sort((a, b) => a.start.localeCompare(b.start));
  })();

  const visibleExceptions = exceptions.filter((item) => filter === "ALL" || item.kind === filter);
  const rangeLabel =
    start && end
      ? `${formatDate(start, locale)} – ${formatDate(addDays(end, -1), locale)}`
      : start
        ? formatDate(start, locale)
        : t("Select a date range");

  function formatMoney(value: number): string {
    return new Intl.NumberFormat(resolveIntlLocale(locale), {
      style: "currency",
      currency: data.listing.currency,
      maximumFractionDigits: value % 1 === 0 ? 0 : 2,
    }).format(value);
  }

  function selectDay(key: string) {
    if (key < today) return;
    if (!start || end || key <= start) {
      setStart(key);
      setEnd("");
      return;
    }
    setEnd(addDays(key, 1));
  }

  async function runAction(
    action:
      | "block"
      | "makeAvailable"
      | "setPrice"
      | "resetPrice"
      | "blockAllFuture"
      | "makeAllFutureAvailable",
    extra: Record<string, unknown> = {}
  ) {
    try {
      setBusy(true);
      await apiFetch(`/api/mobile/v1/listings/${listingId}/availability`, {
        method: "POST",
        body: JSON.stringify({
          action,
          startDate: start,
          endDate: end,
          reason,
          ...extra,
        }),
      });
      if (!["setPrice"].includes(action)) {
        setStart("");
        setEnd("");
      }
      setReason("");
      setPriceOpen(false);
      await reload();
    } catch (caught) {
      Alert.alert(
        t("Could not update calendar"),
        caught instanceof Error ? caught.message : t("Try again.")
      );
    } finally {
      setBusy(false);
    }
  }

  function confirm(title: string, description: string, action: () => void) {
    confirmAction(
      t(title),
      t(description),
      { cancel: t("Cancel"), confirm: t("Confirm") },
      action
    );
  }

  async function removePriceRange(range: PriceRange) {
    const previousStart = start;
    const previousEnd = end;
    setStart(range.start);
    setEnd(addDays(range.end, 1));
    try {
      setBusy(true);
      await apiFetch(`/api/mobile/v1/listings/${listingId}/availability`, {
        method: "POST",
        body: JSON.stringify({
          action: "resetPrice",
          startDate: range.start,
          endDate: addDays(range.end, 1),
        }),
      });
      await reload();
    } catch (caught) {
      Alert.alert(
        t("Could not update calendar"),
        caught instanceof Error ? caught.message : t("Try again.")
      );
    } finally {
      setStart(previousStart);
      setEnd(previousEnd);
      setBusy(false);
    }
  }

  const cells = monthCells(month);
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    formatLocalizedDate(new Date(2026, 7, 2 + index, 12), "EEE", locale)
  );
  const previousMonth = new Date(month.getFullYear(), month.getMonth() - 1, 1);
  const currentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  return (
    <View style={styles.stack}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("Calendar")}</Text>
        <Text style={styles.cardDescription}>
          {t("Select a date range, then apply availability or pricing actions.")}
        </Text>

        <View style={styles.legend}>
          <Legend swatchStyle={styles.manualSwatch} label={t("Manual block")} />
          <Legend swatchStyle={styles.bookingSwatch} label={t("Booking")} />
          <Legend swatchStyle={styles.priceSwatch} label={t("Custom price")} />
        </View>

        <View style={styles.calendar}>
          <View style={styles.monthHeader}>
            <Pressable
              accessibilityLabel={t("Previous")}
              accessibilityRole="button"
              disabled={previousMonth < currentMonth}
              onPress={() => setMonth(previousMonth)}
              style={[styles.monthButton, previousMonth < currentMonth && styles.disabled]}
            >
              <Icon color={colors.ink} name="back" size={18} />
            </Pressable>
            <Text style={styles.monthTitle}>
              {formatLocalizedDate(month, "LLLL yyyy", locale)}
            </Text>
            <Pressable
              accessibilityLabel={t("Next")}
              accessibilityRole="button"
              onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              style={styles.monthButton}
            >
              <Icon color={colors.ink} name="forward" size={18} />
            </Pressable>
          </View>
          <View style={styles.week}>
            {weekdays.map((weekday, index) => (
              <Text key={`${weekday}-${index}`} style={styles.weekday}>
                {weekday.slice(0, 2).toUpperCase()}
              </Text>
            ))}
          </View>
          <View style={styles.grid}>
            {cells.map((cell, index) =>
              cell ? (
                <DayCell
                  accessibilityLabel={`${formatDate(cell.key, locale)}, ${formatMoney(
                    priceByKey.get(cell.key) ?? baseRate
                  )}`}
                  baseRate={baseRate}
                  booked={bookingKeys.has(cell.key)}
                  customPrice={priceByKey.has(cell.key)}
                  disabled={cell.key < today}
                  key={cell.key}
                  manual={manualKeys.has(cell.key)}
                  price={priceByKey.get(cell.key)}
                  selected={
                    cell.key === start ||
                    Boolean(start && end && cell.key >= start && cell.key < end)
                  }
                  value={cell}
                  onPress={() => selectDay(cell.key)}
                />
              ) : (
                <View key={`blank-${index}`} style={styles.dayCell} />
              )
            )}
          </View>
        </View>

        <View style={styles.selection}>
          <Text style={styles.selectionTitle}>{rangeLabel}</Text>
          {selectedKeys.length > 0 ? (
            <View style={styles.stats}>
              <SmallBadge label={`${selectedStats.totalDays} ${t("days")}`} />
              <SmallBadge
                label={
                  selectedStats.uniformRate != null
                    ? `${formatMoney(selectedStats.uniformRate)} / ${t("night")}`
                    : t("Mixed prices")
                }
              />
              {selectedStats.customPriceDays > 0 ? (
                <SmallBadge label={`${selectedStats.customPriceDays} ${t("custom price days")}`} />
              ) : null}
              {selectedStats.manualDays > 0 ? (
                <SmallBadge label={`${selectedStats.manualDays} ${t("blocked days")}`} />
              ) : null}
              {selectedStats.bookingDays > 0 ? (
                <SmallBadge label={`${selectedStats.bookingDays} ${t("booked days")}`} />
              ) : null}
            </View>
          ) : null}

          {/* The selected range is shared. Only the actions offered against it
              change with the lens, so switching never loses the selection. */}
          {lens === "availability" ? (
            <>
              <Text style={styles.fieldLabel}>{t("Block reason (optional)")}</Text>
              <TextInput
                onChangeText={setReason}
                placeholder={t("e.g. Maintenance, private stay")}
                placeholderTextColor={colors.muted}
                style={styles.input}
                value={reason}
              />
              <View style={styles.actions}>
                <ActionButton
                  disabled={!start || !end || busy}
                  label={t("Make available")}
                  onPress={() =>
                    confirm(
                      "Make selected range available",
                      "This removes manual blocks in the selected range. Booking holds stay untouched.",
                      () => void runAction("makeAvailable")
                    )
                  }
                  secondary
                />
                <ActionButton
                  disabled={!start || !end || busy}
                  label={t("Block")}
                  onPress={() =>
                    confirm(
                      "Block selected range",
                      "This will block the selected range for booking requests.",
                      () => void runAction("block")
                    )
                  }
                />
              </View>
            </>
          ) : null}

          {lens === "pricing" ? (
            <View style={styles.actions}>
              <ActionButton
                disabled={!start || !end || busy}
                label={t("Set price for range")}
                onPress={() => {
                  setPrice(
                    String(selectedStats.uniformRate ?? data.listing.baseNightlyRate ?? "")
                  );
                  setPriceOpen(true);
                }}
              />
              {selectedStats.customPriceDays > 0 ? (
                <ActionButton
                  disabled={!start || !end || busy}
                  label={t("Reset to default")}
                  onPress={() => void runAction("resetPrice")}
                  secondary
                />
              ) : null}
            </View>
          ) : null}

          {lens === "promotions" ? promotionsPanel?.({ start, end }) ?? null : null}
        </View>
      </View>

      {lens === "availability" ? (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("Bulk Future Actions")}</Text>
        <Text style={styles.cardDescription}>
          {t("These actions affect all future dates and stay separate from the date-by-date calendar workflow.")}
        </Text>
        <View style={styles.bulkActions}>
          <ActionButton
            disabled={busy}
            label={t("Block all future")}
            onPress={() =>
              confirm(
                "Block all future dates",
                "This will block every currently available future date. Existing booking holds remain as-is.",
                () => void runAction("blockAllFuture")
              )
            }
          />
          <ActionButton
            disabled={busy}
            label={t("Make all future available")}
            onPress={() =>
              confirm(
                "Make all future dates available",
                "This will remove all manual future blocks. Confirmed and pending booking holds are kept.",
                () => void runAction("makeAllFutureAvailable")
              )
            }
            secondary
          />
        </View>
      </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("Upcoming Exceptions")}</Text>
        <Text style={styles.cardDescription}>
          {t("Review the upcoming blocked dates, bookings, and custom price periods in one timeline.")}
        </Text>
        <ScrollView
          contentContainerStyle={styles.filters}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {(
            [
              ["ALL", `${t("All")} (${exceptions.length})`],
              [
                "MANUAL_BLOCK",
                `${t("Blocks")} (${exceptions.filter((item) => item.kind === "MANUAL_BLOCK").length})`,
              ],
              [
                "BOOKING_HOLD",
                `${t("Bookings")} (${exceptions.filter((item) => item.kind === "BOOKING_HOLD").length})`,
              ],
              [
                "CUSTOM_PRICE",
                `${t("Prices")} (${exceptions.filter((item) => item.kind === "CUSTOM_PRICE").length})`,
              ],
            ] as [ActivityFilter, string][]
          ).map(([value, label]) => (
            <Pressable
              key={value}
              onPress={() => setFilter(value)}
              style={[styles.filter, filter === value && styles.filterActive]}
            >
              <Text style={[styles.filterText, filter === value && styles.filterTextActive]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        {visibleExceptions.length === 0 ? (
          <Text style={styles.noExceptions}>
            {t("No upcoming exceptions for the selected filter.")}
          </Text>
        ) : (
          <View style={styles.exceptions}>
            {visibleExceptions.map((item) => {
              const range = priceRanges.find((candidate) => `price-${candidate.id}` === item.id);
              return (
                <View key={item.id} style={styles.exception}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.exceptionTop}>
                      <Text style={styles.exceptionTitle}>{t(item.title)}</Text>
                      <Pill
                        label={item.badge}
                        tone={item.kind === "BOOKING_HOLD" ? "success" : "neutral"}
                      />
                    </View>
                    <Text style={styles.exceptionDate}>
                      {formatDate(item.start, locale)} – {formatDate(item.end, locale)}
                    </Text>
                    <Text style={styles.exceptionDetail}>{item.detail}</Text>
                  </View>
                  {range ? (
                    <Pressable
                      accessibilityLabel={t("Remove custom price")}
                      disabled={busy}
                      onPress={() =>
                        confirm(
                          "Remove custom price",
                          "Nights will revert to the base price.",
                          () => void removePriceRange(range)
                        )
                      }
                      style={styles.removeButton}
                    >
                      <Icon color={colors.danger} name="close" size={14} />
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </View>

      <Modal
        animationType="slide"
        onRequestClose={() => setPriceOpen(false)}
        presentationStyle="pageSheet"
        visible={priceOpen}
      >
        <SafeAreaView style={styles.priceModal}>
          <View style={styles.priceContent}>
            <Text style={styles.priceTitle}>{t("Edit price")}</Text>
            <Text style={styles.cardDescription}>
              {t("Set a nightly rate for the selected range.")}
            </Text>
            <Text style={styles.fieldLabel}>{t("Nightly price")}</Text>
            <TextInput
              autoFocus
              inputMode="decimal"
              onChangeText={setPrice}
              placeholder={String(selectedStats.uniformRate ?? baseRate)}
              placeholderTextColor={colors.muted}
              style={styles.input}
              value={price}
            />
            <Text style={styles.baseRate}>
              {t("Base rate")}: {formatMoney(baseRate)}
            </Text>
            <View style={styles.priceActions}>
              <ActionButton label={t("Cancel")} onPress={() => setPriceOpen(false)} secondary />
              <ActionButton
                disabled={!Number.isFinite(Number(price.replace(",", "."))) || Number(price.replace(",", ".")) <= 0}
                label={t("Save price")}
                onPress={() =>
                  void runAction("setPrice", {
                    nightlyRate: Number(price.replace(",", ".")),
                  })
                }
              />
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function Legend({ swatchStyle, label }: { swatchStyle: object; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.swatch, swatchStyle]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function DayCell({
  accessibilityLabel,
  value,
  selected,
  disabled,
  manual,
  booked,
  customPrice,
  price,
  baseRate,
  onPress,
}: {
  accessibilityLabel: string;
  value: { key: string; day: number };
  selected: boolean;
  disabled: boolean;
  manual: boolean;
  booked: boolean;
  customPrice: boolean;
  price?: number;
  baseRate: number;
  onPress: () => void;
}) {
  return (
    <View style={styles.dayCell}>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        disabled={disabled}
        onPress={onPress}
        style={[
          styles.dayButton,
          manual && styles.dayManual,
          booked && styles.dayBooked,
          customPrice && !manual && !booked && styles.dayCustom,
          selected && styles.daySelected,
          disabled && styles.dayDisabled,
        ]}
      >
        <Text style={[styles.dayNumber, disabled && styles.dayNumberDisabled]}>{value.day}</Text>
        <Text style={[styles.dayPrice, disabled && styles.dayNumberDisabled]}>
          {Math.round(price ?? baseRate)}
        </Text>
        {manual ? <Text style={styles.hatch}>╱╱</Text> : null}
      </Pressable>
    </View>
  );
}

function SmallBadge({ label }: { label: string }) {
  return (
    <View style={styles.smallBadge}>
      <Text style={styles.smallBadgeText}>{label}</Text>
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  disabled = false,
  secondary = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.actionButton,
        secondary && styles.actionSecondary,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.actionText, secondary && styles.actionSecondaryText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  cardTitle: { color: colors.ink, ...type.section },
  cardDescription: { color: colors.muted, ...type.meta, lineHeight: 19, marginTop: 4 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: spacing.lg, marginTop: spacing.lg },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: { width: 13, height: 13, borderRadius: 3, borderWidth: 1, borderColor: colors.border },
  manualSwatch: { backgroundColor: colors.surfaceAlt },
  bookingSwatch: { backgroundColor: "#F6D9D9", borderColor: "#E6B6B6" },
  priceSwatch: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.primary },
  legendText: { color: colors.muted, ...type.caption },
  calendar: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    marginTop: spacing.lg,
  },
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.sm,
  },
  monthButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  monthButtonText: { color: colors.ink, ...type.title },
  monthTitle: { color: colors.ink, ...type.body },
  week: { flexDirection: "row", marginTop: spacing.sm },
  weekday: {
    width: "14.2857%",
    color: colors.muted,
    textAlign: "center",
    ...type.caption,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", marginTop: spacing.xs },
  dayCell: { width: "14.2857%", aspectRatio: 0.82, padding: 2 },
  dayButton: {
    flex: 1,
    overflow: "hidden",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  dayManual: { backgroundColor: colors.surfaceAlt, borderColor: colors.borderStrong },
  dayBooked: { backgroundColor: "#F6D9D9", borderColor: "#E6B6B6" },
  dayCustom: { borderWidth: 2, borderColor: colors.primary },
  daySelected: { borderWidth: 2, borderColor: colors.primaryDark, backgroundColor: colors.primarySoft },
  dayDisabled: { opacity: 0.32 },
  dayNumber: { color: colors.ink, ...type.caption },
  dayNumberDisabled: { color: colors.muted },
  // Deliberately below the type scale: a price hint inside a 40pt calendar cell,
  // where even the 12pt caption does not fit.
  dayPrice: { color: colors.muted, fontSize: 8, marginTop: 2 },
  hatch: { position: "absolute", color: "#9EA8A3", ...type.title, opacity: 0.35 },
  selection: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
  },
  selectionTitle: { color: colors.ink, ...type.meta },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.sm },
  smallBadge: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: colors.surfaceAlt,
  },
  smallBadgeText: { color: colors.inkSoft, ...type.caption },
  fieldLabel: { color: colors.muted, ...type.caption, marginTop: spacing.lg, marginBottom: 6 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    color: colors.ink,
    ...type.meta,
  },
  actions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: spacing.sm, marginTop: spacing.lg },
  actionButton: {
    minHeight: 42,
    borderRadius: radii.pill,
    backgroundColor: colors.ink,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.ink,
  },
  actionSecondary: { backgroundColor: colors.surface, borderColor: colors.borderStrong },
  actionText: { color: "#fff", ...type.caption },
  actionSecondaryText: { color: colors.ink },
  disabled: { opacity: 0.38 },
  bulkActions: { gap: spacing.sm, marginTop: spacing.lg },
  filters: { gap: spacing.sm, marginTop: spacing.lg, paddingRight: spacing.lg },
  filter: {
    minHeight: 38,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
  },
  filterActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  filterText: { color: colors.ink, ...type.caption },
  filterTextActive: { color: "#fff" },
  noExceptions: { color: colors.muted, ...type.caption, marginTop: spacing.lg },
  exceptions: { gap: spacing.sm, marginTop: spacing.lg },
  exception: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  exceptionTop: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
  exceptionTitle: { color: colors.ink, ...type.meta },
  exceptionDate: { color: colors.muted, ...type.caption, marginTop: 5 },
  exceptionDetail: { color: colors.muted, ...type.caption, marginTop: 4 },
  removeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  priceModal: { flex: 1, backgroundColor: colors.background },
  priceContent: { padding: spacing.xl, maxWidth: 520, width: "100%", alignSelf: "center" },
  priceTitle: { color: colors.ink, ...type.title },
  baseRate: { color: colors.muted, ...type.caption, marginTop: spacing.sm },
  priceActions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm, marginTop: spacing.xl },
});
