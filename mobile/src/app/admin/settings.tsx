import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import {
  AppScreen,
  EmptyNotice,
  LoadingState,
  PrimaryButton,
} from "@/components/ui";
import { LabeledInput } from "@/components/listing/labeled-input";
import { useLanguage } from "@/context/language-context";
import { useApiError } from "@/lib/use-api-error";
import { apiFetch } from "@/lib/api";
import { colors, radii, spacing, type } from "@/theme";

interface Settings {
  featuredMarketEnabled: boolean;
  featuredCity: string;
  featuredCountry: string;
}

export default function AdminSettingsScreen() {
  const describeError = useApiError();
  const { t } = useLanguage();
  const [saved, setSaved] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const result = await apiFetch<{ settings: Settings }>(
        "/api/mobile/v1/admin/settings"
      );
      setSaved(result.settings);
      setEnabled(result.settings.featuredMarketEnabled);
      setCity(result.settings.featuredCity);
      setCountry(result.settings.featuredCountry);
    } catch (caught) {
      setError(describeError(caught, "Could not load settings"));
    }
  }, [describeError]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const changed =
    saved !== null &&
    (enabled !== saved.featuredMarketEnabled ||
      city !== saved.featuredCity ||
      country !== saved.featuredCountry);

  // The server refuses to enable a featured market without both fields; saying so
  // here means the admin is not told off after the fact.
  const problem =
    enabled && (!city.trim() || !country.trim())
      ? t("Choose a featured city and country before enabling it.")
      : null;

  async function save() {
    if (busy || !changed || problem) return;
    try {
      setBusy(true);
      await apiFetch("/api/mobile/v1/admin/settings", {
        method: "PUT",
        body: JSON.stringify({
          featuredMarketEnabled: enabled,
          featuredCity: city,
          featuredCountry: country,
        }),
      });
      await load();
      Alert.alert(t("Settings saved"), t("Platform settings have been updated."));
    } catch (caught) {
      Alert.alert(
        t("Could not save settings"),
        caught instanceof Error ? caught.message : t("Try again.")
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppScreen title="Platform settings" onRefresh={load}>
      {!saved && !error ? <LoadingState /> : null}
      {error ? (
        <EmptyNotice
          icon="alert"
          title="Settings unavailable"
          description={error}
          onRetry={load}
        />
      ) : null}

      {saved ? (
        <View style={styles.form}>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: enabled }}
            onPress={() => setEnabled(!enabled)}
            style={styles.toggle}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>{t("Featured market")}</Text>
              <Text style={styles.toggleHint}>
                {t("Highlights one city on the public marketplace.")}
              </Text>
            </View>
            <Switch
              onValueChange={setEnabled}
              thumbColor="#fff"
              trackColor={{ false: colors.borderStrong, true: colors.primary }}
              value={enabled}
            />
          </Pressable>

          <LabeledInput
            label={t("Featured city")}
            value={city}
            onChangeText={setCity}
          />
          <LabeledInput
            label={t("Featured country")}
            value={country}
            onChangeText={setCountry}
          />

          {problem ? <Text style={styles.problem}>{problem}</Text> : null}

          <PrimaryButton
            label={busy ? "Saving…" : "Save settings"}
            disabled={!changed || busy || Boolean(problem)}
            onPress={() => void save()}
          />
        </View>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.lg },
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  toggleLabel: { ...type.bodyStrong, color: colors.ink },
  toggleHint: { ...type.caption, color: colors.muted, marginTop: 2 },
  problem: { ...type.meta, color: colors.danger },
});
