import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "@/context/auth-context";
import { useNotifications } from "@/context/notification-context";
import { useLanguage } from "@/context/language-context";
import { apiFetch, ChatResponse, formatRelativeTime } from "@/lib/api";
import { colors, radii, spacing } from "@/theme";

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { refreshNotifications } = useNotifications();
  const { locale, t } = useLanguage();
  const scrollRef = useRef<ScrollView>(null);
  const [chat, setChat] = useState<ChatResponse | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const result = await apiFetch<ChatResponse>(
        `/api/mobile/v1/conversations/${id}/messages`
      );
      setChat(result);
      setError(null);
      void refreshNotifications();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Conversation unavailable");
    }
  }, [id, refreshNotifications]);

  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    const poller = setInterval(() => void load(), 5_000);
    return () => {
      clearTimeout(initial);
      clearInterval(poller);
    };
  }, [load]);

  async function send() {
    const body = draft.trim();
    if (!body || !id || sending) return;
    try {
      setSending(true);
      setDraft("");
      await apiFetch(`/api/mobile/v1/conversations/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      await load();
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    } catch (caught) {
      setDraft(body);
      setError(caught instanceof Error ? caught.message : "Message could not be sent");
    } finally {
      setSending(false);
    }
  }

  const other = chat?.conversation.participants.find(
    (participant) => participant.userId !== user?.id
  )?.user;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
        style={styles.flex}
      >
        <View style={styles.context}>
          <Text style={styles.person}>{other?.name ?? t("Guest")}</Text>
          <Text numberOfLines={1} style={styles.listing}>
            {chat?.conversation.listing.title ?? t("Booking conversation")}
          </Text>
        </View>

        {!chat && !error ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.messages}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {chat?.messages.length === 0 ? (
            <View style={styles.start}>
              <Text style={styles.startTitle}>{t("Start the conversation")}</Text>
              <Text style={styles.startBody}>
                {t("Share arrival details and answer questions about this booking.")}
              </Text>
            </View>
          ) : null}
          {chat?.messages.map((message) => {
            const mine = message.senderId === user?.id;
            return (
              <View
                key={message.id}
                style={[styles.messageWrap, mine ? styles.mineWrap : styles.theirsWrap]}
              >
                {!mine ? (
                  <Text style={styles.sender}>
                    {message.senderRole === "SUPPORT" ? t("Linger Homes Support") : message.sender.name}
                  </Text>
                ) : null}
                <View style={[
                  styles.bubble,
                  mine ? styles.mine : message.senderRole === "SUPPORT" ? styles.support : styles.theirs,
                ]}>
                  <Text style={[styles.body, mine && styles.mineBody]}>{message.body}</Text>
                </View>
                <Text style={styles.time}>
                  {formatRelativeTime(message.createdAt, locale, t)}
                </Text>
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.composer}>
          <TextInput
            accessibilityLabel={t("Write a message")}
            editable={!sending}
            maxLength={2000}
            multiline
            onChangeText={setDraft}
            onSubmitEditing={() => void send()}
            placeholder={`${t("Write a message")}…`}
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={draft}
          />
          <Pressable
            accessibilityLabel={t("Send")}
            accessibilityRole="button"
            disabled={!draft.trim() || sending}
            onPress={() => void send()}
            style={[styles.send, (!draft.trim() || sending) && styles.disabled]}
          >
            <Text style={styles.sendText}>{sending ? "…" : t("Send")}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  context: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  person: { color: colors.ink, fontSize: 15, fontWeight: "900" },
  listing: { color: colors.primary, fontSize: 11, marginTop: 3 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  error: {
    color: colors.danger,
    backgroundColor: "#FFF2F2",
    padding: spacing.md,
    textAlign: "center",
    fontSize: 12,
  },
  messages: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  start: { alignItems: "center", padding: spacing.xl },
  startTitle: { color: colors.ink, fontSize: 16, fontWeight: "900" },
  startBody: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 6,
  },
  messageWrap: { maxWidth: "82%" },
  mineWrap: { alignSelf: "flex-end", alignItems: "flex-end" },
  theirsWrap: { alignSelf: "flex-start", alignItems: "flex-start" },
  sender: { color: colors.muted, fontSize: 10, marginBottom: 4, marginLeft: 4 },
  bubble: { borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: 10 },
  mine: { backgroundColor: colors.primary, borderBottomRightRadius: 5 },
  theirs: { backgroundColor: colors.surface, borderBottomLeftRadius: 5 },
  support: {
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: "#B8D5DA",
    borderBottomLeftRadius: 5,
  },
  body: { color: colors.ink, fontSize: 14, lineHeight: 20 },
  mineBody: { color: "#fff" },
  time: { color: colors.muted, fontSize: 9, marginTop: 4, marginHorizontal: 4 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  input: {
    flex: 1,
    minWidth: 0,
    maxHeight: 120,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingTop: 11,
    color: colors.ink,
    fontSize: 14,
  },
  send: {
    minWidth: 62,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.45 },
  sendText: { color: "#fff", fontSize: 12, fontWeight: "900" },
});
