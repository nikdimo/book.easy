import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  verifyManager: vi.fn(),
  setBookingMode: vi.fn(),
  preview: vi.fn(),
  confirm: vi.fn(),
  add: vi.fn(),
  update: vi.fn(),
  setDisabled: vi.fn(),
  remove: vi.fn(),
  revalidatePath: vi.fn(),
  revalidatePublic: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/utils/revalidate-public-listing-caches", () => ({
  revalidatePublicListingCaches: mocks.revalidatePublic,
}));
vi.mock("@/lib/services/fixed-stay-mutation.service", () => ({
  verifyFixedStayManager: mocks.verifyManager,
  setBookingModeForManagedListing: mocks.setBookingMode,
  previewFixedStayQuickSetupForManagedListing: mocks.preview,
  confirmFixedStayQuickSetupForManagedListing: mocks.confirm,
  addFixedStayPeriodForManagedListing: mocks.add,
  updateFixedStayPeriodForManagedListing: mocks.update,
  setFixedStayPeriodDisabledForManagedListing: mocks.setDisabled,
  deleteFixedStayPeriodForManagedListing: mocks.remove,
}));

import {
  addFixedStayPeriod,
  confirmFixedStayQuickSetup,
  deleteFixedStayPeriod,
  previewFixedStayQuickSetup,
  setFixedStayPeriodEnabled,
  setListingBookingMode,
  updateFixedStayPeriod,
} from "@/lib/actions/fixed-stay.actions";

/**
 * The action wrappers, with every service mocked out.
 *
 * What is worth proving at this layer is not the product rules — those are tested against
 * the real database beside the service — but that no payload reaches a service without a
 * session and a proven owner, that nothing a client sends past the four accepted fields is
 * forwarded, and that a refusal never revalidates a cache.
 */

const listing = {
  id: "listing-1",
  slug: "lake-house",
  status: "APPROVED",
  bookingMode: "FIXED_STAYS" as const,
};

const season = {
  seasonStart: "2029-06-09",
  lastCheckOut: "2029-06-30",
  changeoverWeekday: 6,
  nights: [7],
};

/** Every action, called the way a client would, for the sweeps below. */
const callAll = () => [
  setListingBookingMode("listing-1", "FIXED_STAYS"),
  previewFixedStayQuickSetup("listing-1", season),
  confirmFixedStayQuickSetup("listing-1", season),
  addFixedStayPeriod("listing-1", { checkIn: "2029-06-09", nights: 7 }),
  updateFixedStayPeriod("listing-1", {
    periodId: "period-1",
    checkIn: "2029-06-09",
    nights: 7,
  }),
  setFixedStayPeriodEnabled("listing-1", "period-1", false),
  deleteFixedStayPeriod("listing-1", "period-1"),
];

const serviceCalls = () =>
  mocks.setBookingMode.mock.calls.length +
  mocks.preview.mock.calls.length +
  mocks.confirm.mock.calls.length +
  mocks.add.mock.calls.length +
  mocks.update.mock.calls.length +
  mocks.setDisabled.mock.calls.length +
  mocks.remove.mock.calls.length;

