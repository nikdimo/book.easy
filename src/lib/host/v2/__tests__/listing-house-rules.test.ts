import { describe, expect, it } from "vitest";
import {
  ADDITIONAL_RULES_MAX,
  FLEXIBLE_STAY_TIME,
  HOUSE_RULE_ROW_ORDER,
  MAX_GUESTS_MAX,
  MAX_GUESTS_MIN,
  REQUIRED_POLICY_COUNT,
  STAY_TIME_OPTIONS,
  answeredPolicyCount,
  conflictsWithBookedParty,
  houseRuleRowId,
  houseRuleRowsWithIssues,
  emptyListingHouseRules,
  houseRulesFromRow,
  houseRulesRowData,
  houseRulesSnapshot,
  listingHouseRulesIssues,
  listingHouseRulesPayloadIssues,
  normalizeListingHouseRules,
  normalizeStayTime,
  parseHouseRulesSnapshot,
  sameListingHouseRules,
  stayTimeChoices,
  type ListingHouseRulesInput,
} from "@/lib/host/v2/listing-house-rules";

/** A fully answered rule set — what a listing published through the create flow holds. */
const VALID: ListingHouseRulesInput = {
  checkInTime: "15:00",
  checkOutTime: "11:00",
  maxGuests: 4,
  petPolicy: "NOT_ALLOWED",
  smokingPolicy: "OUTDOORS_ONLY",
  eventPolicy: "NOT_ALLOWED",
  quietHoursPolicy: "SET",
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  additionalRules: "Please take your shoes off indoors.",
};

/** A listing published before these columns existed: times and a guest count, and no
 *  answer to anything else. */
const UNANSWERED: ListingHouseRulesInput = emptyListingHouseRules();

describe("stay time options", () => {
  it("covers every half hour of the day, once each", () => {
    expect(STAY_TIME_OPTIONS).toHaveLength(48);
    expect(new Set(STAY_TIME_OPTIONS).size).toBe(48);
    expect(STAY_TIME_OPTIONS[0]).toBe("00:00");
    expect(STAY_TIME_OPTIONS.at(-1)).toBe("23:30");
  });
});

describe("normalizeStayTime", () => {
  it("treats null, undefined and blank as the same 'flexible'", () => {
    expect(normalizeStayTime(null)).toBe(FLEXIBLE_STAY_TIME);
    expect(normalizeStayTime(undefined)).toBe(FLEXIBLE_STAY_TIME);
    expect(normalizeStayTime("   ")).toBe(FLEXIBLE_STAY_TIME);
  });

  it("hands an unrecognised value on rather than silently making it flexible", () => {
    // The classic form's transform coerces this to "". Doing that here would turn a bad
    // request into an unannounced change of what the listing promises.
    expect(normalizeStayTime("25:00")).toBe("25:00");
  });
});

describe("listingHouseRulesIssues", () => {
  it("accepts a normal pair of times and a normal party size", () => {
    expect(listingHouseRulesIssues(VALID)).toEqual({});
  });

  it("accepts flexible on either end", () => {
    expect(
      listingHouseRulesIssues({ ...VALID, checkInTime: "", checkOutTime: "" }),
    ).toEqual({});
  });

  it("accepts a stored off-grid time, so an imported listing stays editable", () => {
    expect(listingHouseRulesIssues({ ...VALID, checkInTime: "14:15" })).toEqual({});
  });

  it("does not compare the two times — check-out is the next morning", () => {
    expect(
      listingHouseRulesIssues({ ...VALID, checkInTime: "15:00", checkOutTime: "11:00" }),
    ).toEqual({});
  });

  it("rejects times that are not a time at all", () => {
    expect(listingHouseRulesIssues({ ...VALID, checkInTime: "25:00" })).toEqual({
      checkInTime: "NOT_A_TIME",
    });
    expect(listingHouseRulesIssues({ ...VALID, checkOutTime: "11:60" })).toEqual({
      checkOutTime: "NOT_A_TIME",
    });
    expect(listingHouseRulesIssues({ ...VALID, checkOutTime: "noon" })).toEqual({
      checkOutTime: "NOT_A_TIME",
    });
  });

  it("holds the guest count to the range the booking service and the classic form use", () => {
    expect(
      listingHouseRulesIssues({ ...VALID, maxGuests: MAX_GUESTS_MIN - 1 }),
    ).toEqual({ maxGuests: "TOO_LOW" });
    expect(
      listingHouseRulesIssues({ ...VALID, maxGuests: MAX_GUESTS_MAX + 1 }),
    ).toEqual({ maxGuests: "TOO_HIGH" });
    expect(listingHouseRulesIssues({ ...VALID, maxGuests: 2.5 })).toEqual({
      maxGuests: "NOT_A_NUMBER",
    });
    expect(listingHouseRulesIssues({ ...VALID, maxGuests: Number.NaN })).toEqual({
      maxGuests: "NOT_A_NUMBER",
    });
  });

  it("reports everything wrong at once, so one mistake is not two refused saves", () => {
    expect(
      listingHouseRulesIssues({
        ...VALID,
        checkInTime: "later",
        checkOutTime: "99:99",
        maxGuests: 0,
      }),
    ).toEqual({
      checkInTime: "NOT_A_TIME",
      checkOutTime: "NOT_A_TIME",
      maxGuests: "TOO_LOW",
    });
  });
});

