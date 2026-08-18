"use client";

import { interpolate, type useI18n } from "@/lib/i18n/client";
import type { Resolved } from "@/lib/i18n/t";
import { resolveBookingStatus } from "@/lib/i18n/status-labels";
import { formatMoney } from "@/lib/host/v2/calendar-format";
import type { CalendarFormats } from "@/lib/host/v2/calendar-format";
import type { HostActionKind } from "@/lib/host/booking-action-queue";
import {
  daysFromToday,
  isTerminal,
  type ReservationFilter,
  type ReservationGroup,
  type ReservationSort,
} from "@/lib/host/v2/reservation-model";
import type { HostReservation } from "@/lib/host/v2/reservation-types";

/**
 * Every sentence the reservations panel can say, in one place.
 *
 * Same split as the calendar: the model returns codes, this module turns codes into
 * words, and it always goes through the catalog — no screen invents its own wording for
 * the same state, and no bare English literal is rendered from here.
 */
export type Translator = ReturnType<typeof useI18n>;

/** Money always goes through the server's snapshot, never `Intl` on the client. */
export function money(
  amount: number,
  currency: string,
  formats: CalendarFormats,
): string {
  return formatMoney(amount, currency, formats);
}

/**
 * What a row says about itself.
 *
 * Deliberately not the raw `BookingStatus`: "Confirmed" is true of a stay that started
 * three days ago and of one starting in November, and a host scanning the list needs
 * those told apart. Anything terminal keeps the real status name, because *why* it
 * ended is the only interesting thing left about it.
 */
export type RowStatusCode =
  | "REQUEST"
  | "CHECKING_IN"
  | "STAYING"
  | "CHECKING_OUT"
  | "CONFIRMED"
  | "COMPLETED"
  | "CLOSED";

export function rowStatusOf(
  reservation: HostReservation,
  today: string,
): RowStatusCode {
  if (isTerminal(reservation.status)) return "CLOSED";
  if (reservation.status === "COMPLETED") return "COMPLETED";
  if (reservation.status === "PENDING") return "REQUEST";
  const startsIn = daysFromToday(reservation.checkIn, today);
  const endsIn = daysFromToday(reservation.checkOut, today);
  if (startsIn === 0) return "CHECKING_IN";
  if (endsIn === 0) return "CHECKING_OUT";
  if (startsIn < 0 && endsIn > 0) return "STAYING";
  return "CONFIRMED";
}

export function rowStatusLabel(
  i18n: Translator,
  code: RowStatusCode,
  reservation: HostReservation,
): Resolved {
  switch (code) {
    case "REQUEST":
      return i18n.resolve("host.v2.reservations.status.request", "Request");
    case "CHECKING_IN":
      return i18n.resolve("host.v2.reservations.status.checking_in", "Arrives today");
    case "CHECKING_OUT":
      return i18n.resolve("host.v2.reservations.status.checking_out", "Leaves today");
    case "STAYING":
      return i18n.resolve("host.v2.reservations.status.staying", "Staying now");
    case "CONFIRMED":
      return i18n.resolve("host.v2.reservations.status.confirmed", "Confirmed");
    case "COMPLETED":
      return i18n.resolve("host.v2.reservations.status.completed", "Completed");
    default:
      // The real reason: rejected, expired, or who cancelled it.
      return resolveBookingStatus(i18n, reservation.status);
  }
}

/** Pill colours. Live stays get a colour; anything closed is grey and recedes. */
export const ROW_STATUS_PILL: Record<RowStatusCode, string> = {
  REQUEST: "bg-amber-50 text-amber-800",
  CHECKING_IN: "bg-cyan-50 text-cyan-800",
  CHECKING_OUT: "bg-cyan-50 text-cyan-800",
  STAYING: "bg-cyan-50 text-cyan-800",
  CONFIRMED: "bg-emerald-50 text-emerald-800",
  COMPLETED: "bg-slate-100 text-slate-600",
  CLOSED: "bg-slate-100 text-slate-500",
};

export function filterLabel(
  i18n: Translator,
  filter: ReservationFilter,
): Resolved {
  switch (filter) {
    case "action":
      return i18n.resolve("host.v2.reservations.filter.action", "Needs action");
    case "all":
      return i18n.resolve("host.v2.reservations.filter.all", "All");
    case "upcoming":
      return i18n.resolve("host.v2.reservations.filter.upcoming", "Upcoming");
    case "staying":
      return i18n.resolve("host.v2.reservations.filter.staying", "Staying now");
    case "completed":
      return i18n.resolve("host.v2.reservations.filter.completed", "Completed");
    case "cancelled":
      return i18n.resolve("host.v2.reservations.filter.cancelled", "Cancelled");
  }
}

