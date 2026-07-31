import { Redirect, Tabs } from "expo-router";
import { Text, View } from "react-native";
import { useAuth } from "@/context/auth-context";
import { useLanguage } from "@/context/language-context";
import { colors } from "@/theme";

const icons: Record<string, string> = {
  dashboard: "⌂",
  listings: "▤",
  bookings: "◇",
  inbox: "✉",
  admin: "🛡",
  more: "•••",
};

export default function TabLayout() {
  const { loading, user } = useAuth();
  const { t } = useLanguage();
  if (!loading && !user) return <Redirect href="/login" />;

  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPERADMIN";

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          height: 72,
          paddingTop: 8,
          paddingBottom: 10,
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "700" },
        tabBarIcon: ({ color }) => (
          <View style={{ width: 28, alignItems: "center" }}>
            <Text style={{ color, fontSize: 19, fontWeight: "800" }}>
              {icons[route.name] ?? "•"}
            </Text>
          </View>
        ),
      })}
    >
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="dashboard" options={{ title: t("Dashboard") }} />
      <Tabs.Screen name="listings" options={{ title: t("My Listings") }} />
      <Tabs.Screen name="bookings" options={{ title: t("Bookings") }} />
      <Tabs.Screen name="inbox" options={{ title: t("Inbox") }} />
      <Tabs.Screen
        name="admin"
        options={{
          title: t("Admin"),
          href: isAdmin ? ("/admin" as any) : null,
        }}
      />

      <Tabs.Screen name="more" options={{ title: t("Account") }} />
    </Tabs>
  );
}

