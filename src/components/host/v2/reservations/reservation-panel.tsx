"use client";

import Image from "next/image";
import Link from "next/link";
import { Clock, ExternalLink, House, MessageCircle, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { interpolate, useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { HostBookingActions } from "@/components/host/host-booking-actions";
import { HostCancelBookingButton } from "@/components/host/host-cancel-booking-button";
import { StartConversationButton } from "@/components/communication/start-conversation-button";
import { BookingPaymentProgress } from "@/components/booking/booking-payment-progress";
import type { HostActionItem } from "@/lib/host/booking-action-queue";
import { formatLongDate } from "@/lib/host/v2/calendar-format";
import { RESERVATION_ANCHOR, anchorProps } from "@/lib/host/v2/reservation-anchors";
import type {
  HostReservation,
  HostReservationProperty,
  HostReservationsData,
} from "@/lib/host/v2/reservation-types";
import { ReservationCountdown } from "./reservation-countdown";
import {
  ROW_STATUS_PILL,
  isConvertedMoney,
  money,
  officialMoney,
  rowStatusLabel,
  rowStatusOf,
  stayLine,
} from "./reservation-labels";

/**
 * The right pane: one reservation, in full, with the things that change it.
 *
 * Every irreversible action lives here and nowhere else in the list — a decline sitting
 * on a row of a dense, scrolling list is a mis-click waiting to happen, and this is the
 * only place with room to say what a button will actually do before it is pressed.
 */

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2">
      <p className="text-[0.625rem] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 text-[0.8125rem] font-semibold text-slate-800" translate="no">
        {value}
      </p>
    </div>
  );
}

function Line({
  label,
  value,
  total,
}: {
  label: string;
  value: string;
  total?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 text-[0.78125rem]",
        total &&
          "mt-1 border-t border-slate-100 pt-1.5 text-[0.8125rem] font-semibold text-slate-900",
      )}
    >
      <span className={total ? undefined : "text-slate-600"}>{label}</span>
      <span className="tabular-nums font-semibold text-slate-800" translate="no">
        {value}
      </span>
    </div>
  );
}

function Section({
  title,
  children,
  anchor,
}: {
  title?: string;
  children: React.ReactNode;
  anchor?: ReturnType<typeof anchorProps>;
}) {
  return (
    <section
      {...anchor}
      className="rounded-xl border border-slate-200 bg-white p-3"
    >
      {title ? (
        <h3 className="mb-2 text-[0.625rem] font-bold uppercase tracking-wider text-slate-400">
          {title}
        </h3>
      ) : null}
      {children}
    </section>
  );
}

