import { describe, expect, it } from "vitest";
import {
  AVAILABILITY_START_BLOCK_REASON,
  validateStoredListingAvailabilityForPublish,
} from "@/lib/types/listing-availability-start";

const NOW = new Date("2026-08-15T12:00:00.000Z");

function listing(
  overrides: Partial<Parameters<typeof validateStoredListingAvailabilityForPublish>[0]> = {},
) {
  return {
    availabilityMode: "OPEN" as const,
    publishedAt: null,
    availabilityBlocks: [],
    ...overrides,
  };
}

describe("validateStoredListingAvailabilityForPublish", () => {
  it("fails closed for a never-published OPEN legacy listing with no explicit answer", () => {
    expect(validateStoredListingAvailabilityForPublish(listing(), NOW)).toEqual({
      ok: false,
      reason: "availability-unconfirmed",
    });
  });

  it("accepts a never-published listing that is unavailable by default", () => {
    expect(
      validateStoredListingAvailabilityForPublish(
        listing({ availabilityMode: "CLOSED" }),
        NOW,
      ),
    ).toEqual({ ok: true, basis: "unavailable-by-default" });
  });

  it("accepts the canonical active future-start protection", () => {
    expect(
      validateStoredListingAvailabilityForPublish(
        listing({
          availabilityBlocks: [
            {
              startDate: new Date("2026-08-15T00:00:00.000Z"),
              endDate: new Date("2026-09-01T00:00:00.000Z"),
              reason: AVAILABILITY_START_BLOCK_REASON,
            },
          ],
        }),
        NOW,
      ),
    ).toEqual({ ok: true, basis: "future-start" });
  });

  it("does not treat an arbitrary manual block as publish confirmation", () => {
    expect(
      validateStoredListingAvailabilityForPublish(
        listing({
          availabilityBlocks: [
            {
              startDate: new Date("2026-08-15T00:00:00.000Z"),
              endDate: new Date("2026-08-20T00:00:00.000Z"),
              reason: "Host blocked these dates",
            },
          ],
        }),
        NOW,
      ),
    ).toEqual({ ok: false, reason: "availability-unconfirmed" });
  });

  it("does not accept an expired or not-yet-active start protection", () => {
    for (const availabilityBlocks of [
      [
        {
          startDate: new Date("2026-08-01T00:00:00.000Z"),
          endDate: new Date("2026-08-15T00:00:00.000Z"),
          reason: AVAILABILITY_START_BLOCK_REASON,
        },
      ],
      [
        {
          startDate: new Date("2026-08-16T00:00:00.000Z"),
          endDate: new Date("2026-09-01T00:00:00.000Z"),
          reason: AVAILABILITY_START_BLOCK_REASON,
        },
      ],
    ]) {
      expect(
        validateStoredListingAvailabilityForPublish(
          listing({ availabilityBlocks }),
          NOW,
        ),
      ).toEqual({ ok: false, reason: "availability-unconfirmed" });
    }
  });

  it("allows a previously published listing to return live with its current calendar", () => {
    expect(
      validateStoredListingAvailabilityForPublish(
        listing({ publishedAt: new Date("2026-07-01T10:00:00.000Z") }),
        NOW,
      ),
    ).toEqual({ ok: true, basis: "previously-published" });
  });
});
