import { requireHostPage } from "@/lib/auth-helpers";
import { getHostCalendarWorkspace } from "@/lib/services/host-calendar-workspace.service";
import {
  parseCalendarIntentParam,
  parseCalendarListingParam,
  parseCalendarRangeParams,
} from "@/lib/host/v2/calendar-href";
import { getT } from "@/lib/i18n/t";
import { HostCalendarWorkspace } from "@/components/host/v2/calendar/host-calendar-workspace";

export const metadata = { title: "Calendar" };

interface HostV2CalendarPageProps {
  /**
   * `?listing=<id>` opens the calendar on one property, and `?intent=` says what for.
   *
   * All of it is a request, not an instruction: the workspace only honours an id that
   * is in the payload, and the payload is already scoped to this host. A stale or
   * foreign id falls back to the default property rather than showing an empty
   * calendar, and every intent names an editor that acts on selected dates alone.
   *
   * `?from=`/`?to=` preselect a range a link already knew — a dated offer opened from
   * the Pricing summary. They are clamped to the rendered horizon, so an old link
   * selects the part of its range that still exists and nothing else.
   */
  searchParams: Promise<{
    listing?: string | string[];
    intent?: string | string[];
    from?: string | string[];
    to?: string | string[];
  }>;
}

export default async function HostV2CalendarPage({
  searchParams,
}: HostV2CalendarPageProps) {
  // `requireHostPage` redirects rather than rendering an empty calendar, and the
  // workspace query is scoped to this host — a listing that is not theirs cannot
  // reach the payload. Every mutation the workspace can trigger re-checks ownership
  // on the server independently of this read.
  const [user, t, search] = await Promise.all([
    requireHostPage(),
    getT(),
    searchParams,
  ]);
  // Anything that could not be what it claims to be is dropped before it reaches the
  // workspace, so a crafted or repeated parameter never decides what the calendar
  // renders or which editor it opens.
  const requestedListingId = parseCalendarListingParam(search.listing);
  const intent = parseCalendarIntentParam(search.intent);
  const requestedRange = parseCalendarRangeParams(search.from, search.to);
  // The catalog locale, which is the language the surrounding copy actually resolved
  // to, so the money and date patterns match the words around them.
  const data = await getHostCalendarWorkspace(user.id, t.locale);

  return (
    <HostCalendarWorkspace
      data={data}
      requestedListingId={requestedListingId}
      intent={intent}
      requestedRange={requestedRange}
    />
  );
}