export function ReservationPanel({
  reservation,
  property,
  data,
  action,
  initialCountdown,
  showOpenFull = true,
}: {
  reservation: HostReservation;
  property: HostReservationProperty | undefined;
  data: HostReservationsData;
  /** This reservation's queue entry, when it has one. */
  action: HostActionItem | null;
  initialCountdown: string | null;
  /**
   * The link out to the reservation's own page. Suppressed on that page itself, where
   * it would only point back at the screen the host is already reading.
   */
  showOpenFull?: boolean;
}) {
  const i18n = useI18n();
  const code = rowStatusOf(reservation, data.today);
  const status = rowStatusLabel(i18n, code, reservation);
  const stay = stayLine(i18n, reservation);
  const accommodation = reservation.nightlyRate * reservation.nights;
  const currency = reservation.currency;
  const messageLabel = i18n.resolve(
    "host.v2.reservations.message_guest",
    "Message guest",
  ).text;
  const respondDeadline =
    action?.kind === "RESPOND_TO_REQUEST" ? action.dueAt : null;

  return (
    <div
      {...anchorProps(RESERVATION_ANCHOR.panel)}
      className="flex flex-col gap-2.5"
    >
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="relative aspect-[16/9] w-full bg-slate-100">
          {property?.photoUrl ? (
            <Image
              src={property.photoUrl}
              alt={property.photoAlt || property.title}
              fill
              sizes="(min-width: 1280px) 25rem, (min-width: 1024px) 23rem, 100vw"
              className="object-cover"
            />
          ) : (
            <span className="grid size-full place-items-center text-slate-400">
              <House className="size-7" aria-hidden />
            </span>
          )}
          <span
            className={cn(
              "absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold shadow-sm",
              ROW_STATUS_PILL[code],
              status.translated && "notranslate",
            )}
          >
            {status.text}
          </span>
        </div>
        <div className="p-3">
          <p className="text-[0.9375rem] font-semibold leading-5 tracking-tight text-slate-950">
            <span data-user-generated-content translate="yes">
              {property?.title ?? ""}
            </span>
          </p>
          <p className="mt-0.5 text-[0.75rem] text-slate-500">
            {property?.city ? `${property.city} · ` : ""}
            <span translate="no">{reservation.reference}</span>
          </p>
        </div>
        <div className="grid grid-cols-2 border-t border-slate-100 [&>*:nth-child(odd)]:border-r [&>*:nth-child(odd)]:border-slate-100 [&>*:nth-child(n+3)]:border-t [&>*:nth-child(n+3)]:border-slate-100">
          <Fact
            label={i18n.resolve("host.v2.reservations.check_in", "Check-in").text}
            value={`${formatLongDate(reservation.checkIn, data.formats)}${
              reservation.checkInTime ? ` · ${reservation.checkInTime}` : ""
            }`}
          />
          <Fact
            label={i18n.resolve("host.v2.reservations.check_out", "Check-out").text}
            value={`${formatLongDate(reservation.checkOut, data.formats)}${
              reservation.checkOutTime ? ` · ${reservation.checkOutTime}` : ""
            }`}
          />
          <Fact
            label={i18n.resolve("host.v2.reservations.stay", "Stay").text}
            value={stay.text}
          />
          <Fact
            label={i18n.resolve("host.v2.reservations.booked_on", "Requested").text}
            value={formatLongDate(
              reservation.createdAt.slice(0, 10),
              data.formats,
            )}
          />
        </div>
      </div>

      {/* The one thing on this screen with a clock on it. It sits above the guest and
          the money because a deadline the host misses cannot be recovered afterwards. */}
      {respondDeadline ? (
        <div
          {...anchorProps(RESERVATION_ANCHOR.decision)}
          className={cn(
            "rounded-xl border p-3",
            action?.urgency === "critical"
              ? "border-red-200 bg-red-50/60"
              : "border-amber-200 bg-amber-50/60",
          )}
        >
          <p
            className={cn(
              "flex items-center gap-1.5 text-[0.8125rem] font-semibold",
              action?.urgency === "critical" ? "text-red-800" : "text-amber-900",
            )}
          >
            <Clock className="size-3.5" aria-hidden />
            {i18n.resolve("host.v2.reservations.answer_within", "Answer within").text}{" "}
            <ReservationCountdown
              dueAt={respondDeadline.toISOString()}
              initial={initialCountdown ?? ""}
            />
          </p>
          <p className="mt-1 text-[0.75rem] leading-4 text-slate-700">
            {
              i18n.resolve(
                "host.v2.reservations.answer_body",
                "If you do not answer in time the request expires on its own, and these dates go back on sale.",
              ).text
            }
          </p>
          <div className="mt-2">
            <HostBookingActions bookingId={reservation.id} />
          </div>
        </div>
      ) : null}

      <Section>
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-slate-100 text-[0.8125rem] font-semibold text-slate-600">
            {reservation.guest.image ? (
              // Avatars come from whichever provider the guest signed in with, and
              // those hosts are not in `next.config.ts` — the optimizer would refuse
              // them, and at 36px there is nothing to optimize anyway.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={reservation.guest.image}
                alt=""
                className="size-full object-cover"
              />
            ) : (
              (reservation.guest.name || "?").trim().charAt(0).toUpperCase()
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.84375rem] font-semibold text-slate-900">
              {reservation.guest.name}
            </span>
            <span className="block text-[0.71875rem] text-slate-500">
              {
                interpolate(
                  i18n.plural(
                    "host.v2.reservations.guests",
                    reservation.guestCount,
                    "{n} guest",
                    "{n} guests",
                  ),
                  {},
                ).text
              }
            </span>
          </span>
          {reservation.conversationId ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/host/messages/${reservation.conversationId}`}>
                <MessageCircle className="size-3.5" aria-hidden />
                {messageLabel}
                {reservation.unreadCount > 0 ? (
                  <span
                    className="rounded-full bg-[#0f172a] px-1.5 text-[0.625rem] font-bold text-white"
                    translate="no"
                  >
                    {reservation.unreadCount}
                  </span>
                ) : null}
              </Link>
            </Button>
          ) : (
            <StartConversationButton
              bookingId={reservation.id}
              variant="outline"
              label={messageLabel}
            />
          )}
        </div>
        {reservation.guestNote ? (
          <p className="mt-2.5 border-l-2 border-slate-200 pl-2.5 text-[0.78125rem] leading-5 text-slate-600">
            <span data-user-generated-content translate="yes">
              {reservation.guestNote}
            </span>
          </p>
        ) : null}
      </Section>

      <Section
        title={i18n.resolve("host.v2.reservations.price", "Price").text}
        anchor={anchorProps(RESERVATION_ANCHOR.payout)}
      >
        <div className="flex flex-col gap-1">
          <Line
            label={
              interpolate(
                i18n.plural(
                  "host.v2.reservations.accommodation",
                  reservation.nights,
                  "Accommodation · {n} night",
                  "Accommodation · {n} nights",
                ),
                {},
              ).text
            }
            value={money(accommodation, currency, data.formats)}
          />
          {reservation.cleaningFee > 0 ? (
            <Line
              label={
                i18n.resolve("host.v2.reservations.cleaning_fee", "Cleaning fee").text
              }
              value={money(reservation.cleaningFee, currency, data.formats)}
            />
          ) : null}
          {reservation.discountAmount > 0 ? (
            <Line
              label={i18n.resolve("host.v2.reservations.discount", "Discount").text}
              value={`−${money(reservation.discountAmount, currency, data.formats)}`}
            />
          ) : null}
          {reservation.serviceFee > 0 ? (
            <Line
              label={
                i18n.resolve("host.v2.reservations.service_fee", "Service fee").text
              }
              value={money(reservation.serviceFee, currency, data.formats)}
            />
          ) : null}
          <Line
            label={i18n.resolve("host.v2.reservations.total", "Booking total").text}
            value={money(reservation.total, currency, data.formats)}
            total
          />
          {/*
           * The figures above are converted into the currency the host reads prices
           * in, which makes them an approximation of today's rate. This line is the
           * amount the booking is actually agreed at, in the booking's own currency
           * — it is what the host collects from the guest, and it must be on the
           * screen whenever the total above is not it. Linger Homes neither charges
           * it nor pays it out, so the line must not say that it does.
           */}
          {isConvertedMoney(currency, data.formats) ? (
            <p className="pt-1 text-[0.75rem] leading-5 text-slate-500">
              {
                interpolate(
                  i18n.resolve(
                    "host.v2.reservations.official_total_agreed",
                    "Agreed with the guest as {amount}.",
                  ),
                  {
                    amount: officialMoney(reservation.total, currency, data.formats),
                  },
                ).text
              }
            </p>
          ) : null}
        </div>
      </Section>

      {reservation.status === "CONFIRMED" ? (
        <BookingPaymentProgress
          actor="HOST"
          compact
          progress={{
            bookingId: reservation.id,
            status: reservation.status,
            checkIn: reservation.checkIn,
            currency: reservation.currency,
            total: reservation.total,
            advancePaymentAmount: reservation.advancePaymentAmount,
            damageDepositAmount: reservation.damageDepositAmount,
            depositPolicies: reservation.depositPolicies,
            paymentStatus: reservation.paymentStatus,
            paymentInstructionsStatus: reservation.paymentInstructionsStatus,
            selectedPaymentMethod: reservation.selectedPaymentMethod,
            paymentMethodOtherLabel: reservation.paymentMethodOtherLabel,
            advancePaymentStatus: reservation.advancePaymentStatus,
            damageDepositStatus: reservation.damageDepositStatus,
            paymentStatusEvents: reservation.paymentStatusEvents,
            savedPaymentInstructionTemplates:
              reservation.savedPaymentInstructionTemplates ?? [],
          }}
        />
      ) : null}

      {reservation.cancellationReason ? (
        <Section
          title={i18n.resolve("host.v2.reservations.why_closed", "Reason").text}
        >
          <p className="text-[0.78125rem] leading-5 text-slate-600">
            <span data-user-generated-content translate="yes">
              {reservation.cancellationReason}
            </span>
          </p>
        </Section>
      ) : null}

      {/* Cancelling a confirmed stay is the most destructive thing on this screen, so
          it is last, quiet, and behind a required reason. */}
      {reservation.status === "CONFIRMED" ? (
        <Section>
          <HostCancelBookingButton bookingId={reservation.id} />
        </Section>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5 pb-1">
        {showOpenFull ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/host/reservations/${reservation.id}`}>
              <ExternalLink className="size-3.5" aria-hidden />
              {
                i18n.resolve(
                  "host.v2.reservations.open_full",
                  "Open full reservation",
                ).text
              }
            </Link>
          </Button>
        ) : null}
        {/* Only while the invitation is genuinely open — an expired or already-used
            rating window must not offer a button that goes nowhere. */}
        {reservation.ratingDueAt ? (
          <Button asChild size="sm">
            <Link href={`/account/bookings/${reservation.id}/after-stay`}>
              <Star className="size-3.5" aria-hidden />
              {i18n.resolve("host.v2.reservations.rate_guest", "Rate guest").text}
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
