import { ActivityIndicator, View } from "react-native";
import { Redirect, Stack } from "expo-router";
import { useAuth } from "@/context/auth-context";
import { useLanguage } from "@/context/language-context";
import { isAdminRole } from "@/lib/roles";
import { colors } from "@/theme";

/** Hiding the Admin tab keeps these screens out of a host's way, but in the Expo web
 *  preview every route is still reachable by typing its URL. The data is never at
 *  risk — each admin endpoint calls requireMobileAdmin — yet without this guard a host
 *  who lands here sees admin chrome and a wall of permission errors. Redirecting is
 *  defence in depth and a clearer answer; the server check remains the real boundary. */
export default function AdminLayout() {
  const { loading, user } = useAuth();
  const { t } = useLanguage();

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;

  const isAdmin = isAdminRole(user.role);
  if (!isAdmin) return <Redirect href="/(tabs)/dashboard" />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerShadowVisible: false,
        headerTintColor: colors.ink,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="pending-listings" options={{ title: t("Pending listings") }} />
      <Stack.Screen name="users" options={{ title: t("Users") }} />
      <Stack.Screen name="inspect" options={{ title: t("Listing review") }} />
      <Stack.Screen name="cases" options={{ title: t("Reports and cases") }} />
      <Stack.Screen name="communications" options={{ title: t("Communications") }} />
      <Stack.Screen name="ratings" options={{ title: t("Ratings") }} />
      <Stack.Screen name="audit-log" options={{ title: t("Audit log") }} />
      <Stack.Screen name="settings" options={{ title: t("Platform settings") }} />
    </Stack>
  );
}

const styles = {
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
} as const;
