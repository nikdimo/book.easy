"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  DoorOpen,
  MessageCircle,
  Send,
  MoreHorizontal,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HostBookingActions } from "@/components/host/host-booking-actions";
import { StartConversationButton } from "@/components/communication/start-conversation-button";
import {
  formatCountdown,
  type HostActionKind,
  type HostActionUrgency,
} from "@/lib/host/booking-action-queue";
import { Tx, useI18n } from "@/lib/i18n/client";

export type HostActionCard = {
  bookingId: string;
  kind: HostActionKind;
  urgency: HostActionUrgency;
  /** ISO string; null for kinds without a deadline. Drives the live countdown. */
  dueAt: string | null;
  /** Rendered on the server so the first client paint matches the SSR markup. */
  initialCountdown: string | null;
  conversationId: string | null;
  reference: string;
  listingTitle: string;
  city: string;
  imageUrl: string | null;
  imageAlt: string;
  guestName: string;
  guestLine: string;
  guestNote: string | null;
  unreadCount: number;
  alsoNeeds: HostActionKind[];
};

/** Red / amber / blue. The accent is the only colour signal a scanning host needs, so
 *  it is repeated on the top edge and the countdown pill rather than split across
 *  competing badges. */
const URGENCY_STYLES: Record<
  HostActionUrgency,
  { bar: string; pill: string; dot: string }
> = {
  critical: {
    bar: "bg-destructive",
    pill: "bg-destructive/10 text-destructive",
    dot: "bg-destructive",
  },
  soon: {
    bar: "bg-amber-500",
    pill: "bg-amber-500/15 text-amber-900 dark:text-amber-200",
    dot: "bg-amber-500",
  },
  planned: {
    bar: "bg-secondary",
    pill: "bg-secondary/15 text-secondary dark:text-sky-200",
    dot: "bg-secondary",
  },
};

const KIND_ICONS: Record<HostActionKind, typeof Clock> = {
  RESPOND_TO_REQUEST: Clock,
  REPLY_TO_GUEST: MessageCircle,
  SEND_PAYMENT_INSTRUCTIONS: Send,
  PREPARE_CHECK_IN: DoorOpen,
  RATE_GUEST: Star,
};

/** Ticks the countdown so a deadline visibly shrinks while the host reads the card.
 *  Starts from the server-rendered string, so there is no hydration mismatch and no
 *  flash of a placeholder. */
function Countdown({ dueAt, initial }: { dueAt: string; initial: string }) {
  const [label, setLabel] = useState(initial);

  useEffect(() => {
    const due = new Date(dueAt).getTime();
    const tick = () => setLabel(formatCountdown(due - Date.now()));
    tick();
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, [dueAt]);

  return (
    <span translate="no" className="tabular-nums">
      {label}
    </span>
  );
}

function KindChip({ kind }: { kind: HostActionKind }) {
  const Icon = KIND_ICONS[kind];
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      <Icon className="h-3 w-3" aria-hidden="true" />
      {kind === "RESPOND_TO_REQUEST" ? (
        <Tx k="host.action.chip.respond" source="Awaiting your reply" />
      ) : kind === "REPLY_TO_GUEST" ? (
        <Tx k="host.action.chip.message" source="Unread message" />
      ) : kind === "PREPARE_CHECK_IN" ? (
        <Tx k="host.action.chip.check_in" source="Arriving soon" />
      ) : kind === "SEND_PAYMENT_INSTRUCTIONS" ? (
        <Tx k="host.action.chip.payment" source="Payment instructions missing" />
      ) : (
        <Tx k="host.action.chip.rate" source="Rating open" />
      )}
    </span>
  );
}

