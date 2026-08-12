import { describe, expect, it } from "vitest";
import { buildIcs, parseIcs } from "@/lib/calendar-sync/ics";

const AT = new Date("2026-08-12T09:30:00Z");

describe("buildIcs", () => {
  it("writes an all-day VEVENT per range with CRLF line endings", () => {
    const ics = buildIcs({
      calendarName: "Slice of Paradise",
      now: AT,
      events: [
        {
          uid: "block-abc@lingerhomes.com",
          startYmd: "2026-08-20",
          endYmd: "2026-08-23",
          summary: "Reserved",
        },
      ],
    });

    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART;VALUE=DATE:20260820");
    expect(ics).toContain("DTEND;VALUE=DATE:20260823");
    expect(ics).toContain("DTSTAMP:20260812T093000Z");
    expect(ics).toContain("UID:block-abc@lingerhomes.com");
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  });

  it("never leaks anything but dates", () => {
    const ics = buildIcs({
      calendarName: "Slice of Paradise",
      now: AT,
      events: [
        { uid: "block-1@x", startYmd: "2026-08-20", endYmd: "2026-08-21", summary: "Reserved" },
      ],
    });
    expect(ics).not.toMatch(/ATTENDEE|ORGANIZER|DESCRIPTION|GEO|LOCATION/);
  });

  it("escapes reserved characters in text values", () => {
    const ics = buildIcs({
      calendarName: "Sea view; big, bright",
      now: AT,
      events: [],
    });
    expect(ics).toContain("X-WR-CALNAME:Sea view\\; big\\, bright");
  });

  it("folds content lines longer than 75 octets", () => {
    const ics = buildIcs({
      calendarName: "x".repeat(200),
      now: AT,
      events: [],
    });
    for (const line of ics.split("\r\n")) {
      expect(Buffer.from(line, "utf8").length).toBeLessThanOrEqual(75);
    }
  });

  it("round-trips through the parser", () => {
    const ics = buildIcs({
      calendarName: "Slice of Paradise",
      now: AT,
      events: [
        { uid: "block-1@x", startYmd: "2026-08-20", endYmd: "2026-08-23", summary: "Reserved" },
        { uid: "block-2@x", startYmd: "2026-09-01", endYmd: "2026-09-02", summary: "Not available" },
      ],
    });

    expect(parseIcs(ics)).toEqual([
      { uid: "block-1@x", startYmd: "2026-08-20", endYmd: "2026-08-23", summary: "Reserved" },
      { uid: "block-2@x", startYmd: "2026-09-01", endYmd: "2026-09-02", summary: "Not available" },
    ]);
  });
});

describe("parseIcs", () => {
  /** Shaped like a real Airbnb export, which is the feed this was written against. */
  const AIRBNB = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Airbnb Inc//Hosting Calendar 1.0.0//EN",
    "CALSCALE:GREGORIAN",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "DTEND;VALUE=DATE:20260823",
    "DTSTART;VALUE=DATE:20260820",
    "UID:1483168995586489070-abc@airbnb.com",
    "SUMMARY:Reserved",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "DTEND;VALUE=DATE:20260902",
    "DTSTART;VALUE=DATE:20260901",
    "UID:1483168995586489070-def@airbnb.com",
    "SUMMARY:Airbnb (Not available)",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  it("reads all-day events with exclusive end dates", () => {
    expect(parseIcs(AIRBNB)).toEqual([
      {
        uid: "1483168995586489070-abc@airbnb.com",
        startYmd: "2026-08-20",
        endYmd: "2026-08-23",
        summary: "Reserved",
      },
      {
        uid: "1483168995586489070-def@airbnb.com",
        startYmd: "2026-09-01",
        endYmd: "2026-09-02",
        summary: "Airbnb (Not available)",
      },
    ]);
  });

  it("treats a DATE-TIME checkout as the first free night", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:booking-9@example.com",
      "DTSTART;TZID=Europe/Skopje:20260820T150000",
      "DTEND;TZID=Europe/Skopje:20260823T110000",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    expect(parseIcs(ics)[0]).toMatchObject({ startYmd: "2026-08-20", endYmd: "2026-08-23" });
  });

  it("gives a single night to same-day, missing and reversed end dates", () => {
    const event = (extra: string) =>
      ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "DTSTART;VALUE=DATE:20260820", extra, "END:VEVENT", "END:VCALENDAR"]
        .filter(Boolean)
        .join("\r\n");

    for (const extra of ["", "DTEND;VALUE=DATE:20260820", "DTEND;VALUE=DATE:20260819"]) {
      expect(parseIcs(event(extra))[0]).toMatchObject({
        startYmd: "2026-08-20",
        endYmd: "2026-08-21",
      });
    }
  });

  it("unfolds continuation lines", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:very-long-identifier-that-the-exporter-had-to-fold-onto-a-second-li",
      " ne@example.com",
      "DTSTART;VALUE=DATE:20260820",
      "DTEND;VALUE=DATE:20260821",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    expect(parseIcs(ics)[0].uid).toBe(
      "very-long-identifier-that-the-exporter-had-to-fold-onto-a-second-line@example.com",
    );
  });

  it("skips cancelled and transparent events", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20260820",
      "DTEND;VALUE=DATE:20260821",
      "STATUS:CANCELLED",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20260825",
      "DTEND;VALUE=DATE:20260826",
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    expect(parseIcs(ics)).toEqual([]);
  });

  it("ignores events with no usable start date, and other components", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VTIMEZONE",
      "TZID:Europe/Skopje",
      "BEGIN:STANDARD",
      "DTSTART:19701025T030000",
      "END:STANDARD",
      "END:VTIMEZONE",
      "BEGIN:VEVENT",
      "UID:broken@example.com",
      "DTSTART;VALUE=DATE:not-a-date",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:good@example.com",
      "DTSTART;VALUE=DATE:20260820",
      "DTEND;VALUE=DATE:20260821",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    expect(parseIcs(ics).map((event) => event.uid)).toEqual(["good@example.com"]);
  });

  it("unescapes text values", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20260820",
      "DTEND;VALUE=DATE:20260821",
      "SUMMARY:Reserved\\; sea view\\, 2 guests",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    expect(parseIcs(ics)[0].summary).toBe("Reserved; sea view, 2 guests");
  });

  it("tolerates bare-LF documents and an empty calendar", () => {
    expect(parseIcs("BEGIN:VCALENDAR\nEND:VCALENDAR\n")).toEqual([]);
    expect(parseIcs("")).toEqual([]);
  });
});
