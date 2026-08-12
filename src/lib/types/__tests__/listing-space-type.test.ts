import { describe, expect, it } from "vitest";
import {
  LISTING_SPACE_TYPES,
  allowedListingSpaceTypes,
  spaceTypeForPropertyType,
} from "@/lib/types/listing-space-type";
import { normalizePropertyType } from "@/lib/types/property-type";

const values = (options: { value: string }[]) => options.map((o) => o.value);

describe("allowedListingSpaceTypes", () => {
  it("offers every option for a hotel", () => {
    expect(values(allowedListingSpaceTypes("HOTEL"))).toEqual(
      values([...LISTING_SPACE_TYPES])
    );
  });

  it("drops Hotel room for property types that are not hotels", () => {
    expect(values(allowedListingSpaceTypes("CABIN"))).not.toContain("HOTEL_ROOM");
    expect(values(allowedListingSpaceTypes("APARTMENT"))).toEqual([
      "ENTIRE_PLACE",
      "PRIVATE_ROOM",
      "SHARED_ROOM",
    ]);
  });

  it("keeps a listing's existing answer visible even once the rules exclude it", () => {
    expect(values(allowedListingSpaceTypes("CABIN", "HOTEL_ROOM"))).toContain(
      "HOTEL_ROOM"
    );
  });

  it("treats a missing property type as not-a-hotel", () => {
    expect(values(allowedListingSpaceTypes(undefined))).not.toContain("HOTEL_ROOM");
    expect(values(allowedListingSpaceTypes(""))).not.toContain("HOTEL_ROOM");
  });
});

describe("spaceTypeForPropertyType", () => {
  it("answers the question for a hotel", () => {
    expect(spaceTypeForPropertyType("HOTEL", "")).toBe("HOTEL_ROOM");
    expect(spaceTypeForPropertyType("HOTEL", "PRIVATE_ROOM")).toBe("HOTEL_ROOM");
  });

  it("leaves a hotel host who rents the whole building alone", () => {
    expect(spaceTypeForPropertyType("HOTEL", "ENTIRE_PLACE")).toBe("ENTIRE_PLACE");
    expect(spaceTypeForPropertyType("HOTEL", "HOTEL_ROOM")).toBe("HOTEL_ROOM");
  });

  it("clears Hotel room when the host switches away from a hotel", () => {
    expect(spaceTypeForPropertyType("CABIN", "HOTEL_ROOM")).toBe("ENTIRE_PLACE");
  });

  it("preserves every other answer across a property type change", () => {
    expect(spaceTypeForPropertyType("CABIN", "PRIVATE_ROOM")).toBe("PRIVATE_ROOM");
    expect(spaceTypeForPropertyType("VILLA", "SHARED_ROOM")).toBe("SHARED_ROOM");
  });
});

describe("normalizePropertyType", () => {
  it("follows a merged code to the type that replaced it", () => {
    expect(normalizePropertyType("DETACHED_HOUSE")).toBe("HOUSE");
  });

  it("leaves live codes and emptiness alone", () => {
    expect(normalizePropertyType("HOTEL")).toBe("HOTEL");
    expect(normalizePropertyType("ROW_HOUSE")).toBe("ROW_HOUSE");
    expect(normalizePropertyType(undefined)).toBe("");
    expect(normalizePropertyType("")).toBe("");
  });
});