export function sortLabel(i18n: Translator, sort: ReservationSort): Resolved {
  switch (sort) {
    case "priority":
      return i18n.resolve(
        "host.v2.reservations.sort.priority",
        "Needs you first",
      );
    case "soonest":
      return i18n.resolve("host.v2.reservations.sort.soonest", "Soonest first");
    case "newest":
      return i18n.resolve("host.v2.reservations.sort.newest", "Newest request");
    case "highest":
      return i18n.resolve("host.v2.reservations.sort.highest", "Highest total");
  }
}

export function groupLabel(i18n: Translator, group: ReservationGroup): Resolved {
  switch (group) {
    case "action":
      return i18n.resolve("host.v2.reservations.group.action", "Needs your action");
    case "today":
      return i18n.resolve("host.v2.reservations.group.today", "Today");
    case "upcoming":
      return i18n.resolve("host.v2.reservations.group.upcoming", "Upcoming");
    case "earlier":
      return i18n.resolve("host.v2.reservations.group.earlier", "Earlier");
  }
}

/** The line under a group heading that says how it is ordered. Null when obvious. */
export function groupHint(
  i18n: Translator,
  group: ReservationGroup,
): Resolved | null {
  if (group === "action") {
    return i18n.resolve(
      "host.v2.reservations.group.action_hint",
      "sorted by deadline",
    );
  }
  return null;
}

/** What an action card is asking the host to do, in a few words. */
export function actionHeadline(
  i18n: Translator,
  kind: HostActionKind,
  reservation: HostReservation,
  today: string,
): Resolved {
  switch (kind) {
    case "RESPOND_TO_REQUEST":
      return i18n.resolve(
        "host.v2.reservations.action.respond",
        "Request expires in",
      );
    case "REPLY_TO_GUEST":
      return i18n.resolve(
        "host.v2.reservations.action.reply",
        "Guest is waiting for a reply",
      );
    case "PREPARE_CHECK_IN":
      return daysFromToday(reservation.checkIn, today) === 0
        ? i18n.resolve("host.v2.reservations.action.arrives_today", "Arrives today")
        : i18n.resolve(
            "host.v2.reservations.action.arrives_tomorrow",
            "Arrives tomorrow",
          );
    case "RATE_GUEST":
      return i18n.resolve("host.v2.reservations.action.rate", "Rate your guest");
  }
}

/** The consequence line: what happens if the host does nothing. */
export function actionConsequence(
  i18n: Translator,
  kind: HostActionKind,
): Resolved | null {
  switch (kind) {
    case "RESPOND_TO_REQUEST":
      return i18n.resolve(
        "host.v2.reservations.action.respond_consequence",
        "If you do not answer, the request expires on its own and the dates go back on sale.",
      );
    case "REPLY_TO_GUEST":
      return i18n.resolve(
        "host.v2.reservations.action.reply_consequence",
        "How fast you reply is shown to guests on your listings.",
      );
    case "PREPARE_CHECK_IN":
      return i18n.resolve(
        "host.v2.reservations.action.check_in_consequence",
        "Send the guest their arrival details before they travel.",
      );
    default:
      return null;
  }
}

/** The short chip for a reason a card is not leading with. */
export function actionChipLabel(
  i18n: Translator,
  kind: HostActionKind,
): Resolved {
  switch (kind) {
    case "RESPOND_TO_REQUEST":
      return i18n.resolve(
        "host.v2.reservations.chip.respond",
        "Awaiting your reply",
      );
    case "REPLY_TO_GUEST":
      return i18n.resolve("host.v2.reservations.chip.reply", "Unread message");
    case "PREPARE_CHECK_IN":
      return i18n.resolve("host.v2.reservations.chip.check_in", "Arriving soon");
    case "RATE_GUEST":
      return i18n.resolve("host.v2.reservations.chip.rate", "Rating open");
  }
}

/** "4 guests · 6 nights", the one line that describes the shape of a stay. */
export function stayLine(
  i18n: Translator,
  reservation: HostReservation,
): Resolved {
  const guests = interpolate(
    i18n.plural(
      "host.v2.reservations.guests",
      reservation.guestCount,
      "{n} guest",
      "{n} guests",
    ),
    {},
  );
  const nights = interpolate(
    i18n.plural(
      "host.v2.reservations.nights",
      reservation.nights,
      "{n} night",
      "{n} nights",
    ),
    {},
  );
  return {
    text: `${guests.text} · ${nights.text}`,
    translated: guests.translated && nights.translated,
  };
}
