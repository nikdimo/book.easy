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
import { Icon } from "@/components/icon";
import { startAuth } from "@/lib/api";
import { colors, radii, shadows, spacing, fonts } from "@/theme";

/** Sign-in completes in a separate window, which cannot tell this screen it finished,
 *  so the session has to be polled. Bounds, because the previous version polled every
 *  1.8s for as long as the screen was open — thousands of requests an hour against a
 *  server nobody was signing in to. */
const POLL_START_MS = 1500;
const POLL_MAX_MS = 8000;
const POLL_GIVE_UP_MS = 3 * 60 * 1000;

export default function LoginScreen() {
  const { user, refresh } = useAuth();
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  /** Non-null only while a sign-in is actually in flight. */
  const [awaitingSignIn, setAwaitingSignIn] = useState(false);

  useEffect(() => {
    if (!awaitingSignIn) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let delay = POLL_START_MS;
    const deadline = Date.now() + POLL_GIVE_UP_MS;

    const tick = () => {
      if (cancelled) return;
      if (Date.now() > deadline) {
        setAwaitingSignIn(false);
        setMessage(t("Sign-in timed out. Please try again."));
        return;
      }
      void refresh().finally(() => {
        if (cancelled) return;
        // Back off so a window left open overnight costs a request every 8s, not 1.8.
        delay = Math.min(POLL_MAX_MS, Math.round(delay * 1.5));
        timer = setTimeout(tick, delay);
      });
    };

    timer = setTimeout(tick, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [awaitingSignIn, refresh, t]);

  // Signing in elsewhere — another tab, or the control panel itself — never sets
  // awaitingSignIn, so nothing above would notice. Re-checking whenever this window
  // regains focus covers that without polling at all.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const recheck = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, [refresh]);

  if (user) return <Redirect href="/(tabs)" />;

  function continueWithGoogle() {
    setMessage(t("Complete Google sign-in in the secure window."));
    setAwaitingSignIn(true);
    void startAuth("google");
  }

  function continueWithEmail() {
    const cleanEmail = email.trim();
    if (!cleanEmail.includes("@")) {
      setMessage(t("Enter a valid email address."));
      return;
    }
    setMessage(`We will send a secure sign-in link to ${cleanEmail}.`);
    setAwaitingSignIn(true);
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
              {/* Spin only while genuinely waiting — a timeout or validation
                  message beside a spinner reads as "still working". */}
              {awaitingSignIn ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : (
                <Icon color={colors.primaryDark} name="info" size={16} />
              )}
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
    fontFamily: fonts.bold,
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
  eyebrow: { color: colors.primary, fontSize: 11, fontFamily: fonts.bold, letterSpacing: 1.5 },
  title: {
    color: colors.ink,
    fontSize: 32,
    lineHeight: 38,
    fontFamily: fonts.bold,
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
  googleGlyph: { color: "#4285F4", fontSize: 17, fontFamily: fonts.bold },
  googleButtonText: { color: colors.ink, fontSize: 15, fontFamily: fonts.semiBold },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginVertical: spacing.lg,
  },
  line: { height: 1, backgroundColor: colors.border, flex: 1 },
  or: { color: colors.muted, fontSize: 10, fontFamily: fonts.bold, letterSpacing: 1.2 },
  label: { color: colors.ink, fontSize: 13, fontFamily: fonts.semiBold, marginBottom: spacing.sm },
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
  primaryButtonText: { color: "#fff", fontSize: 15, fontFamily: fonts.bold },
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
