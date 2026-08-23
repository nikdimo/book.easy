import { describe, expect, it } from "vitest";
import {
  MIN_STAY_MAX,
  MIN_STAY_MIN,
  availabilityStepChoice,
  availabilityStepComplete,
  availabilityStepIssue,
  clampMinStay,
} from "@/lib/host/v2/listing-availability-step";

const TODAY = "2026-08-20";

describe("availabilityStepChoice", () => {
  it("is null until the host picks something", () => {
    expect(availabilityStepChoice({ mode: null, startDate: "" })).toBeNull();
  });

  it("produces the canonical shapes for the two dateless answers", () => {
    expect(availabilityStepChoice({ mode: "now", startDate: "" })).toEqual({
      mode: "now",
    });
    expect(availabilityStepChoice({ mode: "selected", startDate: "" })).toEqual({
      mode: "selected",
    });
  });

  it("keeps a start date the publish gate would accept", () => {
    expect(availabilityStepChoice({ mode: "from", startDate: "2026-09-01" })).toEqual({
      mode: "from",
      startDate: "2026-09-01",
    });
  });

  it("ignores whitespace around a typed date", () => {
    expect(
      availabilityStepChoice({ mode: "from", startDate: " 2026-09-01 " }),
    ).toEqual({ mode: "from", startDate: "2026-09-01" });
  });

  it("refuses to guess at a half-typed or impossible date", () => {
    expect(availabilityStepChoice({ mode: "from", startDate: "2026-09" })).toBeNull();
    expect(availabilityStepChoice({ mode: "from", startDate: "2026-02-30" })).toBeNull();
  });
});

describe("availabilityStepIssue", () => {
  it("asks for an answer before one is given", () => {
    expect(availabilityStepIssue({ mode: null, startDate: "" }, TODAY)).toBe(
      "UNANSWERED",
    );
  });

  it("accepts both dateless answers outright", () => {
    expect(
      availabilityStepIssue({ mode: "now", startDate: "" }, TODAY),
    ).toBeUndefined();
    expect(
      availabilityStepIssue({ mode: "selected", startDate: "" }, TODAY),
    ).toBeUndefined();
  });

  it("separates an empty date field from an unanswered question", () => {
    expect(availabilityStepIssue({ mode: "from", startDate: "" }, TODAY)).toBe(
      "MISSING_DATE",
    );
    expect(availabilityStepIssue({ mode: "from", startDate: "   " }, TODAY)).toBe(
      "MISSING_DATE",
    );
  });

  it("names a malformed date rather than reporting it as unanswered", () => {
    expect(availabilityStepIssue({ mode: "from", startDate: "01/09/2026" }, TODAY)).toBe(
      "INVALID_DATE",
    );
  });

  it("refuses a start date that has already passed", () => {
    expect(availabilityStepIssue({ mode: "from", startDate: "2026-08-19" }, TODAY)).toBe(
      "PAST_DATE",
    );
  });

  it("accepts today itself as the first bookable night", () => {
    expect(
      availabilityStepIssue({ mode: "from", startDate: TODAY }, TODAY),
    ).toBeUndefined();
  });

  it("accepts a future start date", () => {
    expect(
      availabilityStepIssue({ mode: "from", startDate: "2026-09-01" }, TODAY),
    ).toBeUndefined();
  });
});

describe("availabilityStepComplete", () => {
  it("is exactly the absence of an issue", () => {
    expect(availabilityStepComplete({ mode: null, startDate: "" }, TODAY)).toBe(false);
    expect(availabilityStepComplete({ mode: "from", startDate: "" }, TODAY)).toBe(false);
    expect(availabilityStepComplete({ mode: "now", startDate: "" }, TODAY)).toBe(true);
  });
});

describe("clampMinStay", () => {
  it("holds the bounds the calendar editor validates against", () => {
    expect(clampMinStay(0)).toBe(MIN_STAY_MIN);
    expect(clampMinStay(-4)).toBe(MIN_STAY_MIN);
    expect(clampMinStay(MIN_STAY_MAX + 1)).toBe(MIN_STAY_MAX);
  });

  it("keeps a value already inside them", () => {
    expect(clampMinStay(3)).toBe(3);
  });

  it("returns a whole number of nights for anything else", () => {
    expect(clampMinStay(2.4)).toBe(2);
    expect(clampMinStay(Number.NaN)).toBe(MIN_STAY_MIN);
  });
});
