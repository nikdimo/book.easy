import { NextResponse } from "next/server";
import { buildListingCalendar } from "@/lib/calendar-sync/service";

/**
 * The public iCal feed a channel subscribes to: `/api/calendar/<token>.ics`.
 *
 * Unauthenticated by design — Airbnb and Booking.com poll it from their own servers
 * with no way to hold a session — so the token in the path is the entire credential,
 * and the body is limited to dates so that a leaked link discloses occupancy and
 * nothing else. Hosts can rotate the token from the availability screen.
 *
 * The `.ics` suffix is carried in the path segment rather than by a separate route
 * because Airbnb's connect form insists on a link ending in .ics.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token: segment } = await params;
  const token = segment.endsWith(".ics") ? segment.slice(0, -4) : segment;

  // Nothing about a wrong token is worth distinguishing: unknown, revoked and malformed
  // all answer the same way, so the endpoint can't be used to test tokens for validity
  // beyond the guessing the token length already makes hopeless.
  if (!token || !/^[A-Za-z0-9_-]{16,128}$/.test(token)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const calendar = await buildListingCalendar(token);
  if (!calendar) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(calendar.body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="availability.ics"',
      // Channels poll on their own schedule (Airbnb roughly hourly); a short shared
      // cache keeps a burst of pollers off the database without letting a booking made
      // now stay invisible for long.
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export const dynamic = "force-dynamic";
