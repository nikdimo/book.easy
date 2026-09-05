import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  verify: vi.fn(),
  setStayLimits: vi.fn(),
  setBookingMode: vi.fn(),
  setChangeover: vi.fn(),
  revalidatePath: vi.fn(),
  revalidatePublic: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/utils/revalidate-public-listing-caches", () => ({
  revalidatePublicListingCaches: mocks.revalidatePublic,
}));
vi.mock("@/lib/services/fixed-stay-mutation.service", () => ({
  verifyFixedStayManager: mocks.verify,
  setStayLimitsForManagedListing: mocks.setStayLimits,
  setBookingModeForManagedListing: mocks.setBookingMode,
  setChangeoverWeekdayForManagedListing: mocks.setChangeover,
}));

import { setListingStayLimits } from "@/lib/actions/fixed-stay.actions";

/**
 * The stay-limit write boundary, held to the product-wide reading of `maxNights`.
 *
 * Zero is how "no maximum" is stored, so the schema has to accept it — and the message
 * shown when it does not must describe the value it actually rejects. The old text ("A
 * maximum stay must be at least 1 night.") sat on a `.min(0)` bound that never fires for
 * zero, so it could only ever be shown for a negative number, about which it said
 * nothing true.
 */
describe("setListingStayLimits validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "host-1", role: "HOST" } });
    mocks.verify.mockResolvedValue({ id: "listing-1", slug: "lake-house" });
    mocks.setStayLimits.mockResolvedValue({ success: "Stay limits saved." });
  });

  it("accepts a maximum of 0 as 'no maximum' and writes it through", async () => {
    await expect(
      setListingStayLimits("listing-1", { minNights: 3, maxNights: 0 }),
    ).resolves.toEqual({ success: "Stay limits saved." });
    expect(mocks.setStayLimits).toHaveBeenCalledWith(
      expect.objectContaining({ id: "listing-1" }),
      "host-1",
      { minNights: 3, maxNights: 0 },
    );
  });

  it("rejects a negative maximum with a message about the value it rejected", async () => {
    await expect(
      setListingStayLimits("listing-1", { minNights: 1, maxNights: -1 }),
    ).resolves.toEqual({ error: "A maximum stay cannot be negative." });
    expect(mocks.setStayLimits).not.toHaveBeenCalled();
    // Validation runs before any session read, so an invalid payload never touches auth.
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it("still rejects a minimum below one night", async () => {
    await expect(
      setListingStayLimits("listing-1", { minNights: 0, maxNights: 10 }),
    ).resolves.toEqual({ error: "A minimum stay must be at least 1 night." });
    expect(mocks.setStayLimits).not.toHaveBeenCalled();
  });
});
