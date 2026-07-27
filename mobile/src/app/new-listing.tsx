import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { openControlPanel } from "@/lib/api";
import { colors, radii, spacing } from "@/theme";
import { useLanguage } from "@/context/language-context";

const steps = [
  ["01", "Property type", "What kind of place will guests book?"],
  ["02", "Location", "Help guests understand where they will stay."],
  ["03", "Property details", "Set the capacity and sleeping arrangements."],
  ["04", "Amenities", "Choose what your property offers."],
  ["05", "Photos", "Add at least 3 photos and choose the best one first."],
  ["06", "Description", "Give guests a clear, inviting overview."],
  ["07", "Pricing", "Set the price and minimum stay, then publish."],
];

export default function NewListingScreen() {
  const { t } = useLanguage();
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>{t("NEW LISTING")}</Text>
        <Text style={styles.title}>{t("Create Listing")}</Text>
        <Text style={styles.subtitle}>
          {t("Your progress is saved as a draft after every step.")}
        </Text>
      </View>

      <View style={styles.steps}>
        {steps.map(([number, title, detail]) => (
          <View key={number} style={styles.step}>
            <Text style={styles.number}>{number}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.stepTitle}>{t(title)}</Text>
              <Text style={styles.stepDetail}>{t(detail)}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>{t("Complete listing builder")}</Text>
        <Text style={styles.noticeText}>
          {t("The same seven-step builder opens securely and uses the same saved drafts as the web control panel.")}
        </Text>
      </View>

      <Pressable
        onPress={() => void openControlPanel("/host/listings/new")}
        style={({ pressed }) => [styles.button, pressed && { opacity: 0.75 }]}
      >
        <Text style={styles.buttonText}>{t("Create Listing")} →</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.xl,
    paddingBottom: 56,
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
  },
  hero: {
    backgroundColor: colors.ink,
    borderRadius: radii.xl,
    padding: spacing.xl,
    marginBottom: spacing.xl,
  },
  eyebrow: { color: colors.accent, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  title: { color: "#fff", fontSize: 28, fontWeight: "900", marginTop: spacing.sm },
  subtitle: { color: "#C6CFD1", fontSize: 14, lineHeight: 21, marginTop: spacing.sm },
  steps: { gap: spacing.sm },
  step: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  number: { color: colors.primary, fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  stepTitle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  stepDetail: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  notice: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginTop: spacing.xl,
  },
  noticeTitle: { color: colors.primaryDark, fontSize: 13, fontWeight: "900" },
  noticeText: { color: colors.primaryDark, fontSize: 12, lineHeight: 18, marginTop: 5 },
  button: {
    backgroundColor: colors.primary,
    minHeight: 54,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.lg,
  },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "900" },
});
