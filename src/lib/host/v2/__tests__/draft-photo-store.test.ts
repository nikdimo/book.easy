import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The server-owned half of the Host V2 draft photo lifecycle.
 *
 * The storage adapter is faked but `storeUploadedFile` is not: the type allow-list, the
 * magic-byte sniffing and the size ceiling all run for real here, so a change that
 * loosened them would show up as a passing upload of something that should be refused.
 */
const mocks = vi.hoisted(() => ({
  upload: vi.fn(async () => "/uploads/1700000000000-stored.jpg"),
  remove: vi.fn(async () => {}),
  draftFindFirst: vi.fn(),
  draftUpdateMany: vi.fn<(args: unknown) => Promise<{ count: number }>>(async () => ({ count: 1 })),
  draftCreate: vi.fn(),
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
}));

vi.mock("@/lib/storage", () => ({
  getStorageAdapter: () => ({
    upload: mocks.upload,
    delete: mocks.remove,
    getUrl: (path: string) => path,
  }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    listingDraft: {
      findFirst: mocks.draftFindFirst,
      updateMany: mocks.draftUpdateMany,
      create: mocks.draftCreate,
    },
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

import {
  addDraftPhoto,
  isUploadStillReferenced,
  removeDraftPhoto,
} from "@/lib/host/v2/draft-photo-store";

/** Four real JPEG bytes: enough for the magic-byte check, which is the point. */
function jpeg(name = "kitchen.jpg", type = "image/jpeg"): File {
  return new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], name, { type });
}

function draftRow(data: unknown, id = "draft-1", hostId = "host-1") {
  return { id, hostId, data, createdAt: new Date(), updatedAt: new Date() };
}

/** The data argument the last draft write was given. */
function written() {
  return mocks.draftUpdateMany.mock.calls.at(-1)?.[0] as
    | { where: { id: string; hostId: string; updatedAt?: Date }; data: { data: { mediaItems?: { url: string }[] } } }
    | undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.upload.mockResolvedValue("/uploads/1700000000000-stored.jpg");
  mocks.draftUpdateMany.mockResolvedValue({ count: 1 });
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
    listingDraft: { updateMany: mocks.draftUpdateMany },
    pendingUploadDeletion: { upsert: mocks.pendingUpsert },
  }));
  mocks.imageCount.mockResolvedValue(0);
  mocks.userCount.mockResolvedValue(0);
  mocks.profileCount.mockResolvedValue(0);
  mocks.damageCount.mockResolvedValue(0);
  mocks.safetyCount.mockResolvedValue(0);
});

