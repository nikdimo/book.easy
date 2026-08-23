import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireHost: vi.fn(async () => ({ id: "host-1" })),
  draftFindFirst: vi.fn(),
  draftUpdateMany: vi.fn(async () => ({ count: 1 })),
  draftCreate: vi.fn(),
  transaction: vi.fn(),
  enqueue: vi.fn(async (_tx: unknown, urls: string[]) => urls),
  sweep: vi.fn(async () => ({ scanned: 0, deleted: 0, kept: 0, failed: 0 })),
  submitNewListing: vi.fn<(formData: FormData, draftId?: string | null) => Promise<unknown>>(
    async () => ({ success: true as const, listingId: "listing-1", slug: "sunny-loft" }),
  ),
  revalidatePath: vi.fn(),
  deleteDraft: vi.fn(async () => ({ ok: true as const, draftId: "draft-1", cleanup: { deleted: [], kept: [], failed: [] } })),
  cookieStore: {
    get: vi.fn(() => ({ value: "draft-1" })),
    set: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("next/headers", () => ({ cookies: async () => mocks.cookieStore }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth-helpers", () => ({ requireHost: mocks.requireHost }));
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
vi.mock("@/lib/actions/listing.actions", () => ({ submitNewListing: mocks.submitNewListing }));
vi.mock("@/lib/listing-draft-cleanup", () => ({
  deleteOwnedListingDraftWithCleanup: mocks.deleteDraft,
}));
vi.mock("@/lib/storage/upload-cleanup", () => ({
  enqueueUploadDeletions: mocks.enqueue,
  sweepUploads: mocks.sweep,
}));

import {
  abandonHostStartDraft,
  publishHostStartDraft,
  saveHostStartDraftPatch,
} from "@/lib/actions/host-start.actions";
import { HOST_START_DRAFT_COOKIE } from "@/lib/host-start-draft";

/** The currency the publish carried into `submitNewListing`, which is the value the
 *  `PricingRule` is created with (`pricingRule: { create: { currency: data.currency } }`). */
function publishedCurrency(): string | null {
  const formData = mocks.submitNewListing.mock.calls.at(-1)?.[0];
  const value = formData?.get("currency");
  return typeof value === "string" ? value : null;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookieStore.get.mockReturnValue({ value: "draft-1" });
  mocks.draftUpdateMany.mockResolvedValue({ count: 1 });
  mocks.enqueue.mockImplementation(async (_tx: unknown, urls: string[]) => urls);
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
    listingDraft: { updateMany: mocks.draftUpdateMany },
  }));
});

describe("saveHostStartDraftPatch", () => {
  it("queues a managed photo removed by a whole-list save", async () => {
    mocks.draftFindFirst.mockResolvedValue({
      id: "draft-1",
      hostId: "host-1",
      updatedAt: new Date("2026-08-21T00:00:00Z"),
      data: { mediaItems: [{ url: "/uploads/old.jpg", mediaType: "IMAGE" }] },
    });

    await expect(saveHostStartDraftPatch({ mediaItems: [] })).resolves.toMatchObject({
      success: true,
      draftId: "draft-1",
    });

    expect(mocks.enqueue).toHaveBeenCalledWith(
      expect.anything(),
      ["/uploads/old.jpg"],
      "draft-media-replaced",
    );
    expect(mocks.sweep).toHaveBeenCalledWith(
      ["/uploads/old.jpg"],
      "draft-media-replaced:draft-1",
    );
  });

  it("retries a concurrent change and preserves the newer fields", async () => {
    mocks.draftFindFirst
      .mockResolvedValueOnce({
        id: "draft-1",
        hostId: "host-1",
        updatedAt: new Date("2026-08-21T00:00:00Z"),
        data: { title: "Old" },
      })
      .mockResolvedValueOnce({
        id: "draft-1",
        hostId: "host-1",
        updatedAt: new Date("2026-08-21T00:00:01Z"),
        data: { title: "Old", city: "Copenhagen" },
      });
    mocks.draftUpdateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    const result = await saveHostStartDraftPatch({ title: "New" });

    expect(result).toMatchObject({ success: true, data: { title: "New", city: "Copenhagen" } });
  });
});

describe("publishHostStartDraft — the draft's currency", () => {
  it("prices the published listing in the currency the draft carries", async () => {
    mocks.draftFindFirst.mockResolvedValue({
      id: "draft-1",
      hostId: "host-1",
      data: { title: "Sunny loft", currency: "USD", baseNightlyRate: "120" },
    });

    await expect(publishHostStartDraft()).resolves.toMatchObject({ listingId: "listing-1" });

    expect(publishedCurrency()).toBe("USD");
  });

  it("leaves the currency to the listing default when the draft has none", async () => {
    mocks.draftFindFirst.mockResolvedValue({
      id: "draft-1",
      hostId: "host-1",
      data: { title: "Sunny loft", baseNightlyRate: "120" },
    });

    await publishHostStartDraft();

    expect(publishedCurrency()).toBeNull();
  });
});

