import { describe, expect, it } from "vitest";
import {
  facebookPropertyShareUrl,
  formatAvailabilityRange,
  formatCheckedOnDate,
  normalizeShareDescription,
  promotionPostText,
  propertyShareUrl,
} from "@/lib/facebook-share";

describe("facebookPropertyShareUrl", () => {
  it("shares the public property page rather than a private host URL", () => {
    const result = new URL(
      facebookPropertyShareUrl(
        "https://lingerhomes.com",
        "mimis-apartments",
      ),
    );

    expect(result.origin).toBe("https://www.facebook.com");
    expect(result.pathname).toBe("/sharer/sharer.php");
    expect(result.searchParams.get("u")).toBe(
      "https://lingerhomes.com/properties/mimis-apartments",
    );
  });

  it("encodes a defensive non-slug value as one path segment", () => {
    const result = new URL(
      facebookPropertyShareUrl("https://lingerhomes.com", "villa/../../host"),
    );

    expect(result.searchParams.get("u")).toBe(
      "https://lingerhomes.com/properties/villa%2F..%2F..%2Fhost",
    );
  });

  it("shares the host-selected stay when both dates are present", () => {
    const result = new URL(
      facebookPropertyShareUrl("https://lingerhomes.com", "mimis-apartments", {
        checkIn: "2026-10-01",
        checkOut: "2026-10-08",
      }),
    );
    const propertyUrl = new URL(result.searchParams.get("u") ?? "");

    expect(propertyUrl.searchParams.get("checkIn")).toBe("2026-10-01");
    expect(propertyUrl.searchParams.get("checkOut")).toBe("2026-10-08");
  });
});

describe("propertyShareUrl", () => {
  it("carries the promoted stay so the guest lands with those dates selected", () => {
    const result = new URL(
      propertyShareUrl({
        origin: "https://lingerhomes.com",
        slug: "slice-of-paradise",
        checkIn: "2026-10-01",
        checkOut: "2026-10-08",
      }),
    );

    expect(result.pathname).toBe("/properties/slice-of-paradise");
    expect(result.searchParams.get("checkIn")).toBe("2026-10-01");
    expect(result.searchParams.get("checkOut")).toBe("2026-10-08");
  });

  it("stays a plain property link when no dates were chosen", () => {
    expect(
      propertyShareUrl({
        origin: "https://lingerhomes.com",
        slug: "slice-of-paradise",
      }),
    ).toBe("https://lingerhomes.com/properties/slice-of-paradise");
  });

  it("omits a half-picked stay rather than seeding one open end", () => {
    // The property page only seeds a stay when both ends are present, so a lone
    // checkIn would be a parameter the destination silently discards.
    expect(
      propertyShareUrl({
        origin: "https://lingerhomes.com",
        slug: "slice-of-paradise",
        checkIn: "2026-10-01",
        checkOut: null,
      }),
    ).toBe("https://lingerhomes.com/properties/slice-of-paradise");
  });
});

describe("normalizeShareDescription", () => {
  it("flattens the line breaks a textarea description arrives with", () => {
    expect(
      normalizeShareDescription("A bright home\n\n  with a terrace   by the sea. "),
    ).toBe("A bright home with a terrace by the sea.");
  });

  it("truncates on a word boundary and marks the cut", () => {
    const result = normalizeShareDescription(
      "Sea view apartment with a private terrace and parking",
      20,
    );

    expect(result).toBe("Sea view apartment…");
    expect(result.length).toBeLessThanOrEqual(21);
  });

  it("falls back to a hard cut when there is no word boundary to use", () => {
    expect(normalizeShareDescription("a".repeat(40), 10)).toBe(`${"a".repeat(10)}…`);
  });
});

describe("promotionPostText", () => {
  const base = {
    title: "Slice of Paradise",
    description: "A bright home\n\nwith a terrace by the sea.",
    callToAction: "Check availability and send an inquiry:",
    propertyUrl: "https://lingerhomes.com/properties/slice-of-paradise",
  };

  it("builds a minimal post from the listing alone", () => {
    expect(promotionPostText(base)).toBe(
      "Slice of Paradise\n\n" +
        "A bright home with a terrace by the sea.\n\n" +
        "Check availability and send an inquiry:\n\n" +
        "https://lingerhomes.com/properties/slice-of-paradise",
    );
  });

  it("keeps the availability line and its freshness statement in one block", () => {
    const result = promotionPostText({
      ...base,
      customMessage: "  Last-minute opening!  ",
      guestsLine: "👥 Sleeps up to 4 guests",
      priceLine: "💶 From €80 per night",
      availabilityLine: "📅 Available: 1–8 October",
      freshnessLine: "Availability checked 30 August — dates can be taken at any time.",
    });

    expect(result).toBe(
      "Last-minute opening!\n\n" +
        "Slice of Paradise\n\n" +
        "A bright home with a terrace by the sea.\n\n" +
        "👥 Sleeps up to 4 guests\n💶 From €80 per night\n\n" +
        "📅 Available: 1–8 October\n" +
        "Availability checked 30 August — dates can be taken at any time.\n\n" +
        "Check availability and send an inquiry:\n\n" +
        "https://lingerhomes.com/properties/slice-of-paradise",
    );
  });

  it("never invents availability: an omitted range leaves no trace in the post", () => {
    const result = promotionPostText({ ...base, guestsLine: "👥 Sleeps up to 4 guests" });

    expect(result).not.toContain("Available");
    expect(result).not.toContain("\n\n\n");
  });
});

describe("formatAvailabilityRange", () => {
  it("names the month once when the range stays inside it", () => {
    expect(formatAvailabilityRange("2026-10-01", "2026-10-08", "en-GB")).toBe(
      "1–8 October",
    );
  });

  it("names both months when the range crosses one", () => {
    expect(formatAvailabilityRange("2026-09-28", "2026-10-03", "en-GB")).toBe(
      "28 September – 3 October",
    );
  });

  it("returns nothing for a value that is not a calendar date", () => {
    expect(formatAvailabilityRange("not-a-date", "2026-10-08", "en-GB")).toBe("");
  });
});

describe("formatCheckedOnDate", () => {
  it("states the day availability was confirmed", () => {
    expect(formatCheckedOnDate("2026-08-30", "en-GB")).toBe("30 August");
  });
});
