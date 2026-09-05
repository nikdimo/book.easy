import { describe, expect, it } from "vitest";
import {
  HOUSE_RULES_DRAFT_FIELDS,
  houseRulesDraftPatch,
  houseRulesFromDraft,
} from "@/lib/host/v2/listing-house-rules-draft";
import {
  emptyListingHouseRules,
  type ListingHouseRulesInput,
} from "@/lib/host/v2/listing-house-rules";
import type { ListingDraftData } from "@/lib/types/listing-draft";

const ANSWERED: ListingHouseRulesInput = {
  checkInTime: "16:00",
  checkInEndTime: "",
  checkOutTime: "10:00",
  maxGuests: 6,
  petPolicy: "ASK_HOST",
  smokingPolicy: "OUTDOORS_ONLY",
  eventPolicy: "NOT_ALLOWED",
  quietHoursPolicy: "SET",
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  additionalRules: "No shoes indoors.",
};

describe("houseRulesFromDraft", () => {
  it("reads back exactly what houseRulesDraftPatch wrote", () => {
    // The whole point of the pair: a rule saved on one screen and resumed on another is
    // the same rule.
    const draft = houseRulesDraftPatch(ANSWERED);

    expect(houseRulesFromDraft(draft)).toEqual(ANSWERED);
  });

  it("treats a draft that has not reached this step as unanswered, not as refused", () => {
    const rules = houseRulesFromDraft({});

    expect(rules.petPolicy).toBeNull();
    expect(rules.smokingPolicy).toBeNull();
    expect(rules.eventPolicy).toBeNull();
    expect(rules.quietHoursPolicy).toBeNull();
    expect(rules.additionalRules).toBe("");
  });

  it("falls back to the arrival pair and guest count the flow pre-fills", () => {
    expect(houseRulesFromDraft({})).toMatchObject({
      checkInTime: "15:00",
      checkOutTime: "11:00",
      maxGuests: 2,
    });
  });

  it("parses the guest count through the shared parser, not Number()", () => {
    // A classic-wizard draft carries "" here, and Number("") is 0 — a guest limit
    // publishing refuses.
    expect(houseRulesFromDraft({ maxGuests: "" }).maxGuests).toBe(2);
    expect(houseRulesFromDraft({ maxGuests: "8" }).maxGuests).toBe(8);
  });

  it("keeps an imported off-grid time rather than rounding it to the half hour", () => {
    expect(houseRulesFromDraft({ checkInTime: "14:15" }).checkInTime).toBe("14:15");
  });

  it("reads a policy the draft should not be holding as unanswered", () => {
    expect(houseRulesFromDraft({ petPolicy: "MAYBE" }).petPolicy).toBeNull();
  });

  it("accepts an explicit fallback, which is how the step seeds itself", () => {
    const fallback = { ...emptyListingHouseRules(), maxGuests: 9 };

    expect(houseRulesFromDraft({}, fallback).maxGuests).toBe(9);
    // The draft still wins where it has an answer.
    expect(houseRulesFromDraft({ maxGuests: "3" }, fallback).maxGuests).toBe(3);
  });
});

describe("houseRulesDraftPatch", () => {
  it("writes every field, so clearing one actually clears it", () => {
    // A patch merges over the stored draft. An omitted field would leave the previous
    // answer in place — which is exactly how quiet hours would come back on after the
    // host switched them off.
    const patch = houseRulesDraftPatch(emptyListingHouseRules());

    for (const field of HOUSE_RULES_DRAFT_FIELDS) {
      expect(patch).toHaveProperty(field);
    }
    expect(patch.petPolicy).toBe("");
    expect(patch.quietHoursPolicy).toBe("");
    expect(patch.additionalRules).toBe("");
  });

  it("stores everything as the strings a draft holds", () => {
    const patch = houseRulesDraftPatch(ANSWERED);

    for (const value of Object.values(patch)) {
      expect(typeof value).toBe("string");
    }
    expect(patch.maxGuests).toBe("6");
  });

  it("does not carry quiet-hours times for a listing with no quiet hours", () => {
    const patch = houseRulesDraftPatch({
      ...ANSWERED,
      quietHoursPolicy: "NONE",
    });

    expect(patch.quietHoursPolicy).toBe("NONE");
    expect(patch.quietHoursStart).toBe("");
    expect(patch.quietHoursEnd).toBe("");
  });
});

describe("HOUSE_RULES_DRAFT_FIELDS", () => {
  it("names only keys ListingDraftData actually has", () => {
    // The publish whitelist and the mobile publish route both index the draft with this
    // list; a name that is not a draft key would silently carry nothing.
    const sample: ListingDraftData = houseRulesDraftPatch(ANSWERED);

    for (const field of HOUSE_RULES_DRAFT_FIELDS) {
      expect(sample[field]).toBeDefined();
    }
  });

  it("covers the arrival times and the guest count as well as the policies", () => {
    expect([...HOUSE_RULES_DRAFT_FIELDS]).toEqual(
      expect.arrayContaining([
        "checkInTime",
        "checkOutTime",
        "maxGuests",
        "petPolicy",
        "smokingPolicy",
        "eventPolicy",
        "quietHoursPolicy",
        "quietHoursStart",
        "quietHoursEnd",
        "additionalRules",
      ]),
    );
  });
});
