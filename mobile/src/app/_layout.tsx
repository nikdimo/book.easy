import "../global.css";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "@/context/auth-context";
import { NotificationProvider } from "@/context/notification-context";
import { LanguageProvider } from "@/context/language-context";
import { useLanguage } from "@/context/language-context";
import { colors } from "@/theme";

export default function RootLayout() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <NotificationProvider>
          <StatusBar style="dark" />
          <AppNavigator />
        </NotificationProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}

function AppNavigator() {
  const { t } = useLanguage();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerShadowVisible: false,
        headerTintColor: colors.ink,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="availability/[id]"
        options={{ title: t("Availability & pricing") }}
      />
      <Stack.Screen name="notifications" options={{ title: t("Notifications") }} />
      <Stack.Screen name="chat/[id]" options={{ title: t("Booking conversation") }} />
      <Stack.Screen
        name="new-listing"
        options={{ title: t("New Listing"), presentation: "modal" }}
      />
    </Stack>
  );
}
