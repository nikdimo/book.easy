import { describe, expect, it } from "vitest";
import {
  canSeeExactLocation,
  exactLocationUnlocksAt,
} from "@/lib/utils/street-view-access";

const checkIn = new Date("2026-08-20T00:00:00.000Z");

describe("exactLocationUnlocksAt", () => {
  it("unlocks three days before check-in", () => {
    expect(exactLocationUnlocksAt(checkIn).toISOString()).toBe(
      "2026-08-17T00:00:00.000Z"
    );
  });
});

describe("canSeeExactLocation", () => {
  it("stays locked while the booking is only requested", () => {
    expect(
      canSeeExactLocation(
        { status: "PENDING", checkIn },
        new Date("2026-08-19T12:00:00.000Z")
      )
    ).toBe(false);
  });

  it("stays locked on a confirmed booking that is still far off", () => {
    expect(
      canSeeExactLocation(
        { status: "CONFIRMED", checkIn },
        new Date("2026-08-16T23:59:59.000Z")
      )
    ).toBe(false);
  });

  it("unlocks exactly at the three-day mark", () => {
    expect(
      canSeeExactLocation(
        { status: "CONFIRMED", checkIn },
        new Date("2026-08-17T00:00:00.000Z")
      )
    ).toBe(true);
  });

  it("stays unlocked after the stay is completed", () => {
    expect(
      canSeeExactLocation(
        { status: "COMPLETED", checkIn },
        new Date("2026-09-01T00:00:00.000Z")
      )
    ).toBe(true);
  });

  it("locks back down when a confirmed booking is cancelled close to arrival", () => {
    for (const status of [
      "CANCELLED_BY_GUEST",
      "CANCELLED_BY_HOST",
      "CANCELLED_BY_ADMIN",
      "REJECTED",
      "EXPIRED",
    ]) {
      expect(
        canSeeExactLocation(
          { status, checkIn },
          new Date("2026-08-19T12:00:00.000Z")
        )
      ).toBe(false);
    }
  });
});
