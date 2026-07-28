"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Headphones, Send } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { COMMUNICATION_BRAND } from "@/lib/communication-brand";

interface ThreadPayload {
  conversation: {
    id: string;
    kind: "INQUIRY" | "BOOKING";
    status: "OPEN" | "FROZEN" | "CLOSED";
    listing: { id: string; title: string };
    booking: { id: string; status: string } | null;
    participants: Array<{
      userId: string;
      role: "MEMBER" | "SUPPORT";
      user: { id: string; name: string | null };
    }>;
  };
  messages: Array<{
    id: string;
    body: string;
    senderId: string | null;
    senderRole: "MEMBER" | "SUPPORT";
    sender: { id: string; name: string | null };
    createdAt: string | Date;
    deletedAt: string | Date | null;
  }>;
}

export function ConversationThread({
  initial,
  currentUserId,
}: {
  initial: ThreadPayload;
  currentUserId: string;
}) {
  const [thread, setThread] = useState(initial);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    const response = await fetch(
      `/api/conversations/${thread.conversation.id}/messages`,
      { cache: "no-store" }
    );
    if (response.ok) setThread((await response.json()) as ThreadPayload);
  }, [thread.conversation.id]);

  useEffect(() => {
    const poller = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(poller);
  }, [refresh]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread.messages.length]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const response = await fetch(
        `/api/conversations/${thread.conversation.id}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        }
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Message could not be sent");
      setDraft("");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Message could not be sent");
    } finally {
      setSending(false);
    }
  }

  const other = thread.conversation.participants.find(
    (participant) =>
      participant.userId !== currentUserId && participant.role !== "SUPPORT"
  );
  const supportJoined = thread.conversation.participants.some(
    (participant) => participant.role === "SUPPORT"
  );
  const open = thread.conversation.status === "OPEN";

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-3xl flex-col overflow-hidden rounded-2xl border bg-background">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div className="min-w-0">
          <h1 className="truncate font-semibold">
            {other?.user.name || `${COMMUNICATION_BRAND.name} conversation`}
          </h1>
          <p className="truncate text-sm text-muted-foreground">
            {thread.conversation.listing.title}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            {thread.conversation.kind === "INQUIRY" ? "Pre-booking inquiry" : "Booking"}
          </Badge>
          {supportJoined ? (
            <Badge><Headphones className="mr-1 h-3 w-3" /> Support</Badge>
          ) : null}
        </div>
      </div>

      {thread.conversation.kind === "INQUIRY" ? (
        <div className="flex gap-2 border-b bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Keep payment and contact details inside {COMMUNICATION_BRAND.name} until the booking is confirmed.
        </div>
      ) : null}

      <div className="flex-1 space-y-4 overflow-y-auto bg-muted/20 p-4 sm:p-6">
        {!thread.messages.length ? (
          <div className="mx-auto max-w-md py-12 text-center text-sm text-muted-foreground">
            Start the conversation. Messages stay private between the guest, host, and
            {COMMUNICATION_BRAND.supportName} if support joins.
          </div>
        ) : null}
        {thread.messages.map((message) => {
          const mine = message.senderId === currentUserId;
          return (
            <div
              key={message.id}
              className={cn("flex", mine ? "justify-end" : "justify-start")}
            >
              <div className="max-w-[82%]">
                {!mine ? (
                  <p className="mb-1 px-1 text-xs text-muted-foreground">
                    {message.senderRole === "SUPPORT"
                      ? COMMUNICATION_BRAND.supportName
                      : message.sender.name || "Member"}
                  </p>
                ) : null}
                <div
                  className={cn(
                    "rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap",
                    mine
                      ? "rounded-br-md bg-primary text-primary-foreground"
                      : message.senderRole === "SUPPORT"
                        ? "rounded-bl-md border border-primary/20 bg-primary/10"
                        : "rounded-bl-md border bg-background"
                  )}
                >
                  {message.body}
                </div>
                <div className={cn("mt-1 flex items-center gap-2 px-1", mine && "justify-end")}>
                  <span className="text-[11px] text-muted-foreground">
                    {new Intl.DateTimeFormat("en", {
                      hour: "2-digit",
                      minute: "2-digit",
                      month: "short",
                      day: "numeric",
                    }).format(new Date(message.createdAt))}
                  </span>
                  {!mine && message.senderRole !== "SUPPORT" ? (
                    <Link
                      className="text-[11px] text-muted-foreground underline hover:text-foreground"
                      href={`/account/support/new?type=REPORT&targetType=MESSAGE&messageId=${message.id}`}
                    >
                      Report
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="border-t bg-background p-3 sm:p-4">
        {open ? (
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
              placeholder="Write a message..."
              aria-label="Write a message"
            />
            <Button
              size="icon"
              className="h-10 w-10 shrink-0 rounded-full"
              disabled={sending || !draft.trim()}
              onClick={() => void send()}
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            This conversation is {thread.conversation.status.toLowerCase()}.
          </p>
        )}
      </div>
    </div>
  );
}
