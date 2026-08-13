"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  Clock3,
  Headphones,
  RefreshCw,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { COMMUNICATION_BRAND } from "@/lib/communication-brand";
import { DamageReportDialog } from "@/components/communication/damage-report-dialog";
import { Tx, useI18n } from "@/lib/i18n/client";
import { normalizeLocaleCode } from "@/lib/i18n/locale-preference";
import { resolveBookingStatus } from "@/lib/i18n/status-labels";

type DeliveryState = "sending" | "failed" | "sent";

interface ThreadMessage {
  id: string;
  clientId: string | null;
  body: string;
  sourceLocale: string;
  senderId: string | null;
  senderRole: "MEMBER" | "SUPPORT";
  sender: { id: string; name: string | null; image?: string | null };
  createdAt: string | Date;
  deletedAt: string | Date | null;
  deliveryState?: DeliveryState;
}

interface ThreadPayload {
  conversation: {
    id: string;
    kind: "INQUIRY" | "BOOKING";
    status: "OPEN" | "FROZEN" | "CLOSED";
    listing: { id: string; title: string; imageUrl: string | null };
    booking: {
      id: string;
      reference: string;
      status: string;
      checkIn: string | Date;
      checkOut: string | Date;
      numberOfNights: number;
      guestCount: number;
      currency: string;
      totalPrice: number;
      detailsUrl: string;
    } | null;
    participants: Array<{
      userId: string;
      role: "MEMBER" | "SUPPORT";
      user: { id: string; name: string | null; image?: string | null };
    }>;
  };
  nextCursor: string | null;
  messages: ThreadMessage[];
  bookingEvents: Array<{
    id: string;
    type: string;
    actorId: string | null;
    data: unknown;
    createdAt: string | Date;
  }>;
  damageReports: Array<{
    id: string;
    description: string;
    status: string;
    reporterId: string | null;
    createdAt: string | Date;
    reporter: { id: string; name: string | null; image?: string | null } | null;
    evidence: Array<{
      id: string;
      url: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
    }>;
  }>;
}

function bookingEventCopy(resolve: ReturnType<typeof useI18n>["resolve"], type: string) {
  switch (type) {
    case "REQUESTED": return resolve("conversation.event.requested", "Booking requested");
    case "CONFIRMED": return resolve("conversation.event.confirmed", "Booking confirmed");
    case "REJECTED": return resolve("conversation.event.rejected", "Booking request declined");
    case "EXPIRED": return resolve("conversation.event.expired", "Booking request expired");
    case "CANCELLED_BY_GUEST": return resolve("conversation.event.cancelled_guest", "Booking cancelled by the guest");
    case "CANCELLED_BY_HOST": return resolve("conversation.event.cancelled_host", "Booking cancelled by the host");
    case "CANCELLED_BY_ADMIN": return resolve("conversation.event.cancelled_support", "Booking cancelled by support");
    case "COMPLETED": return resolve("conversation.event.completed", "Stay completed");
    default: return { text: type.replaceAll("_", " "), translated: false };
  }
}

function damageStatusCopy(resolve: ReturnType<typeof useI18n>["resolve"], status: string) {
  switch (status) {
    case "REPORTED": return resolve("conversation.damage.status.reported", "Reported");
    case "ACKNOWLEDGED": return resolve("conversation.damage.status.acknowledged", "Acknowledged");
    case "ESCALATED": return resolve("conversation.damage.status.escalated", "Support requested");
    case "RESOLVED": return resolve("conversation.damage.status.resolved", "Resolved");
    default: return { text: status.replaceAll("_", " "), translated: false };
  }
}

function conversationStatusCopy(resolve: ReturnType<typeof useI18n>["resolve"], status: string) {
  switch (status) {
    case "FROZEN": return resolve("conversation.status.frozen", "frozen");
    case "CLOSED": return resolve("conversation.status.closed", "closed");
    default: return resolve("conversation.status.open", "open");
  }
}

