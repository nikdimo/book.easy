import { describe, expect, it } from "vitest";
import {
  applyPetPolicy,
  datesStepDestination,
  guestStepDestination,
} from "@/lib/booking-flow";

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

describe("datesStepDestination", () => {
  it("asks for the party first when it has not been answered", () => {
    expect(datesStepDestination(true, false, true, true)).toBe("guests");
  });

  it("goes on to review rather than back to a party already answered", () => {
    expect(datesStepDestination(true, true, true, true)).toBe("review");
  });

  it("returns to the party when the stay cannot enter review yet", () => {
    expect(datesStepDestination(true, true, true, false)).toBe("guests");
  });

  it("leaves search to its caller once its party is answered", () => {
    expect(datesStepDestination(false, true, false, false)).toBeNull();
  });

  it("keeps search's calendar pointed at its guest step", () => {
    expect(datesStepDestination(true, false, false, false)).toBe("guests");
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