describe("publishHostStartDraft — the pin is the confirmation", () => {
  /** What the publish carried into `submitNewListing` for a given field. */
  function published(field: string): string | null {
    const formData = mocks.submitNewListing.mock.calls.at(-1)?.[0];
    const value = formData?.get(field);
    return typeof value === "string" ? value : null;
  }

  it("asserts the location as confirmed when the draft carries a real pin", async () => {
    // Host V2 never asks the host to confirm the pin a second time, so nothing in the
    // flow writes the flag the publish schema still requires. Coordinates the host
    // placed are what stands in for it.
    mocks.draftFindFirst.mockResolvedValue({
      id: "draft-1",
      hostId: "host-1",
      data: { title: "Sunny loft", latitude: "41.9981", longitude: "21.4254" },
    });

    await publishHostStartDraft();

    expect(published("locationConfirmed")).toBe("true");
    expect(published("locationSource")).toBe("MANUAL_PIN");
  });

  it("keeps the source an importer already recorded", async () => {
    mocks.draftFindFirst.mockResolvedValue({
      id: "draft-1",
      hostId: "host-1",
      data: {
        title: "Sunny loft",
        latitude: "41.9981",
        longitude: "21.4254",
        locationSource: "AUTOCOMPLETE",
      },
    });

    await publishHostStartDraft();

    expect(published("locationSource")).toBe("AUTOCOMPLETE");
  });

  it("asserts nothing for a draft with no usable coordinates", async () => {
    // (0, 0) is open ocean and is what an unset coordinate coerces to — the server has
    // to keep refusing it rather than being told the host confirmed it.
    mocks.draftFindFirst.mockResolvedValue({
      id: "draft-1",
      hostId: "host-1",
      data: { title: "Sunny loft", latitude: "0", longitude: "0" },
    });

    await publishHostStartDraft();

    expect(published("locationConfirmed")).toBeNull();
  });

  it("asserts nothing when the draft has no coordinates at all", async () => {
    mocks.draftFindFirst.mockResolvedValue({
      id: "draft-1",
      hostId: "host-1",
      data: { title: "Sunny loft" },
    });

    await publishHostStartDraft();

    expect(published("locationConfirmed")).toBeNull();
  });
});

describe("abandonHostStartDraft", () => {
  beforeEach(() => {
    mocks.deleteDraft.mockClear();
    mocks.cookieStore.delete.mockClear();
    mocks.cookieStore.get.mockReturnValue({ value: "draft-1" });
  });

  it("throws the owned draft away through the shared cleanup path", async () => {
    mocks.draftFindFirst.mockResolvedValue({ id: "draft-1", hostId: "host-1", data: {} });

    await expect(abandonHostStartDraft()).resolves.toEqual({ success: true });

    expect(mocks.deleteDraft).toHaveBeenCalledWith({ hostId: "host-1", draftId: "draft-1" });
  });

  it("clears the wizard's selector either way", async () => {
    mocks.draftFindFirst.mockResolvedValue({ id: "draft-1", hostId: "host-1", data: {} });
    await abandonHostStartDraft();
    expect(mocks.cookieStore.delete).toHaveBeenCalledWith(HOST_START_DRAFT_COOKIE);

    // A cookie pointing at a draft that is already gone is exactly what would strand the
    // next visit, so it goes even when there was no row to delete.
    mocks.cookieStore.delete.mockClear();
    mocks.deleteDraft.mockClear();
    mocks.draftFindFirst.mockResolvedValue(null);
    await abandonHostStartDraft();

    expect(mocks.deleteDraft).not.toHaveBeenCalled();
    expect(mocks.cookieStore.delete).toHaveBeenCalledWith(HOST_START_DRAFT_COOKIE);
  });
});

describe("publishHostStartDraft — the house rules reach the publish", () => {
  /** What the publish carried into `submitNewListing` for a given field. */
  function carried(field: string): string | null {
    const formData = mocks.submitNewListing.mock.calls.at(-1)?.[0];
    const value = formData?.get(field);
    return typeof value === "string" ? value : null;
  }

  it("carries every rule the draft stored", async () => {
    // The whitelist this builds from is the draft module's own field list, so a rule
    // saved on the House rules step cannot be silently dropped on the way to publish.
    mocks.draftFindFirst.mockResolvedValue({
      id: "draft-1",
      hostId: "host-1",
      data: {
        title: "Sunny loft",
        checkInTime: "16:00",
        checkOutTime: "10:00",
        maxGuests: "6",
        petPolicy: "ASK_HOST",
        smokingPolicy: "OUTDOORS_ONLY",
        eventPolicy: "NOT_ALLOWED",
        quietHoursPolicy: "SET",
        quietHoursStart: "22:00",
        quietHoursEnd: "08:00",
        additionalRules: "No shoes indoors.",
      },
    });

    await publishHostStartDraft();

    expect(carried("checkInTime")).toBe("16:00");
    expect(carried("checkOutTime")).toBe("10:00");
    expect(carried("maxGuests")).toBe("6");
    expect(carried("petPolicy")).toBe("ASK_HOST");
    expect(carried("smokingPolicy")).toBe("OUTDOORS_ONLY");
    expect(carried("eventPolicy")).toBe("NOT_ALLOWED");
    expect(carried("quietHoursPolicy")).toBe("SET");
    expect(carried("quietHoursStart")).toBe("22:00");
    expect(carried("quietHoursEnd")).toBe("08:00");
    expect(carried("additionalRules")).toBe("No shoes indoors.");
  });

  it("carries a cleared rule as the empty answer it is", async () => {
    mocks.draftFindFirst.mockResolvedValue({
      id: "draft-1",
      hostId: "host-1",
      data: { title: "Sunny loft", petPolicy: "", quietHoursPolicy: "" },
    });

    await publishHostStartDraft();

    // "" reaches the publish schema, which stores NULL for it — unanswered, never a
    // refusal invented on the host's behalf.
    expect(carried("petPolicy")).toBe("");
    expect(carried("quietHoursPolicy")).toBe("");
  });
});
