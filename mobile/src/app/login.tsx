import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/context/auth-context";
import { useLanguage } from "@/context/language-context";
import { LanguageSelector } from "@/components/language-selector";
import { startAuth } from "@/lib/api";
import { colors, radii, shadows, spacing } from "@/theme";

export default function LoginScreen() {
  const { user, refresh } = useAuth();
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => void refresh(), 1800);
    return () => clearInterval(timer);
  }, [refresh]);

  if (user) return <Redirect href="/(tabs)" />;

  function continueWithGoogle() {
    setMessage(t("Complete Google sign-in in the secure window."));
    void startAuth("google");
  }

  function continueWithEmail() {
    const cleanEmail = email.trim();
    if (!cleanEmail.includes("@")) {
      setMessage(t("Enter a valid email address."));
      return;
    }
    setMessage(`We will send a secure sign-in link to ${cleanEmail}.`);
    void startAuth("email", cleanEmail);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.center}
      >
        <View style={styles.languageRow}>
          <LanguageSelector />
        </View>
        <View style={styles.brandMark}>
          <View style={styles.brandDot} />
          <Text style={styles.brandText}>{t("Hosting dashboard").toUpperCase()}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.eyebrow}>{t("PROPERTY MANAGEMENT")}</Text>
          <Text style={styles.title}>{t("Welcome back")}</Text>
          <Text style={styles.subtitle}>
            {t("Manage listings, availability, and booking requests wherever you are.")}
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={continueWithGoogle}
            style={({ pressed }) => [styles.googleButton, pressed && styles.pressed]}
          >
            <Text style={styles.googleGlyph}>G</Text>
            <Text style={styles.googleButtonText}>{t("Continue with Google")}</Text>
          </Pressable>

          <View style={styles.divider}>
            <View style={styles.line} />
            <Text style={styles.or}>{t("OR")}</Text>
            <View style={styles.line} />
          </View>

          <Text style={styles.label}>{t("Email address")}</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            inputMode="email"
            onChangeText={setEmail}
            onSubmitEditing={continueWithEmail}
            placeholder={t("you@example.com")}
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={email}
          />
          <Pressable
            accessibilityRole="button"
            onPress={continueWithEmail}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.primaryButtonText}>{t("Continue with email")}</Text>
          </Pressable>

          {message ? (
            <View style={styles.message}>
              <ActivityIndicator color={colors.primary} size="small" />
              <Text style={styles.messageText}>{message}</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.footnote}>
          {t("Uses the same secure account and login options as the host control panel.")}
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.xl,
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
  },
  languageRow: { alignItems: "flex-end", marginBottom: spacing.lg },
  brandMark: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  brandDot: { width: 13, height: 13, borderRadius: 7, backgroundColor: colors.accent },
  brandText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1.8,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  title: {
    color: colors.ink,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "800",
    marginTop: spacing.sm,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  googleButton: {
    minHeight: 52,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  googleGlyph: { color: "#4285F4", fontSize: 17, fontWeight: "900" },
  googleButtonText: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginVertical: spacing.lg,
  },
  line: { height: 1, backgroundColor: colors.border, flex: 1 },
  or: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  label: { color: colors.ink, fontSize: 13, fontWeight: "700", marginBottom: spacing.sm },
  input: {
    minHeight: 52,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceAlt,
    color: colors.ink,
    paddingHorizontal: spacing.md,
    fontSize: 16,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.md,
  },
  primaryButtonText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  pressed: { opacity: 0.78, transform: [{ scale: 0.995 }] },
  message: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.lg,
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  messageText: { color: colors.primaryDark, fontSize: 13, flex: 1, lineHeight: 18 },
  footnote: {
    color: colors.muted,
    textAlign: "center",
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
});
