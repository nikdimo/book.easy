import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The listing currency, from the moment a draft comes into existence to the moment it
 * is published.
 *
 * One rule runs through all of it: the currency is decided *once*, seeded from the
 * currency the host was reading the site in, and after that it is the draft's own.
 * Nothing in the flow may replace it, and nothing may keep an amount while changing
 * the label around it.
 */
const mocks = vi.hoisted(() => ({
  requireHost: vi.fn(async () => ({ id: "host-1" })),
  draftFindFirst: vi.fn(),
  draftUpdateMany: vi.fn(async () => ({ count: 1 })),
  draftCreate: vi.fn(),
  transaction: vi.fn(),
  submitNewListing: vi.fn(async () => ({
    success: true as const,
    listingId: "listing-1",
    slug: "sunny-loft",
  })),
  displayCurrency: vi.fn(async () => "DKK"),
  cookieStore: {
    get: vi.fn(() => undefined as { value: string } | undefined),
    set: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("next/headers", () => ({ cookies: async () => mocks.cookieStore }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth-helpers", () => ({ requireHost: mocks.requireHost }));
vi.mock("@/lib/currency/server", () => ({ getDisplayCurrency: mocks.displayCurrency }));
vi.mock("@/lib/db", () => ({
  db: {
    listingDraft: {
      findFirst: mocks.draftFindFirst,
      updateMany: mocks.draftUpdateMany,
      create: mocks.draftCreate,
      deleteMany: vi.fn(),
    },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/actions/listing.actions", () => ({
  submitNewListing: mocks.submitNewListing,
}));
vi.mock("@/lib/listing-draft-cleanup", () => ({
  deleteOwnedListingDraftWithCleanup: vi.fn(),
}));
vi.mock("@/lib/storage/upload-cleanup", () => ({
  enqueueUploadDeletions: vi.fn(async (_tx: unknown, urls: string[]) => urls),
  sweepUploads: vi.fn(async () => ({ scanned: 0, deleted: 0, kept: 0, failed: 0 })),
}));

import {
  publishHostStartDraft,
  saveHostStartDraftPatch,
} from "@/lib/actions/host-start.actions";
import { emptyDepositPoliciesDraft } from "@/lib/host/v2/listing-deposit-draft";

/** The JSON the create call was handed — the draft as it is first written to disk. */
function createdDraftData(): Record<string, unknown> {
  const call = mocks.draftCreate.mock.calls.at(-1) as
    | [{ data: { data: Record<string, unknown> } }]
    | undefined;
  return call?.[0].data.data ?? {};
}

/** The JSON an update call was handed, i.e. the draft after a save. */
function savedDraftData(): Record<string, unknown> {
  const call = mocks.draftUpdateMany.mock.calls.at(-1) as
    | [{ data: { data: Record<string, unknown> } }]
    | undefined;
  return call?.[0].data.data ?? {};
}

/** What the publish carried into `submitNewListing`, which is the value the
 *  `PricingRule` is created with. */
function publishedCurrency(): string | null {
  const formData = mocks.submitNewListing.mock.calls.at(-1)?.at(0) as
    | FormData
    | undefined;
  const value = formData?.get("currency");
  return typeof value === "string" ? value : null;
}

/** A draft row as the action reads it back on the next save. */
function existingDraft(data: Record<string, unknown>) {
  return {
    id: "draft-1",
    hostId: "host-1",
    updatedAt: new Date("2026-08-21T00:00:00Z"),
    data,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.displayCurrency.mockResolvedValue("DKK");
  mocks.cookieStore.get.mockReturnValue(undefined);
  mocks.draftCreate.mockImplementation(async (args: { data: { data: unknown } }) => ({
    id: "draft-1",
    data: args.data.data,
  }));
  mocks.draftUpdateMany.mockResolvedValue({ count: 1 });
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback({ listingDraft: { updateMany: mocks.draftUpdateMany } }),
  );
});

describe("a brand-new draft takes the host's own currency", () => {
  it("seeds the draft with the currency the host is browsing in, not with EUR", async () => {
    await expect(saveHostStartDraftPatch({ propertyType: "HOUSE" })).resolves.toMatchObject({
      success: true,
      data: { currency: "DKK" },
    });

    expect(createdDraftData()).toMatchObject({ currency: "DKK" });
  });

  it("does not override a currency the very first patch already carries", async () => {
    // An import is the case: the listing arrives priced in the currency it was
    // already advertised in, and that is not the host's reading currency.
    await saveHostStartDraftPatch({ currency: "USD", baseNightlyRate: "120" });

    expect(createdDraftData()).toMatchObject({ currency: "USD", baseNightlyRate: "120" });
  });

  it("follows a later change of display currency for the next new draft", async () => {
    mocks.displayCurrency.mockResolvedValue("MKD");

    await saveHostStartDraftPatch({ propertyType: "HOUSE" });

    expect(createdDraftData()).toMatchObject({ currency: "MKD" });
  });
});

describe("the draft's currency survives every save", () => {
  it("is left alone by a save that says nothing about money", async () => {
    mocks.cookieStore.get.mockReturnValue({ value: "draft-1" });
    mocks.draftFindFirst.mockResolvedValue(
      existingDraft({ currency: "DKK", baseNightlyRate: "800" }),
    );

    await expect(saveHostStartDraftPatch({ title: "Sunny loft" })).resolves.toMatchObject({
      data: { currency: "DKK", baseNightlyRate: "800" },
    });

    expect(savedDraftData()).toMatchObject({ currency: "DKK", baseNightlyRate: "800" });
  });

  it("is never re-seeded from the display currency once the draft exists", async () => {
    // The host changed the site to EUR halfway through. The listing stays in DKK
    // until they say otherwise on the price step — a stored 800 must not become 800
    // of a different currency behind their back.
    mocks.displayCurrency.mockResolvedValue("EUR");
    mocks.cookieStore.get.mockReturnValue({ value: "draft-1" });
    mocks.draftFindFirst.mockResolvedValue(
      existingDraft({ currency: "DKK", baseNightlyRate: "800" }),
    );

    await saveHostStartDraftPatch({ title: "Sunny loft" });

    expect(savedDraftData()).toMatchObject({ currency: "DKK", baseNightlyRate: "800" });
  });

  it("accepts an explicit change of currency, which the step only sends with new amounts", async () => {
    mocks.cookieStore.get.mockReturnValue({ value: "draft-1" });
    mocks.draftFindFirst.mockResolvedValue(
      existingDraft({ currency: "DKK", baseNightlyRate: "800" }),
    );

    await saveHostStartDraftPatch({ currency: "EUR", baseNightlyRate: "107" });

    expect(savedDraftData()).toMatchObject({ currency: "EUR", baseNightlyRate: "107" });
  });
});

describe("publishing prices the listing in the draft's currency", () => {
  it("carries a seeded currency through to the pricing rule", async () => {
    mocks.cookieStore.get.mockReturnValue({ value: "draft-1" });
    mocks.draftFindFirst.mockResolvedValue(
      existingDraft({
        title: "Sunny loft",
        currency: "DKK",
        baseNightlyRate: "800",
        depositPolicies: emptyDepositPoliciesDraft(),
        freeCancellationDaysBeforeCheckIn: "7",
      }),
    );

    await expect(publishHostStartDraft()).resolves.toMatchObject({ listingId: "listing-1" });

    expect(publishedCurrency()).toBe("DKK");
  });

  it("is unaffected by what the host happens to be browsing in at publish time", async () => {
    mocks.displayCurrency.mockResolvedValue("USD");
    mocks.cookieStore.get.mockReturnValue({ value: "draft-1" });
    mocks.draftFindFirst.mockResolvedValue(
      existingDraft({
        title: "Sunny loft",
        currency: "DKK",
        baseNightlyRate: "800",
        depositPolicies: emptyDepositPoliciesDraft(),
        freeCancellationDaysBeforeCheckIn: "7",
      }),
    );

    await publishHostStartDraft();

    expect(publishedCurrency()).toBe("DKK");
  });
});
