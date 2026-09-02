import { describe, expect, it } from "vitest";
import {
  FIXED_STAY_PERIOD_PARAM,
  listingSearchLinkQuery,
} from "@/lib/fixed-stay-options";

/**
 * The link a search result carries to its listing page.
 *
 * Two promises here, and they pull in opposite directions. A flexible result's link must
 * be the one it has always been, character for character. A fixed-stay result's must
 * carry the stay it matched *and no dates* — because its page is required to ignore
 * dates, and a range that survived the trip would be a selection the host never offered.
 */

const search = "city=Ohrid&checkIn=2029-06-09&checkOut=2029-06-16&guests=2&adults=2";

const query = (searchQuery: string | undefined, listing: Parameters<typeof listingSearchLinkQuery>[1]) =>
  new URLSearchParams(listingSearchLinkQuery(searchQuery, listing));

describe("a flexible result's link", () => {
  it("is the search query, untouched", () => {
    expect(listingSearchLinkQuery(search, { bookingMode: "FLEXIBLE" })).toBe(search);
    expect(listingSearchLinkQuery(search, {})).toBe(search);
    expect(listingSearchLinkQuery(search, { bookingMode: null })).toBe(search);
  });

  it("keeps its dates even if a matched stay were somehow attached", () => {
    // Nothing produces this combination, and if something ever did, a flexible listing's
    // link must still not change shape.
    expect(
      listingSearchLinkQuery(search, {
        bookingMode: "FLEXIBLE",
        matchedFixedStayPeriodId: "period-1",
      }),
    ).toBe(search);
  });

  it("stays empty when the search carried nothing", () => {
    expect(listingSearchLinkQuery(undefined, { bookingMode: "FLEXIBLE" })).toBe("");
    expect(listingSearchLinkQuery("", { bookingMode: "FLEXIBLE" })).toBe("");
  });
});

describe("a fixed-stay result's link", () => {
  const link = query(search, {
    bookingMode: "FIXED_STAYS",
    matchedFixedStayPeriodId: "period-1",
  });

  it("carries the stay it matched", () => {
    expect(link.get(FIXED_STAY_PERIOD_PARAM)).toBe("period-1");
  });

  it("drops the dates the page is told to ignore", () => {
    expect(link.get("checkIn")).toBeNull();
    expect(link.get("checkOut")).toBeNull();
  });

  it("keeps everything else the search was about", () => {
    expect(link.get("city")).toBe("Ohrid");
    expect(link.get("guests")).toBe("2");
    expect(link.get("adults")).toBe("2");
  });

  it("carries no stay when the search matched none", () => {
    // An undated search reaches a fixed-stay card with nothing matched.
    const undated = query("city=Ohrid&guests=2", {
      bookingMode: "FIXED_STAYS",
      matchedFixedStayPeriodId: null,
    });
    expect(undated.get(FIXED_STAY_PERIOD_PARAM)).toBeNull();
    expect(undated.get("city")).toBe("Ohrid");
  });

  it("still drops stray dates when nothing matched", () => {
    const stray = query(search, { bookingMode: "FIXED_STAYS" });
    expect(stray.get("checkIn")).toBeNull();
    expect(stray.get("checkOut")).toBeNull();
    expect(stray.get(FIXED_STAY_PERIOD_PARAM)).toBeNull();
  });

  it("never inherits a stay id another card put on the query", () => {
    // The search query is shared by every card on the page. Only this listing's own
    // match may appear on its link.
    const inherited = query(`${search}&${FIXED_STAY_PERIOD_PARAM}=someone-elses`, {
      bookingMode: "FIXED_STAYS",
      matchedFixedStayPeriodId: "period-1",
    });
    expect(inherited.get(FIXED_STAY_PERIOD_PARAM)).toBe("period-1");

    const unmatched = query(`${search}&${FIXED_STAY_PERIOD_PARAM}=someone-elses`, {
      bookingMode: "FIXED_STAYS",
      matchedFixedStayPeriodId: null,
    });
    expect(unmatched.get(FIXED_STAY_PERIOD_PARAM)).toBeNull();
  });

  it("carries exactly one stay id", () => {
    expect(
      listingSearchLinkQuery(search, {
        bookingMode: "FIXED_STAYS",
        matchedFixedStayPeriodId: "period-1",
      }).match(new RegExp(FIXED_STAY_PERIOD_PARAM, "g")),
    ).toHaveLength(1);
  });
});
