import { useCallback, useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { AppScreen, EmptyNotice, LoadingState, Pill } from "@/components/ui";
import { Icon } from "@/components/icon";
import {
  absoluteMediaUrl,
  apiFetch,
  ConversationSummary,
  ConversationsResponse,
  formatRelativeTime,
} from "@/lib/api";
import { colors, radii, spacing, type } from "@/theme";
import { useLanguage } from "@/context/language-context";
import { useApiError } from "@/lib/use-api-error";

export default function InboxScreen() {
  const describeError = useApiError();
  const router = useRouter();
  const { locale, t } = useLanguage();
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const result = await apiFetch<ConversationsResponse>("/api/mobile/v1/conversations");
      setConversations(result.conversations);
    } catch (caught) {
      setError(describeError(caught, "Could not load messages"));
    }
  }, [describeError]);

  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    const poller = setInterval(() => void load(), 10_000);
    return () => {
      clearTimeout(initial);
      clearInterval(poller);
    };
  }, [load]);

  const unread = conversations?.filter((c) => c.unreadCount > 0).length ?? 0;

  return (
    <AppScreen
      title="Inbox"
      subtitle={unread > 0 ? undefined : "Every booking has a private conversation."}
      onRefresh={load}
      action={unread > 0 ? <Pill label={`${unread} unread`} tone="danger" /> : undefined}
    >
      {!conversations && !error ? <LoadingState /> : null}
      {error ? (
        <EmptyNotice
          icon="alert"
          title="Inbox unavailable"
          description={error}
          onRetry={load}
        />
      ) : null}
      {conversations?.length === 0 ? (
        <EmptyNotice
          icon="chat"
          title="No conversations yet"
          description="A thread is created automatically when a booking is made."
        />
      ) : null}

      <View style={styles.list}>
        {conversations?.map((conversation) => {
          const unreadRow = conversation.unreadCount > 0;
          return (
            <Pressable
              accessibilityLabel={`${conversation.otherUser.name}, ${conversation.listing.title}${
                unreadRow ? `, ${conversation.unreadCount} ${t("unread")}` : ""
              }`}
              accessibilityRole="button"
              key={conversation.id}
              onPress={() =>
                router.push({ pathname: "/chat/[id]", params: { id: conversation.id } })
              }
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              {conversation.listing.imageUrl ? (
                <Image
                  alt=""
                  source={{ uri: absoluteMediaUrl(conversation.listing.imageUrl) }}
                  style={styles.image}
                />
              ) : (
                <View style={[styles.image, styles.placeholder]}>
                  <Icon color={colors.muted} name="listings" size={18} />
                </View>
              )}

              <View style={{ flex: 1 }}>
                <View style={styles.top}>
                  <Text numberOfLines={1} style={styles.name}>
                    {conversation.otherUser.name}
                  </Text>
                  {conversation.lastMessageAt ? (
                    <Text style={styles.time}>
                      {formatRelativeTime(conversation.lastMessageAt, locale, t)}
                    </Text>
                  ) : null}
                </View>

                {/* Listing, thread kind and support flag on one quiet line. Three
                    separately styled labels stacked here made the row read as
                    metadata first and the message second. */}
                <Text numberOfLines={1} style={styles.context}>
                  {conversation.listing.title}
                  {" · "}
                  {conversation.kind === "INQUIRY" ? t("Inquiry") : t("Booking")}
                  {conversation.hasSupport ? ` · ${t("Support")}` : ""}
                </Text>

                <View style={styles.previewRow}>
                  <Text
                    numberOfLines={1}
                    style={[styles.preview, unreadRow && styles.previewUnread]}
                  >
                    {conversation.lastMessagePreview ?? t("Start the conversation")}
                  </Text>
                  {unreadRow ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{conversation.unreadCount}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  image: {
    width: 52,
    height: 52,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
  },
  placeholder: { alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  name: { ...type.bodyStrong, flex: 1, color: colors.ink },
  time: { ...type.caption, color: colors.muted },
  context: { ...type.caption, color: colors.muted, marginTop: 3 },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: 5,
  },
  preview: { ...type.meta, flex: 1, color: colors.muted },
  previewUnread: { color: colors.ink, fontFamily: type.label.fontFamily },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { ...type.caption, fontSize: 10, color: "#fff" },
  pressed: { opacity: 0.6 },
});
