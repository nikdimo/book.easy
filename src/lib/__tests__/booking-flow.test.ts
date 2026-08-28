import { describe, expect, it } from "vitest";
import { applyPetPolicy, guestStepDestination } from "@/lib/booking-flow";

describe("guestStepDestination", () => {
  it("returns listing guests to dates until the stay is valid", () => {
    expect(guestStepDestination(true, false)).toBe("dates");
  });

  it("advances a valid listing stay to review", () => {
    expect(guestStepDestination(true, true)).toBe("review");
  });

  it("leaves search to its caller because search has no review step", () => {
    expect(guestStepDestination(false, false)).toBeNull();
  });
});

describe("applyPetPolicy", () => {
  const party = { adults: 2, children: 0, infants: 1, pets: 2 };

  it("drops pets a listing does not take, leaving the rest of the party alone", () => {
    expect(applyPetPolicy(party, false)).toEqual({ ...party, pets: 0 });
  });

  it("leaves the party untouched where pets are allowed", () => {
    expect(applyPetPolicy(party, true)).toBe(party);
  });

  it("returns the same object when there is no pet to drop", () => {
    const petless = { ...party, pets: 0 };
    expect(applyPetPolicy(petless, false)).toBe(petless);
  });
});
