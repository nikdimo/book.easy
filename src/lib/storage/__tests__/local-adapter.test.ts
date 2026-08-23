import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  unlink: vi.fn(),
}));

vi.mock("fs/promises", () => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  unlink: mocks.unlink,
}));

import { LocalStorageAdapter } from "@/lib/storage/local.adapter";

beforeEach(() => {
  mocks.unlink.mockReset().mockResolvedValue(undefined);
});

describe("LocalStorageAdapter.delete", () => {
  it("treats an already missing file as successfully deleted", async () => {
    mocks.unlink.mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" }));

    await expect(new LocalStorageAdapter().delete("/uploads/gone.jpg")).resolves.toBeUndefined();
  });

  it("reports real filesystem failures so the cleanup job remains queued", async () => {
    mocks.unlink.mockRejectedValue(Object.assign(new Error("locked"), { code: "EBUSY" }));

    await expect(new LocalStorageAdapter().delete("/uploads/locked.jpg")).rejects.toThrow("locked");
  });
});
