import { requireHostPage } from "@/lib/auth-helpers";
import { getHostReservations } from "@/lib/services/host-reservations.service";
import { getT } from "@/lib/i18n/t";
import { HostReservationsWorkspace } from "@/components/host/v2/reservations/host-reservations-workspace";

export const metadata = { title: "Reservations" };

export default async function HostV2ReservationsPage() {
  // `requireHostPage` redirects rather than rendering an empty panel, and the query is
  // scoped to this host — a booking on somebody else's listing cannot reach the
  // payload. Every action the panel can trigger re-checks ownership on the server.
  const [user, t] = await Promise.all([requireHostPage(), getT()]);
  // The catalog locale, which is the language the surrounding copy actually resolved
  // to, so the money and date patterns match the words around them.
  const data = await getHostReservations(user.id, t.locale);

  return <HostReservationsWorkspace data={data} />;
}
