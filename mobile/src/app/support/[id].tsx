import { useCallback, useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { Alert, StyleSheet, Text, View } from "react-native";
import {
  AppScreen,
  EmptyNotice,
  LoadingState,
  Pill,
  PrimaryButton,
} from "@/components/ui";
import { Icon } from "@/components/icon";
import { LabeledInput } from "@/components/listing/labeled-input";
import { useLanguage } from "@/context/language-context";
import { useApiError } from "@/lib/use-api-error";
import { apiFetch, formatRelativeTime } from "@/lib/api";
import { isAdminRole, type UserRole } from "@/lib/roles";
import { colors, radii, spacing, type } from "@/theme";

interface CaseDetail {
  id: string;
  reference: string;
  type: string;
  category: string;
  status: string;
  priority: string;
  subject: string;
  description: string;
  createdAt: string;
  listing: { id: string; title: string } | null;
  evidence: {
    id: string;
    url: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }[];
  updates: {
    id: string;
    body: string;
    createdAt: string;
    author: { name: string | null; role: UserRole } | null;
  }[];
}

const CLOSED = new Set(["RESOLVED", "REJECTED"]);

export default function SupportCaseScreen() {
  const describeError = useApiError();
  const { locale, t } = useLanguage();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      const result = await apiFetch<{ case: CaseDetail }>(
        `/api/mobile/v1/support?caseId=${encodeURIComponent(id)}`
      );
      setDetail(result.case);
    } catch (caught) {
      setError(describeError(caught, "Could not load this case"));
    }
  }, [describeError, id]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const closed = detail ? CLOSED.has(detail.status) : false;

  async function send() {
    if (!id || busy || message.trim().length < 2) return;
    try {
      setBusy(true);
      await apiFetch("/api/mobile/v1/support", {
        method: "POST",
        body: JSON.stringify({ caseId: id, body: message.trim() }),
      });
      setMessage("");
      await load();
    } catch (caught) {
      Alert.alert(
        t("Could not send"),
        caught instanceof Error ? caught.message : t("Try again.")
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppScreen title={detail?.subject ?? "Case"} onRefresh={load}>
      {!detail && !error ? <LoadingState /> : null}
      {error ? (
        <EmptyNotice
          icon="alert"
          title="Case unavailable"
          description={error}
          onRetry={load}
        />
      ) : null}

      {detail ? (
        <View style={styles.stack}>
          <View style={styles.badges}>
            <Pill
              label={detail.status.replaceAll("_", " ")}
              tone={closed ? "success" : "warning"}
            />
            <Pill label={detail.reference} />
            <Pill label={detail.type.replaceAll("_", " ")} />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t("What was reported")}</Text>
            <Text style={styles.body}>{detail.description}</Text>
            {detail.listing ? (
              <Text style={styles.meta}>{detail.listing.title}</Text>
            ) : null}
          </View>

          {detail.evidence.length ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t("Evidence")}</Text>
              {detail.evidence.map((file) => (
                <View key={file.id} style={styles.file}>
                  <Icon color={colors.muted} name="preview" size={16} />
                  <Text numberOfLines={1} style={styles.fileName}>
                    {file.fileName}
                  </Text>
                  <Text style={styles.fileSize}>
                    {Math.max(1, Math.round(file.sizeBytes / 1024))} KB
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <Text style={styles.sectionTitle}>{t("Conversation")}</Text>
          {detail.updates.length === 0 ? (
            <Text style={styles.meta}>
              {t("No replies yet. Linger Homes Support will respond here.")}
            </Text>
          ) : null}
          {detail.updates.map((update) => {
            const fromSupport = isAdminRole(update.author?.role);
            return (
              <View
                key={update.id}
                style={[styles.update, fromSupport && styles.updateSupport]}
              >
                <Text style={styles.updateWho}>
                  {fromSupport
                    ? t("Linger Homes Support")
                    : update.author?.name ?? t("You")}
                </Text>
                <Text style={styles.body}>{update.body}</Text>
                <Text style={styles.meta}>
                  {formatRelativeTime(update.createdAt, locale, t)}
                </Text>
              </View>
            );
          })}

          {closed ? (
            <Text style={styles.meta}>
              {t("This case is closed. Reply is disabled.")}
            </Text>
          ) : (
            <View style={styles.reply}>
              <LabeledInput
                label={t("Add a message")}
                multiline
                value={message}
                onChangeText={setMessage}
              />
              <PrimaryButton
                label={busy ? "Sending…" : "Send"}
                disabled={busy || message.trim().length < 2}
                onPress={() => void send()}
              />
            </View>
          )}
        </View>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  card: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  cardTitle: { ...type.label, color: colors.inkSoft },
  sectionTitle: { ...type.section, color: colors.ink, marginTop: spacing.lg },
  body: { ...type.body, color: colors.ink },
  meta: { ...type.caption, color: colors.muted },
  file: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  fileName: { ...type.meta, flex: 1, color: colors.ink },
  fileSize: { ...type.caption, color: colors.muted },
  update: {
    gap: spacing.xs,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  updateSupport: {
    borderColor: colors.primarySoft,
    backgroundColor: colors.primarySoft,
  },
  updateWho: { ...type.label, color: colors.inkSoft },
  reply: { gap: spacing.md, marginTop: spacing.md },
});
