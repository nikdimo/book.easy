"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Headphones,
  RefreshCw,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Tx, interpolate, useI18n } from "@/lib/i18n/client";
import { normalizeLocaleCode } from "@/lib/i18n/locale-preference";
import { COMMUNICATION_BRAND } from "@/lib/communication-brand";
import type { HostInboxReservation } from "@/lib/services/host-inbox.service";
import { Avatar, FIELD, FOCUS_RING, PANE } from "./inbox-surface";
import { ReservationRail } from "./reservation-rail";

/**
 * One conversation, and the stay it is about.
 *
 * The transport is the same as the guest-side thread: a five-second poll plus a
 * server-sent `refresh` event, an optimistic bubble that carries its own delivery state,
 * and a read receipt posted for whatever message is last on screen. What differs is the
 * shape — a host reading a thread is usually deciding something about a reservation, so
 * the reservation is a column beside the words rather than a card the messages push off
 * the top of the screen.
 */

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

export interface InboxThreadPayload {
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

const MESSAGE_MAX_LENGTH = 2000;

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

function conversationStatusCopy(
  resolve: ReturnType<typeof useI18n>["resolve"],
  status: string
) {
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
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

function dayKey(value: string | Date) {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/**
 * Whether there is room for a third column. The reservation rail is a column at `xl` and
 * an overlay below it, and the toggle has to know which one it is about to open — a
 * media query is the only honest source for that, so it is read as an external store
 * rather than guessed during render and corrected in an effect.
 */
const XL_QUERY = "(min-width: 1280px)";

function subscribeToXl(onChange: () => void) {
  const media = window.matchMedia(XL_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function useIsWide() {
  return useSyncExternalStore(
    subscribeToXl,
    () => window.matchMedia(XL_QUERY).matches,
    // The server cannot know the viewport. It renders the narrow layout, and the rail
    // appears on the first client render — never the other way round, so a phone is
    // never briefly covered by a panel it did not ask for.
    () => false
  );
}

export function InboxThread({
  initial,
  reservation,
  currentUserId,
}: {
  initial: InboxThreadPayload;
  reservation: HostInboxReservation;
  currentUserId: string;
}) {
  const { requestedLocale, locale, resolve } = useI18n();
  const [thread, setThread] = useState(initial);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [railOverride, setRailOverride] = useState<boolean | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const wide = useIsWide();
  const railOpen = railOverride ?? wide;
  const router = useRouter();
  const loadedConversation = useRef(initial.conversation.id);
  const readRefreshedFor = useRef<string | null>(null);

  // A different conversation is a different thread, so its payload replaces this one
  // outright. The guard is on the id rather than on the prop's identity: a
  // `router.refresh()` hands down a new object for the *same* conversation, and
  // resetting on that would throw away a half-typed reply or an unsent bubble.
  useEffect(() => {
    if (loadedConversation.current === initial.conversation.id) return;
    loadedConversation.current = initial.conversation.id;
    setThread(initial);
    setDraft("");
    stickToBottom.current = true;
  }, [initial]);

  const markRead = useCallback(async (payload: InboxThreadPayload) => {
    const lastMessage = payload.messages.at(-1);
    if (!lastMessage || lastMessage.id.startsWith("temp-")) return;
    await fetch(`/api/conversations/${payload.conversation.id}/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lastMessageId: lastMessage.id }),
    });
  }, []);

  const conversationId = thread.conversation.id;

  const refresh = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    const response = await fetch(`/api/conversations/${conversationId}/messages`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    const next = (await response.json()) as InboxThreadPayload;
    setThread((current) => ({
      ...next,
      messages: mergeMessages(current.messages, next.messages),
    }));
    void markRead(next);
  }, [conversationId, markRead]);

  // Opening a thread is what clears its unread badge, and that badge is rendered by the
  // layout beside this pane. One `router.refresh()` per conversation re-reads the list
  // on the server so the dot disappears where the host is looking, instead of surviving
  // until the next full page load. The ref keeps it to one: the refresh itself hands
  // down a new payload, which would otherwise run this effect again forever.
  useEffect(() => {
    void (async () => {
      await markRead(initial);
      if (readRefreshedFor.current === initial.conversation.id) return;
      readRefreshedFor.current = initial.conversation.id;
      router.refresh();
    })();
  }, [initial, markRead, router]);

  useEffect(() => {
    const poller = window.setInterval(() => void refresh(), 5000);
    const events = new EventSource(`/api/conversations/${conversationId}/events`);
    events.addEventListener("refresh", () => {
      void refresh();
      // Something actually changed, so the conversation column's preview, ordering and
      // unread counts are now stale too. This fires on real events only — the 5s poll
      // deliberately does not, or the list would re-query the database twelve times a
      // minute for nothing.
      router.refresh();
    });
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
  }, [conversationId, refresh, router]);

  useEffect(() => {
    if (stickToBottom.current) {
      endRef.current?.scrollIntoView({ block: "end" });
    }
  }, [thread.messages.length, thread.damageReports.length]);

  async function loadOlder() {
    if (!thread.nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    const previousHeight = scrollRef.current?.scrollHeight ?? 0;
    try {
      const response = await fetch(
        `/api/conversations/${conversationId}/messages?cursor=${encodeURIComponent(thread.nextCursor)}`,
        { cache: "no-store" }
      );
      if (!response.ok) throw new Error("Could not load earlier messages");
      const older = (await response.json()) as InboxThreadPayload;
      setThread((current) => ({
        ...current,
        nextCursor: older.nextCursor,
        messages: mergeMessages(older.messages, current.messages),
      }));
      // Restoring by height difference keeps the message the host was reading under
      // their eyes instead of jumping them to the top of the new page.
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
      const existing = current.messages.find((message) => message.id === temporaryId);
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
      const response = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, clientId }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Message could not be sent");
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
      `/api/conversations/${conversationId}/damage-reports`,
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
  const guestName =
    other?.user.name || resolve("conversation.deleted_user", "Deleted user").text;

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
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [thread.bookingEvents, thread.damageReports, thread.messages]);

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 gap-3 xl:gap-4">
      <section className={cn("flex min-h-0 min-w-0 flex-1 flex-col", PANE)}>
        <header className="flex shrink-0 items-center gap-2 px-4 py-3.5 md:px-5">
          {/* The way back on a phone, where the list is not on screen. */}
          <Link
            href="/host/v2/messages"
            aria-label={resolve("host.v2.messages.back", "Back to messages").text}
            className={cn(
              "-ml-1 grid size-9 shrink-0 place-items-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 lg:hidden",
              FOCUS_RING
            )}
          >
            <ChevronLeft className="size-5" aria-hidden />
          </Link>

          <Avatar
            name={other?.user.name}
            image={other?.user.image}
            className="size-10"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold tracking-tight text-slate-950">
              {guestName}
            </p>
            <p className="truncate text-xs text-slate-500">
              <span data-user-generated-content translate="yes">
                {thread.conversation.listing.title}
              </span>
            </p>
          </div>

          {supportJoined ? (
            <span className="hidden items-center gap-1 rounded-full bg-[#fde7dc] px-2.5 py-1 text-xs font-medium text-[#8f3d21] sm:inline-flex">
              <Headphones className="size-3.5" aria-hidden />
              <Tx k="conversation.support" source="Support" />
            </span>
          ) : null}

          <button
            type="button"
            onClick={() => setRailOverride(!railOpen)}
            aria-expanded={railOpen}
            aria-label={
              resolve("host.v2.messages.reservation_details", "Reservation details").text
            }
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950",
              FOCUS_RING
            )}
          >
            <ChevronRight
              className={cn(
                "size-5 transition-transform",
                railOpen && "xl:rotate-180"
              )}
              aria-hidden
            />
          </button>
        </header>

        <div
          ref={scrollRef}
          onScroll={(event) => {
            const element = event.currentTarget;
            stickToBottom.current =
              element.scrollHeight - element.scrollTop - element.clientHeight < 120;
          }}
          className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-2 md:px-6"
        >
          {thread.nextCursor ? (
            <div className="text-center">
              <button
                type="button"
                disabled={loadingOlder}
                onClick={() => void loadOlder()}
                className={cn(
                  "rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200 disabled:opacity-60",
                  FOCUS_RING
                )}
              >
                {loadingOlder ? (
                  <Tx k="common.loading" source="Loading..." />
                ) : (
                  <Tx
                    k="conversation.load_earlier"
                    source="Load earlier messages"
                  />
                )}
              </button>
            </div>
          ) : null}

          {timeline.length === 0 ? (
            <p className="mx-auto max-w-sm py-16 text-center text-sm text-slate-500">
              <Tx
                k="conversation.empty_timeline"
                source="Start the conversation. Messages and booking activity will appear here."
              />
            </p>
          ) : null}

          {timeline.map((item, index) => {
            const showDay =
              index === 0 ||
              dayKey(timeline[index - 1].createdAt) !== dayKey(item.createdAt);
            return (
              <div key={`${item.kind}-${item.id}`}>
                {showDay ? (
                  <p className="py-2 text-center text-xs font-medium text-slate-500">
                    {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
                      new Date(item.createdAt)
                    )}
                  </p>
                ) : null}

                {item.kind === "booking" ? (
                  // Booking activity is not something anyone said, so it is not a
                  // bubble — one quiet centred line, the way the platform's own
                  // notices read in a chat.
                  <p className="py-1 text-center text-xs text-slate-500">
                    {bookingEventCopy(resolve, item.value.type).text}
                  </p>
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
                    <div className="max-w-[85%] overflow-hidden rounded-3xl bg-slate-50 sm:max-w-md">
                      <div className="flex items-center justify-between gap-3 px-4 pt-3">
                        <p className="text-sm font-semibold text-slate-900">
                          <Tx
                            k="conversation.damage.reported"
                            source="Damage reported"
                          />
                        </p>
                        <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-slate-700">
                          {damageStatusCopy(resolve, item.value.status).text}
                        </span>
                      </div>
                      {item.value.evidence.length ? (
                        <div className="mt-3 grid grid-cols-2 gap-1 px-3">
                          {item.value.evidence.map((photo) => (
                            // Evidence uploads are served from the app's own media
                            // route; the optimizer adds nothing at thumbnail size.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={photo.id}
                              src={photo.url}
                              alt={photo.fileName}
                              className="aspect-[4/3] w-full rounded-xl object-cover"
                            />
                          ))}
                        </div>
                      ) : null}
                      <p className="whitespace-pre-wrap px-4 py-3 text-sm text-slate-800">
                        {item.value.description}
                      </p>
                      {item.value.status !== "RESOLVED" ? (
                        <div className="flex flex-wrap gap-2 px-4 pb-3">
                          {item.value.status === "REPORTED" &&
                          item.value.reporterId !== currentUserId ? (
                            <DamageAction
                              onClick={() =>
                                void updateDamageReport(item.value.id, "ACKNOWLEDGE")
                              }
                            >
                              <Tx
                                k="conversation.damage.acknowledge"
                                source="Acknowledge"
                              />
                            </DamageAction>
                          ) : null}
                          {item.value.status !== "ESCALATED" ? (
                            <DamageAction
                              onClick={() =>
                                void updateDamageReport(item.value.id, "ESCALATE")
                              }
                            >
                              <Tx
                                k="conversation.damage.ask_support"
                                source="Ask support"
                              />
                            </DamageAction>
                          ) : null}
                          <DamageAction
                            primary
                            onClick={() =>
                              void updateDamageReport(item.value.id, "RESOLVE")
                            }
                          >
                            <Tx
                              k="conversation.damage.mark_resolved"
                              source="Mark resolved"
                            />
                          </DamageAction>
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
                      void sendMessage(message.body, message.clientId!, message.id)
                    }
                  />
                ) : null}
              </div>
            );
          })}
          <div ref={endRef} />
        </div>

        <div className="shrink-0 px-4 pb-4 pt-2 md:px-6">
          {open ? (
            <div
              className={cn(
                "flex items-end gap-2 py-2 pl-4 pr-2 transition-shadow focus-within:shadow-[0_2px_4px_rgba(15,23,42,0.08),0_12px_28px_-14px_rgba(15,23,42,0.32)]",
                FIELD
              )}
            >
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                maxLength={MESSAGE_MAX_LENGTH}
                rows={1}
                placeholder={
                  resolve("conversation.write_placeholder", "Write a message...").text
                }
                aria-label={
                  resolve("conversation.write_label", "Write a message").text
                }
                // The field grows with the draft up to a point and then scrolls, so a
                // long message never eats the conversation above it.
                className="max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />
              <button
                type="button"
                disabled={sending || !draft.trim()}
                onClick={() => void send()}
                aria-label={resolve("conversation.send", "Send message").text}
                className={cn(
                  "mb-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-slate-900 text-white transition-opacity hover:bg-slate-800 disabled:opacity-30",
                  FOCUS_RING
                )}
              >
                <ArrowUp className="size-4" aria-hidden />
              </button>
            </div>
          ) : (
            <p className="py-3 text-center text-sm text-slate-500">
              {
                interpolate(
                  resolve(
                    "conversation.closed_state",
                    "This conversation is {status}."
                  ),
                  {
                    status: conversationStatusCopy(
                      resolve,
                      thread.conversation.status
                    ).text,
                  }
                ).text
              }
            </p>
          )}
        </div>
      </section>

      {railOpen ? (
        /*
         * At `xl` this is the third column. Below it there is no room for a third
         * column, so the same panel covers the thread instead — the host asked to see
         * the reservation, and on a narrow screen seeing it means seeing only it.
         */
        <aside
          className={cn(
            "absolute inset-0 z-20 flex min-h-0 flex-col xl:static xl:inset-auto xl:z-auto xl:w-[21rem] xl:shrink-0 2xl:w-[23rem]",
            PANE
          )}
        >
          <div className="flex shrink-0 items-center justify-between gap-2 px-5 pt-5">
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">
              {reservation.booking ? (
                <Tx k="host.v2.messages.reservation" source="Reservation" />
              ) : (
                <Tx k="host.v2.messages.details" source="Details" />
              )}
            </h2>
            <button
              type="button"
              onClick={() => setRailOverride(false)}
              aria-label={resolve("common.close", "Close").text}
              className={cn(
                "-mr-1 grid size-9 place-items-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950",
                FOCUS_RING
              )}
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-4">
            <ReservationRail reservation={reservation} onChanged={refresh} />
          </div>
        </aside>
      ) : null}
    </div>
  );
}

function DamageAction({
  children,
  onClick,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
        primary
          ? "bg-slate-900 text-white hover:bg-slate-800"
          : "bg-white text-slate-800 hover:bg-slate-100",
        FOCUS_RING
      )}
    >
      {children}
    </button>
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
  const translatedForReader =
    sourceLocale.split("-")[0] !== readerLocale.split("-")[0];
  const support = message.senderRole === "SUPPORT";

  return (
    <div className={cn("flex items-end gap-2", mine ? "justify-end" : "justify-start")}>
      {!mine ? (
        <Avatar
          name={support ? COMMUNICATION_BRAND.supportName : message.sender.name}
          image={support ? null : message.sender.image}
          className="mb-5 size-7 text-xs"
        />
      ) : null}
      <div className={cn("max-w-[78%]", mine && "flex flex-col items-end")}>
        {!mine ? (
          <p className="mb-1 px-1 text-xs text-slate-500">
            {support
              ? COMMUNICATION_BRAND.supportName
              : message.sender.name ||
                resolve("conversation.member", "Member").text}
          </p>
        ) : null}
        <div
          className={cn(
            "whitespace-pre-wrap rounded-3xl px-4 py-2.5 text-sm leading-6",
            mine
              ? "bg-slate-900 text-white"
              : support
                ? "bg-[#fde7dc] text-[#5c2812]"
                : "bg-slate-100 text-slate-900",
            message.deliveryState === "failed" && "opacity-70 ring-1 ring-red-400"
          )}
        >
          <span data-user-generated-content translate="yes">
            {message.body}
          </span>
        </div>
        {translatedForReader ? (
          <p className="mt-1 px-1 text-[11px] text-slate-400">
            {
              interpolate(
                resolve(
                  "conversation.google_translated_from",
                  "Google translated from {language}"
                ),
                { language: languageName(sourceLocale, readerLocale) }
              ).text
            }
          </p>
        ) : null}
        <div className="mt-1 flex items-center gap-2 px-1">
          <span className="flex items-center gap-1 text-[11px] text-slate-400">
            {message.deliveryState === "sending" ? (
              <Clock3 className="size-3" aria-hidden />
            ) : null}
            {new Intl.DateTimeFormat(requestedLocale, {
              hour: "2-digit",
              minute: "2-digit",
            }).format(new Date(message.createdAt))}
          </span>
          {message.deliveryState === "failed" ? (
            <button
              type="button"
              className="flex items-center gap-1 text-[11px] font-medium text-red-600 underline"
              onClick={() => onRetry(message)}
            >
              <RefreshCw className="size-3" aria-hidden />
              <Tx k="conversation.retry" source="Retry" />
            </button>
          ) : null}
          {!mine && !support ? (
            <Link
              className="text-[11px] text-slate-400 underline hover:text-slate-700"
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
