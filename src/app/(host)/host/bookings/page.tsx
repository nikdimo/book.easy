import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getHostBookings, type HostBooking } from "@/lib/services/listing.service";
import { EmptyState } from "@/components/shared/empty-state";
import {
  HostBookingActionRail,
  type HostActionCard,
} from "@/components/host/host-booking-action-rail";
import { formatDate, formatPrice } from "@/lib/utils/format";
import { getDisplayCurrency } from "@/lib/currency/server";
import { getExchangeRates } from "@/lib/currency/rates";
import { summarizeUpcomingTotal } from "@/lib/host/upcoming-booking-total";
import { BOOKING_STATUSES } from "@/lib/constants";
import Link from "next/link";
import Image from "next/image";
import { ChevronRight } from "lucide-react";
import { getT, T } from "@/lib/i18n/t";
import { ListControls } from "@/components/shared/list-controls";
import {
  buildHostActionQueue,
  daysUntil,
  formatCountdown,
} from "@/lib/host/booking-action-queue";
import { resolveBookingStatus } from "@/lib/i18n/status-labels";

export const metadata = { title: "Bookings" };

/** Live bookings get a colour; everything terminal is grey and the row is dimmed, so
 *  history recedes instead of competing with work. */
const STATUS_DOTS: Record<string, string> = {
  PENDING: "bg-amber-500",
  CONFIRMED: "bg-emerald-500",
  COMPLETED: "bg-secondary",
};

const TERMINAL_STATUSES = new Set([
  "REJECTED",
  "EXPIRED",
  "CANCELLED_BY_GUEST",
  "CANCELLED_BY_HOST",
  "CANCELLED_BY_ADMIN",
]);

/** Unread messages for the host in this booking's conversation. */
function unreadFor(booking: HostBooking): number {
  return booking.conversation?.participants[0]?.unreadCount ?? 0;
}

/** An invitation to rate the guest counts as outstanding only while no HOST_TO_GUEST
 *  review has been submitted for the booking yet. */
function ratingDueAtFor(booking: HostBooking): Date | null {
  if (booking.reviews.length > 0) return null;
  return booking.reviewInvitations[0]?.deadline ?? null;
}

/**
 * Sort key for the default "Upcoming first" ordering.
 *
 * A plain ascending check-in date would open the page on the oldest booking in the
 * account. What a host actually wants is the next arrival, then the one after, and
 * only then the recent past working backwards — so past stays are pushed beyond every
 * future one and ordered by how recently they ended.
 */
function upcomingFirstKey(checkIn: Date, now: Date): number {
  const days = daysUntil(checkIn, now);
  return days >= 0 ? days : 1_000_000 - days;
}

