import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AppScreen, EmptyNotice, LoadingState, Pill } from "@/components/ui";
import { useLanguage } from "@/context/language-context";
import { useApiError } from "@/lib/use-api-error";
import { apiFetch, formatRelativeTime } from "@/lib/api";
import { colors, radii, spacing, type } from "@/theme";

interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  user: { name: string | null; email: string | null };
  details: string | null;
}

/** Read-only, and intentionally so — an audit log that can be edited from a phone
 *  is not an audit log. */
export default function AdminAuditLogScreen() {
  const describeError = useApiError();
  const { locale, t } = useLanguage();
  const [logs, setLogs] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const result = await apiFetch<{ logs: AuditEntry[] }>(
        "/api/mobile/v1/admin/audit-log"
      );
      setLogs(result.logs);
    } catch (caught) {
      setError(describeError(caught, "Could not load the audit log"));
    }
  }, [describeError]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <AppScreen title="Audit log" subtitle="The 100 most recent actions." onRefresh={load}>
      {!logs && !error ? <LoadingState /> : null}
      {error ? (
        <EmptyNotice
          icon="alert"
          title="Audit log unavailable"
          description={error}
          onRetry={load}
        />
      ) : null}
      {logs?.length === 0 ? (
        <EmptyNotice icon="info" title="Nothing recorded yet" description="Admin actions appear here." />
      ) : null}

      <View style={styles.list}>
        {logs?.map((log) => (
          <View key={log.id} style={styles.row}>
            <View style={styles.top}>
              <Text numberOfLines={1} style={styles.who}>
                {log.user.name ?? log.user.email ?? t("Unknown")}
              </Text>
              <Text style={styles.time}>
                {formatRelativeTime(log.createdAt, locale, t)}
              </Text>
            </View>
            <View style={styles.badges}>
              <Pill label={log.action} />
              <Pill label={`${log.entityType} ${log.entityId.slice(0, 8)}`} />
            </View>
            {log.details ? (
              <Text numberOfLines={3} style={styles.details}>
                {log.details}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: {
    gap: spacing.xs,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  top: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  who: { ...type.bodyStrong, flex: 1, color: colors.ink },
  time: { ...type.caption, color: colors.muted },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  details: { ...type.caption, color: colors.muted },
});