describe("addDraftPhoto", () => {
  it("stores the file and appends it to the host's own draft in one go", async () => {
    mocks.draftFindFirst.mockResolvedValue(draftRow({ title: "Loft", mediaItems: [] }));

    const result = await addDraftPhoto({
      hostId: "host-1",
      draftId: "draft-1",
      file: jpeg(),
      alt: "kitchen.jpg",
    });

    expect(result).toMatchObject({ ok: true, draftId: "draft-1", mediaType: "IMAGE" });
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(written()?.where).toEqual(expect.objectContaining({ id: "draft-1", hostId: "host-1" }));
    expect(written()?.data.data.mediaItems).toEqual([
      { url: "/uploads/1700000000000-stored.jpg", mediaType: "IMAGE", alt: "kitchen.jpg" },
    ]);
    // Everything else the draft was carrying survives the append.
    expect(written()?.data.data).toMatchObject({ title: "Loft" });
  });

  it("keeps the photos already on the draft and adds the new one at the end", async () => {
    mocks.draftFindFirst.mockResolvedValue(
      draftRow({
        mediaItems: [
          { url: "https://cdn.example/imported.jpg", mediaType: "IMAGE", alt: "Imported" },
          { url: "/uploads/1-first.jpg", mediaType: "IMAGE", alt: "first.jpg" },
        ],
      }),
    );

    await addDraftPhoto({ hostId: "host-1", draftId: "draft-1", file: jpeg() });

    expect(written()?.data.data.mediaItems?.map((item) => item.url)).toEqual([
      "https://cdn.example/imported.jpg",
      "/uploads/1-first.jpg",
      "/uploads/1700000000000-stored.jpg",
    ]);
  });

  it("retries a concurrent write instead of losing the other uploaded photo", async () => {
    const first = draftRow({ mediaItems: [] });
    const concurrent = draftRow(
      { mediaItems: [{ url: "/uploads/concurrent.jpg", mediaType: "IMAGE" }] },
    );
    concurrent.updatedAt = new Date(first.updatedAt.getTime() + 1_000);
    mocks.draftFindFirst
      .mockResolvedValueOnce(first) // ownership check before storing
      .mockResolvedValueOnce(first) // first compare-and-swap attempt
      .mockResolvedValueOnce(concurrent); // retry sees the other request's result
    mocks.draftUpdateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    await addDraftPhoto({ hostId: "host-1", draftId: "draft-1", file: jpeg() });

    expect(written()?.data.data.mediaItems?.map((item) => item.url)).toEqual([
      "/uploads/concurrent.jpg",
      "/uploads/1700000000000-stored.jpg",
    ]);
  });

  it("deletes the file it just wrote when the draft cannot record it", async () => {
    mocks.draftFindFirst.mockResolvedValue(draftRow({ mediaItems: [] }));
    mocks.draftUpdateMany.mockRejectedValue(new Error("connection lost"));

    const result = await addDraftPhoto({ hostId: "host-1", draftId: "draft-1", file: jpeg() });

    expect(result).toMatchObject({ ok: false, status: 500 });
    expect(mocks.remove).toHaveBeenCalledWith("/uploads/1700000000000-stored.jpg");
  });

  it("starts a fresh owned draft rather than writing to a stale or foreign cookie", async () => {
    // findFirst is scoped to `{ id, hostId }`, so another host's draft id simply is not
    // found — and is replaced with a draft this host owns instead of being written to.
    mocks.draftFindFirst.mockResolvedValue(null);
    mocks.draftCreate.mockResolvedValue(
      draftRow({ mediaItems: [{ url: "/uploads/1700000000000-stored.jpg", mediaType: "IMAGE", alt: null }] }, "draft-new"),
    );

    const result = await addDraftPhoto({
      hostId: "host-2",
      draftId: "someone-elses-draft",
      file: jpeg(),
    });

    expect(result).toMatchObject({ ok: true, draftId: "draft-new" });
    expect(mocks.draftUpdateMany).not.toHaveBeenCalled();
    expect(mocks.draftCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ hostId: "host-2" }) }),
    );
  });

  it("still refuses a file the upload rules do not allow, and stores nothing", async () => {
    mocks.draftFindFirst.mockResolvedValue(draftRow({ mediaItems: [] }));

    const wrongType = await addDraftPhoto({
      hostId: "host-1",
      draftId: "draft-1",
      file: new File(["not a pdf really"], "plan.pdf", { type: "application/pdf" }),
    });
    // A JPEG content-type over bytes that are not a JPEG.
    const spoofed = await addDraftPhoto({
      hostId: "host-1",
      draftId: "draft-1",
      file: new File(["<html>"], "trap.jpg", { type: "image/jpeg" }),
    });

    expect(wrongType).toMatchObject({ ok: false, status: 400 });
    expect(spoofed).toMatchObject({ ok: false, status: 400 });
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.draftUpdateMany).not.toHaveBeenCalled();
  });
});