function mergeMessages(
  current: ThreadMessage[],
  incoming: ThreadMessage[]
): ThreadMessage[] {
  const incomingClientIds = new Set(
    incoming.map((message) => message.clientId).filter(Boolean)
  );
  const byId = new Map<string, ThreadMessage>();
  for (const message of current) {
    if (
      message.id.startsWith("temp-") &&
      message.clientId &&
      incomingClientIds.has(message.clientId)
    ) {
      continue;
    }
    byId.set(message.id, message);
  }
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

function dayKey(value: string | Date) {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function ConversationThread({
  initial,
  currentUserId,
}: {
  initial: ThreadPayload;
  currentUserId: string;
}) {
  const { requestedLocale, locale, resolve } = useI18n();
  const [thread, setThread] = useState(initial);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const markRead = useCallback(
    async (payload: ThreadPayload) => {
      const lastMessage = payload.messages.at(-1);
      if (!lastMessage || lastMessage.id.startsWith("temp-")) return;
      await fetch(`/api/conversations/${payload.conversation.id}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastMessageId: lastMessage.id }),
      });
    },
    []
  );

  const refresh = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    const response = await fetch(
      `/api/conversations/${thread.conversation.id}/messages`,
      { cache: "no-store" }
    );
    if (!response.ok) return;
    const next = (await response.json()) as ThreadPayload;
    setThread((current) => ({
      ...next,
      messages: mergeMessages(current.messages, next.messages),
    }));
    void markRead(next);
  }, [markRead, thread.conversation.id]);

  useEffect(() => {
    void markRead(initial);
  }, [initial, markRead]);

  useEffect(() => {
    const poller = window.setInterval(() => void refresh(), 5000);
    const events = new EventSource(
      `/api/conversations/${thread.conversation.id}/events`
    );
    events.addEventListener("refresh", () => void refresh());
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(poller);
      events.close();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refresh, thread.conversation.id]);

  useEffect(() => {
    if (stickToBottom.current) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [thread.messages.length, thread.damageReports.length]);

  async function loadOlder() {
    if (!thread.nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    const previousHeight = scrollRef.current?.scrollHeight ?? 0;
    try {
      const response = await fetch(
        `/api/conversations/${thread.conversation.id}/messages?cursor=${encodeURIComponent(thread.nextCursor)}`,
        { cache: "no-store" }
      );
      if (!response.ok) throw new Error("Could not load earlier messages");
      const older = (await response.json()) as ThreadPayload;
      setThread((current) => ({
        ...current,
        nextCursor: older.nextCursor,
        messages: mergeMessages(older.messages, current.messages),
      }));
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop =
            scrollRef.current.scrollHeight - previousHeight;
        }
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not load earlier messages"
      );
    } finally {
      setLoadingOlder(false);
    }
  }

  async function sendMessage(
    body: string,
    clientId: string,
    temporaryId = `temp-${clientId}`
  ) {
    const role =
      thread.conversation.participants.find(
        (participant) => participant.userId === currentUserId
      )?.role ?? "MEMBER";
    setThread((current) => {
      const existing = current.messages.find(
        (message) => message.id === temporaryId
      );
      const optimistic: ThreadMessage = existing
        ? { ...existing, deliveryState: "sending" }
        : {
            id: temporaryId,
            clientId,
            body,
            senderId: currentUserId,
            senderRole: role,
            sender: { id: currentUserId, name: "You" },
            sourceLocale: normalizeLocaleCode(requestedLocale) ?? "en",
            createdAt: new Date().toISOString(),
            deletedAt: null,
            deliveryState: "sending",
          };
      return {
        ...current,
        messages: existing
          ? current.messages.map((message) =>
              message.id === temporaryId ? optimistic : message
            )
          : [...current.messages, optimistic],
      };
    });
    stickToBottom.current = true;
    try {
      const response = await fetch(
        `/api/conversations/${thread.conversation.id}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body, clientId }),
        }
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error || "Message could not be sent");
      }
      await refresh();
    } catch (error) {
      setThread((current) => ({
        ...current,
        messages: current.messages.map((message) =>
          message.id === temporaryId
            ? { ...message, deliveryState: "failed" }
            : message
        ),
      }));
      toast.error(
        error instanceof Error ? error.message : "Message could not be sent"
      );
    }
  }

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setDraft("");
    try {
      await sendMessage(body, crypto.randomUUID());
    } finally {
      setSending(false);
    }
  }

  async function updateDamageReport(
    damageReportId: string,
    action: "ACKNOWLEDGE" | "ESCALATE" | "RESOLVE"
  ) {
    const response = await fetch(
      `/api/conversations/${thread.conversation.id}/damage-reports`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ damageReportId, action }),
      }
    );
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      toast.error(result.error || "Could not update damage report");
      return;
    }
    await refresh();
  }

  const other = thread.conversation.participants.find(
    (participant) =>
      participant.userId !== currentUserId && participant.role !== "SUPPORT"
  );
  const supportJoined = thread.conversation.participants.some(
    (participant) => participant.role === "SUPPORT"
  );
  const open = thread.conversation.status === "OPEN";
  const booking = thread.conversation.booking;

  const timeline = useMemo(() => {
    return [
      ...thread.messages.map((message) => ({
        kind: "message" as const,
        id: message.id,
        createdAt: message.createdAt,
        value: message,
      })),
      ...thread.bookingEvents.map((event) => ({
        kind: "booking" as const,
        id: event.id,
        createdAt: event.createdAt,
        value: event,
      })),
      ...thread.damageReports.map((report) => ({
        kind: "damage" as const,
        id: report.id,
        createdAt: report.createdAt,
        value: report,
      })),
    ].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [thread.bookingEvents, thread.damageReports, thread.messages]);

  return (
    <div className="mx-auto flex h-[calc(100dvh-8rem)] min-h-[640px] max-w-4xl flex-col overflow-hidden rounded-2xl border bg-background shadow-sm">
      <div className="shrink-0 border-b bg-background p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate font-semibold">
              {other?.user.name || resolve("conversation.title", `${COMMUNICATION_BRAND.name} conversation`).text}
            </h1>
            <p className="truncate text-sm text-muted-foreground">
              <span data-user-generated-content translate="yes">{thread.conversation.listing.title}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {supportJoined ? (
              <Badge>
                <Headphones className="mr-1 h-3 w-3" /> <Tx k="conversation.support" source="Support" />
              </Badge>
            ) : null}
            {booking ? (
              <DamageReportDialog
                conversationId={thread.conversation.id}
                onCreated={refresh}
              />
            ) : null}
          </div>
        </div>

        {booking ? (
          <Link
            href={booking.detailsUrl}
            className="mt-4 flex gap-3 rounded-xl border bg-muted/30 p-3 transition-colors hover:bg-muted/60"
          >
            <div className="h-20 w-24 shrink-0 overflow-hidden rounded-lg bg-muted">
              {thread.conversation.listing.imageUrl ? (
                // Listing images can be stored locally or on a configured media host.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thread.conversation.listing.imageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-semibold">
                  <span data-user-generated-content translate="yes">{thread.conversation.listing.title}</span>
                </p>
                <Badge variant="secondary">{resolveBookingStatus({ resolve }, booking.status).text}</Badge>
              </div>
              <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" />
                {new Intl.DateTimeFormat(locale, {
                  month: "short",
                  day: "numeric",
                }).format(new Date(booking.checkIn))}
                {" – "}
                {new Intl.DateTimeFormat(locale, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                }).format(new Date(booking.checkOut))}
              </p>
              <p className="mt-1 text-sm">
                {booking.numberOfNights} <Tx k="conversation.nights" source="nights" /> · {booking.guestCount} <Tx k="conversation.guests" source="guests" /> ·{" "}
                <strong>
                  {new Intl.NumberFormat(locale, {
                    style: "currency",
                    currency: booking.currency,
                  }).format(booking.totalPrice)}
                </strong>
              </p>
              <p className="mt-1 text-xs text-primary">
                <Tx k="conversation.booking" source="Booking" /> {booking.reference} · <Tx k="conversation.view_details" source="View details" />
              </p>
            </div>
          </Link>
        ) : null}
      </div>

      {thread.conversation.kind === "INQUIRY" ? (
        <div className="flex shrink-0 gap-2 border-b bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <Tx k="conversation.safety_notice" source="Keep payment and contact details inside Linger Homes until the booking is confirmed." />
        </div>
      ) : null}

      <div
        ref={scrollRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          stickToBottom.current =
            element.scrollHeight - element.scrollTop - element.clientHeight < 120;
        }}
        className="flex-1 space-y-4 overflow-y-auto bg-muted/20 p-4 sm:p-6"
      >
        {thread.nextCursor ? (
          <div className="text-center">
            <Button
              variant="outline"
              size="sm"
              disabled={loadingOlder}
              onClick={() => void loadOlder()}
            >
              {loadingOlder ? <Tx k="common.loading" source="Loading..." /> : <Tx k="conversation.load_earlier" source="Load earlier messages" />}
            </Button>
          </div>
        ) : null}
        {!timeline.length ? (
          <div className="mx-auto max-w-md py-12 text-center text-sm text-muted-foreground">
            <Tx k="conversation.empty_timeline" source="Start the conversation. Messages and booking activity will appear here." />
          </div>
        ) : null}
        {timeline.map((item, index) => {
          const showDay =
            index === 0 ||
            dayKey(timeline[index - 1].createdAt) !== dayKey(item.createdAt);
          return (
            <div key={`${item.kind}-${item.id}`}>
              {showDay ? (
                <p className="mb-4 text-center text-xs font-medium text-muted-foreground">
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: "medium",
                  }).format(new Date(item.createdAt))}
                </p>
              ) : null}

              {item.kind === "booking" ? (
                <div className="mx-auto max-w-md rounded-xl border bg-background px-4 py-3 text-center shadow-sm">
                  <Check className="mx-auto mb-1 h-5 w-5 text-primary" />
                  <p className="font-medium">
                    {bookingEventCopy(resolve, item.value.type).text}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat(locale, {
                      timeStyle: "short",
                    }).format(new Date(item.createdAt))}
                  </p>
                </div>
              ) : null}

              {item.kind === "damage" ? (
                <div
                  className={cn(
                    "flex",
                    item.value.reporterId === currentUserId
                      ? "justify-end"
                      : "justify-start"
                  )}
                >
                  <div className="max-w-[88%] overflow-hidden rounded-2xl border bg-background shadow-sm sm:max-w-md">
                    <div className="flex items-center justify-between gap-3 px-4 py-3">
                      <div>
                        <p className="font-semibold">
                          <Tx k="conversation.damage.reported" source="Damage reported" />
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.value.reporter?.name ?? resolve("conversation.member", "Member").text}
                        </p>
                      </div>
                      <Badge variant="secondary">{damageStatusCopy(resolve, item.value.status).text}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-1 px-3">
                      {item.value.evidence.map((photo) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={photo.id}
                          src={photo.url}
                          alt={photo.fileName}
                          className="aspect-[4/3] w-full rounded-lg object-cover"
                        />
                      ))}
                    </div>
                    <p className="whitespace-pre-wrap px-4 py-3 text-sm">
                      {item.value.description}
                    </p>
                    {item.value.status !== "RESOLVED" ? (
                      <div className="flex flex-wrap gap-2 border-t px-4 py-3">
                        {item.value.status === "REPORTED" &&
                        item.value.reporterId !== currentUserId ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              void updateDamageReport(
                                item.value.id,
                                "ACKNOWLEDGE"
                              )
                            }
                          >
                            <Tx k="conversation.damage.acknowledge" source="Acknowledge" />
                          </Button>
                        ) : null}
                        {item.value.status !== "ESCALATED" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              void updateDamageReport(
                                item.value.id,
                                "ESCALATE"
                              )
                            }
                          >
                            <Tx k="conversation.damage.ask_support" source="Ask support" />
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          onClick={() =>
                            void updateDamageReport(item.value.id, "RESOLVE")
                          }
                        >
                          <Tx k="conversation.damage.mark_resolved" source="Mark resolved" />
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {item.kind === "message" ? (
                <MessageBubble
                  message={item.value}
                  mine={item.value.senderId === currentUserId}
                  onRetry={(message) =>
                    void sendMessage(
                      message.body,
                      message.clientId!,
                      message.id
                    )
                  }
                />
              ) : null}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="shrink-0 border-t bg-background p-3 sm:p-4">
        {open ? (
          <>
            <div className="flex items-end gap-2">
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                maxLength={2000}
                rows={2}
                placeholder={resolve("conversation.write_placeholder", "Write a message...").text}
                aria-label={resolve("conversation.write_label", "Write a message").text}
              />
              <Button
                size="icon"
                className="h-10 w-10 shrink-0 rounded-full"
                disabled={sending || !draft.trim()}
                onClick={() => void send()}
                aria-label={resolve("conversation.send", "Send message").text}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-1 text-right text-[11px] text-muted-foreground">
              {resolve("conversation.characters_remaining", "{count} characters remaining").text.replace("{count}", String(2000 - draft.length))}
            </p>
          </>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            {resolve("conversation.closed_state", "This conversation is {status}.").text.replace(
              "{status}",
              conversationStatusCopy(resolve, thread.conversation.status).text,
            )}
          </p>
        )}
      </div>
    </div>
  );
}

