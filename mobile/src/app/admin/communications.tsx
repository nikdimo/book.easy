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
import { apiFetch, formatRelativeTime } from "@/lib/api";
import { colors, radii, spacing, type } from "@/theme";

interface AdminConversation {
  id: string;
  kind: string;
  lastMessageAt: string | null;
  createdAt: string;
  listing: { id: string; title: string } | null;
  booking: { id: string; status: string } | null;
  participants: { id: string; name: string | null; role: string }[];
  messageCount: number;
  safetyCaseCount: number;
  hasSupport: boolean;
}

/** Oversight, not surveillance.
 *
 *  This lists conversation metadata only — who is in a thread, how many messages,
 *  whether a case is attached. Message content is deliberately absent, and the API
 *  does not return it. Reading a thread means joining it as support, which is
 *  recorded and visible to the participants. */
export default function AdminCommunicationsScreen() {
  const describeError = useApiError();
  const { locale, t } = useLanguage();
  const [conversations, setConversations] = useState<AdminConversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "support" | "cases">("all");

  const load = useCallback(async () => {
    try {
      setError(null);
      const result = await apiFetch<{ conversations: AdminConversation[] }>(
        "/api/mobile/v1/admin/communications"
      );
      setConversations(result.conversations);
    } catch (caught) {
      setError(describeError(caught, "Could not load communications"));
    }
  }, [describeError]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const all = conversations ?? [];
  const withSupport = all.filter((entry) => entry.hasSupport);
  const withCases = all.filter((entry) => entry.safetyCaseCount > 0);
  const visible =
    filter === "support" ? withSupport : filter === "cases" ? withCases : all;

  return (
    <AppScreen
      title="Communications"
      subtitle="Thread metadata only. Message content stays private."
      onRefresh={load}
      sticky={
        conversations ? (
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All", count: all.length },
              { value: "support", label: "Support joined", count: withSupport.length },
              { value: "cases", label: "With cases", count: withCases.length },
            ]}
          />
        ) : null
      }
    >
      {!conversations && !error ? <LoadingState /> : null}
      {error ? (
        <EmptyNotice
          icon="alert"
          title="Communications unavailable"
          description={error}
          onRetry={load}
        />
      ) : null}
      {conversations && visible.length === 0 ? (
        <EmptyNotice
          icon="chat"
          title="Nothing here"
          description="Conversations appear as guests and hosts start talking."
        />
      ) : null}

      <View style={styles.list}>
        {visible.map((entry) => (
          <View key={entry.id} style={styles.card}>
            <View style={styles.top}>
              <Text numberOfLines={1} style={styles.title}>
                {entry.listing?.title ?? t("No listing")}
              </Text>
              <Text style={styles.time}>
                {entry.lastMessageAt
                  ? formatRelativeTime(entry.lastMessageAt, locale, t)
                  : ""}
              </Text>
            </View>
            <Text numberOfLines={1} style={styles.people}>
              {entry.participants
                .map((participant) => participant.name ?? t("Unknown"))
                .join(" · ")}
            </Text>
            <View style={styles.badges}>
              <Pill label={entry.kind} />
              <Pill label={`${entry.messageCount} ${t("messages")}`} />
              {entry.safetyCaseCount > 0 ? (
                <Pill
                  label={`${entry.safetyCaseCount} ${t("cases")}`}
                  tone="danger"
                />
              ) : null}
              {entry.hasSupport ? <Pill label="Support joined" tone="warning" /> : null}
              {entry.booking ? <Pill label={entry.booking.status} tone="neutral" /> : null}
            </View>
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
  top: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { ...type.bodyStrong, flex: 1, color: colors.ink },
  time: { ...type.caption, color: colors.muted },
  people: { ...type.caption, color: colors.muted },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
});
