import { describe, expect, it } from "vitest";
import {
  ARRIVAL_CREDENTIAL_RELEASE_HOURS,
  ARRIVAL_FIELD_VISIBILITY,
  ARRIVAL_GUIDE_TOPICS,
  CHECKOUT_INSTRUCTION_KINDS,
  DIRECTIONS_MAX,
  HOUSE_MANUAL_MAX,
  arrivalGuideFromRow,
  arrivalGuideRowData,
  arrivalTopicAnswered,
  canSeeArrivalField,
  checkInMethodNeedsCode,
  emptyListingArrivalGuide,
  findArrivalGuideTopic,
  listingArrivalGuidePayloadIssues,
  normalizeCheckoutInstructions,
  normalizeListingArrivalGuide,
  sameListingArrivalGuide,
  type ListingArrivalGuideInput,
} from "@/lib/host/v2/listing-arrival-guide";

const FILLED: ListingArrivalGuideInput = {
  directions: "Second gate past the bakery.",
  checkInMethod: "KEYPAD",
  checkInMethodInstructions: "The keypad code is 4821.",
  wifiNetwork: "Villa-Guest",
  wifiPassword: "correct horse battery",
  houseManual: "The boiler switch is behind the kitchen door.",
  checkoutInstructions: [{ kind: "LOCK_UP", note: "" }],
  interactionPreference: "SAY_HELLO",
};

const CHECK_IN = new Date("2026-10-01T00:00:00.000Z");
const HOUR = 60 * 60 * 1000;