function ActionCard({ card }: { card: HostActionCard }) {
  const { resolve } = useI18n();
  const tone = URGENCY_STYLES[card.urgency];
  const Icon = KIND_ICONS[card.kind];

  return (
    <article className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className={`h-[3px] ${tone.bar}`} aria-hidden="true" />
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${tone.pill}`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {card.kind === "RESPOND_TO_REQUEST" && card.dueAt ? (
              <>
                <Tx k="host.action.expires_in" source="Request expires in" />{" "}
                <Countdown dueAt={card.dueAt} initial={card.initialCountdown ?? ""} />
              </>
            ) : card.kind === "REPLY_TO_GUEST" ? (
              <Tx k="host.action.unread" source="Guest is waiting for a reply" />
            ) : card.kind === "PREPARE_CHECK_IN" ? (
              <Tx k="host.action.checking_in" source="Checking in soon" />
            ) : card.kind === "SEND_PAYMENT_INSTRUCTIONS" ? (
              <Tx k="host.action.payment_missing" source="Send payment instructions" />
            ) : (
              <Tx k="host.action.rate_open" source="Rate your guest" />
            )}
          </span>
          <span className="text-xs text-muted-foreground" translate="no">
            {card.reference}
          </span>
          {card.alsoNeeds.map((kind) => (
            <KindChip key={kind} kind={kind} />
          ))}
        </div>

        <div className="flex gap-3">
          {card.imageUrl ? (
            <span className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg">
              <Image
                src={card.imageUrl}
                alt={card.imageAlt}
                fill
                sizes="80px"
                className="object-cover"
              />
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <h3 className="break-words font-semibold leading-tight">
              {card.listingTitle}
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">{card.guestLine}</p>
            {card.guestNote ? (
              <p className="mt-2 border-l-2 border-border pl-2.5 text-sm text-muted-foreground">
                {card.guestNote}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {card.kind === "RESPOND_TO_REQUEST" ? (
            <>
              <HostBookingActions bookingId={card.bookingId} />
              <StartConversationButton
                bookingId={card.bookingId}
                variant="outline"
                label={resolve("host.bookings.message_guest", "Message guest").text}
              />
            </>
          ) : card.kind === "REPLY_TO_GUEST" && card.conversationId ? (
            <Button asChild>
              <Link href={`/messages/${card.conversationId}`}>
                <MessageCircle className="mr-1 h-4 w-4" />
                <Tx k="host.action.open_conversation" source="Open conversation" />
                {card.unreadCount > 1 ? (
                  <span className="ml-1.5 rounded-full bg-primary-foreground/20 px-1.5 text-xs">
                    {card.unreadCount}
                  </span>
                ) : null}
              </Link>
            </Button>
          ) : card.kind === "SEND_PAYMENT_INSTRUCTIONS" ? (
            <Button asChild>
              <Link href={`/host/bookings/${card.bookingId}`}>
                <Send className="mr-1 h-4 w-4" />
                <Tx k="host.action.send_payment" source="Send payment request" />
              </Link>
            </Button>
          ) : card.kind === "RATE_GUEST" ? (
            <Button asChild>
              <Link href={`/account/bookings/${card.bookingId}/after-stay`}>
                <Star className="mr-1 h-4 w-4" />
                <Tx k="host.action.leave_rating" source="Leave rating" />
              </Link>
            </Button>
          ) : (
            <>
              <Button asChild>
                <Link href={`/host/bookings/${card.bookingId}`}>
                  <CheckCircle2 className="mr-1 h-4 w-4" />
                  <Tx k="host.action.review_arrival" source="Review arrival" />
                </Link>
              </Button>
              <StartConversationButton
                bookingId={card.bookingId}
                variant="outline"
                label={resolve("host.bookings.message_guest", "Message guest").text}
              />
            </>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto"
                aria-label={resolve("host.action.more", "More options").text}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/host/bookings/${card.bookingId}`}>
                  <Tx k="host.bookings.view_details" source="View details" />
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  href={`/account/support/new?type=CLAIM&targetType=BOOKING&bookingId=${card.bookingId}`}
                >
                  <Tx k="host.bookings.report_problem" source="Report a problem" />
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </article>
  );
}

/**
 * The action queue, pinned above the searchable list. It deliberately ignores the
 * list's search, filter and sort controls: this section answers "what do I have to do
 * right now", and a filter that could hide an expiring request would defeat it.
 */
export function HostBookingActionRail({ cards }: { cards: HostActionCard[] }) {
  if (cards.length === 0) {
    return (
      <div className="mb-6 flex items-center gap-2.5 rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
        <Tx
          k="host.action.all_caught_up"
          source="You're all caught up — nothing needs your attention right now."
        />
      </div>
    );
  }

  const worst = cards[0].urgency;

  return (
    <section className="mb-8" aria-labelledby="host-action-heading">
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <span
          className={`h-1.5 w-1.5 rounded-full ${URGENCY_STYLES[worst].dot}`}
          aria-hidden="true"
        />
        <h2 id="host-action-heading" className="text-sm font-medium">
          <Tx k="host.action.heading" source="Needs your action" />
        </h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">
          {cards.length}
        </span>
        <span className="text-xs text-muted-foreground">
          <Tx k="host.action.sorted_by" source="sorted by deadline" />
        </span>
      </div>
      <div className="space-y-2">
        {cards.map((card) => (
          <ActionCard key={card.bookingId} card={card} />
        ))}
      </div>
    </section>
  );
}
