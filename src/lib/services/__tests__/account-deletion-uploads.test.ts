import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What happens to a host's draft photos when their account is erased.
 *
 * `ListingDraft.host` is `onDelete: Cascade`, so deleting a user takes their drafts with
 * it without any of the draft-delete paths ever running — which used to leave every photo
 * on those drafts on disk forever. The queueing happens inside the erasure transaction and
 * the unlinking strictly after it, and both halves are exercised here for real: only the
 * database and the storage adapter are faked.
 */
interface QueueRow {
  id: string;
  url: string;
  reason: string;
  attempts: number;
  lastError: string | null;
  lastTriedAt: Date | null;
  createdAt: Date;
}

const mocks = vi.hoisted(() => ({
  remove: vi.fn<(path: string) => Promise<void>>(async () => {}),
  /** The drafts the doomed account owns. */
  drafts: [] as { data: unknown }[],
  rows: [] as QueueRow[],
  clock: 0,
  userUpdate: vi.fn(async () => ({})),
  /** Anything else the erasure transaction touches; the counts are irrelevant here. */
  imageCount: vi.fn(async () => 0),
  userCount: vi.fn(async () => 0),
  profileCount: vi.fn(async () => 0),
  damageCount: vi.fn(async () => 0),
  safetyCount: vi.fn(async () => 0),
  queryRaw: vi.fn<(...args: unknown[]) => Promise<{ id: string; data: unknown }[]>>(async () => []),
}));

vi.mock("@/lib/storage", () => ({
  getStorageAdapter: () => ({
    upload: vi.fn(),
    delete: mocks.remove,
    getUrl: (path: string) => path,
  }),
}));

const pendingUploadDeletion = {
  async upsert({ where, create }: { where: { url: string }; create: { url: string; reason: string } }) {
    const found = mocks.rows.find((row) => row.url === where.url);
    if (found) return found;
    mocks.clock += 1;
    const row: QueueRow = {
      id: `job-${mocks.clock}`,
      url: create.url,
      reason: create.reason,
      attempts: 0,
      lastError: null,
      lastTriedAt: null,
      createdAt: new Date(mocks.clock),
    };
    mocks.rows.push(row);
    return row;
  },
  async findMany({ where, take }: { where?: { url?: { in: string[] } }; take?: number } = {}) {
    let rows = [...mocks.rows];
    if (where?.url?.in) rows = rows.filter((row) => where.url!.in.includes(row.url));
    return typeof take === "number" ? rows.slice(0, take) : rows;
  },
  async deleteMany({ where }: { where: { id: string } }) {
    const before = mocks.rows.length;
    mocks.rows = mocks.rows.filter((row) => row.id !== where.id);
    return { count: before - mocks.rows.length };
  },
  async update({ where }: { where: { id: string } }) {
    const row = mocks.rows.find((entry) => entry.id === where.id);
    if (!row) throw new Error("Record to update not found");
    row.attempts += 1;
    row.lastError = "failed";
    row.lastTriedAt = new Date();
    return row;
  },
  async count() {
    return mocks.rows.length;
  },
  async findFirst() {
    return mocks.rows[0] ?? null;
  },
};

/** Every other model the erasure walks: permissive stubs, since none of them is what this
 *  file is about. `listingDraft` and `user` are the two that matter. */
const permissiveModel = {
  findMany: async () => [],
  findFirst: async () => null,
  findUnique: async () => null,
  count: async () => 0,
  create: async () => ({}),
  createMany: async () => ({ count: 0 }),
  update: async () => ({}),
  updateMany: async () => ({ count: 0 }),
  upsert: async () => ({}),
  delete: async () => ({}),
  deleteMany: async () => ({ count: 0 }),
};

function modelFor(name: string) {
  if (name === "pendingUploadDeletion") return pendingUploadDeletion;
  if (name === "listingDraft") {
    return { ...permissiveModel, findMany: async () => mocks.drafts };
  }
  if (name === "user") {
    return {
      ...permissiveModel,
      // Erasure anonymizes in place, so the walk reads the row, then overwrites it.
      findUnique: async () => ({ id: "host-1", image: null, deletedAt: null }),
      update: mocks.userUpdate,
    };
  }
  if (name === "listingImage") return { ...permissiveModel, count: mocks.imageCount };
  if (name === "profile") return { ...permissiveModel, count: mocks.profileCount };
  if (name === "damageReportEvidence") return { ...permissiveModel, count: mocks.damageCount };
  if (name === "safetyCaseEvidence") return { ...permissiveModel, count: mocks.safetyCount };
  return permissiveModel;
}

vi.mock("@/lib/db", () => {
  const client: Record<string, unknown> = {
    $transaction: async (callback: (tx: unknown) => unknown) => callback(dbProxy),
    $queryRaw: (...args: unknown[]) => mocks.queryRaw(...args),
  };
  const dbProxy: unknown = new Proxy(client, {
    get(target, key: string) {
      if (key in target) return target[key];
      if (key === "user") return { ...modelFor("user"), count: mocks.userCount };
      return modelFor(key);
    },
  });
  return { db: dbProxy };
});

import { deleteUserAccount } from "@/lib/services/gdpr.service";

function unlinked(): string[] {
  return mocks.remove.mock.calls.map(([path]) => path).sort();
}

