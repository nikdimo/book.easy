import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Deleting a whole draft, and what happens to its photos afterwards.
 *
 * The storage adapter is faked; everything above it is real — `isManagedUploadUrl`,
 * `deleteStoredFile` and `isUploadStillReferenced` all run as written, so a change that
 * loosened the safe-to-delete rules would show up here as a file being unlinked that
 * should have been kept.
 */
const mocks = vi.hoisted(() => ({
  remove: vi.fn<(path: string) => Promise<void>>(async () => {}),
  draftFindFirst: vi.fn(),
  draftDeleteMany: vi.fn<(args: unknown) => Promise<{ count: number }>>(async () => ({ count: 1 })),
  imageCount: vi.fn(async () => 0),
  userCount: vi.fn(async () => 0),
  profileCount: vi.fn(async () => 0),
  damageCount: vi.fn(async () => 0),
  safetyCount: vi.fn(async () => 0),
  queryRaw: vi.fn<() => Promise<{ id: string; data: unknown }[]>>(async () => []),
  transaction: vi.fn(),
  pendingUpsert: vi.fn(),
  pendingFindMany: vi.fn(),
  pendingDeleteMany: vi.fn(),
  pendingUpdate: vi.fn(),
  pendingUrls: [] as string[],
  cookieStore: {
    get: vi.fn<(name: string) => { value: string } | undefined>(() => undefined),
    set: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("next/headers", () => ({ cookies: async () => mocks.cookieStore }));

vi.mock("@/lib/storage", () => ({
  getStorageAdapter: () => ({
    upload: vi.fn(),
    delete: mocks.remove,
    getUrl: (path: string) => path,
  }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    listingDraft: { findFirst: mocks.draftFindFirst, deleteMany: mocks.draftDeleteMany },
    pendingUploadDeletion: {
      upsert: mocks.pendingUpsert,
      findMany: mocks.pendingFindMany,
      deleteMany: mocks.pendingDeleteMany,
      update: mocks.pendingUpdate,
    },
    listingImage: { count: mocks.imageCount },
    user: { count: mocks.userCount },
    profile: { count: mocks.profileCount },
    damageReportEvidence: { count: mocks.damageCount },
    safetyCaseEvidence: { count: mocks.safetyCount },
    $queryRaw: mocks.queryRaw,
    $transaction: mocks.transaction,
  },
}));

import { HOST_START_DRAFT_COOKIE } from "@/lib/host-start-draft";
import {
  deleteOwnedListingDraftWithCleanup,
  draftUploadUrls,
} from "@/lib/listing-draft-cleanup";

function draftRow(data: unknown, id = "draft-1") {
  return { id, data, updatedAt: new Date("2026-08-21T00:00:00Z") };
}

/** Every path handed to the storage adapter, in call order. */
function unlinked(): string[] {
  return mocks.remove.mock.calls.map(([path]) => path);
}

let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.draftDeleteMany.mockResolvedValue({ count: 1 });
  mocks.remove.mockResolvedValue(undefined);
  mocks.queryRaw.mockResolvedValue([]);
  mocks.pendingUrls.length = 0;
  mocks.pendingUpsert.mockImplementation(async ({ where }: { where: { url: string } }) => {
    if (!mocks.pendingUrls.includes(where.url)) mocks.pendingUrls.push(where.url);
    return { id: where.url, url: where.url };
  });
  mocks.pendingFindMany.mockImplementation(async ({ where }: { where?: { url?: { in: string[] } } }) =>
    mocks.pendingUrls
      .filter((url) => !where?.url?.in || where.url.in.includes(url))
      .map((url) => ({ id: url, url })),
  );
  mocks.pendingDeleteMany.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const index = mocks.pendingUrls.indexOf(where.id);
    if (index >= 0) mocks.pendingUrls.splice(index, 1);
    return { count: index >= 0 ? 1 : 0 };
  });
  mocks.pendingUpdate.mockResolvedValue({});
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
    listingDraft: { findFirst: mocks.draftFindFirst, deleteMany: mocks.draftDeleteMany },
    pendingUploadDeletion: { upsert: mocks.pendingUpsert },
  }));
  mocks.imageCount.mockResolvedValue(0);
  mocks.userCount.mockResolvedValue(0);
  mocks.profileCount.mockResolvedValue(0);
  mocks.damageCount.mockResolvedValue(0);
  mocks.safetyCount.mockResolvedValue(0);
  mocks.cookieStore.get.mockReturnValue(undefined);
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  logged.mockRestore();
});

