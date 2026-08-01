import { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import {
  AppScreen,
  EmptyNotice,
  LoadingState,
  Pill,
  PrimaryButton,
} from "@/components/ui";
import { LabeledInput } from "@/components/listing/labeled-input";
import { useLanguage } from "@/context/language-context";
import { useAuth } from "@/context/auth-context";
import { useApiError } from "@/lib/use-api-error";
import { apiFetch } from "@/lib/api";
import { spacing } from "@/theme";

interface ProfileResponse {
  profile: {
    name: string;
    email: string;
    role: string;
    isHost: boolean;
    phone: string;
    bio: string;
  };
}

export default function ProfileScreen() {
  const describeError = useApiError();
  const { refresh } = useAuth();
  const { t } = useLanguage();
  const [data, setData] = useState<ProfileResponse["profile"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const result = await apiFetch<ProfileResponse>("/api/mobile/v1/profile");
      setData(result.profile);
      setName(result.profile.name);
      setPhone(result.profile.phone);
      setBio(result.profile.bio);
    } catch (caught) {
      setError(describeError(caught, "Could not load your profile"));
    }
  }, [describeError]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const nameProblem =
    name.trim().length > 0 && name.trim().length < 2
      ? t("Name must be at least 2 characters")
      : null;
  const changed =
    data !== null &&
    (name !== data.name || phone !== data.phone || bio !== data.bio);

  async function save() {
    if (saving || !changed || nameProblem) return;
    try {
      setSaving(true);
      await apiFetch("/api/mobile/v1/profile", {
        method: "PUT",
        body: JSON.stringify({ name, phone, bio }),
      });
      // The name shows in the app shell, so refresh the cached session too.
      await refresh();
      await load();
      Alert.alert(t("Profile updated"), t("Your details have been saved."));
    } catch (caught) {
      Alert.alert(
        t("Could not save"),
        caught instanceof Error ? caught.message : t("Try again.")
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppScreen title="Personal details" onRefresh={load}>
      {!data && !error ? <LoadingState /> : null}
      {error ? (
        <EmptyNotice
          icon="alert"
          title="Profile unavailable"
          description={error}
          onRetry={load}
        />
      ) : null}

      {data ? (
        <View style={styles.form}>
          <View style={styles.badges}>
            <Pill
              label={data.role === "ADMIN" || data.role === "SUPERADMIN" ? "Admin" : "Host"}
              tone="success"
            />
            <Pill label={data.email} />
          </View>

          <LabeledInput
            label={t("Name")}
            value={name}
            error={nameProblem}
            onChangeText={setName}
          />
          <LabeledInput
            label={t("Phone")}
            hint={t("Optional. Shared with guests only after a booking is confirmed.")}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />
          <LabeledInput
            label={t("About you")}
            hint={t("Optional")}
            multiline
            value={bio}
            onChangeText={setBio}
          />

          <PrimaryButton
            label={saving ? "Saving…" : "Save changes"}
            disabled={!changed || saving || Boolean(nameProblem)}
            onPress={() => void save()}
          />
        </View>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.lg },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
