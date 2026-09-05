import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireHost: vi.fn(),
  listingFindFirst: vi.fn(),
  listingUpdate: vi.fn(),
  revalidatePath: vi.fn(),
  revalidatePublicListingCaches: vi.fn(),
}));

vi.mock("@/lib/auth-helpers", () => ({ requireHost: mocks.requireHost }));
vi.mock("@/lib/db", () => ({
  db: {
    listing: { findFirst: mocks.listingFindFirst, update: mocks.listingUpdate },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/utils/revalidate-public-listing-caches", () => ({
  revalidatePublicListingCaches: mocks.revalidatePublicListingCaches,
}));

import { updateListingHouseRules } from "@/lib/actions/listing-house-rules.actions";
import type { ListingHouseRulesInput } from "@/lib/host/v2/listing-house-rules";

/** What the editor sends when the host has answered everything. */
const VALID: ListingHouseRulesInput = {
  checkInTime: "16:00",
  checkInEndTime: "",
  checkOutTime: "10:00",
  maxGuests: 6,
  petPolicy: "ASK_HOST",
  smokingPolicy: "OUTDOORS_ONLY",
  eventPolicy: "NOT_ALLOWED",
  quietHoursPolicy: "SET",
  quietHoursPeriods: [{ start: "22:00", end: "08:00" }],
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  additionalRules: "No shoes indoors.",
};

/** A listing row, defaulting to one published before these columns existed. */
function listing(overrides: Record<string, unknown> = {}) {
  return {
    id: "listing-1",
    slug: "seaside-apartment",
    status: "DRAFT",
    checkInTime: "15:00",
    checkOutTime: "11:00",
    maxGuests: 4,
    petPolicy: null,
    smokingPolicy: null,
    eventPolicy: null,
    quietHoursPolicy: null,
    quietHoursStart: null,
    quietHoursEnd: null,
    additionalRules: null,
    houseRulesReviewedAt: null,
    ...overrides,
  };
}

/** The same row, holding everything VALID says. */
function storedAsValid(overrides: Record<string, unknown> = {}) {
  return listing({
    checkInTime: "16:00",
    checkOutTime: "10:00",
    maxGuests: 6,
    petPolicy: "ASK_HOST",
    smokingPolicy: "OUTDOORS_ONLY",
    eventPolicy: "NOT_ALLOWED",
    quietHoursPolicy: "SET",
    quietHoursStart: "22:00",
    quietHoursEnd: "08:00",
    additionalRules: "No shoes indoors.",
    ...overrides,
  });
}

function writtenData() {
  return mocks.listingUpdate.mock.calls[0][0].data as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireHost.mockResolvedValue({ id: "host-1", isHost: true });
  mocks.listingFindFirst.mockResolvedValue(listing());
  mocks.listingUpdate.mockResolvedValue({});
});

describe("updateListingHouseRules ownership", () => {
  it("scopes the read to the signed-in host", async () => {
    await updateListingHouseRules("listing-1", VALID);

    expect(mocks.listingFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "listing-1", hostId: "host-1" } }),
    );
  });

  it("refuses a listing this host does not own, without writing", async () => {
    mocks.listingFindFirst.mockResolvedValue(null);

    const result = await updateListingHouseRules("someone-elses", VALID);

    expect(result).toEqual({ error: "Listing not found." });
    expect(mocks.listingUpdate).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated caller before anything is read", async () => {
    mocks.requireHost.mockRejectedValue(new Error("Host access required"));

    await expect(updateListingHouseRules("listing-1", VALID)).rejects.toThrow(
      "Host access required",
    );
    expect(mocks.listingFindFirst).not.toHaveBeenCalled();
  });
});

