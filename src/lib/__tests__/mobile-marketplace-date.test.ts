import { describe, expect, it } from "vitest";
import { marketplaceTodayYmd } from "../../../mobile/src/lib/marketplace-date";

describe("native marketplace date", () => {
  it("uses the marketplace day around UTC midnight, not the device day", () => {
    const instant = new Date("2026-08-04T22:30:00.000Z");

    expect(marketplaceTodayYmd(instant, "Europe/Skopje")).toBe("2026-08-05");
    expect(marketplaceTodayYmd(instant, "America/New_York")).toBe("2026-08-04");
  });
});
