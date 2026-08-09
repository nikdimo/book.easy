import { useState } from "react";
import { Alert, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Pill, PrimaryButton, SoftButton } from "@/components/ui";
import { LabeledInput } from "@/components/listing/labeled-input";
import { useLanguage } from "@/context/language-context";
import {
  apiFetch,
  formatDate,
  resolveIntlLocale,
  type PromotionSummary,
} from "@/lib/api";
import { colors, radii, spacing, type } from "@/theme";

/** Promotions against the shared calendar selection.
 *
 *  The rules mirror promotion.actions.ts, which validates all of this again:
 *   - a discount is 0–50%; 50% is the hard cap
 *   - an offer needs a discount, free cleaning, or both
 *   - free cleaning requires a cleaning fee above zero
 *   - the offer minimum cannot exceed the listing maximum stay
 *   - date windows may not overlap another active offer
 *
 *  Leaving the dates empty makes the offer always-active, which is how the web
 *  workspace distinguishes an evergreen promotion from a seasonal one. */
export function PromotionsPanel({
  listingId,
  promotions,
  cleaningFee,
  maxNights,
  currency,
  selection,
  reload,
  onManagePricing,
}: {
  listingId: string;
  promotions: PromotionSummary[];
  cleaningFee: number;
  maxNights: number;
  currency: string;
  /** yyyy-MM-dd, end exclusive, from the shared calendar. */
  selection: { start: string; end: string };
  reload: () => Promise<void>;
  onManagePricing: () => void;
}) {
  const { locale, t } = useLanguage();
  const [editing, setEditing] = useState<PromotionSummary | null>(null);
  const [open, setOpen] = useState(false);
  const [percent, setPercent] = useState("10");
  const [nights, setNights] = useState("2");
  const [freeCleaning, setFreeCleaning] = useState(false);
  const [roundUp, setRoundUp] = useState(true);
  const [useSelection, setUseSelection] = useState(true);
  const [busy, setBusy] = useState(false);

  const hasSelection = Boolean(selection.start && selection.end);
  const discount = Number(percent);
  const minimumNights = Number(nights);
  const formattedCleaningFee = new Intl.NumberFormat(resolveIntlLocale(locale), {
    style: "currency",
    currency,
    maximumFractionDigits: cleaningFee % 1 === 0 ? 0 : 2,
  }).format(cleaningFee);

  const problems: string[] = [];
  if (!Number.isInteger(discount) || discount < 0 || discount > 50) {
    problems.push("Discount must be a whole number from 0 to 50.");
  }
  if (discount === 0 && !freeCleaning) {
    problems.push("Add a discount, free cleaning, or both.");
  }
  if (!Number.isInteger(minimumNights) || minimumNights < 1 || minimumNights > 365) {
    problems.push("Minimum stay must be between 1 and 365 nights.");
  }
  if (minimumNights > maxNights) {
    problems.push(`The offer minimum cannot exceed ${maxNights} nights.`);
  }
  if (freeCleaning && !(cleaningFee > 0)) {
    problems.push("Add a cleaning fee before offering free cleaning.");
  }

  function startNew() {
    setEditing(null);
    setPercent("10");
    setNights("2");
    setFreeCleaning(false);
    setRoundUp(true);
    setUseSelection(hasSelection);
    setOpen(true);
  }

  function startEdit(promotion: PromotionSummary) {
    setEditing(promotion);
    setPercent(String(promotion.discountPercent));
    setNights(String(promotion.minimumNights));
    setFreeCleaning(cleaningFee > 0 && promotion.freeCleaning);
    setRoundUp(promotion.roundToWholeUnit);
    setUseSelection(Boolean(promotion.startDate && promotion.endDate));
    setOpen(true);
  }

  async function save() {
    if (problems.length || busy) return;
    try {
      setBusy(true);
      await apiFetch(`/api/mobile/v1/listings/${listingId}/availability`, {
        method: "POST",
        body: JSON.stringify({
          action: "savePromotion",
          promotionId: editing?.id,
          discountPercent: discount,
          minimumNights,
          freeCleaning,
          roundToWholeUnit: roundUp,
          // An offer with no window is always active.
          startDate: useSelection ? selection.start : undefined,
          endDate: useSelection ? selection.end : undefined,
        }),
      });
      setOpen(false);
      await reload();
    } catch (caught) {
      Alert.alert(
        t("Could not save the offer"),
        caught instanceof Error ? caught.message : t("Try again.")
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(promotion: PromotionSummary) {
    try {
      setBusy(true);
      await apiFetch(`/api/mobile/v1/listings/${listingId}/availability`, {
        method: "POST",
        body: JSON.stringify({ action: "removePromotion", promotionId: promotion.id }),
      });
      await reload();
    } catch (caught) {
      Alert.alert(
        t("Could not remove the offer"),
        caught instanceof Error ? caught.message : t("Try again.")
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      {promotions.length === 0 && !open ? (
        <Text style={styles.empty}>
          {t("No active offers. Create one to attract longer stays.")}
        </Text>
      ) : null}

      {promotions.map((promotion) => (
        <View key={promotion.id} style={styles.card}>
          <View style={styles.cardTop}>
            <Text style={styles.cardTitle}>
              {promotion.discountPercent > 0
                ? `${promotion.discountPercent}% ${t("off")}`
                : t("Free cleaning")}
            </Text>
            <Pill
              label={
                promotion.startDate && promotion.endDate ? "Date range" : "Always active"
              }
              tone={promotion.startDate ? "neutral" : "success"}
            />
          </View>
          <Text style={styles.cardMeta}>
            {t("Minimum")} {promotion.minimumNights} {t("nights")}
            {promotion.freeCleaning && promotion.discountPercent > 0
              ? ` · ${t("Free cleaning")}`
              : ""}
            {promotion.roundToWholeUnit
              ? ` · ${t("Rounded to the nearest whole number")}`
              : ""}
          </Text>
          {promotion.startDate && promotion.endDate ? (
            <Text style={styles.cardMeta}>
              {formatDate(promotion.startDate, locale)} –{" "}
              {formatDate(promotion.endDate, locale)}
            </Text>
          ) : null}
          <View style={styles.cardActions}>
            <SoftButton label="Edit" onPress={() => startEdit(promotion)} />
            <SoftButton
              label="Remove"
              tone="danger"
              disabled={busy}
              onPress={() => void remove(promotion)}
            />
          </View>
        </View>
      ))}

      {!open ? (
        <SoftButton icon="add" label="New offer" onPress={startNew} />
      ) : (
        <View style={styles.form}>
          <Text style={styles.formTitle}>
            {editing ? t("Edit offer") : t("New offer")}
          </Text>

          <LabeledInput
            label={t("Discount %")}
            hint={t("0 to 50. Use 0 for a cleaning-only offer.")}
            keyboardType="number-pad"
            value={percent}
            onChangeText={setPercent}
          />
          <LabeledInput
            label={t("Minimum nights")}
            keyboardType="number-pad"
            value={nights}
            onChangeText={setNights}
          />

          <Toggle
            label={t("Free cleaning")}
            hint={
              cleaningFee > 0
                ? `${t("Waives the current cleaning fee of")} ${formattedCleaningFee}`
                : `${t("Current cleaning fee")}: ${formattedCleaningFee}`
            }
            value={freeCleaning}
            disabled={!(cleaningFee > 0)}
            onChange={setFreeCleaning}
          />
          {cleaningFee > 0 ? null : (
            <View style={styles.noCleaningFee}>
              <Text style={styles.noCleaningFeeText}>
                {t("Set a cleaning fee in Pricing before offering free cleaning.")}
              </Text>
              <SoftButton
                label={t("Set cleaning fee in Pricing")}
                onPress={onManagePricing}
              />
            </View>
          )}
          <Toggle
            label={t("Round to the nearest whole number")}
            hint={t("Keeps discounted prices tidy.")}
            value={roundUp}
            onChange={setRoundUp}
          />
          <Toggle
            label={t("Limit to selected dates")}
            hint={
              hasSelection
                ? `${formatDate(selection.start, locale)} – ${formatDate(selection.end, locale)}`
                : t("Select a range on the calendar to limit this offer")
            }
            value={useSelection && hasSelection}
            disabled={!hasSelection}
            onChange={setUseSelection}
          />

          {problems.length ? (
            <View style={styles.problems}>
              {problems.map((problem) => (
                <Text key={problem} style={styles.problemText}>
                  {t(problem)}
                </Text>
              ))}
            </View>
          ) : null}

          <View style={styles.formActions}>
            <SoftButton label="Cancel" tone="neutral" onPress={() => setOpen(false)} />
            <View style={{ flex: 1 }}>
              <PrimaryButton
                label={busy ? "Saving…" : editing ? "Save offer" : "Create offer"}
                disabled={problems.length > 0 || busy}
                onPress={() => void save()}
              />
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

function Toggle({
  label,
  hint,
  value,
  disabled = false,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={[styles.toggle, disabled && styles.disabled]}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {hint ? <Text style={styles.toggleHint}>{hint}</Text> : null}
      </View>
      <Switch
        disabled={disabled}
        onValueChange={onChange}
        thumbColor="#fff"
        trackColor={{ false: colors.borderStrong, true: colors.primary }}
        value={value}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  empty: { ...type.meta, color: colors.muted },
  card: {
    gap: spacing.xs,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  cardTitle: { ...type.bodyStrong, color: colors.ink },
  cardMeta: { ...type.caption, color: colors.muted },
  cardActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  form: {
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  formTitle: { ...type.section, color: colors.ink },
  formActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  toggle: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  toggleLabel: { ...type.bodyStrong, color: colors.ink },
  toggleHint: { ...type.caption, color: colors.muted, marginTop: 2 },
  disabled: { opacity: 0.5 },
  problems: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.dangerSoft,
  },
  problemText: { ...type.meta, color: colors.danger },
  noCleaningFee: { gap: spacing.sm },
  noCleaningFeeText: { ...type.caption, color: colors.muted },
});
