import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  AppScreen,
  EmptyNotice,
  LoadingState,
  Pill,
  Segmented,
} from "@/components/ui";
import { useLanguage } from "@/context/language-context";
import { useApiError } from "@/lib/use-api-error";
import { apiFetch, formatDate } from "@/lib/api";
import { colors, radii, spacing, type } from "@/theme";

interface SafetyCase {
  id: string;
  reference: string;
  type: string;
  category: string;
  status: string;
  priority: string;
  subject: string;
  createdAt: string;
  reporter: { id: string; name: string | null } | null;
  reportedUser: { id: string; name: string | null } | null;
  listing: { id: string; title: string } | null;
  assignedAdmin: string | null;
  evidenceCount: number;
  updateCount: number;
}

/** Cases arrive ordered by priority then recency from the service, so "Open" simply
 *  filters rather than re-sorting — the queue a moderator should work top-down. */
const OPEN_STATUSES = new Set(["SUBMITTED", "IN_REVIEW", "AWAITING_INFO"]);

export default function AdminCasesScreen() {
  const describeError = useApiError();
  const { locale, t } = useLanguage();
  const [cases, setCases] = useState<SafetyCase[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"open" | "all">("open");

  const load = useCallback(async () => {
    try {
      setError(null);
      const result = await apiFetch<{ cases: SafetyCase[] }>(
        "/api/mobile/v1/admin/cases"
      );
      setCases(result.cases);
    } catch (caught) {
      setError(describeError(caught, "Could not load cases"));
    }
  }, [describeError]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const all = cases ?? [];
  const open = all.filter((entry) => OPEN_STATUSES.has(entry.status));
  const visible = filter === "open" ? open : all;

  return (
    <AppScreen
      title="Reports and cases"
      onRefresh={load}
      sticky={
        cases ? (
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: "open", label: "Open", count: open.length },
              { value: "all", label: "All", count: all.length },
            ]}
          />
        ) : null
      }
    >
      {!cases && !error ? <LoadingState /> : null}
      {error ? (
        <EmptyNotice
          icon="alert"
          title="Cases unavailable"
          description={error}
          onRetry={load}
        />
      ) : null}
      {cases && visible.length === 0 ? (
        <EmptyNotice
          icon="report"
          title={filter === "open" ? "Nothing open" : "No cases"}
          description="Reports, claims and safety cases appear here."
        />
      ) : null}

      <View style={styles.list}>
        {visible.map((entry) => (
          <View key={entry.id} style={styles.card}>
            <View style={styles.top}>
              <Text numberOfLines={2} style={styles.subject}>
                {entry.subject}
              </Text>
              <Pill
                label={entry.priority}
                tone={
                  entry.priority === "URGENT" || entry.priority === "HIGH"
                    ? "danger"
                    : "neutral"
                }
              />
            </View>
            <Text style={styles.meta}>
              {entry.reference} · {entry.type.replaceAll("_", " ")} · {entry.category}
            </Text>
            <Text style={styles.meta}>
              {t("Reported by")} {entry.reporter?.name ?? t("Unknown")}
              {entry.listing ? ` · ${entry.listing.title}` : ""}
            </Text>
            <View style={styles.badges}>
              <Pill
                label={entry.status.replaceAll("_", " ")}
                tone={OPEN_STATUSES.has(entry.status) ? "warning" : "success"}
              />
              {entry.evidenceCount > 0 ? (
                <Pill label={`${entry.evidenceCount} ${t("evidence")}`} />
              ) : null}
              {entry.updateCount > 0 ? (
                <Pill label={`${entry.updateCount} ${t("updates")}`} />
              ) : null}
              {entry.assignedAdmin ? <Pill label={entry.assignedAdmin} /> : null}
            </View>
            <Text style={styles.date}>{formatDate(entry.createdAt, locale)}</Text>
          </View>
        ))}
      </View>
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
});