describe("updateListingHouseRules validation", () => {
  it("refuses a guest count outside the range rather than clamping it", async () => {
    const result = await updateListingHouseRules("listing-1", {
      ...VALID,
      maxGuests: 40,
    });

    expect(result).toEqual({ issues: { maxGuests: "TOO_HIGH" } });
    expect(mocks.listingUpdate).not.toHaveBeenCalled();
  });

  it("refuses a time that is not a time, rather than storing 'flexible'", async () => {
    const result = await updateListingHouseRules("listing-1", {
      ...VALID,
      checkInTime: "25:00",
    });

    expect(result).toEqual({ issues: { checkInTime: "NOT_A_TIME" } });
    expect(mocks.listingUpdate).not.toHaveBeenCalled();
  });

  it("refuses a policy this build does not recognise, rather than clearing it", async () => {
    // Reading "MAYBE" as "unanswered" would store a change the host never chose.
    const result = await updateListingHouseRules("listing-1", {
      ...VALID,
      petPolicy: "MAYBE" as never,
    });

    expect(result).toEqual({ issues: { petPolicy: "NOT_A_CHOICE" } });
    expect(mocks.listingUpdate).not.toHaveBeenCalled();
  });

  it("refuses quiet hours with only one end set", async () => {
    const result = await updateListingHouseRules("listing-1", {
      ...VALID,
      quietHoursPeriods: [{ start: "22:00", end: "" }],
      quietHoursEnd: "",
    });

    expect(result).toEqual({ issues: { quietHoursEnd: "REQUIRED" } });
    expect(mocks.listingUpdate).not.toHaveBeenCalled();
  });

  it("refuses additional rules that are too long, rather than truncating them", async () => {
    const result = await updateListingHouseRules("listing-1", {
      ...VALID,
      additionalRules: "x".repeat(5_000),
    });

    expect(result).toEqual({ issues: { additionalRules: "TOO_LONG" } });
    expect(mocks.listingUpdate).not.toHaveBeenCalled();
  });

  it("accepts a listing that has never answered a policy", async () => {
    // Every listing published before these columns existed. The create flow requires
    // answers; the editor must not lock its host out over a question nobody asked them.
    const result = await updateListingHouseRules("listing-1", {
      ...VALID,
      petPolicy: null,
      smokingPolicy: null,
      eventPolicy: null,
      quietHoursPolicy: null,
      quietHoursStart: "",
      quietHoursEnd: "",
    });

    expect(result.issues).toBeUndefined();
    expect(writtenData()).toMatchObject({ petPolicy: null, smokingPolicy: null });
  });

  it("reports every broken field in one answer", async () => {
    const result = await updateListingHouseRules("listing-1", {
      ...VALID,
      checkInTime: "later",
      maxGuests: 0,
    });

    expect(result.issues).toEqual({ checkInTime: "NOT_A_TIME", maxGuests: "TOO_LOW" });
    expect(mocks.listingUpdate).not.toHaveBeenCalled();
  });
});

