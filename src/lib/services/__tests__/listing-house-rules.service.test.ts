import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listingFindFirst: vi.fn(),
  bookingAggregate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    listing: { findFirst: mocks.listingFindFirst },
    booking: { aggregate: mocks.bookingAggregate },
  },
}));

import { getListingHouseRulesEditorData } from "@/lib/services/listing-house-rules.service";

/** A listing row as the section reads it, defaulting to one that has answered
 *  everything the create flow asks. */
function listing(overrides: Record<string, unknown> = {}) {
  return {
    id: "listing-1",
    slug: "seaside-apartment",
    status: "APPROVED",
    checkInTime: "15:00",
    checkOutTime: "11:00",
    maxGuests: 4,
    petPolicy: "ASK_HOST",
    smokingPolicy: "OUTDOORS_ONLY",
    eventPolicy: "NOT_ALLOWED",
    quietHoursPolicy: "SET",
    quietHoursStart: "22:00",
    quietHoursEnd: "08:00",
    additionalRules: "No shoes indoors.",
    houseRulesReviewedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listingFindFirst.mockResolvedValue(listing());
  mocks.bookingAggregate.mockResolvedValue({ _max: { guestCount: null } });
});

describe("getListingHouseRulesEditorData ownership", () => {
  it("scopes the read to the host, so another host's listing is simply absent", async () => {
    await getListingHouseRulesEditorData("listing-1", "host-1");

    expect(mocks.listingFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "listing-1", hostId: "host-1" } }),
    );
  });

  it("returns null, and does not go looking for bookings, when there is no such listing", async () => {
    mocks.listingFindFirst.mockResolvedValue(null);

    expect(await getListingHouseRulesEditorData("listing-1", "host-2")).toBeNull();
    expect(mocks.bookingAggregate).not.toHaveBeenCalled();
  });
});

describe("getListingHouseRulesEditorData shape", () => {
  it("reports the stored rules as the editor's controls express them", async () => {
    const data = await getListingHouseRulesEditorData("listing-1", "host-1");

    expect(data).toEqual({
      listing: { id: "listing-1", slug: "seaside-apartment", status: "APPROVED" },
      rules: {
        checkInTime: "15:00",
        checkInEndTime: "",
        checkOutTime: "11:00",
        maxGuests: 4,
        petPolicy: "ASK_HOST",
        smokingPolicy: "OUTDOORS_ONLY",
        eventPolicy: "NOT_ALLOWED",
        quietHoursPolicy: "SET",
        quietHoursStart: "22:00",
        quietHoursEnd: "08:00",
        additionalRules: "No shoes indoors.",
      },
      reviewedAt: null,
      largestUpcomingParty: 0,
    });
  });

  it("turns a stored NULL time into the empty 'flexible' the controls use", async () => {
    mocks.listingFindFirst.mockResolvedValue(
      listing({ status: "DRAFT", checkInTime: null, checkOutTime: null }),
    );

    const data = await getListingHouseRulesEditorData("listing-1", "host-1");

    expect(data?.rules).toMatchObject({ checkInTime: "", checkOutTime: "" });
  });

  it("counts only unfinished stays that still hold a place, scoped to this listing", async () => {
    mocks.bookingAggregate.mockResolvedValue({ _max: { guestCount: 6 } });

    const data = await getListingHouseRulesEditorData("listing-1", "host-1");

    const where = mocks.bookingAggregate.mock.calls[0][0].where;
    expect(where.listingId).toBe("listing-1");
    expect(where.status).toEqual({ in: ["PENDING", "CONFIRMED"] });
    expect(where.checkOut.gte).toBeInstanceOf(Date);
    expect(data?.largestUpcomingParty).toBe(6);
  });
});

describe("getListingHouseRulesEditorData unanswered policies", () => {
  it("reports a listing published before these columns as unanswered, not refused", async () => {
    mocks.listingFindFirst.mockResolvedValue(
      listing({
        petPolicy: null,
        smokingPolicy: null,
        eventPolicy: null,
        quietHoursPolicy: null,
        quietHoursStart: null,
        quietHoursEnd: null,
        additionalRules: null,
      }),
    );

    const data = await getListingHouseRulesEditorData("listing-1", "host-1");

    expect(data?.rules).toMatchObject({
      petPolicy: null,
      smokingPolicy: null,
      eventPolicy: null,
      quietHoursPolicy: null,
      additionalRules: "",
    });
  });

  it("reads back the moment the host last reviewed the section", async () => {
    const reviewedAt = new Date("2026-08-01T09:30:00.000Z");
    mocks.listingFindFirst.mockResolvedValue(
      listing({ houseRulesReviewedAt: reviewedAt }),
    );

    const data = await getListingHouseRulesEditorData("listing-1", "host-1");

    expect(data?.reviewedAt).toEqual(reviewedAt);
  });

  it("drops quiet-hours times a row is holding without the rule behind them", async () => {
    mocks.listingFindFirst.mockResolvedValue(
      listing({ quietHoursPolicy: "NONE", quietHoursStart: "22:00", quietHoursEnd: "08:00" }),
    );

    const data = await getListingHouseRulesEditorData("listing-1", "host-1");

    expect(data?.rules).toMatchObject({
      quietHoursPolicy: "NONE",
      quietHoursStart: "",
      quietHoursEnd: "",
    });
  });
});
