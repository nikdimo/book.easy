import { describe, expect, it } from "vitest";
import { hostStartQuery, hostStartResumeHref } from "@/lib/host-start-draft";

describe("host start draft routing", () => {
  it("preserves the choices needed by every resumed page", () => {
    expect(hostStartQuery({ propertyType: "HOUSE", spaceType: "PRIVATE_ROOM" }))
      .toBe("propertyType=HOUSE&spaceType=PRIVATE_ROOM");
  });

  it("resumes canonical draft steps in their Host V2 equivalents", () => {
    expect(hostStartResumeHref({ currentStepId: "photos", propertyType: "HOUSE", spaceType: "ENTIRE_PLACE" }))
      .toBe("/host/start/photos?propertyType=HOUSE&spaceType=ENTIRE_PLACE");
    expect(hostStartResumeHref({ currentStepId: "pricing", propertyType: "HOUSE", spaceType: "ENTIRE_PLACE" }))
      .toBe("/host/start/price?propertyType=HOUSE&spaceType=ENTIRE_PLACE");
  });

  it("falls back safely for old or unknown step ids", () => {
    expect(hostStartResumeHref({ currentStepId: "unknown" })).toBe("/host/start/property-type");
  });
});
