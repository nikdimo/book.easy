import { describe, expect, it } from "vitest";
import {
  defaultFeedName,
  platformFromFeedUrl,
} from "@/lib/host/v2/calendar-feed-platform";

describe("platformFromFeedUrl", () => {
  it("reads the channel from the host that served the file", () => {
    expect(
      platformFromFeedUrl("https://www.airbnb.com/calendar/ical/123.ics?s=abc"),
    ).toBe("AIRBNB");
    expect(
      platformFromFeedUrl("https://admin.booking.com/hotel/ical.html?t=xyz"),
    ).toBe("BOOKING");
    expect(platformFromFeedUrl("https://www.vrbo.com/icalendar/abc.ics")).toBe(
      "VRBO",
    );
  });

  it("matches a regional domain the same channel serves", () => {
    // Airbnb hands a host whichever country domain they signed up on, so the ending is
    // read as an ending rather than enumerated.
    expect(
      platformFromFeedUrl("https://www.airbnb.co.uk/calendar/ical/1.ics"),
    ).toBe("AIRBNB");
    expect(platformFromFeedUrl("https://www.airbnb.com.au/calendar/1.ics")).toBe(
      "AIRBNB",
    );
    expect(platformFromFeedUrl("https://www.airbnb.de/calendar/1.ics")).toBe(
      "AIRBNB",
    );
  });

  it("knows Vrbo's European sites by the names they still use", () => {
    expect(platformFromFeedUrl("https://www.abritel.fr/icalendar/1.ics")).toBe(
      "VRBO",
    );
    expect(platformFromFeedUrl("https://www.fewo-direkt.de/icalendar/1.ics")).toBe(
      "VRBO",
    );
  });

  it("refuses a channel name that is not the registered domain", () => {
    // The word is in the host, but the site is example.com's.
    expect(platformFromFeedUrl("https://booking.example.com/ical/1.ics")).toBeNull();
  });

  it("refuses a lookalike host", () => {
    // The suffix has to be the host itself or a subdomain of it, or "notairbnb.com"
    // would wear someone else's name.
    expect(platformFromFeedUrl("https://notairbnb.com/ical/1.ics")).toBeNull();
    expect(platformFromFeedUrl("https://airbnb.com.example.net/1.ics")).toBeNull();
  });

  it("ignores the word appearing anywhere but the host", () => {
    expect(
      platformFromFeedUrl("https://sync.example.com/airbnb/calendar.ics"),
    ).toBeNull();
  });

  it("has no answer for a missing or malformed url", () => {
    expect(platformFromFeedUrl(null)).toBeNull();
    expect(platformFromFeedUrl("not a url")).toBeNull();
  });
});

describe("defaultFeedName", () => {
  it("names a calendar after the channel that served it", () => {
    expect(defaultFeedName("https://www.airbnb.com/calendar/ical/1.ics")).toBe(
      "Airbnb",
    );
    expect(defaultFeedName("https://admin.booking.com/hotel/ical.html?t=1")).toBe(
      "Booking.com",
    );
  });

  it("still gives an unrecognised link something to be called", () => {
    // Not a failure: plenty of small channels and property managers publish a feed,
    // and the row needs a name whether or not this knows whose it is.
    expect(defaultFeedName("https://pms.example.com/ical/1.ics")).toBe(
      "Connected calendar",
    );
  });
});