describe("normalizeListingHouseRules", () => {
  it("trims the times and leaves the count alone", () => {
    expect(
      normalizeListingHouseRules({
        ...VALID,
        checkInTime: " 15:00 ",
        checkOutTime: "",
        maxGuests: 6,
      }),
    ).toEqual({ ...VALID, checkInTime: "15:00", checkOutTime: "", maxGuests: 6 });
  });
});

describe("stayTimeChoices", () => {
  it("offers the standard half hours for a standard value", () => {
    expect(stayTimeChoices("15:00")).toEqual(STAY_TIME_OPTIONS);
    expect(stayTimeChoices("")).toEqual(STAY_TIME_OPTIONS);
  });

  it("adds a stored off-grid time so the picker can show what the listing says", () => {
    const choices = stayTimeChoices("14:15");

    expect(choices).toContain("14:15");
    expect(choices).toHaveLength(STAY_TIME_OPTIONS.length + 1);
    // Still in clock order, so the extra option is not stranded at the end of the list.
    expect(choices.indexOf("14:15")).toBe(choices.indexOf("14:30") - 1);
  });

  it("does not offer a stored value that is not a time", () => {
    expect(stayTimeChoices("whenever")).toEqual(STAY_TIME_OPTIONS);
  });
});

describe("conflictsWithBookedParty", () => {
  it("warns when the new limit is under a party already on the books", () => {
    expect(conflictsWithBookedParty(2, 5)).toBe(true);
  });

  it("stays quiet when the limit still covers it, or nothing is booked", () => {
    expect(conflictsWithBookedParty(5, 5)).toBe(false);
    expect(conflictsWithBookedParty(6, 5)).toBe(false);
    expect(conflictsWithBookedParty(1, 0)).toBe(false);
  });
});


// ─── The structured policies ─────────────────────────────────────────────────────

describe("policies as the editor sees them", () => {
  it("accepts a listing that has answered nothing, because most of them have not", () => {
    // Every listing published before these columns existed is exactly this, and the
    // editor has to be able to save one.
    expect(listingHouseRulesIssues(UNANSWERED)).toEqual({});
  });

  it("accepts every choice each policy offers", () => {
    for (const petPolicy of ["ALLOWED", "NOT_ALLOWED", "ASK_HOST"] as const) {
      expect(listingHouseRulesIssues({ ...VALID, petPolicy })).toEqual({});
    }
    for (const smokingPolicy of ["ALLOWED", "NOT_ALLOWED", "OUTDOORS_ONLY"] as const) {
      expect(listingHouseRulesIssues({ ...VALID, smokingPolicy })).toEqual({});
    }
    for (const eventPolicy of ["ALLOWED", "NOT_ALLOWED"] as const) {
      expect(listingHouseRulesIssues({ ...VALID, eventPolicy })).toEqual({});
    }
  });

  it("reads an unrecognised choice as unanswered rather than storing it", () => {
    const normalized = normalizeListingHouseRules({
      ...VALID,
      petPolicy: "MAYBE" as never,
    });

    expect(normalized.petPolicy).toBeNull();
  });
});

