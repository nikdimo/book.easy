import { useCallback, useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { AppScreen, EmptyNotice, LoadingState } from "@/components/ui";
import {
  absoluteMediaUrl,
  apiFetch,
  ConversationSummary,
  ConversationsResponse,
  formatRelativeTime,
} from "@/lib/api";
import { colors, radii, spacing } from "@/theme";
import { useLanguage } from "@/context/language-context";

export default function InboxScreen() {
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
      setError(caught instanceof Error ? caught.message : "Could not load messages");
    }
  }, []);

  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    const poller = setInterval(() => void load(), 10_000);
    return () => {
      clearTimeout(initial);
      clearInterval(poller);
    };
  }, [load]);

  return (
    <AppScreen
      eyebrow="MESSAGES"
      title="Inbox"
      subtitle="Every booking has a private conversation with the guest."
      onRefresh={load}
    >
      {!conversations && !error ? <LoadingState /> : null}
      {error ? <EmptyNotice title="Inbox unavailable" description={error} onRetry={load} /> : null}
      {conversations?.length === 0 ? (
        <EmptyNotice
          title="No conversations yet"
          description="A thread is created automatically when a booking is made."
        />
      ) : null}
      <View style={styles.list}>
        {conversations?.map((conversation) => (
          <Pressable
            accessibilityLabel={`${conversation.otherUser.name}, ${conversation.listing.title}`}
            accessibilityRole="button"
            key={conversation.id}
            onPress={() =>
              router.push({
                pathname: "/chat/[id]",
                params: { id: conversation.id },
              })
            }
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.65 }]}
          >
            {conversation.listing.imageUrl ? (
              <Image
                alt=""
                source={{ uri: absoluteMediaUrl(conversation.listing.imageUrl) }}
                style={styles.image}
              />
            ) : (
              <View style={[styles.image, styles.placeholder]}>
                <Text style={styles.placeholderText}>P</Text>
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
              <Text numberOfLines={1} style={styles.listing}>
                {conversation.listing.title}
              </Text>
              <View style={styles.previewRow}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.preview,
                    conversation.unreadCount > 0 && styles.previewUnread,
                  ]}
                >
                  {conversation.lastMessagePreview ?? t("Start the conversation")}
                </Text>
                {conversation.unreadCount > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{conversation.unreadCount}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </Pressable>
        ))}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  list: { borderTopWidth: 1, borderTopColor: colors.border },
  row: {
    minHeight: 94,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.md,
  },
  image: { width: 62, height: 62, borderRadius: radii.md, backgroundColor: colors.surfaceAlt },
  placeholder: { alignItems: "center", justifyContent: "center" },
  placeholderText: { color: colors.primary, fontSize: 18, fontWeight: "900" },
  top: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  name: { flex: 1, color: colors.ink, fontSize: 14, fontWeight: "900" },
  time: { color: colors.muted, fontSize: 10 },
  listing: { color: colors.primary, fontSize: 11, fontWeight: "700", marginTop: 3 },
  previewRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 6 },
  preview: { flex: 1, color: colors.muted, fontSize: 12 },
  previewUnread: { color: colors.ink, fontWeight: "800" },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "900" },
});