describe("updateListingHouseRules persistence", () => {
  it("stores every rule, and reports back what it stored", async () => {
    const result = await updateListingHouseRules("listing-1", VALID);

    expect(writtenData()).toMatchObject({
      checkInTime: "16:00",
      checkOutTime: "10:00",
      maxGuests: 6,
      petPolicy: "ASK_HOST",
      smokingPolicy: "OUTDOORS_ONLY",
      eventPolicy: "NOT_ALLOWED",
      quietHoursPolicy: "SET",
      quietHoursStart: "22:00",
      quietHoursEnd: "08:00",
      additionalRules: "No shoes indoors.",
    });
    expect(result.rules).toEqual(VALID);
  });

  it("stores NULL for a flexible host, which is what the public page tests for", async () => {
    await updateListingHouseRules("listing-1", {
      ...VALID,
      checkInTime: "",
      checkOutTime: "",
      additionalRules: "",
    });

    expect(writtenData()).toMatchObject({
      checkInTime: null,
      checkOutTime: null,
      additionalRules: null,
    });
  });

  it("clears the quiet-hours times when the host switches quiet hours off", async () => {
    mocks.listingFindFirst.mockResolvedValue(storedAsValid());

    await updateListingHouseRules("listing-1", {
      ...VALID,
      quietHoursPolicy: "NONE",
    });

    expect(writtenData()).toMatchObject({
      quietHoursPolicy: "NONE",
      quietHoursStart: null,
      quietHoursEnd: null,
    });
  });

  it("keeps an imported off-grid time when the host only changes the guest count", async () => {
    mocks.listingFindFirst.mockResolvedValue(listing({ checkInTime: "14:15" }));

    const result = await updateListingHouseRules("listing-1", {
      ...VALID,
      checkInTime: "14:15",
      maxGuests: 5,
    });

    expect(writtenData()).toMatchObject({ checkInTime: "14:15" });
    expect(result.rules?.checkInTime).toBe("14:15");
  });

  it("stores the review stamp even when nothing changed, and touches nothing else", async () => {
    // A host who opens the section, reads it and agrees with every answer has reviewed
    // it. That is the claim the editor's tick makes, so it is the fact recorded.
    mocks.listingFindFirst.mockResolvedValue(storedAsValid());

    const result = await updateListingHouseRules("listing-1", VALID);

    expect(Object.keys(writtenData())).toEqual(["houseRulesReviewedAt"]);
    expect(writtenData().houseRulesReviewedAt).toBeInstanceOf(Date);
    expect(result.reviewedAt).toEqual(
      (writtenData().houseRulesReviewedAt as Date).toISOString(),
    );
  });

  it("treats a stored NULL and a submitted '' as the same value", async () => {
    mocks.listingFindFirst.mockResolvedValue(
      storedAsValid({ checkInTime: null, checkOutTime: null }),
    );

    await updateListingHouseRules("listing-1", {
      ...VALID,
      checkInTime: "",
      checkOutTime: "",
    });

    // Only the stamp: nothing about the listing's rules actually differs.
    expect(Object.keys(writtenData())).toEqual(["houseRulesReviewedAt"]);
  });

  it("revalidates the editor and the classic form, but not a draft's public page", async () => {
    await updateListingHouseRules("listing-1", VALID);

    const paths = mocks.revalidatePath.mock.calls.map(([path]) => path);
    expect(paths).toContain("/host/listings/listing-1/house-rules");
    expect(paths).toContain("/host/listings/listing-1");
    expect(paths).toContain("/host/listings/listing-1/edit");
    expect(paths).not.toContain("/properties/seaside-apartment");
    expect(mocks.revalidatePublicListingCaches).not.toHaveBeenCalled();
  });
});

describe("updateListingHouseRules moderation", () => {
  it("flags a live listing for re-review and rebuilds its public page", async () => {
    mocks.listingFindFirst.mockResolvedValue(listing({ status: "APPROVED" }));

    await updateListingHouseRules("listing-1", VALID);

    expect(writtenData()).toMatchObject({ needsReview: true });
    const paths = mocks.revalidatePath.mock.calls.map(([path]) => path);
    expect(paths).toContain("/properties/seaside-apartment");
    expect(mocks.revalidatePublicListingCaches).toHaveBeenCalled();
  });

  it("puts an edit to the host's own written rules back in the review queue", async () => {
    // `additionalRules` is guest-facing copy in the host's words, so it gets exactly
    // what title and description get.
    mocks.listingFindFirst.mockResolvedValue(storedAsValid({ status: "APPROVED" }));

    await updateListingHouseRules("listing-1", {
      ...VALID,
      additionalRules: "Quiet in the courtyard after 10pm, please.",
    });

    expect(writtenData()).toMatchObject({
      needsReview: true,
      additionalRules: "Quiet in the courtyard after 10pm, please.",
    });
  });

  it("stores the host's words exactly, never a translation of them", async () => {
    const written = "Молиме извадете ги чевлите.";

    await updateListingHouseRules("listing-1", { ...VALID, additionalRules: written });

    expect(writtenData().additionalRules).toBe(written);
  });

  it("does not re-queue a live listing for a review that changed nothing", async () => {
    mocks.listingFindFirst.mockResolvedValue(storedAsValid({ status: "APPROVED" }));

    await updateListingHouseRules("listing-1", VALID);

    expect(writtenData()).not.toHaveProperty("needsReview");
  });

  it("leaves a listing that is not live out of the review queue", async () => {
    mocks.listingFindFirst.mockResolvedValue(listing({ status: "UNPUBLISHED" }));

    await updateListingHouseRules("listing-1", VALID);

    expect(writtenData()).not.toHaveProperty("needsReview");
  });
});