export default async function HostBookingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const bookings = await getHostBookings(session.user.id);
  const t = await getT();
  const now = new Date();

  if (bookings.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">
          <T t={t} k="host.bookings.heading" source="Bookings" />
        </h1>
        <EmptyState
          title={t.resolve("host.bookings.empty_title", "No bookings yet").text}
          description={
            t.resolve(
              "host.bookings.empty_description",
              "Bookings will appear here when guests request to stay at your listings.",
            ).text
          }
        />
      </div>
    );
  }

  const byId = new Map(bookings.map((booking) => [booking.id, booking]));
  const queue = buildHostActionQueue(
    bookings.map((booking) => ({
      id: booking.id,
      status: booking.status,
      checkIn: booking.checkIn,
      responseDueAt: booking.responseDueAt,
      unreadCount: unreadFor(booking),
      paymentInstructionsStatus: booking.paymentInstructionsStatus,
      ratingDueAt: ratingDueAtFor(booking),
    })),
    now,
  );

  const actionCards: HostActionCard[] = queue.map((item) => {
    const booking = byId.get(item.bookingId)!;
    return {
      bookingId: booking.id,
      kind: item.kind,
      urgency: item.urgency,
      dueAt: item.dueAt?.toISOString() ?? null,
      initialCountdown: item.dueAt
        ? formatCountdown(item.dueAt.getTime() - now.getTime())
        : null,
      conversationId: booking.conversation?.id ?? null,
      reference: booking.reference,
      listingTitle: booking.listing.title,
      city: booking.listing.property.city,
      imageUrl: booking.listing.images[0]?.url ?? null,
      imageAlt: booking.listing.images[0]?.alt || booking.listing.title,
      guestName: booking.guest.name,
      guestLine: `${booking.guest.name} · ${booking.guestCount} · ${formatDate(booking.checkIn, t.locale)} – ${formatDate(booking.checkOut, t.locale)} · ${formatPrice(Number(booking.totalPrice), booking.currency, t.locale)}`,
      guestNote: booking.guestNote,
      unreadCount: unreadFor(booking),
      alsoNeeds: item.alsoNeeds,
    };
  });

  const upcomingBookings = bookings.filter(
    (booking) => booking.status === "CONFIRMED" && booking.checkIn >= now,
  );
  const [displayCurrency, rateTable] = await Promise.all([
    getDisplayCurrency(),
    getExchangeRates(),
  ]);
  const upcomingSummary = summarizeUpcomingTotal(
    upcomingBookings.map((booking) => ({
      currency: booking.currency,
      amount: Number(booking.totalPrice),
    })),
    displayCurrency,
    t.locale,
    rateTable ? { display: displayCurrency, rates: rateTable.rates } : null,
  );

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold">
          <T t={t} k="host.bookings.heading" source="Bookings" />
        </h1>
        <p className="text-sm text-muted-foreground">
          {bookings.length}{" "}
          <T t={t} k="host.bookings.count_suffix" source="bookings" /> ·{" "}
          {upcomingSummary.approximate ? "~" : ""}
          {upcomingSummary.text}{" "}
          <T t={t} k="host.bookings.upcoming_suffix" source="upcoming" />
        </p>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        {actionCards.length > 0 ? (
          <>
            {actionCards.length}{" "}
            <T
              t={t}
              k="host.bookings.needs_you_today"
              source="things need you today"
            />
          </>
        ) : (
          <T
            t={t}
            k="host.bookings.nothing_today"
            source="Nothing needs you today"
          />
        )}
      </p>

      <HostBookingActionRail cards={actionCards} />

      <h2 className="mb-3 text-sm font-medium">
        <T t={t} k="host.bookings.all_heading" source="All bookings" />
      </h2>
      <ListControls
        searchPlaceholder={t.resolve("host.bookings.search_placeholder", "Search bookings by property, city, guest, reference, status or note…").text}
        filters={[{
          key: "status",
          label: t.resolve("common.status", "Status").text,
          allLabel: t.resolve("list_controls.all_statuses", "All statuses").text,
          options: BOOKING_STATUSES.map((status) => ({ value: status.value, label: resolveBookingStatus(t, status.value).text })),
        }]}
        sorts={[
          { value: "upcomingFirst", label: t.resolve("host.bookings.sort_upcoming", "Upcoming first").text },
          { value: "checkIn", label: t.resolve("host.bookings.sort_checkin_newest", "Check-in: newest").text, direction: "desc" },
          { value: "checkInOldest", label: t.resolve("host.bookings.sort_checkin_oldest", "Check-in: oldest").text },
          { value: "total", label: t.resolve("host.bookings.sort_total_highest", "Total: highest").text, direction: "desc" },
          { value: "guest", label: t.resolve("host.bookings.sort_guest", "Guest: A–Z").text },
          { value: "listing", label: t.resolve("host.bookings.sort_property", "Property: A–Z").text },
        ]}
        className="space-y-2"
        items={bookings.map((booking) => {
          const statusConfig = resolveBookingStatus(t, booking.status);
          const isTerminal = TERMINAL_STATUSES.has(booking.status);
          const daysToCheckIn = daysUntil(booking.checkIn, now);
          return {
            id: booking.id,
            searchText: [booking.listing.title, booking.listing.property.city, booking.guest.name, booking.reference, booking.status, statusConfig.text, booking.guestNote].filter(Boolean).join(" "),
            filters: { status: booking.status },
            sortValues: {
              upcomingFirst: upcomingFirstKey(booking.checkIn, now),
              checkIn: booking.checkIn.getTime(),
              checkInOldest: booking.checkIn.getTime(),
              total: Number(booking.totalPrice),
              guest: booking.guest.name,
              listing: booking.listing.title,
            },
            content: (
              // The whole row is the link to the detail page, which buys back the
              // button slot that a separate "View details" used to occupy — the row's
              // per-booking actions live on the detail page and, while they are
              // urgent, in the rail above.
              <Link
                href={`/host/bookings/${booking.id}`}
                className={`flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:border-foreground/20 hover:bg-muted/40 ${isTerminal ? "opacity-70" : ""}`}
              >
                <div className="w-11 shrink-0 text-center">
                  <p className="text-[11px] uppercase text-muted-foreground" translate="no">
                    {new Intl.DateTimeFormat(t.locale, { month: "short" }).format(booking.checkIn)}
                  </p>
                  <p className="text-xl font-semibold leading-tight tabular-nums" translate="no">
                    {new Intl.DateTimeFormat(t.locale, { day: "2-digit" }).format(booking.checkIn)}
                  </p>
                </div>
                <span className="self-stretch border-l" aria-hidden="true" />
                {booking.listing.images[0]?.url ? (
                  <span className="relative hidden h-12 w-16 shrink-0 overflow-hidden rounded-lg sm:block">
                    <Image
                      src={booking.listing.images[0].url}
                      alt={booking.listing.images[0].alt || booking.listing.title}
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  </span>
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOTS[booking.status] ?? "bg-muted-foreground/50"}`}
                      aria-hidden="true"
                    />
                    <h3
                      className={`min-w-0 truncate font-medium ${isTerminal ? "line-through decoration-muted-foreground" : ""}`}
                    >
                      <span data-user-generated-content translate="yes">{booking.listing.title}</span>
                    </h3>
                  </div>
                  <p className="mt-0.5 truncate pl-3.5 text-sm text-muted-foreground">
                    {isTerminal ? `${statusConfig.text} · ` : ""}
                    {booking.guest.name} · {booking.guestCount} ·{" "}
                    {formatDate(booking.checkIn, t.locale)} – {formatDate(booking.checkOut, t.locale)} ·{" "}
                    {formatPrice(Number(booking.totalPrice), booking.currency, t.locale)}
                  </p>
                </div>
                {!isTerminal && daysToCheckIn >= 0 && daysToCheckIn <= 7 ? (
                  <span className="hidden shrink-0 text-xs text-emerald-700 md:block dark:text-emerald-400">
                    {daysToCheckIn === 0 ? (
                      <T t={t} k="host.bookings.checkin_today" source="Check-in today" />
                    ) : (
                      <>
                        <T t={t} k="host.bookings.checkin_in" source="Check-in in" />{" "}
                        {daysToCheckIn}
                        <T t={t} k="host.bookings.days_short" source="d" />
                      </>
                    )}
                  </span>
                ) : null}
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            ),
          };
        })}
      />
    </div>
  );
}
