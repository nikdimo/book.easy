import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/icon";
import { LabeledInput } from "@/components/listing/labeled-input";
import { useLanguage } from "@/context/language-context";
import { alpha, colors, radii, spacing, type } from "@/theme";

export interface OfferValues {
  promotionType: string;
  promotionPercent: string;
  promotionMinimumNights: string;
}

type OfferKind = "NONE" | "PERCENT_DISCOUNT" | "FREE_CLEANING";

/** Mirrors the server rules in listing.actions.ts. Validated again there on publish;
 *  these checks only exist so the host is told before they try:
 *   - a percentage discount must be a whole number from 5 to 50
 *   - any offer needs a minimum stay from 1 to 365 nights
 *   - free cleaning needs a cleaning fee above zero */
export function offerProblems(
  values: OfferValues,
  cleaningFee: string
): string[] {
  const kind = (values.promotionType || "NONE") as OfferKind;
  if (kind === "NONE") return [];

  const problems: string[] = [];
  const nights = Number(values.promotionMinimumNights);
  if (!Number.isInteger(nights) || nights < 1 || nights > 365) {
    problems.push("Promotion minimum stay must be between 1 and 365 nights.");
  }
  if (kind === "PERCENT_DISCOUNT") {
    const percent = Number(values.promotionPercent);
    if (!Number.isInteger(percent) || percent < 5 || percent > 50) {
      problems.push("Choose a discount between 5% and 50%.");
    }
  }
  if (kind === "FREE_CLEANING" && !(Number(cleaningFee) > 0)) {
    problems.push("Add a cleaning fee before offering free cleaning.");
  }
  return problems;
}

const OPTIONS: { value: OfferKind; label: string; description: string }[] = [
  {
    value: "NONE",
    label: "No launch offer",
    description: "Publish at your normal price.",
  },
  {
    value: "PERCENT_DISCOUNT",
    label: "Percentage discount",
    description: "Take a percentage off the nightly rate.",
  },
  {
    value: "FREE_CLEANING",
    label: "Free cleaning",
    description: "Waive the cleaning fee for qualifying stays.",
  },
];

export function SpecialOfferField({
  values,
  cleaningFee,
  onChange,
}: {
  values: OfferValues;
  cleaningFee: string;
  onChange: (patch: Partial<OfferValues>) => void;
}) {
  const { t } = useLanguage();
  const kind = (values.promotionType || "NONE") as OfferKind;
  const problems = offerProblems(values, cleaningFee);

  return (
    <View style={styles.wrap}>
      <Text style={styles.intro}>
        {t(
          "Optional. A launch offer is created when the listing is published, and you can change it later from Promotions."
        )}
      </Text>

      <View accessibilityRole="radiogroup" style={styles.options}>
        {OPTIONS.map((option) => {
          const selected = kind === option.value;
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              key={option.value}
              onPress={() =>
                onChange({
                  promotionType: option.value,
                  // Seed sensible defaults so a freshly chosen offer is already
                  // valid rather than showing an error the host did not cause.
                  ...(option.value !== "NONE" && !values.promotionMinimumNights
                    ? { promotionMinimumNights: "2" }
                    : {}),
                  ...(option.value === "PERCENT_DISCOUNT" && !values.promotionPercent
                    ? { promotionPercent: "15" }
                    : {}),
                })
              }
              style={[styles.option, selected && styles.optionSelected]}
            >
              <View style={[styles.radio, selected && styles.radioSelected]}>
                {selected ? <Icon color="#fff" name="check" size={12} /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.optionLabel}>{t(option.label)}</Text>
                <Text style={styles.optionDescription}>{t(option.description)}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {kind === "PERCENT_DISCOUNT" ? (
        <LabeledInput
          label={t("Discount")}
          hint={t("Between 5% and 50%")}
          keyboardType="number-pad"
          placeholder="15"
          value={values.promotionPercent}
          onChangeText={(value) => onChange({ promotionPercent: value })}
        />
      ) : null}

      {kind !== "NONE" ? (
        <LabeledInput
          label={t("Minimum stay for the offer")}
          hint={t("Between 1 and 365 nights")}
          keyboardType="number-pad"
          placeholder="2"
          value={values.promotionMinimumNights}
          onChangeText={(value) => onChange({ promotionMinimumNights: value })}
        />
      ) : null}

      {problems.length ? (
        <View style={styles.problems}>
          {problems.map((problem) => (
            <Text key={problem} style={styles.problemText}>
              {t(problem)}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  intro: { ...type.meta, color: colors.muted },
  options: { gap: spacing.sm },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  optionSelected: {
    borderColor: colors.primary,
    backgroundColor: alpha(colors.primary, 6),
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  optionLabel: { ...type.bodyStrong, color: colors.ink },
  optionDescription: { ...type.caption, color: colors.muted, marginTop: 2 },
  problems: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.dangerSoft,
  },
  problemText: { ...type.meta, color: colors.danger },
});