describe("topics", () => {
  it("has a unique slug for every card", () => {
    const slugs = ARRIVAL_GUIDE_TOPICS.map((topic) => topic.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("does not recognise a slug it does not have", () => {
    expect(findArrivalGuideTopic("guidebook")).toBeUndefined();
    expect(findArrivalGuideTopic("wifi-details")).toBeDefined();
  });
});

describe("visibility", () => {
  it("keeps the credentials off every public surface", () => {
    expect(ARRIVAL_FIELD_VISIBILITY.wifiPassword).toBe("PRE_ARRIVAL");
    expect(ARRIVAL_FIELD_VISIBILITY.checkInMethodInstructions).toBe("PRE_ARRIVAL");
    expect(ARRIVAL_FIELD_VISIBILITY.directions).toBe("BOOKED");
  });

  it("shows a public field to somebody with no booking at all", () => {
    expect(canSeeArrivalField("checkoutInstructions", null)).toBe(true);
    expect(canSeeArrivalField("interactionPreference", null)).toBe(true);
    expect(canSeeArrivalField("checkInMethod", null)).toBe(true);
  });

  it("shows nothing gated to somebody with no booking", () => {
    expect(canSeeArrivalField("directions", null)).toBe(false);
    expect(canSeeArrivalField("wifiPassword", null)).toBe(false);
  });

  it("waits for the booking to be confirmed, not merely requested", () => {
    const pending = { status: "PENDING", checkIn: CHECK_IN };
    expect(canSeeArrivalField("directions", pending, CHECK_IN)).toBe(false);

    const confirmed = { status: "CONFIRMED", checkIn: CHECK_IN };
    expect(canSeeArrivalField("directions", confirmed, CHECK_IN)).toBe(true);
  });

  it("releases credentials exactly at the boundary, not a minute before", () => {
    const booking = { status: "CONFIRMED", checkIn: CHECK_IN };
    const boundary = new Date(
      CHECK_IN.getTime() - ARRIVAL_CREDENTIAL_RELEASE_HOURS * HOUR,
    );

    expect(canSeeArrivalField("wifiPassword", booking, boundary)).toBe(true);
    expect(
      canSeeArrivalField("wifiPassword", booking, new Date(boundary.getTime() - 1)),
    ).toBe(false);
  });

  it("takes everything back when the stay is cancelled", () => {
    for (const status of ["CANCELLED", "DECLINED", "EXPIRED"]) {
      const booking = { status, checkIn: CHECK_IN };
      expect(canSeeArrivalField("directions", booking, CHECK_IN)).toBe(false);
      expect(canSeeArrivalField("wifiPassword", booking, CHECK_IN)).toBe(false);
    }
  });
});

describe("normalising", () => {
  it("leaves a filled guide alone", () => {
    expect(normalizeListingArrivalGuide(FILLED)).toEqual(FILLED);
  });

  it("drops instructions that belong to no method", () => {
    const orphan = normalizeListingArrivalGuide({
      ...FILLED,
      checkInMethod: null,
    });

    expect(orphan.checkInMethodInstructions).toBe("");
  });

  it("keeps the spaces inside a password and trims only the ends", () => {
    const guide = normalizeListingArrivalGuide({
      ...FILLED,
      wifiPassword: "  two  spaces  ",
      wifiNetwork: "  Villa   Guest  ",
    });

    expect(guide.wifiPassword).toBe("two  spaces");
    // An SSID is one token; a stray newline off a router label is noise.
    expect(guide.wifiNetwork).toBe("Villa Guest");
  });

  it("clips text to its documented limit rather than refusing to store anything", () => {
    const guide = normalizeListingArrivalGuide({
      ...FILLED,
      directions: "x".repeat(DIRECTIONS_MAX + 50),
      houseManual: "y".repeat(HOUSE_MANUAL_MAX + 50),
    });

    expect(guide.directions).toHaveLength(DIRECTIONS_MAX);
    expect(guide.houseManual).toHaveLength(HOUSE_MANUAL_MAX);
  });

  it("normalises an unrecognised choice to unanswered", () => {
    const guide = normalizeListingArrivalGuide({
      ...FILLED,
      checkInMethod: "FRONT_DESK" as never,
      interactionPreference: "CHATTY" as never,
    });

    expect(guide.checkInMethod).toBeNull();
    expect(guide.interactionPreference).toBeNull();
  });
});

describe("checkout instructions", () => {
  it("drops anything that is not a known instruction", () => {
    expect(
      normalizeCheckoutInstructions([
        { kind: "LOCK_UP", note: "" },
        { kind: "WATER_THE_PLANTS", note: "please" },
        "not an object",
        null,
      ]),
    ).toEqual([{ kind: "LOCK_UP", note: "" }]);
  });

  it("never lists the same instruction twice", () => {
    expect(
      normalizeCheckoutInstructions([
        { kind: "LOCK_UP", note: "first" },
        { kind: "LOCK_UP", note: "second" },
      ]),
    ).toEqual([{ kind: "LOCK_UP", note: "first" }]);
  });

  it("drops a free-text request with nothing written in it", () => {
    expect(
      normalizeCheckoutInstructions([{ kind: "ADDITIONAL_REQUESTS", note: "   " }]),
    ).toEqual([]);
  });

  it("stores them in the catalog's order, whatever order they were added in", () => {
    const reversed = [...CHECKOUT_INSTRUCTION_KINDS]
      .filter((kind) => kind !== "ADDITIONAL_REQUESTS")
      .reverse()
      .map((kind) => ({ kind, note: "" }));

    expect(normalizeCheckoutInstructions(reversed).map((entry) => entry.kind)).toEqual(
      CHECKOUT_INSTRUCTION_KINDS.filter((kind) => kind !== "ADDITIONAL_REQUESTS"),
    );
  });

  it("reads a column that holds something it does not understand as empty", () => {
    expect(normalizeCheckoutInstructions(null)).toEqual([]);
    expect(normalizeCheckoutInstructions({ kind: "LOCK_UP" })).toEqual([]);
    expect(normalizeCheckoutInstructions("[]")).toEqual([]);
  });
});

describe("payload issues", () => {
  it("accepts a guide the editor could have produced", () => {
    expect(listingArrivalGuidePayloadIssues(FILLED)).toEqual({});
    expect(listingArrivalGuidePayloadIssues(emptyListingArrivalGuide())).toEqual({});
  });

  it("refuses a choice this build does not have rather than reading it as unanswered", () => {
    expect(
      listingArrivalGuidePayloadIssues({
        ...FILLED,
        checkInMethod: "FRONT_DESK" as never,
      }).checkInMethod,
    ).toBe("NOT_A_CHOICE");
  });

  it("refuses text past its limit", () => {
    expect(
      listingArrivalGuidePayloadIssues({
        ...FILLED,
        houseManual: "y".repeat(HOUSE_MANUAL_MAX + 1),
      }).houseManual,
    ).toBe("TOO_LONG");
  });

  it("refuses a code that belongs to no method", () => {
    expect(
      listingArrivalGuidePayloadIssues({
        ...FILLED,
        checkInMethod: null,
      }).checkInMethodInstructions,
    ).toBe("CODE_WITHOUT_METHOD");
  });
});

describe("rows", () => {
  it("round-trips a stored row through the controls and back", () => {
    const row = arrivalGuideRowData(FILLED);
    expect(arrivalGuideFromRow(row)).toEqual(FILLED);
  });

  it("writes NULL, not an empty string, for everything unanswered", () => {
    const row = arrivalGuideRowData(emptyListingArrivalGuide());

    expect(row.directions).toBeNull();
    expect(row.wifiPassword).toBeNull();
    expect(row.checkInMethod).toBeNull();
  });

  it("reads a listing with no row at all as an empty guide", () => {
    expect(arrivalGuideFromRow(null)).toEqual(emptyListingArrivalGuide());
  });
});

describe("comparison and summaries", () => {
  it("notices a change to any field", () => {
    expect(sameListingArrivalGuide(FILLED, FILLED)).toBe(true);
    expect(
      sameListingArrivalGuide(FILLED, { ...FILLED, wifiPassword: "something else" }),
    ).toBe(false);
    expect(
      sameListingArrivalGuide(FILLED, { ...FILLED, checkoutInstructions: [] }),
    ).toBe(false);
  });

  it("knows which cards still need filling in", () => {
    const empty = emptyListingArrivalGuide();

    expect(arrivalTopicAnswered("directions", empty)).toBe(false);
    expect(arrivalTopicAnswered("directions", FILLED)).toBe(true);
    expect(arrivalTopicAnswered("wifi-details", empty)).toBe(false);
    // The three cards that summarise themselves from elsewhere are never "unanswered".
    expect(arrivalTopicAnswered("check-in-checkout", empty)).toBe(true);
    expect(arrivalTopicAnswered("house-rules", empty)).toBe(true);
  });

  it("asks for a code only where one is what opens the door", () => {
    expect(checkInMethodNeedsCode("KEYPAD")).toBe(true);
    expect(checkInMethodNeedsCode("LOCKBOX")).toBe(true);
    expect(checkInMethodNeedsCode("IN_PERSON")).toBe(false);
    expect(checkInMethodNeedsCode(null)).toBe(false);
  });
});
