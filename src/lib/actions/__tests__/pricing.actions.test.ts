import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  listingFindFirst: vi.fn(),
  saveDefaultPricing: vi.fn(),
  createDefaultPricing: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({
  db: { listing: { findFirst: mocks.listingFindFirst } },
}));
vi.mock("@/lib/services/pricing-promotion-mutation.service", () => ({
  saveDefaultPricingForManagedListing: mocks.saveDefaultPricing,
  createDefaultPricingForManagedListing: mocks.createDefaultPricing,
}));

import {
  createListingPricing,
  saveListingPricing,
} from "@/lib/actions/pricing.actions";

function pricingForm() {
  const formData = new FormData();
  formData.set("baseNightlyRate", "120");
  formData.set("cleaningFee", "35");
  return formData;
}

/** What a Pricing page rendered before an Availability edit would still submit. */
function stalePricingForm() {
  const formData = pricingForm();
  formData.set("minNights", "2");
  formData.set("maxNights", "30");
  return formData;
}

describe("saveListingPricing web wrapper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "host-1", isHost: true } });
    mocks.listingFindFirst.mockResolvedValue({
      id: "listing-1",
      slug: "lake-house",
      availabilityMode: "OPEN",
    });
    mocks.saveDefaultPricing.mockResolvedValue({ success: "Pricing saved." });
    mocks.createDefaultPricing.mockResolvedValue({ success: "Pricing saved." });
  });

  it("authenticates, scopes ownership, and delegates to the canonical core", async () => {
    await expect(
      saveListingPricing("listing-1", {}, pricingForm()),
    ).resolves.toEqual({ success: "Pricing saved." });
    expect(mocks.listingFindFirst).toHaveBeenCalledWith({
      where: { id: "listing-1", hostId: "host-1" },
      select: { id: true, slug: true, availabilityMode: true },
    });
    expect(mocks.saveDefaultPricing).toHaveBeenCalledWith(
      { id: "listing-1", slug: "lake-house", availabilityMode: "OPEN" },
      "host-1",
      { baseNightlyRate: 120, cleaningFee: 35 },
    );
  });

  it("forwards the two amounts and nothing else", async () => {
    await saveListingPricing("listing-1", {}, pricingForm());
    const [, , input] = mocks.saveDefaultPricing.mock.calls[0];
    expect(Object.keys(input).sort()).toEqual(["baseNightlyRate", "cleaningFee"]);
  });

  /**
   * The stale-tab race, at the boundary that has to close it.
   *
   * A host opens Pricing, changes their minimum stay from Availability in another tab,
   * then saves a price from the older Pricing tab. That save carries the stay limits
   * the page was rendered with; if the action forwarded them, the price save would undo
   * the booking-rule change. Extra form fields are dropped here, so it cannot.
   */
  it("ignores stay limits submitted by a stale Pricing page", async () => {
    await expect(
      saveListingPricing("listing-1", {}, stalePricingForm()),
    ).resolves.toEqual({ success: "Pricing saved." });
    expect(mocks.saveDefaultPricing).toHaveBeenCalledWith(
      { id: "listing-1", slug: "lake-house", availabilityMode: "OPEN" },
      "host-1",
      { baseNightlyRate: 120, cleaningFee: 35 },
    );
    const [, , input] = mocks.saveDefaultPricing.mock.calls[0];
    expect(input).not.toHaveProperty("minNights");
    expect(input).not.toHaveProperty("maxNights");
  });

  it("does not expose the core to unauthenticated or non-owner callers", async () => {
    mocks.auth.mockResolvedValue(null);
    await expect(saveListingPricing("listing-1", {}, pricingForm())).resolves.toEqual({
      error: "Not authorized.",
    });
    mocks.auth.mockResolvedValue({ user: { id: "host-1", isHost: true } });
    mocks.listingFindFirst.mockResolvedValue(null);
    await expect(saveListingPricing("listing-1", {}, pricingForm())).resolves.toEqual({
      error: "Listing not found.",
    });
    expect(mocks.saveDefaultPricing).not.toHaveBeenCalled();
  });
});

/**
 * The Pricing section's path for a listing that has never been priced. It is a write
 * like any other: same session check, same ownership scope, same canonical core.
 */
describe("createListingPricing web wrapper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "host-1", isHost: true } });
    mocks.listingFindFirst.mockResolvedValue({
      id: "listing-1",
      slug: "lake-house",
      availabilityMode: "OPEN",
    });
    mocks.createDefaultPricing.mockResolvedValue({ success: "Pricing saved." });
  });

  it("authenticates, scopes ownership, and delegates to the canonical core", async () => {
    await expect(
      createListingPricing("listing-1", {
        baseNightlyRate: 90,
        cleaningFee: 0,
      }),
    ).resolves.toEqual({ success: "Pricing saved." });
    expect(mocks.listingFindFirst).toHaveBeenCalledWith({
      where: { id: "listing-1", hostId: "host-1" },
      select: { id: true, slug: true, availabilityMode: true },
    });
    expect(mocks.createDefaultPricing).toHaveBeenCalledWith(
      { id: "listing-1", slug: "lake-house", availabilityMode: "OPEN" },
      "host-1",
      { baseNightlyRate: 90, cleaningFee: 0 },
    );
    // The neutral minimum a new rule needs is the server's business; the Pricing UI
    // neither submits nor controls it.
    const [, , input] = mocks.createDefaultPricing.mock.calls[0];
    expect(Object.keys(input).sort()).toEqual(["baseNightlyRate", "cleaningFee"]);
  });

  it("does not expose the core to unauthenticated or non-owner callers", async () => {
    const input = { baseNightlyRate: 90, cleaningFee: 0 };
    mocks.auth.mockResolvedValue(null);
    await expect(createListingPricing("listing-1", input)).resolves.toEqual({
      error: "Not authorized.",
    });
    // A signed-in host is still not every host: the listing lookup is scoped by
    // `hostId`, so someone else's id resolves to nothing.
    mocks.auth.mockResolvedValue({ user: { id: "host-1", isHost: true } });
    mocks.listingFindFirst.mockResolvedValue(null);
    await expect(createListingPricing("listing-1", input)).resolves.toEqual({
      error: "Listing not found.",
    });
    expect(mocks.createDefaultPricing).not.toHaveBeenCalled();
  });

  it("refuses a signed-in user who is not a host", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "guest-1", isHost: false } });
    await expect(
      createListingPricing("listing-1", {
        baseNightlyRate: 90,
        cleaningFee: 0,
      }),
    ).resolves.toEqual({ error: "Not authorized." });
    expect(mocks.listingFindFirst).not.toHaveBeenCalled();
  });
});