describe("fixed-stay action wrappers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({
      user: { id: "host-1", role: "HOST", isHost: true },
    });
    mocks.verifyManager.mockResolvedValue(listing);
    mocks.setBookingMode.mockResolvedValue({
      success: true,
      bookingMode: "FIXED_STAYS",
    });
    mocks.preview.mockResolvedValue({
      success: true,
      rows: [],
      generated: 0,
      newCount: 0,
      duplicateCount: 0,
    });
    mocks.confirm.mockResolvedValue({
      success: true,
      generated: 3,
      created: 3,
      skipped: 0,
    });
    const written = {
      success: true,
      period: {
        id: "period-1",
        checkIn: "2029-06-09",
        checkOut: "2029-06-16",
        nights: 7,
      },
      overlaps: [],
    };
    mocks.add.mockResolvedValue(written);
    mocks.update.mockResolvedValue(written);
    mocks.setDisabled.mockResolvedValue({ ...written, disabled: true });
    mocks.remove.mockResolvedValue({ success: true, deletedId: "period-1" });
  });

  it("scopes ownership through the shared manager check", async () => {
    await addFixedStayPeriod("listing-1", { checkIn: "2029-06-09", nights: 7 });
    expect(mocks.verifyManager).toHaveBeenCalledWith(
      { id: "host-1", role: "HOST" },
      "listing-1",
    );
    expect(mocks.add).toHaveBeenCalledWith(
      listing,
      "host-1",
      { checkIn: "2029-06-09", nights: 7 },
    );
  });

  it("passes an admin's role through so admins reach any listing", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN", isHost: false },
    });
    await deleteFixedStayPeriod("listing-1", "period-1");
    expect(mocks.verifyManager).toHaveBeenCalledWith(
      { id: "admin-1", role: "ADMIN" },
      "listing-1",
    );
  });

  it("never enters a service without a session", async () => {
    mocks.auth.mockResolvedValue(null);
    for (const result of await Promise.all(callAll())) {
      expect(result).toEqual({ error: "Not authorized." });
    }
    expect(serviceCalls()).toBe(0);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("never enters a service for a listing the caller does not manage", async () => {
    mocks.verifyManager.mockResolvedValue(null);
    for (const result of await Promise.all(callAll())) {
      // The same sentence a missing listing gets: a different one would confirm that
      // another host's listing id is real.
      expect(result).toEqual({ error: "Listing not found." });
    }
    expect(serviceCalls()).toBe(0);
  });

  it("refuses a blank or non-string listing id before anything else", async () => {
    expect(
      await addFixedStayPeriod("", { checkIn: "2029-06-09", nights: 7 }),
    ).toEqual({ error: "Listing not found." });
    expect(
      await deleteFixedStayPeriod(
        undefined as unknown as string,
        "period-1",
      ),
    ).toEqual({ error: "Listing not found." });
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(serviceCalls()).toBe(0);
  });

  it("refuses a booking mode this product does not have", async () => {
    expect(
      await setListingBookingMode(
        "listing-1",
        "PACKAGES" as unknown as "FLEXIBLE",
      ),
    ).toEqual({ error: "Choose either flexible dates or fixed stays." });
    expect(mocks.setBookingMode).not.toHaveBeenCalled();
  });

  it.each([1, 6, 8, 10, 13, 21, 0, -7])(
    "refuses %s nights before reaching the service",
    async (nights) => {
      expect(
        await addFixedStayPeriod("listing-1", { checkIn: "2029-06-09", nights }),
      ).toMatchObject({ error: expect.any(String) });
      expect(
        await updateFixedStayPeriod("listing-1", {
          periodId: "period-1",
          checkIn: "2029-06-09",
          nights,
        }),
      ).toMatchObject({ error: expect.any(String) });
      expect(mocks.add).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
    },
  );

  it.each(["2029-6-9", "09/06/2029", "", "2029-06-09T00:00:00Z"])(
    "refuses the malformed date %s",
    async (checkIn) => {
      expect(await addFixedStayPeriod("listing-1", { checkIn, nights: 7 })).toEqual({
        error: "Enter a valid date.",
      });
      expect(mocks.add).not.toHaveBeenCalled();
    },
  );

  it("never forwards a checkout, a price, or any other extra a client sends", async () => {
    await addFixedStayPeriod("listing-1", {
      checkIn: "2029-06-09",
      nights: 7,
      checkOut: "2029-12-25",
      packagePrice: 999,
      packagePriceCurrency: "EUR",
      disabledAt: null,
      state: "AVAILABLE",
      listingId: "someone-elses-listing",
    } as unknown as { checkIn: string; nights: number });

    expect(mocks.add).toHaveBeenCalledWith(listing, "host-1", {
      checkIn: "2029-06-09",
      nights: 7,
    });
    const forwarded = JSON.stringify(mocks.add.mock.calls[0]);
    expect(forwarded).not.toContain("999");
    expect(forwarded).not.toContain("2029-12-25");
    expect(forwarded).not.toContain("someone-elses-listing");
  });

  it("forwards Quick setup as the four answers, never as a list of periods", async () => {
    await confirmFixedStayQuickSetup("listing-1", {
      ...season,
      nights: [7, 14],
      periods: [{ checkIn: "1999-01-01", checkOut: "1999-01-08" }],
    } as unknown as typeof season);

    expect(mocks.confirm).toHaveBeenCalledWith(listing, "host-1", {
      seasonStart: "2029-06-09",
      lastCheckOut: "2029-06-30",
      changeoverWeekday: 6,
      nights: [7, 14],
    });
    expect(JSON.stringify(mocks.confirm.mock.calls[0])).not.toContain("1999");
  });

  it("refuses a changeover weekday outside the week", async () => {
    for (const changeoverWeekday of [-1, 7, 9, 1.5]) {
      expect(
        await confirmFixedStayQuickSetup("listing-1", { ...season, changeoverWeekday }),
      ).toMatchObject({ error: expect.any(String) });
    }
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("refuses an unsupported Quick setup duration", async () => {
    expect(
      await confirmFixedStayQuickSetup("listing-1", { ...season, nights: [10] }),
    ).toMatchObject({ error: expect.any(String) });
    expect(
      await confirmFixedStayQuickSetup("listing-1", { ...season, nights: [] }),
    ).toMatchObject({ error: expect.any(String) });
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("turns an enabled flag into the service's disabled flag", async () => {
    await setFixedStayPeriodEnabled("listing-1", "period-1", false);
    expect(mocks.setDisabled).toHaveBeenLastCalledWith(listing, "host-1", {
      periodId: "period-1",
      disabled: true,
    });
    await setFixedStayPeriodEnabled("listing-1", "period-1", true);
    expect(mocks.setDisabled).toHaveBeenLastCalledWith(listing, "host-1", {
      periodId: "period-1",
      disabled: false,
    });
  });

  it("refuses a blank period id", async () => {
    expect(await deleteFixedStayPeriod("listing-1", "")).toEqual({
      error: "Fixed stay not found.",
    });
    expect(await setFixedStayPeriodEnabled("listing-1", "", true)).toEqual({
      error: "Fixed stay not found.",
    });
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.setDisabled).not.toHaveBeenCalled();
  });
});

describe("cache revalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({
      user: { id: "host-1", role: "HOST", isHost: true },
    });
    mocks.verifyManager.mockResolvedValue(listing);
    mocks.remove.mockResolvedValue({ success: true, deletedId: "period-1" });
    mocks.confirm.mockResolvedValue({
      success: true,
      generated: 3,
      created: 3,
      skipped: 0,
    });
    mocks.preview.mockResolvedValue({
      success: true,
      rows: [],
      generated: 0,
      newCount: 0,
      duplicateCount: 0,
    });
  });

  it("refreshes the host calendar, the editor and the public page after a write", async () => {
    await deleteFixedStayPeriod("listing-1", "period-1");
    const paths = mocks.revalidatePath.mock.calls.map((call) => call[0]);
    expect(paths).toContain("/host/calendar");
    expect(paths).toContain("/host/listings/listing-1");
    expect(paths).toContain("/properties/lake-house");
    expect(mocks.revalidatePublic).toHaveBeenCalled();
  });

  it("leaves the public caches alone for a listing that is not live", async () => {
    mocks.verifyManager.mockResolvedValue({ ...listing, status: "DRAFT" });
    await deleteFixedStayPeriod("listing-1", "period-1");
    const paths = mocks.revalidatePath.mock.calls.map((call) => call[0]);
    expect(paths).toContain("/host/calendar");
    expect(paths).not.toContain("/properties/lake-house");
    expect(mocks.revalidatePublic).not.toHaveBeenCalled();
  });

  it("does not revalidate when the service refuses", async () => {
    mocks.remove.mockResolvedValue({ error: "A guest has booked this stay." });
    expect(await deleteFixedStayPeriod("listing-1", "period-1")).toEqual({
      error: "A guest has booked this stay.",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.revalidatePublic).not.toHaveBeenCalled();
  });

  it("does not revalidate for a preview, which writes nothing", async () => {
    await previewFixedStayQuickSetup("listing-1", season);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
