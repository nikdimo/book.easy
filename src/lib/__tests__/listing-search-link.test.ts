import { describe, expect, it } from "vitest";
import { listingSearchLinkQuery } from "@/lib/fixed-stay-options";

describe("listing search links", () => {
  const search =
    "city=Ohrid&checkIn=2029-06-09&checkOut=2029-06-30&adults=2&children=1";

  it.each(["FLEXIBLE", "FIXED_STAYS"])(
    "preserves searched dates and guests in %s mode",
    (bookingMode) => {
      expect(listingSearchLinkQuery(search, { bookingMode })).toBe(search);
    },
  );

  it("preserves an empty search", () => {
    expect(listingSearchLinkQuery(undefined, { bookingMode: "FIXED_STAYS" })).toBe("");
  });

  it("does not replace weekly dates with a legacy period id", () => {
    expect(
      listingSearchLinkQuery(search, {
        bookingMode: "FIXED_STAYS",
        matchedFixedStayPeriodId: "legacy-period",
      }),
    ).toBe(search);
  });
});
