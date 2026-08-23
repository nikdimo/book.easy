import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What an import does with a provider's pet labels.
 *
 * Providers publish pet rules as ordinary amenity text. Before this, the importer
 * created an amenity row for each of them — which would have handed the project back the
 * duplicate source of truth the pet-policy migration had just removed, on every import.
 * They populate the draft's `petPolicy` instead, and no amenity is created.
 */

const mocks = vi.hoisted(() => ({
  requireHost: vi.fn(),
  rateLimit: vi.fn(),
  importListingUrl: vi.fn(),
  copyImportedImages: vi.fn(),
  reverseGeocode: vi.fn(),
  amenityFindMany: vi.fn(),
  amenityAliasFindMany: vi.fn(),
  propertyTypeFindMany: vi.fn(),
  amenityUpsert: vi.fn(),
  draftCreate: vi.fn(),
  categoryIdForName: vi.fn(),
  uniqueAmenityKey: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/auth-helpers", () => ({ requireHost: mocks.requireHost }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/listing-import/importer", () => ({
  importListingUrl: mocks.importListingUrl,
  copyImportedImages: mocks.copyImportedImages,
}));
vi.mock("@/lib/services/location.service", () => ({
  reverseGeocode: mocks.reverseGeocode,
}));
vi.mock("@/lib/storage/store-upload", () => ({ deleteStoredFile: vi.fn() }));
vi.mock("@/lib/amenities/catalog", () => ({
  categoryIdForName: mocks.categoryIdForName,
  uniqueAmenityKey: mocks.uniqueAmenityKey,
}));
// `unstable_cache` comes along because the amenity service (reached through the route's
// AMENITIES_TAG import) caches its catalog reads; the route itself only revalidates.
vi.mock("next/cache", () => ({
  revalidateTag: mocks.revalidateTag,
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("@/lib/db", () => ({
  db: {
    amenity: { findMany: mocks.amenityFindMany },
    amenityAlias: { findMany: mocks.amenityAliasFindMany },
    propertyType: { findMany: mocks.propertyTypeFindMany },
    $transaction: async (
      run: (tx: {
        amenity: { upsert: typeof mocks.amenityUpsert; update: () => Promise<unknown> };
        listingDraft: { create: typeof mocks.draftCreate };
      }) => Promise<unknown>,
    ) =>
      run({
        amenity: { upsert: mocks.amenityUpsert, update: async () => ({}) },
        listingDraft: { create: mocks.draftCreate },
      }),
  },
}));

import { POST } from "@/app/api/listing-import/route";

/** The draft data the route wrote. */
function draftData(): Record<string, unknown> {
  return mocks.draftCreate.mock.calls[0][0].data.data as Record<string, unknown>;
}

async function importWith(amenities: string[]) {
  mocks.importListingUrl.mockResolvedValue({
    provider: "AIRBNB",
    sourceUrl: "https://www.airbnb.com/rooms/123",
    title: "Sunny loft",
    description: "A bright loft.",
    amenities,
    imageUrls: [],
  });
  return POST(
    new Request("http://localhost/api/listing-import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: "https://www.airbnb.com/rooms/123",
        rightsConfirmed: true,
      }),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireHost.mockResolvedValue({ id: "host-1", isHost: true });
  mocks.rateLimit.mockReturnValue({ success: true });
  mocks.copyImportedImages.mockResolvedValue([]);
  mocks.amenityFindMany.mockResolvedValue([]);
  mocks.amenityAliasFindMany.mockResolvedValue([]);
  mocks.propertyTypeFindMany.mockResolvedValue([]);
  mocks.categoryIdForName.mockResolvedValue("category-1");
  mocks.uniqueAmenityKey.mockImplementation(async (name: string) => name.toLowerCase());
  mocks.amenityUpsert.mockImplementation(async ({ create }: { create: { name: string } }) => ({
    id: `amenity-${create.name}`,
    name: create.name,
  }));
  mocks.draftCreate.mockResolvedValue({ id: "draft-1" });
});

describe("importing a listing's pet rule", () => {
  it("records an allowed policy on the draft rather than creating an amenity", async () => {
    await importWith(["Wi-Fi", "Pets allowed"]);

    expect(draftData().petPolicy).toBe("ALLOWED");
    const created = mocks.amenityUpsert.mock.calls.map(([args]) => args.create.name);
    expect(created).toEqual(["Wi-Fi"]);
    expect(created).not.toContain("Pets allowed");
  });

  it("records a refusal the provider stated", async () => {
    await importWith(["No pets", "Kitchen"]);

    expect(draftData().petPolicy).toBe("NOT_ALLOWED");
    expect(mocks.amenityUpsert.mock.calls.map(([args]) => args.create.name)).toEqual([
      "Kitchen",
    ]);
  });

  it("records an on-request policy, which an amenity could never have expressed", async () => {
    await importWith(["Pets on request"]);

    expect(draftData().petPolicy).toBe("ASK_HOST");
    expect(mocks.amenityUpsert).not.toHaveBeenCalled();
  });

  it("leaves the policy unanswered when the provider said nothing about pets", async () => {
    // "" is unanswered, and the House rules step asks for it before publishing.
    await importWith(["Wi-Fi", "Kitchen"]);

    expect(draftData().petPolicy).toBe("");
  });

  it("keeps every non-pet amenity the provider listed", async () => {
    await importWith(["Wi-Fi", "Pets allowed", "Kitchen", "Pool"]);

    expect(mocks.amenityUpsert.mock.calls.map(([args]) => args.create.name)).toEqual([
      "Wi-Fi",
      "Kitchen",
      "Pool",
    ]);
  });

  it("answers nothing else on the host's behalf", async () => {
    // Pets is the one rule providers reliably state. Guessing at the rest would put
    // rules on a listing that its host never chose.
    await importWith(["Pets allowed"]);

    const data = draftData();
    expect(data.smokingPolicy).toBeUndefined();
    expect(data.eventPolicy).toBeUndefined();
    expect(data.quietHoursPolicy).toBeUndefined();
  });
});

describe("amenity labels the importer used to discard", () => {
  it("keeps a label that merely contains 'no'", async () => {
    // `^yes|no|true|false$` anchored only its first and last branches, so the bare `no`
    // matched anywhere and threw these away on every import.
    await importWith(["Nordic sauna", "Snorkelling gear"]);

    expect(mocks.amenityUpsert.mock.calls.map(([args]) => args.create.name)).toEqual([
      "Nordic sauna",
      "Snorkelling gear",
    ]);
  });

  it("still drops a provider's bare yes/no artefacts", async () => {
    await importWith(["yes", "No", "true", "Kitchen"]);

    expect(mocks.amenityUpsert.mock.calls.map(([args]) => args.create.name)).toEqual([
      "Kitchen",
    ]);
  });
});
