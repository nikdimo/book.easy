import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The outbox that makes upload cleanup crash-safe, exercised against an in-memory stand-in
 * for the `PendingUploadDeletion` table.
 *
 * The storage adapter is faked; `isManagedUploadUrl` and `deleteStoredFile` are real, so a
 * change that loosened what may be queued or unlinked shows up here.
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
  referenced: vi.fn<(url: string) => Promise<boolean>>(async () => false),
  rows: [] as QueueRow[],
  clock: 0,
}));

vi.mock("@/lib/storage", () => ({
  getStorageAdapter: () => ({
    upload: vi.fn(),
    delete: mocks.remove,
    getUrl: (path: string) => path,
  }),
}));

vi.mock("@/lib/storage/upload-references", () => ({
  isUploadStillReferenced: mocks.referenced,
}));

/** A minimal `pendingUploadDeletion` delegate: enough of Prisma's surface for the queue,
 *  and cheap enough that every test can start from a clean table. */
const queue = {
  async upsert({
    where,
    create,
    update,
  }: {
    where: { url: string };
    create: { url: string; reason: string };
    update: { reason: string };
  }) {
    const found = mocks.rows.find((row) => row.url === where.url);
    if (found) {
      found.reason = update.reason;
      return found;
    }
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
  async findMany({
    where,
    take,
  }: { where?: { url?: { in: string[] } }; take?: number } = {}) {
    let rows = [...mocks.rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    if (where?.url?.in) rows = rows.filter((row) => where.url!.in.includes(row.url));
    return typeof take === "number" ? rows.slice(0, take) : rows;
  },
  async deleteMany({ where }: { where: { id: string } }) {
    const before = mocks.rows.length;
    mocks.rows = mocks.rows.filter((row) => row.id !== where.id);
    return { count: before - mocks.rows.length };
  },
  async update({
    where,
    data,
  }: {
    where: { id: string };
    data: { attempts: { increment: number }; lastError: string; lastTriedAt: Date };
  }) {
    const row = mocks.rows.find((entry) => entry.id === where.id);
    if (!row) throw new Error("Record to update not found");
    row.attempts += data.attempts.increment;
    row.lastError = data.lastError;
    row.lastTriedAt = data.lastTriedAt;
    return row;
  },
  async count({ where }: { where?: { attempts: { gt: number } } } = {}) {
    if (!where) return mocks.rows.length;
    return mocks.rows.filter((row) => row.attempts > where.attempts.gt).length;
  },
  async findFirst() {
    return [...mocks.rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0] ?? null;
  },
};

// The factory is hoisted above `queue`, so it forwards lazily rather than capturing it.
vi.mock("@/lib/db", () => ({
  db: {
    pendingUploadDeletion: new Proxy(
      {},
      { get: (_target, key: string) => (queue as Record<string, unknown>)[key] },
    ),
  },
}));

import {
  enqueueUploadDeletions,
  pendingUploadDeletionStats,
  processPendingUploadDeletions,
  sweepUploads,
} from "@/lib/storage/upload-cleanup";

/** Stands in for the transaction client a caller would pass. */
function tx() {
  return { pendingUploadDeletion: queue } as never;
}

function queuedUrls(): string[] {
  return mocks.rows.map((row) => row.url).sort();
}

let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mocks.rows = [];
  mocks.clock = 0;
  mocks.remove.mockReset().mockResolvedValue(undefined);
  mocks.referenced.mockReset().mockResolvedValue(false);
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  logged.mockRestore();
});

describe("enqueueUploadDeletions", () => {
  it("queues only server-generated upload paths", async () => {
    const queued = await enqueueUploadDeletions(
      tx(),
      [
        "/uploads/1-hall.jpg",
        "https://cdn.example/imported.jpg",
        "/uploads/../../etc/passwd",
        "/private/secret.jpg",
        "/uploads/",
      ],
      "test",
    );

    expect(queued).toEqual(["/uploads/1-hall.jpg"]);
    expect(queuedUrls()).toEqual(["/uploads/1-hall.jpg"]);
  });

  it("collapses a URL queued more than once into one job", async () => {
    await enqueueUploadDeletions(tx(), ["/uploads/1-a.jpg", "/uploads/1-a.jpg"], "test");
    await enqueueUploadDeletions(tx(), ["/uploads/1-a.jpg"], "test-again");

    expect(mocks.rows).toHaveLength(1);
    expect(mocks.rows[0].reason).toBe("test-again");
  });
});

