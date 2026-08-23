"use client";

import Link from "next/link";
import { ArrowLeft, House } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import type { HostActionItem } from "@/lib/host/booking-action-queue";
import type {
  HostReservation,
  HostReservationsData,
} from "@/lib/host/v2/reservation-types";
import { ReservationPanel } from "./reservation-panel";

/**
 * One reservation on a page of its own.
 *
 * The host panel's own replacement for `/host/bookings/[id]`: the same reservation the
 * drawer shows, at a URL that can be linked to from an email, a notification or a
 * message thread. It deliberately renders the drawer's panel rather than a second
 * layout of the same facts — one description of a reservation, reachable two ways,
 * means an action added to the panel is never missing from the page.
 *
 * The extras below the panel are the ones the panel has no room for and only a
 * dedicated page needs: the way back to the list, the listing behind the booking, and
 * the escalation path when something about the stay has gone wrong.
 */
export function ReservationDetail({
  data,
  reservation,
  action,
  initialCountdown,
}: {
  data: HostReservationsData;
  reservation: HostReservation;
  action: HostActionItem | null;
  initialCountdown: string | null;
}) {
  const i18n = useI18n();
  const property = data.properties.find(
    (candidate) => candidate.id === reservation.listingId,
  );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 pb-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/host/reservations">
            <ArrowLeft className="size-3.5" aria-hidden />
            {
              i18n.resolve(
                "host.v2.reservations.back_to_all",
                "All reservations",
              ).text
            }
          </Link>
        </Button>
      </div>

      <ReservationPanel
        reservation={reservation}
        property={property}
        data={data}
        action={action}
        initialCountdown={initialCountdown}
        showOpenFull={false}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        {/* The listing is where a wrong price, a wrong house time or a blocked date
            actually gets fixed, and a reservation is the most common place to notice
            that something is wrong with it. */}
        <Button asChild variant="outline" size="sm">
          <Link href={`/host/listings/${reservation.listingId}`}>
            <House className="size-3.5" aria-hidden />
            {
              i18n.resolve(
                "host.v2.reservations.view_listing",
                "View listing",
              ).text
            }
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link
            href={`/account/support/new?type=CLAIM&targetType=BOOKING&bookingId=${reservation.id}`}
          >
            {i18n.resolve("host.bookings.report_problem", "Report a problem").text}
          </Link>
        </Button>
      </div>
    </div>
  );
}