function languageName(locale: string, displayLocale: string): string {
  try {
    return new Intl.DisplayNames([displayLocale], { type: "language" }).of(locale) ?? locale;
  } catch {
    return locale;
  }
}

function MessageBubble({
  message,
  mine,
  onRetry,
}: {
  message: ThreadMessage;
  mine: boolean;
  onRetry: (message: ThreadMessage) => void;
}) {
  const { requestedLocale, resolve } = useI18n();
  const sourceLocale = normalizeLocaleCode(message.sourceLocale) ?? "en";
  const readerLocale = normalizeLocaleCode(requestedLocale) ?? "en";
  const translatedForReader = sourceLocale.split("-")[0] !== readerLocale.split("-")[0];
  const translationNotice = resolve(
    "conversation.google_translated_from",
    "Google translated from {language}",
  ).text.replace("{language}", languageName(sourceLocale, readerLocale));
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div className="max-w-[82%]">
        {!mine ? (
          <p className="mb-1 px-1 text-xs text-muted-foreground">
            {message.senderRole === "SUPPORT"
              ? COMMUNICATION_BRAND.supportName
              : message.sender.name || resolve("conversation.member", "Member").text}
          </p>
        ) : null}
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap",
            mine
              ? "rounded-br-md bg-primary text-primary-foreground"
              : message.senderRole === "SUPPORT"
                ? "rounded-bl-md border border-primary/20 bg-primary/10"
                : "rounded-bl-md border bg-background",
            message.deliveryState === "failed" && "border-destructive"
          )}
        >
          <span data-user-generated-content translate="yes">{message.body}</span>
        </div>
        {translatedForReader ? (
          <p className="mt-1 px-1 text-[11px] text-muted-foreground">{translationNotice}</p>
        ) : null}
        <div
          className={cn(
            "mt-1 flex items-center gap-2 px-1",
            mine && "justify-end"
          )}
        >
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            {message.deliveryState === "sending" ? (
              <Clock3 className="h-3 w-3" />
            ) : null}
            {new Intl.DateTimeFormat(requestedLocale, {
              hour: "2-digit",
              minute: "2-digit",
            }).format(new Date(message.createdAt))}
          </span>
          {message.deliveryState === "failed" ? (
            <button
              type="button"
              className="flex items-center gap-1 text-[11px] text-destructive underline"
              onClick={() => onRetry(message)}
            >
              <RefreshCw className="h-3 w-3" />
              <Tx k="conversation.retry" source="Retry" />
            </button>
          ) : null}
          {!mine && message.senderRole !== "SUPPORT" ? (
            <Link
              className="text-[11px] text-muted-foreground underline hover:text-foreground"
              href={`/account/support/new?type=REPORT&targetType=MESSAGE&messageId=${message.id}`}
            >
              <Tx k="conversation.report" source="Report" />
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
