import { mkdir, readdir, rm, utimes, writeFile } from "fs/promises";
import { join } from "path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The historical-orphan sweep, run against a throwaway directory.
 *
 * It works from the disk inwards, which is the opposite direction to every other cleanup
 * path in the app, so the tests care most about what it *refuses* to do: dry-run unless
 * told otherwise, nothing outside the managed naming scheme, and nothing young enough to
 * be an upload still in flight.
 */
const mocks = vi.hoisted(() => ({
  referenced: vi.fn<(url: string) => Promise<boolean>>(async () => false),
}));

/**
 * A throwaway upload directory, created and pointed at *before* the modules under test
 * load: `LocalStorageAdapter` resolves `UPLOAD_DIR` once at import time, and the real
 * adapter is deliberately left in place so `apply` is proven to remove real bytes.
 */
const dir = vi.hoisted(() => {
  // Built from env rather than `os.tmpdir()`: the hoisted block runs before this file's
  // own imports are initialised. `beforeEach` creates the directory itself.
  const base = process.env.TMPDIR || process.env.TEMP || process.env.TMP || "/tmp";
  const created = `${base}/reconcile-uploads-${process.pid}-${Date.now()}`;
  process.env.UPLOAD_DIR = created;
  return created;
});

vi.mock("@/lib/storage/upload-references", () => ({
  isUploadStillReferenced: mocks.referenced,
}));

import { reconcileUploads } from "@/lib/storage/reconcile-uploads";

const HOUR = 60 * 60 * 1000;

/** Writes a file and back-dates it, since anything recent is deliberately skipped. */
async function upload(name: string, ageHours = 48) {
  const path = join(dir, name);
  await writeFile(path, "bytes");
  const when = new Date(Date.now() - ageHours * HOUR);
  await utimes(path, when, when);
  return `/uploads/${name}`;
}

async function remaining(): Promise<string[]> {
  return (await readdir(dir)).sort();
}

beforeEach(async () => {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  mocks.referenced.mockReset().mockResolvedValue(false);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
  // Workers are reused across files; leaving `UPLOAD_DIR` pointing at a directory this
  // file deleted would be a confusing thing for the next one to inherit.
  delete process.env.UPLOAD_DIR;
});

describe("reconcileUploads — dry run (the default)", () => {
  it("reports orphans and deletes nothing", async () => {
    await upload("1700000000000-a.jpg");
    await upload("1700000000001-b.jpg");

    const report = await reconcileUploads();

    expect(report).toMatchObject({ scanned: 2, orphaned: 2, deleted: 0, kept: 2, failed: 0 });
    expect(report.candidates).toEqual([
      "/uploads/1700000000000-a.jpg",
      "/uploads/1700000000001-b.jpg",
    ]);
    expect(await remaining()).toHaveLength(2);
  });

  it("counts a referenced file as referenced and never offers it as a candidate", async () => {
    const keep = await upload("1700000000000-live.jpg");
    await upload("1700000000001-orphan.jpg");
    mocks.referenced.mockImplementation(async (url) => url === keep);

    const report = await reconcileUploads();

    expect(report).toMatchObject({ scanned: 2, referenced: 1, orphaned: 1 });
    expect(report.candidates).toEqual(["/uploads/1700000000001-orphan.jpg"]);
  });

  it("skips a file too recent to tell apart from an upload still in flight", async () => {
    // `/api/upload` stores a file before the request that attaches it ever runs; during
    // that window an in-flight upload looks exactly like an orphan.
    await upload("1700000000000-justnow.jpg", 0);
    await upload("1700000000001-old.jpg", 48);

    const report = await reconcileUploads();

    expect(report).toMatchObject({ tooRecent: 1, orphaned: 1 });
    expect(report.candidates).toEqual(["/uploads/1700000000001-old.jpg"]);
    // The reference check is not even asked about the recent one.
    expect(mocks.referenced).toHaveBeenCalledTimes(1);
  });

  it("ignores names the app's own storage would never have produced", async () => {
    await writeFile(join(dir, ".hidden-config"), "x");
    await mkdir(join(dir, "nested"));
    const real = await upload("1700000000000-a.jpg");

    const report = await reconcileUploads();

    expect(report.scanned).toBe(1);
    expect(report.unsafe).toBe(2);
    expect(report.candidates).toEqual([real]);
  });

  it("returns an empty report when the upload directory does not exist", async () => {
    await rm(dir, { recursive: true, force: true });

    const report = await reconcileUploads();

    expect(report).toMatchObject({ scanned: 0, orphaned: 0, deleted: 0 });
  });

  it("stays within the limit it is given", async () => {
    await upload("1700000000000-a.jpg");
    await upload("1700000000001-b.jpg");
    await upload("1700000000002-c.jpg");

    const report = await reconcileUploads({ limit: 2 });

    expect(report.scanned).toBe(2);
  });
});

describe("reconcileUploads — apply", () => {
  it("deletes genuine orphans and only those", async () => {
    const live = await upload("1700000000000-live.jpg");
    await upload("1700000000001-orphan.jpg");
    await upload("1700000000002-recent.jpg", 0);
    mocks.referenced.mockImplementation(async (url) => url === live);

    const report = await reconcileUploads({ apply: true });

    expect(report).toMatchObject({ deleted: 1, referenced: 1, tooRecent: 1, kept: 0, failed: 0 });
    expect(await remaining()).toEqual([
      "1700000000000-live.jpg",
      "1700000000002-recent.jpg",
    ]);
  });

  it("is safe to run twice — the second pass finds nothing left to do", async () => {
    await upload("1700000000000-a.jpg");

    await reconcileUploads({ apply: true });
    const again = await reconcileUploads({ apply: true });

    expect(again).toMatchObject({ scanned: 0, orphaned: 0, deleted: 0 });
    expect(await remaining()).toEqual([]);
  });

  it("respects a stricter minimum age", async () => {
    await upload("1700000000000-a.jpg", 48);

    const report = await reconcileUploads({ apply: true, minAgeMs: 72 * HOUR });

    expect(report).toMatchObject({ tooRecent: 1, deleted: 0 });
    expect(await remaining()).toEqual(["1700000000000-a.jpg"]);
  });
});
