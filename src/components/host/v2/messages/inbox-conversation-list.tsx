"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Search, Settings2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tx, interpolate, useI18n } from "@/lib/i18n/client";
import { resolveBookingStatus } from "@/lib/i18n/status-labels";
import type { HostInboxConversation } from "@/lib/services/host-inbox.service";
import { Avatar, FIELD, FOCUS_RING } from "./inbox-surface";

/**
 * The left column: every conversation on this host's listings, newest first.
 *
 * A row answers three questions in three lines — who, what did they last say, and which
 * stay is this about — because that is the order a host reads them in. The filter is two
 * pills rather than a select: there are exactly two states worth having, and a pill
 * shows which one is active without being opened.
 */

function formatStamp(value: string, locale: string) {
  const date = new Date(value);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }
  // Inside the last week a weekday reads faster than a date — "Wednesday" places a
  // message in the host's own memory of the week in a way "13 Aug" does not.
  const days = (now.getTime() - date.getTime()) / 86_400_000;
  if (days < 7) {
    return new Intl.DateTimeFormat(locale, { weekday: "long" }).format(date);
  }
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
  }).format(date);
}

function formatStayRange(checkIn: string, checkOut: string, locale: string) {
  const from = new Date(checkIn);
  const to = new Date(checkOut);
  const day = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    // Booking check-in/out values are calendar dates serialized at UTC midnight.
    timeZone: "UTC",
  });
  return `${day.format(from)} – ${day.format(to)}`;
}

