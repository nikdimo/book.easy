import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "@/components/icon";
import { useLanguage } from "@/context/language-context";
import { colors, spacing, type } from "@/theme";

export type ListingWorkspaceDestination =
  | "listing"
  | "availability"
  | "pricing"
  | "promotions";

const DESTINATIONS: {
  value: ListingWorkspaceDestination;
  icon: IconName;
}[] = [
  { value: "listing", icon: "property" },
  { value: "availability", icon: "availability" },
  { value: "pricing", icon: "pricing" },
  { value: "promotions", icon: "promotions" },
];

function destinationLabel(destination: ListingWorkspaceDestination): string {
  return destination[0].toUpperCase() + destination.slice(1);
}

/** The native counterpart of the responsive web footer. Creation teaches these
 * four ownership buckets; every existing listing exposes the same destinations. */
export function ListingWorkspaceNav({
  active,
  onSelect,
}: {
  active: ListingWorkspaceDestination;
  onSelect: (destination: ListingWorkspaceDestination) => void;
}) {
  const { t } = useLanguage();
  return (
    <View accessibilityRole="tablist" style={styles.nav}>
      {DESTINATIONS.map((destination) => {
        const selected = destination.value === active;
        const color = selected ? colors.primary : colors.muted;
        return (
          <Pressable
            key={destination.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onSelect(destination.value)}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
          >
            <Icon name={destination.icon} size={20} color={color} />
            <Text numberOfLines={1} style={[styles.label, { color }]}>
              {t(destinationLabel(destination.value))}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingBottom: spacing.sm,
  },
  item: {
    minHeight: 58,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: 2,
  },
  label: { ...type.caption, fontSize: 10, fontWeight: "600" },
  pressed: { opacity: 0.6 },
});
