import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The admin retry for queued upload deletions.
 *
 * The point of these tests is what the endpoint refuses: it is not reachable without an
 * admin session, it accepts no URLs or ids of any kind, and it cannot be asked to sweep an
 * unbounded amount of work.
 */
const mocks = vi.hoisted(() => ({
  auth: vi.fn<() => Promise<unknown>>(),
  rateLimit: vi.fn(() => ({ success: true, remaining: 9, resetAt: 0 })),
  process: vi.fn(async () => ({ scanned: 3, deleted: 2, kept: 1, failed: 0 })),
  stats: vi.fn<() => Promise<{ queued: number; failing: number; oldestQueuedAt: string | null }>>(
    async () => ({ queued: 0, failing: 0, oldestQueuedAt: null }),
  ),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/storage/upload-cleanup", () => ({
  DEFAULT_CLEANUP_BATCH: 200,
  processPendingUploadDeletions: mocks.process,
  pendingUploadDeletionStats: mocks.stats,
}));

import { GET, POST } from "@/app/api/admin/uploads/cleanup/route";

function post(body: unknown = {}) {
  return POST(
    new Request("https://example.test/api/admin/uploads/cleanup", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  mocks.rateLimit.mockReturnValue({ success: true, remaining: 9, resetAt: 0 });
  mocks.process.mockResolvedValue({ scanned: 3, deleted: 2, kept: 1, failed: 0 });
  mocks.stats.mockResolvedValue({ queued: 0, failing: 0, oldestQueuedAt: null });
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("POST /api/admin/uploads/cleanup", () => {
  it("runs a bounded sweep for an admin and reports the counts", async () => {
    const response = await post();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      scanned: 3,
      deleted: 2,
      kept: 1,
      failed: 0,
    });
    expect(mocks.process).toHaveBeenCalledWith({ limit: 200 });
  });

  it("is closed to a signed-in non-admin", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "host-1", role: "USER" } });

    const response = await post();

    expect(response.status).toBe(403);
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("is closed to an anonymous caller", async () => {
    mocks.auth.mockResolvedValue(null);

    expect((await post()).status).toBe(403);
    expect((await GET()).status).toBe(403);
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("is rate limited per admin", async () => {
    mocks.rateLimit.mockReturnValue({ success: false, remaining: 0, resetAt: 0 });

    const response = await post();

    expect(response.status).toBe(429);
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("clamps the batch size a caller asks for, in both directions", async () => {
    await post({ limit: 10_000_000 });
    expect(mocks.process).toHaveBeenLastCalledWith({ limit: 1000 });

    await post({ limit: -5 });
    expect(mocks.process).toHaveBeenLastCalledWith({ limit: 1 });

    await post({ limit: "all of them" });
    expect(mocks.process).toHaveBeenLastCalledWith({ limit: 200 });
  });

  it("ignores anything that looks like an instruction to delete a specific file", async () => {
    // There is no parameter for this and there must never be one: the queue is the only
    // thing that decides which files may go.
    await post({ url: "/uploads/1-someone-elses.jpg", ids: ["job-1"] });

    expect(mocks.process).toHaveBeenCalledWith({ limit: 200 });
  });
});

describe("GET /api/admin/uploads/cleanup", () => {
  it("reports the backlog as counts, never as storage paths", async () => {
    mocks.stats.mockResolvedValue({
      queued: 4,
      failing: 1,
      oldestQueuedAt: "2026-08-20T10:00:00.000Z",
    });

    const body = await (await GET()).json();

    expect(body).toEqual({
      queued: 4,
      failing: 1,
      oldestQueuedAt: "2026-08-20T10:00:00.000Z",
    });
    expect(JSON.stringify(body)).not.toContain("/uploads/");
  });
});
