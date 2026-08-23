import { describe, expect, it } from "vitest";
import { listingFormSchema } from "@/lib/validations/listing.schema";
import {
  BATHROOMS_MAX,
  BEDROOMS_MAX,
  BEDS_MAX,
  CAPACITY_BOUNDS,
  MAX_GUESTS_MAX,
  MAX_GUESTS_MIN,
  capacityCountFromDraft,
  clampCapacity,
  listingCapacityComplete,
  listingCapacityIssues,
} from "@/lib/host/v2/listing-capacity";

describe("capacityCountFromDraft", () => {
  it('reads "" as unanswered rather than as zero', () => {
    // The bug this exists for: `Number("")` is a perfectly finite 0, which used to open
    // the guest counter on a value publishing then refused.
    expect(capacityCountFromDraft("", "guests", 1)).toBe(1);
    expect(capacityCountFromDraft("   ", "guests", 1)).toBe(1);
    expect(capacityCountFromDraft(undefined, "guests", 1)).toBe(1);
  });

  it("keeps a real stored count", () => {
    expect(capacityCountFromDraft("4", "guests", 1)).toBe(4);
    expect(capacityCountFromDraft("0", "bedrooms", 1)).toBe(0);
  });

  it("falls back when the stored value is not a number at all", () => {
    expect(capacityCountFromDraft("many", "beds", 2)).toBe(2);
  });

  it("clamps a stored count that is out of range", () => {
    expect(capacityCountFromDraft("999", "guests", 1)).toBe(MAX_GUESTS_MAX);
    expect(capacityCountFromDraft("-3", "bedrooms", 1)).toBe(0);
  });
});

describe("clampCapacity", () => {
  it("keeps each field inside its own bounds", () => {
    expect(clampCapacity(0, "guests")).toBe(MAX_GUESTS_MIN);
    expect(clampCapacity(99, "bedrooms")).toBe(BEDROOMS_MAX);
    expect(clampCapacity(99, "beds")).toBe(BEDS_MAX);
    expect(clampCapacity(99, "bathrooms")).toBe(BATHROOMS_MAX);
  });
});

describe("listingCapacityIssues", () => {
  const valid = { guests: 2, bedrooms: 1, beds: 1, bathrooms: 1 };

  it("passes a capacity the publish schema accepts", () => {
    expect(listingCapacityIssues(valid)).toEqual({});
    expect(listingCapacityComplete(valid)).toBe(true);
  });

  it("refuses zero guests, which the schema also refuses", () => {
    expect(listingCapacityIssues({ ...valid, guests: 0 })).toEqual({ guests: "TOO_LOW" });
  });

  it("refuses counts above the schema's ceilings", () => {
    expect(listingCapacityIssues({ ...valid, guests: 21 })).toEqual({ guests: "TOO_HIGH" });
    expect(listingCapacityIssues({ ...valid, beds: 41 })).toEqual({ beds: "TOO_HIGH" });
  });

  it("refuses a fractional or unparseable count", () => {
    expect(listingCapacityIssues({ ...valid, bedrooms: 1.5 })).toEqual({
      bedrooms: "NOT_A_NUMBER",
    });
    expect(listingCapacityIssues({ ...valid, beds: Number.NaN })).toEqual({
      beds: "NOT_A_NUMBER",
    });
  });
});

describe("the bounds are the publish schema's own", () => {
  const base = {
    title: "A place to stay",
    description: "A description that comfortably clears the twenty character minimum.",
    propertyType: "HOUSE",
    spaceType: "ENTIRE_PLACE",
    address: "Partizanska 15",
    city: "Skopje",
    country: "MK",
    latitude: "41.99",
    longitude: "21.42",
    locationSource: "MANUAL_PIN",
    locationConfirmed: "true",
    currency: "EUR",
    baseNightlyRate: "50",
  };

  /** Every bound this module publishes is checked against the schema rather than
   *  restated in the test, so raising one in only one of the two places fails here. */
  for (const [field, key] of [
    ["guests", "maxGuests"],
    ["bedrooms", "bedrooms"],
    ["beds", "beds"],
    ["bathrooms", "bathrooms"],
  ] as const) {
    const { min, max } = CAPACITY_BOUNDS[field];

    it(`agrees with listingFormSchema on ${key}`, () => {
      const counts = { maxGuests: "2", bedrooms: "1", beds: "1", bathrooms: "1" };
      expect(
        listingFormSchema.safeParse({ ...base, ...counts, [key]: String(min) }).success,
      ).toBe(true);
      expect(
        listingFormSchema.safeParse({ ...base, ...counts, [key]: String(max) }).success,
      ).toBe(true);
      expect(
        listingFormSchema.safeParse({ ...base, ...counts, [key]: String(min - 1) }).success,
      ).toBe(false);
      expect(
        listingFormSchema.safeParse({ ...base, ...counts, [key]: String(max + 1) }).success,
      ).toBe(false);
    });
  }
});
