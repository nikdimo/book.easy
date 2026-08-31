import { Redirect, Tabs, type Href } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/context/auth-context";
import { useLanguage } from "@/context/language-context";
import { Icon } from "@/components/icon";
import { FloatingTabBar } from "@/components/tab-bar";
import { clearMobileSessionToken, startAuth } from "@/lib/api";
import { isAdminRole } from "@/lib/roles";
import { colors, radii, spacing, type } from "@/theme";

export default function TabLayout() {
  const { loading, user } = useAuth();
  const { t } = useLanguage();
  if (!loading && !user) return <Redirect href="/login" />;

  // A real session that simply has no hosting account. Sending them back to sign-in
  // would loop, and rendering the tabs would give them five screens of 403s, so say
  // plainly what happened.
  if (user && !user.canManageProperties) return <NoHostAccess />;

  const isAdmin = isAdminRole(user?.role);

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="dashboard" options={{ title: t("Home") }} />
      <Tabs.Screen name="listings" options={{ title: t("Listings") }} />
      <Tabs.Screen name="bookings" options={{ title: t("Bookings") }} />
      <Tabs.Screen name="inbox" options={{ title: t("Inbox") }} />
      <Tabs.Screen
        name="admin"
        options={{
          title: t("Admin"),
          href: isAdmin ? ("/admin" as Href) : null,
        }}
      />

      <Tabs.Screen name="more" options={{ title: t("Account") }} />
    </Tabs>
  );
}

/** Signed in, but this is a guest account. Offer the one useful action — sign out and
 *  try another account — rather than a dead end. */
function NoHostAccess() {
  const { t } = useLanguage();
  const { clearSession } = useAuth();

  return (
    <View style={styles.gate}>
      <View style={styles.gateIcon}>
        <Icon color={colors.primary} name="info" size={24} />
      </View>
      <Text style={styles.gateTitle}>{t("This account has no properties")}</Text>
      <Text style={styles.gateBody}>
        {t(
          "You are signed in, but this app is for hosts and administrators. Ask an administrator to enable hosting for your account, or sign in with a different one."
        )}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          void startAuth("signout");
          void clearMobileSessionToken();
          clearSession();
        }}
        style={styles.gateButton}
      >
        <Text style={styles.gateButtonText}>{t("Sign out")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  gate: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  gateIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
  },
  gateTitle: { ...type.title, color: colors.ink, textAlign: "center" },
  gateBody: {
    ...type.body,
    maxWidth: 420,
    color: colors.muted,
    textAlign: "center",
  },
  gateButton: {
    minHeight: 46,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
    backgroundColor: colors.ink,
    marginTop: spacing.sm,
  },
  gateButtonText: { ...type.label, color: "#fff" },
});

