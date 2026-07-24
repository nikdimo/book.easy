import { NextResponse } from "next/server";
import { ListingStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { rateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { buildVisitorKey, recordListingView, startOfUtcDay } from "@/lib/services/popularity.service";

/** Obvious crawlers, previewers and uptime checks. This is not a security control —
 *  anything determined can spoof a user agent — it's a data-quality filter, so that a
 *  listing doesn't rank as "popular" because a search engine indexed it. */
const BOT_USER_AGENT = /bot|crawl|spider|slurp|preview|monitor|headless|curl|wget|python-requests|facebookexternalhit|whatsapp|telegram/i;

/**
 * Records one listing view for popularity scoring. Called from the listing page by
 * ListingViewTracker rather than counted during server render, because a server render
 * also happens for crawlers, prefetches and metadata requests — a browser that actually
 * ran the page's JS is a much better proxy for "a person looked at this".
 *
 * Deliberately returns 204 for every non-abusive case, including ignored ones: the
 * client has nothing to do with the answer, and telling a caller whether their view
 * counted would just make the endpoint easier to game.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const headers = _req.headers;
  const ip = clientIpFromHeaders(headers);
  const userAgent = headers.get("user-agent") ?? "";

  // Generous enough for real browsing (a guest opening many listings in tabs), low
  // enough that a script can't inflate one listing from a single address.
  const limit = rateLimit(`listing-view:${ip}`, 120, 10 * 60 * 1000);
  if (!limit.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  if (!userAgent || BOT_USER_AGENT.test(userAgent)) {
    return new NextResponse(null, { status: 204 });
  }

  // Only count views of listings the public can actually see, so a host repeatedly
  // opening their own unpublished draft can't seed a score for it.
  const listing = await db.listing.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!listing || listing.status !== ListingStatus.APPROVED) {
    return new NextResponse(null, { status: 204 });
  }

  const now = new Date();
  await recordListingView(listing.id, buildVisitorKey(ip, userAgent, startOfUtcDay(now)), now);

  return new NextResponse(null, { status: 204 });
}
