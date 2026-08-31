import { describe, expect, it } from "vitest";
import {
  bookingPartyDetailLine,
  bookingPartyDetailSegments,
  bookingPartyIssues,
  bookingPartyOccupancy,
  bookingPartyPayload,
  bookingPartySegments,
  normalizeBookingParty,
  resolveBookingParty,
} from "@/lib/booking-party";

/**
 * The two rules the whole feature rests on, in isolation from Prisma and React:
 * capacity is adults + children, and a party nobody recorded is not a party of zero.
 */

/** English, no catalog — the fallback path every locale takes for a missing key. */
const translator = {
  locale: "en",
  resolve: (_key: string, source: string) => ({ text: source, translated: false }),
};

describe("booking party capacity", () => {
  it("counts adults and children, and never infants or pets", () => {
    const party = normalizeBookingParty({
      adults: 2,
      children: 1,
      infants: 3,
      pets: 4,
    });
    expect(bookingPartyOccupancy(party)).toBe(3);
  });

  it("defaults the three optional counters to zero, never the adults", () => {
    expect(normalizeBookingParty({ adults: 1 })).toEqual({
      adults: 1,
      children: 0,
      infants: 0,
      pets: 0,
    });
  });
});

describe("booking party validation", () => {
  const base = { adults: 2, children: 0, infants: 0, pets: 0 };

  it("accepts an ordinary party at a pets-allowed listing", () => {
    expect(
      bookingPartyIssues({ ...base, pets: 1 }, { petsAllowed: true }),
    ).toEqual([]);
  });

  it("refuses a party with no adult in it, however many others there are", () => {
    expect(
      bookingPartyIssues(
        { adults: 0, children: 2, infants: 1, pets: 1 },
        { petsAllowed: true },
      ),
    ).toContain("NO_ADULTS");
  });

  it("refuses a pet the listing's house rules do not take", () => {
    expect(
      bookingPartyIssues({ ...base, pets: 1 }, { petsAllowed: false }),
    ).toContain("PETS_NOT_ALLOWED");
  });

  it("leaves a pet-free party alone at a pet-free listing", () => {
    expect(bookingPartyIssues(base, { petsAllowed: false })).toEqual([]);
  });

  it("refuses counts outside the range a listing could ever declare", () => {
    expect(
      bookingPartyIssues({ ...base, infants: 21 }, { petsAllowed: true }),
    ).toContain("COUNT_OUT_OF_RANGE");
    expect(
      bookingPartyIssues(
        { adults: 15, children: 15, infants: 0, pets: 0 },
        { petsAllowed: true },
      ),
    ).toContain("COUNT_OUT_OF_RANGE");
    expect(
      bookingPartyIssues({ ...base, children: 1.5 }, { petsAllowed: true }),
    ).toContain("COUNT_OUT_OF_RANGE");
  });
});

describe("reading a stored party back", () => {
  it("reads a recorded party as recorded", () => {
    expect(
      resolveBookingParty({
        guestCount: 3,
        adults: 2,
        children: 1,
        infants: 1,
        pets: 1,
      }),
    ).toEqual({
      recorded: true,
      guestCount: 3,
      adults: 2,
      children: 1,
      infants: 1,
      pets: 1,
    });
  });

  it("reads a booking taken before the columns existed as unrecorded, not as zeroes", () => {
    const party = resolveBookingParty({
      guestCount: 3,
      adults: null,
      children: null,
      infants: null,
      pets: null,
    });

    expect(party).toEqual({ recorded: false, guestCount: 3 });
    // The distinction that matters: nothing here may claim the guest brought no
    // infant and no pet, because nobody ever asked them.
    expect(bookingPartyDetailSegments(party)).toEqual([]);
    expect(bookingPartyDetailLine(translator, party)).toBeNull();
    expect(bookingPartyPayload(party)).toBeNull();
  });
});

describe("printing a party", () => {
  const recorded = (over: Partial<Record<string, number>> = {}) =>
    resolveBookingParty({
      guestCount: 2,
      adults: 2,
      children: 0,
      infants: 0,
      pets: 0,
      ...over,
    });

  it("leaves out every counter that is zero", () => {
    expect(
      bookingPartySegments({ adults: 2, children: 0, infants: 1, pets: 0 }),
    ).toEqual([
      { kind: "adults", count: 2 },
      { kind: "infants", count: 1 },
    ]);
  });

  it("says nothing when the guest count already said it", () => {
    expect(bookingPartyDetailLine(translator, recorded())).toBeNull();
  });

  it("spells out the party as soon as the count leaves something out", () => {
    expect(
      bookingPartyDetailLine(
        translator,
        recorded({ guestCount: 3, adults: 2, children: 1, infants: 1, pets: 1 }),
      ),
    ).toEqual({ text: "2 adults, 1 child, 1 infant, 1 pet", translated: false });
  });

  it("uses the singular form for a count of one", () => {
    expect(
      bookingPartyDetailLine(
        translator,
        recorded({ guestCount: 1, adults: 1, infants: 1 }),
      )?.text,
    ).toBe("1 adult, 1 infant");
  });
});
