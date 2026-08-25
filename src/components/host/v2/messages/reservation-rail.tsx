"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tx, interpolate, useI18n } from "@/lib/i18n/client";
import { useDisplayCurrency } from "@/lib/currency/client";
import { formatMoney } from "@/lib/currency/convert";
import { resolveBookingStatus } from "@/lib/i18n/status-labels";
import { DamageReportDialog } from "@/components/communication/damage-report-dialog";
import type { HostInboxReservation } from "@/lib/services/host-inbox.service";
import { Avatar, CARD, FOCUS_RING } from "./inbox-surface";

/**
 * The stay a thread is about, as facts rather than prose.
 *
 * This is the answer to the question a host actually opens a message with — who is
 * coming, when, for how much, and is it confirmed. Everything here is read-only on
 * purpose: acting on a reservation (cancelling, changing dates) has consequences that
 * belong on the reservation page, where the confirmation and the rules live. What this
 * rail owes the host is the facts and one honest way through to that page.
 */

export function ReservationRail({
  reservation,
  onChanged,
}: {
  reservation: HostInboxReservation;
  onChanged: () => Promise<void>;
}) {
  const { locale, resolve } = useI18n();
  const display = useDisplayCurrency();
  const { booking, listing, guest } = reservation;
  const payout = booking
    ? display.format(booking.totalPrice, booking.currency)
    : null;

  const dayMonth = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const fullDate = new Intl.DateTimeFormat(locale, { dateStyle: "long" });

  return (
    <div className="space-y-3">
      <div className={cn("overflow-hidden", CARD)}>
        <div className="relative aspect-[16/10] w-full bg-slate-100">
          {listing.imageUrl ? (
            <Image
              src={listing.imageUrl}
              alt=""
              fill
              sizes="(min-width: 1280px) 21rem, 100vw"
              className="object-cover"
            />
          ) : (
            <span className="grid size-full place-items-center text-slate-400">
              <ImageIcon className="size-7" aria-hidden />
            </span>
          )}
        </div>
        <div className="p-4">
          {booking ? (
            <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
              {resolveBookingStatus({ resolve }, booking.status).text}
            </span>
          ) : (
            <span className="inline-flex rounded-full bg-[#f1f5f9] px-2.5 py-1 text-xs font-medium text-[#0f172a]">
              <Tx k="conversation.kind.inquiry" source="Inquiry" />
            </span>
          )}
          <p className="mt-2 text-base font-semibold leading-6 tracking-tight text-slate-950">
            <span data-user-generated-content translate="yes">
              {listing.title}
            </span>
          </p>
          {booking ? (
            <p className="mt-1 text-sm text-slate-600">
              {`${dayMonth.format(new Date(booking.checkIn))} – ${dayMonth.format(
                new Date(booking.checkOut)
              )} · `}
              {
                interpolate(
                  resolve("host.v2.messages.nights", "{count} nights"),
                  { count: booking.numberOfNights }
                ).text
              }
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-600">
              <Tx
                k="host.v2.messages.no_reservation"
                source="No reservation yet — this guest is asking about the listing."
              />
            </p>
          )}
        </div>
      </div>

      {booking ? (
        <>
          <div className={cn("grid grid-cols-2", CARD)}>
            <div className="p-4">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
                <Tx k="host.v2.messages.check_in" source="Check-in" />
              </p>
              <p className="mt-1.5 text-sm font-semibold text-slate-950">
                {dayMonth.format(new Date(booking.checkIn))}
              </p>
              <p className="text-sm text-slate-500">
                {listing.checkInTime ?? (
                  <Tx k="host.v2.messages.flexible_time" source="Flexible" />
                )}
              </p>
            </div>
            <div className="p-4">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
                <Tx k="host.v2.messages.check_out" source="Checkout" />
              </p>
              <p className="mt-1.5 text-sm font-semibold text-slate-950">
                {dayMonth.format(new Date(booking.checkOut))}
              </p>
              <p className="text-sm text-slate-500">
                {listing.checkOutTime ?? (
                  <Tx k="host.v2.messages.flexible_time" source="Flexible" />
                )}
              </p>
            </div>
          </div>

          <div className={cn("p-4", CARD)}>
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
              <Tx k="host.v2.messages.guests" source="Guests" />
            </p>
            <div className="mt-3 flex items-center gap-3">
              <Avatar name={guest.name} image={guest.image} className="size-9" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-950">
                  {guest.name ||
                    resolve("conversation.deleted_user", "Deleted user").text}
                </p>
                <p className="text-sm text-slate-500">
                  {
                    interpolate(
                      resolve("host.v2.messages.guest_count", "{count} guests"),
                      { count: booking.guestCount }
                    ).text
                  }
                </p>
              </div>
            </div>
            {booking.guestNote ? (
              <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                <span data-user-generated-content translate="yes">
                  {booking.guestNote}
                </span>
              </p>
            ) : null}
          </div>

          <dl className={cn("divide-y divide-slate-100 px-4", CARD)}>
            {/*
             * Through the shared display-currency formatter rather than a bare `Intl`
             * call: this was the one price in the host panel that ignored the chosen
             * display currency entirely, so a host reading the site in DKK saw every
             * other figure in DKK and this one in the booking's currency.
             *
             * The agreed booking total is still stated in its official currency — a
             * converted figure is today's approximation, while this row records the
             * amount the host and guest agreed.
             */}
            <Row
              label={<Tx k="host.v2.messages.total_booking" source="Booking total" />}
              value={payout?.text ?? ""}
              note={
                payout?.converted
                  ? interpolate(
                      resolve(
                        "host.v2.messages.official_total_agreed",
                        "Agreed as {amount}",
                      ),
                      {
                        amount: formatMoney(
                          booking.totalPrice,
                          booking.currency,
                          locale,
                        ),
                      },
                    ).text
                  : undefined
              }
              strong
            />
            <Row
              label={
                <Tx k="host.v2.messages.confirmation_code" source="Confirmation code" />
              }
              value={booking.reference}
            />
            <Row
              label={<Tx k="host.v2.messages.booked_on" source="Booking date" />}
              value={fullDate.format(new Date(booking.createdAt))}
            />
          </dl>

          <Link
            href={booking.detailsUrl}
            className={cn(
              "flex items-center gap-3 p-4 transition-colors hover:bg-slate-50",
              CARD,
              FOCUS_RING
            )}
          >
            <span className="min-w-0 flex-1 text-sm font-semibold text-slate-950">
              <Tx
                k="host.v2.messages.manage_reservation"
                source="Manage reservation"
              />
            </span>
            <ArrowRight className="size-4 shrink-0 text-slate-400" aria-hidden />
          </Link>

          <div className="pt-1">
            <DamageReportDialog
              conversationId={reservation.conversationId}
              onCreated={onChanged}
            />
          </div>
        </>
      ) : (
        <Link
          href={`/listings/${listing.id}`}
          className={cn(
            "flex items-center gap-3 p-4 transition-colors hover:bg-slate-50",
            CARD,
            FOCUS_RING
          )}
        >
          <span className="min-w-0 flex-1 text-sm font-semibold text-slate-950">
            <Tx k="host.v2.messages.view_listing" source="View listing" />
          </span>
          <ArrowRight className="size-4 shrink-0 text-slate-400" aria-hidden />
        </Link>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  note,
  strong,
}: {
  label: React.ReactNode;
  value: string;
  /** A quieter second line under the value — used for the official amount behind a
   *  converted one, which must be readable but must not compete with it. */
  note?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd
        className={cn(
          "text-right text-sm text-slate-900",
          strong ? "font-semibold" : "font-medium"
        )}
      >
        <span className="notranslate" translate="no">
          {value}
        </span>
        {note ? (
          <span className="notranslate mt-0.5 block text-xs font-normal text-slate-500" translate="no">
            {note}
          </span>
        ) : null}
      </dd>
    </div>
  );
}
