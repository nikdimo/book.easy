import { notFound } from "next/navigation";
import { requireHostPage } from "@/lib/auth-helpers";
import { getHostReservations } from "@/lib/services/host-reservations.service";
import { getT } from "@/lib/i18n/t";
import { buildActionQueue } from "@/lib/host/v2/reservation-model";
import { formatCountdown } from "@/lib/host/booking-action-queue";
import { ReservationDetail } from "@/components/host/v2/reservations/reservation-detail";

export const metadata = { title: "Reservation" };

/**
 * One reservation, at its own URL — the host panel's replacement for
 * `/host/bookings/[id]`.
 *
 * Two independent gates stand in front of the data. `requireHostPage` refuses anyone
 * who is not signed in as a host, and sends them back here after login rather than to
 * the panel's home. Ownership is then the query itself: `getHostReservations` is
 * scoped to this host's listings, so a booking id belonging to somebody else's listing
 * is simply not in the payload and falls through to `notFound()` — the same answer a
 * made-up id gets, which is what keeps the page from confirming that a stranger's
 * booking exists. Every action the panel can trigger re-checks ownership server-side.
 */
export default async function HostV2ReservationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [user, t] = await Promise.all([
    requireHostPage(`/host/reservations/${id}`),
    getT(),
  ]);
  const data = await getHostReservations(user.id, t.locale);

  const reservation = data.reservations.find(
    (candidate) => candidate.id === id,
  );
  if (!reservation) notFound();

  // Ranked against the host's whole portfolio, not against this booking alone: the
  // urgency wording and the countdown have to say the same thing here as they do in
  // the list the host arrived from.
  const action =
    buildActionQueue(data.reservations, new Date(data.now)).find(
      (item) => item.bookingId === reservation.id,
    ) ?? null;

  return (
    <ReservationDetail
      data={data}
      reservation={reservation}
      action={action}
      initialCountdown={
        action?.dueAt
          ? formatCountdown(action.dueAt.getTime() - new Date(data.now).getTime())
          : null
      }
    />
  );
}
