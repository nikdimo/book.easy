import { describe, expect, it } from "vitest";
import { normalizeAmenityName } from "@/lib/amenities/normalize";

describe("normalizeAmenityName", () => {
  it("makes provider spelling differences stable for alias lookup", () => {
    expect(normalizeAmenityName("Smoke alarm")).toBe("smokealarm");
    expect(normalizeAmenityName("  Wi-Fi  ")).toBe("wifi");
    expect(normalizeAmenityName("Room-darkening shades")).toBe("roomdarkeningshades");
  });
});