describe("policies as the create flow sees them", () => {
  it("requires an answer to every policy", () => {
    expect(listingHouseRulesIssues(UNANSWERED, { requireAnswers: true })).toEqual({
      petPolicy: "REQUIRED",
      smokingPolicy: "REQUIRED",
      eventPolicy: "REQUIRED",
      quietHoursPolicy: "REQUIRED",
    });
  });

  it("is satisfied once every policy is answered", () => {
    expect(listingHouseRulesIssues(VALID, { requireAnswers: true })).toEqual({});
  });

  it("names each missing policy separately, so the host fixes them in one pass", () => {
    expect(
      listingHouseRulesIssues(
        { ...VALID, petPolicy: null, smokingPolicy: null },
        { requireAnswers: true },
      ),
    ).toEqual({ petPolicy: "REQUIRED", smokingPolicy: "REQUIRED" });
  });

  it("counts an explicit refusal as an answer — it is a decision, not a blank", () => {
    expect(
      listingHouseRulesIssues(
        { ...VALID, petPolicy: "NOT_ALLOWED" },
        { requireAnswers: true },
      ),
    ).toEqual({});
  });
});

describe("payload validation", () => {
  it("refuses a policy that is not one of the choices, rather than reading it as blank", () => {
    // The normalising check would call this "unanswered" and store null, which is a
    // change the host's browser never asked for.
    expect(
      listingHouseRulesPayloadIssues({ ...VALID, petPolicy: "MAYBE" as never }),
    ).toEqual({ petPolicy: "NOT_A_CHOICE" });
  });

  it("still accepts a cleared policy, which is a real thing to send", () => {
    expect(listingHouseRulesPayloadIssues({ ...VALID, petPolicy: null })).toEqual({});
    expect(
      listingHouseRulesPayloadIssues({ ...VALID, petPolicy: "" as never }),
    ).toEqual({});
  });
});

describe("quiet hours", () => {
  it("accepts a range that crosses midnight, which is the ordinary case", () => {
    expect(
      listingHouseRulesIssues({
        ...VALID,
        quietHoursPolicy: "SET",
        quietHoursStart: "22:00",
        quietHoursEnd: "08:00",
      }),
    ).toEqual({});
  });

  it("accepts a same-day range too", () => {
    expect(
      listingHouseRulesIssues({
        ...VALID,
        quietHoursPolicy: "SET",
        quietHoursStart: "13:00",
        quietHoursEnd: "15:00",
      }),
    ).toEqual({});
  });

  it("needs both ends once quiet hours apply", () => {
    expect(
      listingHouseRulesIssues({
        ...VALID,
        quietHoursPolicy: "SET",
        quietHoursStart: "22:00",
        quietHoursEnd: "",
      }),
    ).toEqual({ quietHoursEnd: "REQUIRED" });
    expect(
      listingHouseRulesIssues({
        ...VALID,
        quietHoursPolicy: "SET",
        quietHoursStart: "",
        quietHoursEnd: "",
      }),
    ).toEqual({ quietHoursStart: "REQUIRED", quietHoursEnd: "REQUIRED" });
  });

  it("rejects a quiet-hours time that is not a time", () => {
    expect(
      listingHouseRulesIssues({
        ...VALID,
        quietHoursPolicy: "SET",
        quietHoursStart: "25:00",
        quietHoursEnd: "08:00",
      }),
    ).toEqual({ quietHoursStart: "NOT_A_TIME" });
  });

  it("drops the times when the host says there are no quiet hours", () => {
    // Otherwise switching quiet hours off and reloading brings them back.
    const normalized = normalizeListingHouseRules({
      ...VALID,
      quietHoursPolicy: "NONE",
    });

    expect(normalized).toMatchObject({
      quietHoursPolicy: "NONE",
      quietHoursStart: "",
      quietHoursEnd: "",
    });
    expect(listingHouseRulesIssues(normalized)).toEqual({});
  });

  it("keeps 'none' and 'unanswered' apart", () => {
    expect(normalizeListingHouseRules({ ...VALID, quietHoursPolicy: "NONE" })
      .quietHoursPolicy).toBe("NONE");
    expect(normalizeListingHouseRules({ ...VALID, quietHoursPolicy: null })
      .quietHoursPolicy).toBeNull();
  });
});

