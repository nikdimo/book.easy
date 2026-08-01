import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { AppScreen, ListRow, Pill, SectionHeader, SoftButton } from "@/components/ui";
import { useAuth } from "@/context/auth-context";
import { useLanguage } from "@/context/language-context";
import { LanguageSelector } from "@/components/language-selector";
import { clearMobileSessionToken, openControlPanel, startAuth } from "@/lib/api";
import { colors, radii, spacing, type } from "@/theme";

export default function MoreScreen() {
  const { user, clearSession } = useAuth();
  const { t } = useLanguage();
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPERADMIN";

  const initials =
    user?.name
      ?.split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "H";

  return (
    <AppScreen title="Account">
      {/* A light identity card rather than the previous solid-ink block. At full
          width that block was the heaviest element in the app and sat on the one
          screen with nothing urgent on it. */}
      <View style={styles.profile}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={styles.name}>
            {user?.name || t("Host")}
          </Text>
          <Text numberOfLines={1} style={styles.email}>
            {user?.email}
          </Text>
        </View>
        <Pill label={isAdmin ? "Admin" : "Host"} tone={isAdmin ? "success" : "neutral"} />
      </View>

      <SectionHeader title="Manage" />
      <ListRow
        icon="users"
        label="Personal details"
        onPress={() => router.push("/profile")}
      />
      <ListRow
        icon="listings"
        label="Browse stays"
        onPress={() => void openControlPanel("/properties")}
      />

      <SectionHeader title="Help and support" />
      <ListRow
        icon="support"
        label="Support cases"
        onPress={() => router.push("/support")}
      />
      <ListRow
        icon="report"
        label="Reports and claims"
        onPress={() => router.push("/support")}
      />

      <SectionHeader title="Preferences" />
      <View style={styles.languageRow}>
        <Text style={styles.languageLabel}>{t("Language")}</Text>
        <LanguageSelector />
      </View>

      <View style={styles.signOut}>
        <SoftButton
          icon="external"
          label="Log out"
          tone="danger"
          onPress={() => {
            void startAuth("signout");
            void clearMobileSessionToken();
            clearSession();
          }}
        />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  profile: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
  },
  avatarText: { ...type.bodyStrong, color: colors.primary },
  name: { ...type.bodyStrong, color: colors.ink },
  email: { ...type.meta, color: colors.muted, marginTop: 2 },
  languageRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  languageLabel: { ...type.bodyStrong, color: colors.ink },
  signOut: { marginTop: spacing.xxl },
});
