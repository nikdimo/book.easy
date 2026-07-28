import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppScreen, SectionHeader } from "@/components/ui";
import { useAuth } from "@/context/auth-context";
import { useLanguage } from "@/context/language-context";
import { openControlPanel, startAuth } from "@/lib/api";
import { colors, radii, spacing } from "@/theme";

export default function MoreScreen() {
  const { user } = useAuth();
  const { t } = useLanguage();

  return (
    <AppScreen
      eyebrow=""
      title="Account"
    >
      <View style={styles.profile}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.name
              ?.split(" ")
              .map((part) => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase() || "H"}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{user?.name || "Host"}</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>
        <View style={styles.hostBadge}>
          <Text style={styles.hostBadgeText}>{t("HOST")}</Text>
        </View>
      </View>

      <SectionHeader title="Account" />
      <View style={styles.menu}>
        <MenuItem
          label={t("Hosting dashboard")}
          detail={t("All existing host tools")}
          onPress={() => void openControlPanel("/host")}
        />
        <MenuItem
          label={t("Account")}
          detail={t("Name, photo, and personal details")}
          onPress={() => void openControlPanel("/account/profile")}
        />
        <MenuItem
          label={t("Stays")}
          detail={t("Browse public properties")}
          onPress={() => void openControlPanel("/properties")}
        />
        <MenuItem
          label={t("Support cases")}
          detail={t("Reports, booking claims, and support replies")}
          onPress={() => void openControlPanel("/account/support")}
        />
      </View>

      <SectionHeader title="Session" />
      <Pressable
        accessibilityRole="button"
        style={styles.signOut}
        onPress={() => void startAuth("signout")}
      >
        <Text style={styles.signOutText}>{t("Log out")}</Text>
      </Pressable>
    </AppScreen>
  );
}

function MenuItem({
  label,
  detail,
  onPress,
}: {
  label: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`${label}. ${detail}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.65 }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.menuLabel}>{label}</Text>
        <Text style={styles.menuDetail}>{detail}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  profile: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.ink,
    padding: spacing.lg,
    borderRadius: radii.xl,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  avatarText: { color: colors.ink, fontSize: 17, fontWeight: "900" },
  name: { color: "#fff", fontSize: 16, fontWeight: "800" },
  email: { color: "#B7C2C5", fontSize: 12, marginTop: 3 },
  hostBadge: {
    borderRadius: radii.pill,
    backgroundColor: "rgba(255,255,255,.12)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  hostBadgeText: { color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  menu: { borderTopWidth: 1, borderTopColor: colors.border },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 68,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuLabel: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  menuDetail: { color: colors.muted, fontSize: 12, marginTop: 3 },
  chevron: { color: colors.muted, fontSize: 28 },
  signOut: {
    borderWidth: 1,
    borderColor: "#F2C9C9",
    backgroundColor: "#FFF6F6",
    borderRadius: radii.md,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  signOutText: { color: colors.danger, fontSize: 14, fontWeight: "800" },
});
