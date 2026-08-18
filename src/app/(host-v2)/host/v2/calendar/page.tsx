import { requireHostPage } from "@/lib/auth-helpers";
import { getHostCalendarWorkspace } from "@/lib/services/host-calendar-workspace.service";
import { getT } from "@/lib/i18n/t";
import { HostCalendarWorkspace } from "@/components/host/v2/calendar/host-calendar-workspace";

export const metadata = { title: "Calendar" };

interface HostV2CalendarPageProps {
  /**
   * `?listing=<id>` opens the calendar on one property.
   *
   * It is a request, not an instruction: the workspace only honours an id that is in
   * the payload, and the payload is already scoped to this host. A stale or foreign id
   * falls back to the default property rather than showing an empty calendar.
   */
  searchParams: Promise<{ listing?: string }>;
}

export default async function HostV2CalendarPage({
  searchParams,
}: HostV2CalendarPageProps) {
  // `requireHostPage` redirects rather than rendering an empty calendar, and the
  // workspace query is scoped to this host — a listing that is not theirs cannot
  // reach the payload. Every mutation the workspace can trigger re-checks ownership
  // on the server independently of this read.
  const [user, t, { listing: requestedListingId }] = await Promise.all([
    requireHostPage(),
    getT(),
    searchParams,
  ]);
  // The catalog locale, which is the language the surrounding copy actually resolved
  // to, so the money and date patterns match the words around them.
  const data = await getHostCalendarWorkspace(user.id, t.locale);

  return (
    <HostCalendarWorkspace
      data={data}
      requestedListingId={requestedListingId ?? null}
    />
  );
}