export function InboxConversationList({
  conversations,
  activeId,
}: {
  conversations: HostInboxConversation[];
  activeId: string | null;
}) {
  const { locale, resolve } = useI18n();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return conversations.filter((conversation) => {
      if (unreadOnly && conversation.unreadCount === 0) return false;
      if (!needle) return true;
      return [
        conversation.guest.name,
        conversation.listing.title,
        conversation.lastMessagePreview,
      ]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(needle));
    });
  }, [conversations, query, unreadOnly]);

  const unreadTotal = conversations.reduce(
    (total, conversation) => total + (conversation.unreadCount > 0 ? 1 : 0),
    0
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 px-5 pt-5">
        <h1 className="font-[family-name:var(--font-manrope)] text-2xl font-semibold tracking-tight">
          <Tx k="host.v2.messages.title" source="Messages" />
        </h1>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setSearching((open) => !open);
              if (searching) setQuery("");
            }}
            aria-expanded={searching}
            aria-label={resolve("host.v2.messages.search", "Search messages").text}
            className={cn(
              "grid size-9 place-items-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950",
              searching && "bg-slate-100 text-slate-950",
              FOCUS_RING
            )}
          >
            {searching ? (
              <X className="size-[18px]" aria-hidden />
            ) : (
              <Search className="size-[18px]" aria-hidden />
            )}
          </button>
          <Link
            href="/host/reservations"
            aria-label={
              resolve("host.v2.messages.all_reservations", "All reservations").text
            }
            className={cn(
              "grid size-9 place-items-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950",
              FOCUS_RING
            )}
          >
            <Settings2 className="size-[18px]" aria-hidden />
          </Link>
        </div>
      </div>

      {searching ? (
        <div className="px-5 pt-3">
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              resolve(
                "host.v2.messages.search_placeholder",
                "Search by guest, listing or message"
              ).text
            }
            aria-label={resolve("host.v2.messages.search", "Search messages").text}
            className={cn(
              "h-11 w-full px-4 text-sm text-slate-900 outline-none placeholder:text-slate-400",
              FIELD,
              FOCUS_RING
            )}
          />
        </div>
      ) : null}

      <div className="flex gap-2 px-5 pb-3 pt-3">
        <FilterPill active={!unreadOnly} onClick={() => setUnreadOnly(false)}>
          <Tx k="host.v2.messages.filter.all" source="All" />
        </FilterPill>
        <FilterPill active={unreadOnly} onClick={() => setUnreadOnly(true)}>
          <Tx k="host.v2.messages.filter.unread" source="Unread" />
          {unreadTotal > 0 ? (
            <span className="ml-1.5 tabular-nums">{unreadTotal}</span>
          ) : null}
        </FilterPill>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-4">
        {visible.length === 0 ? (
          <p className="px-3 py-10 text-center text-sm text-slate-500">
            {conversations.length === 0 ? (
              <Tx
                k="host.v2.messages.empty"
                source="No conversations yet. Guest enquiries and booking messages will appear here."
              />
            ) : (
              <Tx
                k="host.v2.messages.no_matches"
                source="No conversations match this filter."
              />
            )}
          </p>
        ) : null}

        <ul className="space-y-0.5">
          {visible.map((conversation) => {
            const active = conversation.id === activeId;
            const unread = conversation.unreadCount > 0;
            const stay = conversation.booking
              ? formatStayRange(
                  conversation.booking.checkIn,
                  conversation.booking.checkOut,
                  locale
                )
              : resolve("host.v2.messages.enquiry", "Enquiry").text;
            return (
              <li key={conversation.id}>
                <Link
                  href={`/host/messages/${conversation.id}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex gap-3 rounded-2xl px-3 py-3 transition-colors",
                    active ? "bg-slate-100" : "hover:bg-slate-50",
                    FOCUS_RING
                  )}
                >
                  <span className="relative size-11 shrink-0">
                    <Avatar
                      name={conversation.guest.name}
                      image={conversation.guest.image}
                      className="size-11 text-sm"
                    />
                    {conversation.listing.imageUrl ? (
                      // The stay the thread is about, tucked under the guest's picture:
                      // a host with several homes recognises the photo before the title.
                      <span className="absolute -bottom-0.5 -right-0.5 size-6 overflow-hidden rounded-full ring-2 ring-white">
                        <Image
                          src={conversation.listing.imageUrl}
                          alt=""
                          width={24}
                          height={24}
                          className="size-full object-cover"
                        />
                      </span>
                    ) : null}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-[0.9375rem]",
                          unread ? "font-semibold text-slate-950" : "font-medium text-slate-900"
                        )}
                      >
                        {conversation.guest.name ||
                          resolve("conversation.deleted_user", "Deleted user").text}
                      </span>
                      {conversation.lastMessageAt ? (
                        <span className="shrink-0 text-xs text-slate-500">
                          {formatStamp(conversation.lastMessageAt, locale)}
                        </span>
                      ) : null}
                    </span>

                    <span
                      className={cn(
                        "mt-0.5 block truncate text-sm",
                        unread ? "font-medium text-slate-900" : "text-slate-500"
                      )}
                    >
                      {conversation.lastMessagePreview ? (
                        <span data-user-generated-content translate="yes">
                          {conversation.lastMessagePreview}
                        </span>
                      ) : (
                        <Tx k="conversation.start" source="Start the conversation" />
                      )}
                    </span>

                    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                      <span className="truncate">{stay}</span>
                      <span aria-hidden>·</span>
                      <span
                        className="truncate"
                        data-user-generated-content
                        translate="yes"
                      >
                        {conversation.listing.title}
                      </span>
                    </span>

                    {conversation.booking &&
                    conversation.booking.status !== "CONFIRMED" ? (
                      <span className="mt-1.5 inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                        {resolveBookingStatus({ resolve }, conversation.booking.status).text}
                      </span>
                    ) : null}
                    {conversation.hasSupport ? (
                      <span className="ml-1.5 mt-1.5 inline-flex rounded-full bg-[#f1f5f9] px-2.5 py-0.5 text-xs font-medium text-[#0f172a]">
                        <Tx k="conversation.support_joined" source="Support joined" />
                      </span>
                    ) : null}
                  </span>

                  {unread ? (
                    <span
                      role="img"
                      className="mt-2 size-2.5 shrink-0 rounded-full bg-[#0f172a]"
                      aria-label={
                        interpolate(
                          resolve(
                            "host.v2.messages.unread_count",
                            "{count} unread messages"
                          ),
                          { count: conversation.unreadCount }
                        ).text
                      }
                    />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 items-center rounded-full px-4 text-sm font-medium transition-colors",
        active
          ? "bg-slate-900 text-white"
          : "bg-white text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_6px_16px_-10px_rgba(15,23,42,0.24)] hover:bg-slate-50",
        FOCUS_RING
      )}
    >
      {children}
    </button>
  );
}
