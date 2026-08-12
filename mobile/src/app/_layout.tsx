import "../global.css";

import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { AuthProvider } from "@/context/auth-context";
import { NotificationProvider } from "@/context/notification-context";
import { LanguageProvider } from "@/context/language-context";
import { useLanguage } from "@/context/language-context";
import { colors } from "@/theme";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontError, fontsLoaded]);

  // Hold the first paint so text does not land in the system font and reflow. A
  // font failure still renders — falling back to the system face is far better
  // than a permanently blank app.
  if (!fontsLoaded && !fontError) return null;

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
      {/* The admin group owns its own header via app/admin/_layout.tsx, which is
          also where the role guard lives — leaving this header on stacks two. */}
      <Stack.Screen name="admin" options={{ headerShown: false }} />
      <Stack.Screen
        name="availability/[id]"
        options={{ title: t("Manage listing") }}
      />
      <Stack.Screen
        name="listing/[id]"
        options={{ title: t("Edit listing"), presentation: "modal" }}
      />
      <Stack.Screen name="support/index" options={{ title: t("Support") }} />
      <Stack.Screen name="support/[id]" options={{ title: t("Support case") }} />
      <Stack.Screen name="booking/[id]" options={{ title: t("Booking") }} />
      <Stack.Screen name="profile" options={{ title: t("Personal details") }} />
      <Stack.Screen name="notifications" options={{ title: t("Notifications") }} />
      <Stack.Screen name="chat/[id]" options={{ title: t("Booking conversation") }} />
      <Stack.Screen
        name="new-listing"
        options={{ title: t("New Listing"), presentation: "modal" }}
      />
    </Stack>
  );
}
