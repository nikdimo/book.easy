import { describe, expect, it } from "vitest";
/*
 * Next's own matcher and destination compiler rather than a hand-rolled pair, and
 * rather than the top-level `path-to-regexp`, which is a major version ahead of the
 * copy the router uses and disagrees with it about `:param*`. These are the exact
 * functions that will run against this table in production, so what the test asserts
 * is where a request actually lands.
 */
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { prepareDestination } from "next/dist/shared/lib/router/utils/prepare-destination";
import { hostCanonicalRewrites, hostV1Redirects } from "../../../../next.config";

/** Where a request lands, applying the table in order the way the router does. */
function resolve(url: string): string | null {
  const [pathname, search = ""] = url.split("?");
  const query = Object.fromEntries(new URLSearchParams(search));

  for (const rule of hostV1Redirects) {
    const params = getPathMatch(rule.source, { removeUnnamedParams: true })(pathname);
    if (params === false) continue;
    // Only query conditions are used in this table; a `has` entry naming a missing
    // parameter means the rule does not apply and the next one is tried.
    if (rule.has?.some((condition) => !condition.key || !(condition.key in query)))
      continue;

    // `newUrl` is only the pathname; anything the destination or the incoming request
    // contributes to the query comes back separately in `destQuery`, and both halves
    // together are the URL the browser is sent to.
    const { newUrl, destQuery } = prepareDestination({
      appendParamsToQuery: false,
      destination: rule.destination,
      params,
      query,
    });
    // Next also carries the incoming query across to the destination, which is what
    // keeps `?draft=` alive on its way to the resume route. `destQuery` is applied on
    // top, so a value the destination names itself wins.
    const search = new URLSearchParams({
      ...query,
      ...Object.fromEntries(
        Object.entries(destQuery).flatMap(([key, value]) =>
          value === undefined
            ? []
            : [[key, Array.isArray(value) ? value[0] : value] as [string, string]],
        ),
      ),
    }).toString();
    return search ? `${newUrl}?${search}` : newUrl;
  }
  return null;
}

describe("Host V1 compatibility redirects", () => {
  it.each([
    ["/host/v2", "/host"],
    ["/host/v2/listings", "/host/listings"],
    ["/host/v2/listings/listing-1/pricing", "/host/listings/listing-1/pricing"],
    ["/host/listings/new", "/host/start/new"],
    ["/host/listings/new?draft=draft-1", "/host/start/resume?draft=draft-1"],
    ["/host/listings/listing-1/edit", "/host/listings/listing-1"],
    ["/host/listings/listing-1/promotion", "/host/calendar?listing=listing-1"],
    ["/host/bookings", "/host/reservations"],
    ["/host/bookings/booking-1", "/host/reservations/booking-1"],
    ["/host/inbox", "/host/messages"],
    ["/host/inbox/conversation-1", "/host/messages/conversation-1"],
    ["/host/mobile", "/host"],
  ])("sends %s to %s", (from, to) => {
    expect(resolve(from)).toBe(to);
  });

  /*
   * The destinations live under `/host` themselves, so an over-broad source would
   * redirect the panel into itself and loop. `/admin` is a separate product that is not
   * being retired and must never be matched here.
   */
  it.each([
    "/host",
    "/host/listings",
    "/host/listings/listing-1/pricing",
    "/host/calendar",
    "/host/reservations/booking-1",
    "/host/messages/conversation-1",
    "/host/panel",
    "/host/start",
    "/host/start/property-type",
    "/host/start/resume",
    "/host/start/new",
    "/admin",
    "/admin/listings",
    "/admin/bookings",
    "/account/bookings",
    "/properties/sunny-loft",
    "/",
  ])("leaves %s alone", (path) => {
    expect(resolve(path)).toBeNull();
  });

  it("never sends anything back into the classic panel", () => {
    for (const rule of hostV1Redirects) {
      expect(rule.destination).not.toMatch(/^\/host\/(v2|bookings|inbox|mobile)\b/);
    }
  });

  it("uses temporary redirects, so none of this is cached into a browser forever", () => {
    for (const rule of hostV1Redirects) {
      expect(rule).toMatchObject({ permanent: false });
    }
  });
});

function rewrite(pathname: string): string | null {
  for (const rule of hostCanonicalRewrites) {
    const params = getPathMatch(rule.source, { removeUnnamedParams: true })(pathname);
    if (params === false) continue;
    return prepareDestination({
      appendParamsToQuery: false,
      destination: rule.destination,
      params,
      query: {},
    }).newUrl;
  }
  return null;
}

describe("canonical Host URL rewrites", () => {
  it.each([
    ["/host", "/host/v2"],
    ["/host/calendar", "/host/v2/calendar"],
    ["/host/listings", "/host/v2/listings"],
    ["/host/listings/listing-1", "/host/v2/listings/listing-1"],
    ["/host/listings/listing-1/pricing", "/host/v2/listings/listing-1/pricing"],
    ["/host/reservations", "/host/v2/reservations"],
    ["/host/reservations/booking-1", "/host/v2/reservations/booking-1"],
    ["/host/messages", "/host/v2/messages"],
    ["/host/messages/conversation-1", "/host/v2/messages/conversation-1"],
  ])("serves %s from %s without changing the browser URL", (from, internal) => {
    expect(rewrite(from)).toBe(internal);
  });

  it.each([
    "/host/v2",
    "/host/start/new",
    "/host/panel",
    "/admin",
    "/account/bookings",
    "/",
  ])("does not rewrite %s", (path) => {
    expect(rewrite(path)).toBeNull();
  });
});
