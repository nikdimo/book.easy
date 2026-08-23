import { describe, expect, it } from "vitest";
import { listingPropertyDetailsComplete, listingPropertyDetailsIssues } from "../listing-property-details";

const valid = { propertyType: "HOUSE", spaceType: "ENTIRE_PLACE" as const, bedrooms: 2, beds: 3, bathrooms: 1 };

describe("property details validation", () => {
  it("accepts the existing listing fields", () => {
    expect(listingPropertyDetailsIssues(valid)).toEqual({});
    expect(listingPropertyDetailsComplete(valid)).toBe(true);
  });
  it("reports every invalid count and selection", () => {
    expect(listingPropertyDetailsIssues({ ...valid, propertyType: " ", bedrooms: -1, beds: 41, bathrooms: 1.5 })).toEqual({
      propertyType: "REQUIRED", bedrooms: "OUT_OF_RANGE", beds: "OUT_OF_RANGE", bathrooms: "INVALID",
    });
  });
});
