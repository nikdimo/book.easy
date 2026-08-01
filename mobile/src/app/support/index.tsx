import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppScreen, EmptyNotice, LoadingState, Pill } from "@/components/ui";
import { Icon } from "@/components/icon";
import { useLanguage } from "@/context/language-context";
import { useApiError } from "@/lib/use-api-error";
import { apiFetch, formatDate, openControlPanel } from "@/lib/api";
import { colors, radii, spacing, type } from "@/theme";

export interface SupportCase {
  id: string;
  reference: string;
  type: string;
  category: string;
  status: string;
  subject: string;
  createdAt: string;
  listing: { id: string; title: string } | null;
  evidenceCount: number;
  updateCount: number;
}

const CLOSED = new Set(["RESOLVED", "REJECTED"]);

export default function SupportScreen() {
  const describeError = useApiError();
  const { locale, t } = useLanguage();
  const [cases, setCases] = useState<SupportCase[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const result = await apiFetch<{ cases: SupportCase[] }>("/api/mobile/v1/support");
      setCases(result.cases);
    } catch (caught) {
      setError(describeError(caught, "Could not load your cases"));
    }
  }, [describeError]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <AppScreen
      title="Support"
      subtitle="Reports, claims and safety cases you are part of."
      onRefresh={load}
    >
      {!cases && !error ? <LoadingState /> : null}
      {error ? (
        <EmptyNotice
          icon="alert"
          title="Support unavailable"
          description={error}
          onRetry={load}
        />
      ) : null}
      {cases?.length === 0 ? (
        <EmptyNotice
          icon="support"
          title="No cases"
          description="Reports and claims you raise will appear here."
        />
      ) : null}

      <View style={styles.list}>
        {cases?.map((entry) => (
          <Pressable
            accessibilityRole="button"
            key={entry.id}
            onPress={() =>
              router.push({ pathname: "/support/[id]", params: { id: entry.id } })
            }
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.6 }]}
          >
            <View style={styles.top}>
              <Text numberOfLines={2} style={styles.subject}>
                {entry.subject}
              </Text>
              <Icon color={colors.muted} name="forward" size={16} />
            </View>
            <Text style={styles.meta}>
              {entry.reference} · {entry.type.replaceAll("_", " ")}
              {entry.listing ? ` · ${entry.listing.title}` : ""}
            </Text>
            <View style={styles.badges}>
              <Pill
                label={entry.status.replaceAll("_", " ")}
                tone={CLOSED.has(entry.status) ? "success" : "warning"}
              />
              {entry.updateCount > 0 ? (
                <Pill label={`${entry.updateCount} ${t("updates")}`} />
              ) : null}
              {entry.evidenceCount > 0 ? (
                <Pill label={`${entry.evidenceCount} ${t("files")}`} />
              ) : null}
            </View>
            <Text style={styles.date}>{formatDate(entry.createdAt, locale)}</Text>
          </Pressable>
        ))}
      </View>

      {/* Raising a new case needs evidence upload and a target picker that only the
          web form has today. Linking out is honest; the case itself is then fully
          readable and answerable here. */}
      <Pressable
        accessibilityRole="button"
        onPress={() => void openControlPanel("/account/support/new")}
        style={({ pressed }) => [styles.newCase, pressed && { opacity: 0.6 }]}
      >
        <Icon color={colors.primary} name="add" size={16} />
        <Text style={styles.newCaseText}>{t("Report a problem")}</Text>
        <Icon color={colors.muted} name="external" size={14} />
      </Pressable>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  card: {
    gap: spacing.xs,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  top: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  subject: { ...type.bodyStrong, flex: 1, color: colors.ink },
  meta: { ...type.caption, color: colors.muted },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  date: { ...type.caption, color: colors.muted, marginTop: spacing.xs },
  newCase: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    marginTop: spacing.lg,
  },
  newCaseText: { ...type.bodyStrong, flex: 1, color: colors.primary },
});