describe("processPendingUploadDeletions", () => {
  it("unlinks unreferenced files and clears their jobs", async () => {
    await enqueueUploadDeletions(tx(), ["/uploads/1-a.jpg", "/uploads/2-b.jpg"], "test");

    const report = await processPendingUploadDeletions();

    expect(report).toMatchObject({ scanned: 2, deleted: 2, kept: 0, failed: 0 });
    expect(mocks.remove.mock.calls.map(([url]) => url).sort()).toEqual([
      "/uploads/1-a.jpg",
      "/uploads/2-b.jpg",
    ]);
    expect(mocks.rows).toHaveLength(0);
  });

  it("re-checks references at processing time and spares a file that got adopted", async () => {
    await enqueueUploadDeletions(tx(), ["/uploads/1-a.jpg"], "test");
    // Between queueing and sweeping, something started pointing at it again.
    mocks.referenced.mockResolvedValue(true);

    const report = await processPendingUploadDeletions();

    expect(report).toMatchObject({ scanned: 1, deleted: 0, kept: 1, failed: 0 });
    expect(mocks.remove).not.toHaveBeenCalled();
    // The job is settled, not left to be reconsidered forever.
    expect(mocks.rows).toHaveLength(0);
  });

  it("keeps a failed job queued, with the failure recorded", async () => {
    await enqueueUploadDeletions(tx(), ["/uploads/1-stuck.jpg"], "test");
    mocks.remove.mockRejectedValue(new Error("EBUSY"));

    const report = await processPendingUploadDeletions();

    expect(report).toMatchObject({ scanned: 1, deleted: 0, failed: 1 });
    expect(mocks.rows).toHaveLength(1);
    expect(mocks.rows[0].attempts).toBe(1);
    expect(mocks.rows[0].lastError).toBeTruthy();
    expect(mocks.rows[0].lastTriedAt).toBeInstanceOf(Date);
    expect(logged).toHaveBeenCalled();
  });

  it("retries a previously failed job and succeeds once the file lets go", async () => {
    await enqueueUploadDeletions(tx(), ["/uploads/1-stuck.jpg"], "test");
    mocks.remove.mockRejectedValueOnce(new Error("EBUSY"));

    const first = await processPendingUploadDeletions();
    expect(first.failed).toBe(1);
    expect(mocks.rows).toHaveLength(1);

    const second = await processPendingUploadDeletions();

    expect(second).toMatchObject({ scanned: 1, deleted: 1, failed: 0 });
    expect(mocks.rows).toHaveLength(0);
  });

  it("is idempotent — a second sweep over the same queue is a no-op", async () => {
    await enqueueUploadDeletions(tx(), ["/uploads/1-a.jpg"], "test");
    await processPendingUploadDeletions();
    mocks.remove.mockClear();

    const again = await processPendingUploadDeletions();

    expect(again).toMatchObject({ scanned: 0, deleted: 0, kept: 0, failed: 0 });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("settles a job whose file already went, rather than looping on it forever", async () => {
    // The adapter treats a missing file as done, which is what makes replay safe.
    await enqueueUploadDeletions(tx(), ["/uploads/1-gone.jpg"], "test");

    const report = await processPendingUploadDeletions();

    expect(report.deleted).toBe(1);
    expect(mocks.rows).toHaveLength(0);
  });

  it("refuses a queued path that is no longer safe, without touching the disk", async () => {
    // Belt and braces: the enqueue gate should make this impossible, so a row like this
    // means something has gone wrong and the file must not be trusted to the adapter.
    mocks.rows.push({
      id: "job-hand-written",
      url: "/uploads/../../etc/passwd",
      reason: "tampered",
      attempts: 0,
      lastError: null,
      lastTriedAt: null,
      createdAt: new Date(1),
    });

    const report = await processPendingUploadDeletions();

    expect(report).toMatchObject({ scanned: 1, kept: 1, deleted: 0 });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("stays bounded by the limit it is given, oldest first", async () => {
    await enqueueUploadDeletions(
      tx(),
      ["/uploads/1-a.jpg", "/uploads/2-b.jpg", "/uploads/3-c.jpg"],
      "test",
    );

    const report = await processPendingUploadDeletions({ limit: 2 });

    expect(report.scanned).toBe(2);
    expect(queuedUrls()).toEqual(["/uploads/3-c.jpg"]);
  });
});

describe("sweepUploads", () => {
  it("clears exactly the files it was handed and leaves the rest queued", async () => {
    await enqueueUploadDeletions(tx(), ["/uploads/1-a.jpg", "/uploads/2-b.jpg"], "test");

    const report = await sweepUploads(["/uploads/1-a.jpg"], "test");

    expect(report).toMatchObject({ scanned: 1, deleted: 1 });
    expect(queuedUrls()).toEqual(["/uploads/2-b.jpg"]);
  });

  it("does nothing at all when there is no managed file among them", async () => {
    const report = await sweepUploads(["https://cdn.example/a.jpg"], "test");

    expect(report).toMatchObject({ scanned: 0, deleted: 0, kept: 0, failed: 0 });
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});

describe("pendingUploadDeletionStats", () => {
  it("reports what is waiting and what has already failed", async () => {
    await enqueueUploadDeletions(tx(), ["/uploads/1-a.jpg", "/uploads/2-b.jpg"], "test");
    mocks.remove.mockRejectedValueOnce(new Error("EBUSY"));
    await processPendingUploadDeletions();

    const stats = await pendingUploadDeletionStats();

    expect(stats.queued).toBe(1);
    expect(stats.failing).toBe(1);
    expect(stats.oldestQueuedAt).toBeTruthy();
  });
});
