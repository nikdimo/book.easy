import { useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/context/auth-context";
import { useLanguage } from "@/context/language-context";
import { colors, spacing, type } from "@/theme";

// Expo's asset pipeline resolves static image assets through require().
// eslint-disable-next-line @typescript-eslint/no-require-imports
const splashLogo = require("../../assets/images/splash-icon.png");
const MINIMUM_STARTUP_SCREEN_MS = 1400;

export default function Index() {
  const { loading, user } = useAuth();
  const { t } = useLanguage();
  const [minimumStartupTimeElapsed, setMinimumStartupTimeElapsed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(
      () => setMinimumStartupTimeElapsed(true),
      MINIMUM_STARTUP_SCREEN_MS,
    );
    return () => clearTimeout(timer);
  }, []);

  if (loading || !minimumStartupTimeElapsed) {
    return <StartupScreen slogan={t("Host with confidence. Stay in control.")} />;
  }

  return <Redirect href={user ? "/(tabs)" : "/login"} />;
}

function StartupScreen({ slogan }: { slogan: string }) {
  return (
    <View style={styles.startup}>
      <Image
        accessibilityLabel="Linger Homes"
        alt="Linger Homes"
        source={splashLogo}
        style={styles.logo}
      />
      <Text style={styles.brand}>LINGER HOMES</Text>
      <ActivityIndicator color={colors.accent} size="small" style={styles.spinner} />
      <Text style={styles.slogan}>{slogan}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  startup: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink,
    padding: spacing.xl,
  },
  logo: { width: 96, height: 116, resizeMode: "contain" },
  brand: {
    color: "#FFFFFF",
    ...type.meta,
    letterSpacing: 2.4,
    marginTop: spacing.lg,
  },
  spinner: { marginTop: spacing.xxl },
  slogan: {
    color: "rgba(255,255,255,0.78)",
    ...type.body,
    textAlign: "center",
    marginTop: spacing.lg,
  },
});