describe("removeDraftPhoto", () => {
  const stored = "/uploads/1-hall.jpg";

  it("takes the photo off the draft and deletes the file nothing else wants", async () => {
    mocks.draftFindFirst.mockResolvedValue(
      draftRow({
        mediaItems: [
          { url: stored, mediaType: "IMAGE", alt: "hall" },
          { url: "/uploads/2-terrace.jpg", mediaType: "IMAGE", alt: "terrace" },
        ],
        imageUrls: [stored],
      }),
    );

    const result = await removeDraftPhoto({ hostId: "host-1", draftId: "draft-1", url: stored });

    expect(result).toMatchObject({ ok: true, fileDeleted: true });
    expect(written()?.data.data.mediaItems?.map((item) => item.url)).toEqual([
      "/uploads/2-terrace.jpg",
    ]);
    expect(mocks.remove).toHaveBeenCalledWith(stored);
  });

  it("keeps the file when a published listing still points at it", async () => {
    mocks.draftFindFirst.mockResolvedValue(
      draftRow({ mediaItems: [{ url: stored, mediaType: "IMAGE" }] }),
    );
    mocks.imageCount.mockResolvedValue(1);

    const result = await removeDraftPhoto({ hostId: "host-1", draftId: "draft-1", url: stored });

    expect(result).toMatchObject({ ok: true, fileDeleted: false });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("retries a concurrent draft change and preserves it while removing", async () => {
    const first = draftRow({ mediaItems: [{ url: stored, mediaType: "IMAGE" }] });
    const concurrent = draftRow({
      title: "Changed elsewhere",
      mediaItems: [
        { url: stored, mediaType: "IMAGE" },
        { url: "/uploads/new.jpg", mediaType: "IMAGE" },
      ],
    });
    concurrent.updatedAt = new Date(first.updatedAt.getTime() + 1_000);
    mocks.draftFindFirst.mockResolvedValueOnce(first).mockResolvedValueOnce(concurrent);
    mocks.draftUpdateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    const result = await removeDraftPhoto({ hostId: "host-1", draftId: "draft-1", url: stored });

    expect(result).toMatchObject({
      ok: true,
      data: {
        title: "Changed elsewhere",
        mediaItems: [{ url: "/uploads/new.jpg", mediaType: "IMAGE" }],
      },
    });
  });

  it("keeps the file when another draft still points at it", async () => {
    mocks.draftFindFirst.mockResolvedValue(
      draftRow({ mediaItems: [{ url: stored, mediaType: "IMAGE" }] }),
    );
    mocks.queryRaw.mockResolvedValue([
      { id: "other-draft", data: { mediaItems: [{ url: stored, mediaType: "IMAGE" }] } },
    ]);

    const result = await removeDraftPhoto({ hostId: "host-1", draftId: "draft-1", url: stored });

    expect(result).toMatchObject({ ok: true, fileDeleted: false });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("unlinks an imported remote photo from the draft without deleting anything", async () => {
    const remote = "https://cdn.example/imported.jpg";
    mocks.draftFindFirst.mockResolvedValue(
      draftRow({ mediaItems: [{ url: remote, mediaType: "IMAGE" }] }),
    );

    const result = await removeDraftPhoto({ hostId: "host-1", draftId: "draft-1", url: remote });

    expect(result).toMatchObject({ ok: true, fileDeleted: false });
    expect(written()?.data.data.mediaItems).toEqual([]);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("treats an already absent URL as an idempotent success and never touches the disk", async () => {
    mocks.draftFindFirst.mockResolvedValue(
      draftRow({ mediaItems: [{ url: "/uploads/9-mine.jpg", mediaType: "IMAGE" }] }),
    );

    const result = await removeDraftPhoto({
      hostId: "host-1",
      draftId: "draft-1",
      url: "/uploads/7-someone-elses.jpg",
    });

    expect(result).toMatchObject({ ok: true, draftId: "draft-1", fileDeleted: false });
    expect(mocks.draftUpdateMany).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("refuses outright when the draft is not this host's", async () => {
    mocks.draftFindFirst.mockResolvedValue(null);

    const result = await removeDraftPhoto({
      hostId: "host-2",
      draftId: "draft-1",
      url: "/uploads/1-hall.jpg",
    });

    expect(result).toMatchObject({ ok: false, status: 404 });
    expect(mocks.draftUpdateMany).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("refuses a path that tries to climb out of the upload directory", async () => {
    const traversal = "/uploads/../../etc/passwd";
    mocks.draftFindFirst.mockResolvedValue(
      draftRow({ mediaItems: [{ url: traversal, mediaType: "IMAGE" }] }),
    );

    const result = await removeDraftPhoto({ hostId: "host-1", draftId: "draft-1", url: traversal });

    expect(result).toMatchObject({ ok: true, fileDeleted: false });
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});

describe("isUploadStillReferenced", () => {
  it("asks every table that can hold an upload URL before calling a file orphaned", async () => {
    expect(await isUploadStillReferenced("/uploads/1-a.jpg")).toBe(false);

    for (const counter of [
      mocks.imageCount,
      mocks.userCount,
      mocks.profileCount,
      mocks.damageCount,
      mocks.safetyCount,
    ]) {
      counter.mockResolvedValueOnce(1);
      expect(await isUploadStillReferenced("/uploads/1-a.jpg")).toBe(true);
    }
  });
});