let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mocks.drafts = [];
  mocks.rows = [];
  mocks.clock = 0;
  mocks.remove.mockReset().mockResolvedValue(undefined);
  mocks.userUpdate.mockReset().mockResolvedValue({});
  mocks.imageCount.mockReset().mockResolvedValue(0);
  mocks.userCount.mockReset().mockResolvedValue(0);
  mocks.profileCount.mockReset().mockResolvedValue(0);
  mocks.damageCount.mockReset().mockResolvedValue(0);
  mocks.safetyCount.mockReset().mockResolvedValue(0);
  mocks.queryRaw.mockReset().mockResolvedValue([]);
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  logged.mockRestore();
});

describe("deleteUserAccount — draft photo cleanup", () => {
  it("removes the uploads on the account's drafts once the user is gone", async () => {
    mocks.drafts = [
      { data: { mediaItems: [{ url: "/uploads/1-hall.jpg", mediaType: "IMAGE" }] } },
      { data: { imageUrls: ["/uploads/2-legacy.jpg"] } },
    ];

    const result = await deleteUserAccount("host-1");

    expect(result.success).toBe(true);
    expect(mocks.userUpdate).toHaveBeenCalled();
    expect(unlinked()).toEqual(["/uploads/1-hall.jpg", "/uploads/2-legacy.jpg"]);
    expect(result.deletedRecords.draftUploads).toBe(2);
    expect(mocks.rows).toHaveLength(0);
  });

  it("checks the same URL once when several drafts share it", async () => {
    mocks.drafts = [
      { data: { mediaItems: [{ url: "/uploads/1-shared.jpg", mediaType: "IMAGE" }] } },
      { data: { imageUrls: ["/uploads/1-shared.jpg"] } },
    ];

    await deleteUserAccount("host-1");

    expect(unlinked()).toEqual(["/uploads/1-shared.jpg"]);
    expect(mocks.imageCount).toHaveBeenCalledTimes(1);
  });

  it("keeps a photo a published listing still shows", async () => {
    mocks.drafts = [{ data: { mediaItems: [{ url: "/uploads/1-live.jpg", mediaType: "IMAGE" }] } }];
    mocks.imageCount.mockResolvedValue(1);

    const result = await deleteUserAccount("host-1");

    expect(mocks.remove).not.toHaveBeenCalled();
    expect(result.deletedRecords.draftUploads).toBe(0);
  });

  it("keeps a photo another host's draft still holds", async () => {
    mocks.drafts = [{ data: { mediaItems: [{ url: "/uploads/1-shared.jpg", mediaType: "IMAGE" }] } }];
    mocks.queryRaw.mockResolvedValue([
      { id: "someone-elses", data: { mediaItems: [{ url: "/uploads/1-shared.jpg" }] } },
    ]);

    await deleteUserAccount("host-1");

    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("keeps a photo that is also an avatar or a case attachment", async () => {
    for (const counter of [
      mocks.userCount,
      mocks.profileCount,
      mocks.damageCount,
      mocks.safetyCount,
    ]) {
      mocks.rows = [];
      mocks.remove.mockClear();
      mocks.drafts = [{ data: { mediaItems: [{ url: "/uploads/1-reused.jpg", mediaType: "IMAGE" }] } }];
      counter.mockResolvedValue(1);

      await deleteUserAccount("host-1");

      expect(mocks.remove).not.toHaveBeenCalled();
      counter.mockResolvedValue(0);
    }
  });

  it("never hands a remote or unsafe URL to storage", async () => {
    mocks.drafts = [
      {
        data: {
          mediaItems: [
            { url: "https://cdn.example/remote.jpg", mediaType: "IMAGE" },
            { url: "/uploads/../../etc/passwd", mediaType: "IMAGE" },
            { url: "/uploads/1-mine.jpg", mediaType: "IMAGE" },
          ],
        },
      },
    ];

    await deleteUserAccount("host-1");

    expect(unlinked()).toEqual(["/uploads/1-mine.jpg"]);
  });

  it("still erases the account when a file cannot be unlinked, and leaves the job queued", async () => {
    mocks.drafts = [{ data: { mediaItems: [{ url: "/uploads/1-stuck.jpg", mediaType: "IMAGE" }] } }];
    mocks.remove.mockRejectedValue(new Error("EBUSY"));

    const result = await deleteUserAccount("host-1");

    // The erasure is a legal obligation; a stuck file must never hold it up.
    expect(result.success).toBe(true);
    expect(result.anonymizedRecords.user).toBe(1);
    expect(result.deletedRecords.draftUploads).toBe(0);
    // Discoverable and retryable rather than silently lost.
    expect(mocks.rows.map((row) => row.url)).toEqual(["/uploads/1-stuck.jpg"]);
    expect(mocks.rows[0].attempts).toBe(1);
  });

  it("queues nothing when the erasure itself fails", async () => {
    mocks.drafts = [{ data: { mediaItems: [{ url: "/uploads/1-hall.jpg", mediaType: "IMAGE" }] } }];
    mocks.userUpdate.mockRejectedValue(new Error("foreign key violation"));

    await expect(deleteUserAccount("host-1")).rejects.toThrow(/Failed to delete user account/);

    // The real transaction would roll the queue rows back with everything else; what
    // matters at this level is that no file was touched.
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("does nothing at all for an account with no drafts", async () => {
    const result = await deleteUserAccount("guest-1");

    expect(result.success).toBe(true);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(result.deletedRecords.draftUploads).toBeUndefined();
  });
});