describe("additional rules", () => {
  it("stores exactly what the host wrote, trimmed of surrounding blank", () => {
    expect(
      normalizeListingHouseRules({
        ...VALID,
        additionalRules: "  No shoes indoors.\nBins out on Tuesday.  ",
      }).additionalRules,
    ).toBe("No shoes indoors.\nBins out on Tuesday.");
  });

  it("reports an over-long value rather than truncating a half-written sentence", () => {
    const tooLong = "x".repeat(ADDITIONAL_RULES_MAX + 1);

    expect(listingHouseRulesIssues({ ...VALID, additionalRules: tooLong })).toEqual({
      additionalRules: "TOO_LONG",
    });
    // Nothing was cut off on the way through.
    expect(
      normalizeListingHouseRules({ ...VALID, additionalRules: tooLong })
        .additionalRules,
    ).toHaveLength(ADDITIONAL_RULES_MAX + 1);
  });

  it("accepts a value exactly at the limit", () => {
    expect(
      listingHouseRulesIssues({
        ...VALID,
        additionalRules: "x".repeat(ADDITIONAL_RULES_MAX),
      }),
    ).toEqual({});
  });
});

describe("rows and snapshots", () => {
  const ROW = {
    checkInTime: "15:00",
    checkOutTime: "11:00",
    maxGuests: 4,
    petPolicy: "ASK_HOST",
    smokingPolicy: "NOT_ALLOWED",
    eventPolicy: "NOT_ALLOWED",
    quietHoursPolicy: "SET",
    quietHoursStart: "22:00",
    quietHoursEnd: "08:00",
    additionalRules: "No shoes indoors.",
  };

  it("round-trips a listing row through the controls and back", () => {
    expect(houseRulesRowData(houseRulesFromRow(ROW))).toEqual(ROW);
  });

  it("writes NULL, not an empty string, for everything unanswered", () => {
    expect(
      houseRulesRowData({
        ...UNANSWERED,
        checkInTime: "",
        checkOutTime: "",
      }),
    ).toEqual({
      checkInTime: null,
      checkOutTime: null,
      maxGuests: UNANSWERED.maxGuests,
      petPolicy: null,
      smokingPolicy: null,
      eventPolicy: null,
      quietHoursPolicy: null,
      quietHoursStart: null,
      quietHoursEnd: null,
      additionalRules: null,
    });
  });

  it("takes a snapshot that says nothing about the rules nobody answered", () => {
    expect(
      houseRulesSnapshot({
        checkInTime: null,
        checkOutTime: null,
        maxGuests: 2,
        petPolicy: null,
        smokingPolicy: null,
        eventPolicy: null,
        quietHoursPolicy: null,
        quietHoursStart: null,
        quietHoursEnd: null,
        additionalRules: null,
      }),
    ).toEqual({
      version: 1,
      checkInTime: null,
      checkOutTime: null,
      maxGuests: 2,
      petPolicy: null,
      smokingPolicy: null,
      eventPolicy: null,
      quietHoursPolicy: null,
      quietHoursStart: null,
      quietHoursEnd: null,
      additionalRules: null,
    });
  });

  it("never snapshots quiet-hours times without the rule that gives them meaning", () => {
    const snapshot = houseRulesSnapshot({
      ...ROW,
      quietHoursPolicy: "NONE",
    });

    expect(snapshot.quietHoursStart).toBeNull();
    expect(snapshot.quietHoursEnd).toBeNull();
  });

  it("reads a stored snapshot back unchanged", () => {
    const snapshot = houseRulesSnapshot(ROW);

    expect(parseHouseRulesSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(
      snapshot,
    );
  });

  it("treats a missing or unrecognised snapshot as no snapshot at all", () => {
    // Every booking taken before acceptance was recorded holds NULL here, and a
    // half-understood shape is worse than none.
    expect(parseHouseRulesSnapshot(null)).toBeNull();
    expect(parseHouseRulesSnapshot(undefined)).toBeNull();
    expect(parseHouseRulesSnapshot({})).toBeNull();
    expect(parseHouseRulesSnapshot({ version: 2, maxGuests: 4 })).toBeNull();
    expect(parseHouseRulesSnapshot([{ version: 1 }])).toBeNull();
  });
});

describe("sameListingHouseRules", () => {
  it("sees through normalisation, so a stray space is not a save", () => {
    expect(
      sameListingHouseRules(VALID, { ...VALID, checkInTime: " 15:00 " }),
    ).toBe(true);
  });

  it("notices a changed policy", () => {
    expect(sameListingHouseRules(VALID, { ...VALID, petPolicy: "ALLOWED" })).toBe(
      false,
    );
    expect(
      sameListingHouseRules(VALID, { ...VALID, additionalRules: "Something else." }),
    ).toBe(false);
  });
});

// ─── Sending a host to the rule that needs them ──────────────────────────────────

describe("rows, order and progress", () => {
  it("lists the rows in the order the page shows them", () => {
    expect(HOUSE_RULE_ROW_ORDER).toEqual([
      "checkInTime",
      "checkOutTime",
      "maxGuests",
      "petPolicy",
      "smokingPolicy",
      "eventPolicy",
      "quietHoursPolicy",
      "additionalRules",
    ]);
    expect(REQUIRED_POLICY_COUNT).toBe(4);
  });

  it("builds the same id the rows render", () => {
    expect(houseRuleRowId("flow-house-rules", "petPolicy")).toBe(
      "flow-house-rules-pets",
    );
    expect(houseRuleRowId("flow-house-rules", "quietHoursPolicy")).toBe(
      "flow-house-rules-quiet-hours",
    );
    expect(houseRuleRowId("editor", "additionalRules")).toBe(
      "editor-additional-rules",
    );
  });

  it("reports the rows with problems in page order, first one first", () => {
    const rules = emptyListingHouseRules();
    const issues = listingHouseRulesIssues(rules, { requireAnswers: true });

    expect(houseRuleRowsWithIssues(issues)).toEqual([
      "petPolicy",
      "smokingPolicy",
      "eventPolicy",
      "quietHoursPolicy",
    ]);
  });

  it("collapses a half-set quiet-hours range onto the one row that edits it", () => {
    // Both ends are broken, but there is one sheet to open and one thing to fix.
    const issues = listingHouseRulesIssues(
      {
        ...emptyListingHouseRules(),
        petPolicy: "ALLOWED",
        smokingPolicy: "ALLOWED",
        eventPolicy: "ALLOWED",
        quietHoursPolicy: "SET",
        quietHoursStart: "",
        quietHoursEnd: "",
      },
      { requireAnswers: true },
    );

    expect(houseRuleRowsWithIssues(issues)).toEqual(["quietHoursPolicy"]);
  });

  it("says nothing is wrong when nothing is", () => {
    expect(houseRuleRowsWithIssues({})).toEqual([]);
  });

  it("counts each answered policy, including an explicit refusal", () => {
    const rules = emptyListingHouseRules();

    expect(answeredPolicyCount(rules)).toBe(0);
    expect(answeredPolicyCount({ ...rules, petPolicy: "NOT_ALLOWED" })).toBe(1);
    expect(
      answeredPolicyCount({
        ...rules,
        petPolicy: "ALLOWED",
        smokingPolicy: "OUTDOORS_ONLY",
        eventPolicy: "NOT_ALLOWED",
        quietHoursPolicy: "NONE",
      }),
    ).toBe(4);
  });

  it("does not count quiet hours that are set but have no times", () => {
    const rules = {
      ...emptyListingHouseRules(),
      quietHoursPolicy: "SET" as const,
      quietHoursStart: "22:00",
      quietHoursEnd: "",
    };

    expect(answeredPolicyCount(rules)).toBe(0);
    expect(
      answeredPolicyCount({ ...rules, quietHoursEnd: "08:00" }),
    ).toBe(1);
  });
});
