import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/icon";
import { useLanguage } from "@/context/language-context";
import { colors, fonts, radii, spacing } from "@/theme";

const SPACE_TYPES = [
  ["ENTIRE_PLACE", "Entire place", "Guests have the whole property to themselves."],
  ["PRIVATE_ROOM", "Private room", "Guests have a private room and may share other spaces."],
  ["SHARED_ROOM", "Shared room", "Guests sleep in a room or area shared with others."],
  ["HOTEL_ROOM", "Hotel room", "Guests book a private room in a hotel or similar property."],
] as const;

export function SpaceTypeField({
  propertyType,
  value,
  onChange,
}: {
  propertyType: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useLanguage();
  const options = SPACE_TYPES.filter(
    ([option]) =>
      option !== "HOTEL_ROOM" || propertyType === "HOTEL" || value === "HOTEL_ROOM",
  );
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{t("What will guests book?")}</Text>
      <Text style={styles.hint}>{t("Pick the one that matches how you rent it out.")}</Text>
      <View accessibilityRole="radiogroup" style={styles.options}>
        {options.map(([option, label, description]) => {
          const checked = value === option;
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ checked }}
              onPress={() => onChange(option)}
              style={[styles.card, checked && styles.selected]}
            >
              <View style={styles.copy}>
                <Text style={styles.label}>{t(label)}</Text>
                <Text style={styles.description}>{t(description)}</Text>
              </View>
              {checked ? <Icon color={colors.primary} name="check" size={18} /> : null}
            </Pressable>
          );
        })}
      </View>
      {!value ? <Text style={styles.error}>{t("Choose what guests will book")}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  title: { color: colors.ink, fontSize: 15, fontFamily: fonts.bold },
  hint: { color: colors.muted, fontSize: 12, marginBottom: spacing.xs },
  options: { gap: spacing.sm },
  card: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  selected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  copy: { flex: 1 },
  label: { color: colors.ink, fontSize: 14, fontFamily: fonts.bold },
  description: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  error: { color: colors.danger, fontSize: 11, lineHeight: 16 },
});