describe("draftUploadUrls", () => {
  it("reads both the current media list and the legacy one, deduplicated", () => {
    expect(
      draftUploadUrls({
        mediaItems: [
          { url: "/uploads/1-a.jpg", mediaType: "IMAGE" },
          { url: "/uploads/2-b.jpg", mediaType: "IMAGE" },
        ],
        imageUrls: ["/uploads/2-b.jpg", "/uploads/3-legacy.jpg"],
      }),
    ).toEqual(["/uploads/1-a.jpg", "/uploads/2-b.jpg", "/uploads/3-legacy.jpg"]);
  });

  it("has nothing to say about a draft that never held a photo", () => {
    expect(draftUploadUrls({})).toEqual([]);
    expect(draftUploadUrls({ mediaItems: [] })).toEqual([]);
  });
});

describe("deleteOwnedListingDraftWithCleanup", () => {
  it("deletes the draft and the uploads nothing else references", async () => {
    mocks.draftFindFirst.mockResolvedValue(
      draftRow({
        mediaItems: [
          { url: "/uploads/1-hall.jpg", mediaType: "IMAGE" },
          { url: "/uploads/2-terrace.jpg", mediaType: "IMAGE" },
        ],
      }),
    );

    const result = await deleteOwnedListingDraftWithCleanup({
      hostId: "host-1",
      draftId: "draft-1",
    });

    expect(result).toMatchObject({ ok: true, draftId: "draft-1" });
    expect(mocks.draftDeleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: "draft-1", hostId: "host-1" }),
    });
    expect(unlinked().sort()).toEqual(["/uploads/1-hall.jpg", "/uploads/2-terrace.jpg"]);
  });

  it("cleans the legacy imageUrls list as well as mediaItems", async () => {
    mocks.draftFindFirst.mockResolvedValue(
      draftRow({
        mediaItems: [{ url: "/uploads/1-new.jpg", mediaType: "IMAGE" }],
        imageUrls: ["/uploads/2-old.jpg"],
      }),
    );

    await deleteOwnedListingDraftWithCleanup({ hostId: "host-1", draftId: "draft-1" });

    expect(unlinked().sort()).toEqual(["/uploads/1-new.jpg", "/uploads/2-old.jpg"]);
  });

  it("checks and deletes a URL listed twice exactly once", async () => {
    const url = "/uploads/1-hall.jpg";
    mocks.draftFindFirst.mockResolvedValue(
      draftRow({
        mediaItems: [
          { url, mediaType: "IMAGE" },
          { url, mediaType: "IMAGE" },
        ],
        imageUrls: [url],
      }),
    );

    const result = await deleteOwnedListingDraftWithCleanup({
      hostId: "host-1",
      draftId: "draft-1",
    });

    expect(unlinked()).toEqual([url]);
    expect(mocks.imageCount).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.cleanup.deleted).toBe(1);
  });

  it("leaves an imported remote photo alone — it is not this app's file", async () => {
    mocks.draftFindFirst.mockResolvedValue(
      draftRow({
        mediaItems: [
          { url: "https://cdn.example/imported.jpg", mediaType: "IMAGE" },
          { url: "/uploads/1-mine.jpg", mediaType: "IMAGE" },
        ],
      }),
    );

    const result = await deleteOwnedListingDraftWithCleanup({
      hostId: "host-1",
      draftId: "draft-1",
    });

    expect(unlinked()).toEqual(["/uploads/1-mine.jpg"]);
    expect(result.ok && result.cleanup.deleted).toBe(1);
  });

  it("ignores a path that is not a server-generated upload name", async () => {
    mocks.draftFindFirst.mockResolvedValue(
      draftRow({
        mediaItems: [
          { url: "/uploads/../../etc/passwd", mediaType: "IMAGE" },
          { url: "/uploads/", mediaType: "IMAGE" },
          { url: "/private/secret.jpg", mediaType: "IMAGE" },
        ],
      }),
    );

    const result = await deleteOwnedListingDraftWithCleanup({
      hostId: "host-1",
      draftId: "draft-1",
    });

    expect(result).toMatchObject({ ok: true });
    expect(mocks.remove).not.toHaveBeenCalled();
    // Not even asked about: they can never be safe to delete, so there is nothing to look up.
    expect(mocks.imageCount).not.toHaveBeenCalled();
  });

  it("keeps a file another draft still points at", async () => {
    mocks.draftFindFirst.mockResolvedValue(
      draftRow({ mediaItems: [{ url: "/uploads/1-shared.jpg", mediaType: "IMAGE" }] }),
    );
    mocks.queryRaw.mockResolvedValue([
      { id: "other-draft", data: { mediaItems: [{ url: "/uploads/1-shared.jpg", mediaType: "IMAGE" }] } },
    ]);

    const result = await deleteOwnedListingDraftWithCleanup({
      hostId: "host-1",
      draftId: "draft-1",
    });

    expect(mocks.remove).not.toHaveBeenCalled();
    expect(result.ok && result.cleanup.kept).toBe(1);
  });

  it("keeps a file a published listing still points at", async () => {
    mocks.draftFindFirst.mockResolvedValue(
      draftRow({ mediaItems: [{ url: "/uploads/1-published.jpg", mediaType: "IMAGE" }] }),
    );
    mocks.imageCount.mockResolvedValue(1);

    const result = await deleteOwnedListingDraftWithCleanup({
      hostId: "host-1",
      draftId: "draft-1",
    });

    expect(mocks.remove).not.toHaveBeenCalled();
    expect(result.ok && result.cleanup.kept).toBe(1);
  });

  it("keeps a file that is somebody's avatar or a case attachment", async () => {
    for (const counter of [
      mocks.userCount,
      mocks.profileCount,
      mocks.damageCount,
      mocks.safetyCount,
    ]) {
      mocks.remove.mockClear();
      mocks.draftDeleteMany.mockResolvedValue({ count: 1 });
      mocks.draftFindFirst.mockResolvedValue(
        draftRow({ mediaItems: [{ url: "/uploads/1-reused.jpg", mediaType: "IMAGE" }] }),
      );
      counter.mockResolvedValue(1);

      const result = await deleteOwnedListingDraftWithCleanup({
        hostId: "host-1",
        draftId: "draft-1",
      });

      expect(mocks.remove).not.toHaveBeenCalled();
      expect(result.ok && result.cleanup.kept).toBe(1);
      counter.mockResolvedValue(0);
    }
  });

  it("refuses another host's draft and touches neither the row nor the disk", async () => {
    // findFirst is scoped to `{ id, hostId }`, so a draft the caller does not own is
    // simply not found.
    mocks.draftFindFirst.mockResolvedValue(null);

    const result = await deleteOwnedListingDraftWithCleanup({
      hostId: "host-2",
      draftId: "draft-1",
    });

    expect(result).toMatchObject({ ok: false, status: 404, error: "Draft not found" });
    expect(mocks.draftDeleteMany).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("deletes nothing from disk when the row itself could not be deleted", async () => {
    mocks.draftFindFirst.mockResolvedValue(
      draftRow({ mediaItems: [{ url: "/uploads/1-hall.jpg", mediaType: "IMAGE" }] }),
    );
    mocks.draftDeleteMany.mockRejectedValue(new Error("connection lost"));

    const result = await deleteOwnedListingDraftWithCleanup({
      hostId: "host-1",
      draftId: "draft-1",
    });

    expect(result).toMatchObject({ ok: false, status: 500 });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("deletes nothing from disk when the row was already gone", async () => {
    mocks.draftFindFirst.mockResolvedValue(
      draftRow({ mediaItems: [{ url: "/uploads/1-hall.jpg", mediaType: "IMAGE" }] }),
    );
    mocks.draftDeleteMany.mockResolvedValue({ count: 0 });

    const result = await deleteOwnedListingDraftWithCleanup({
      hostId: "host-1",
      draftId: "draft-1",
    });

    expect(result).toMatchObject({ ok: false, status: 404 });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("still reports success when a file could not be unlinked, and logs it", async () => {
    mocks.draftFindFirst.mockResolvedValue(
      draftRow({ mediaItems: [{ url: "/uploads/1-stuck.jpg", mediaType: "IMAGE" }] }),
    );
    mocks.remove.mockRejectedValue(new Error("EBUSY"));

    const result = await deleteOwnedListingDraftWithCleanup({
      hostId: "host-1",
      draftId: "draft-1",
    });

    // The row is gone; saying otherwise would invite a retry that can only 404.
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.cleanup.failed).toBe(1);
    expect(
      logged.mock.calls.some((entry: unknown[]) => String(entry[0]).includes("Upload cleanup job")),
    ).toBe(true);
  });

  it("clears the wizard's selector only when it names the draft that went away", async () => {
    mocks.draftFindFirst.mockResolvedValue(draftRow({ mediaItems: [] }));
    mocks.cookieStore.get.mockReturnValue({ value: "draft-1" });

    await deleteOwnedListingDraftWithCleanup({ hostId: "host-1", draftId: "draft-1" });
    expect(mocks.cookieStore.delete).toHaveBeenCalledWith(HOST_START_DRAFT_COOKIE);

    mocks.cookieStore.delete.mockClear();
    mocks.cookieStore.get.mockReturnValue({ value: "another-draft" });
    await deleteOwnedListingDraftWithCleanup({ hostId: "host-1", draftId: "draft-1" });
    expect(mocks.cookieStore.delete).not.toHaveBeenCalled();
  });
});
