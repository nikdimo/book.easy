import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Who still wants a stored file — and, in particular, the difference between a URL that
 * appears inside a draft and a URL that a draft actually holds.
 *
 * The database can only pre-filter these with a substring test (the photos live inside a
 * JSON blob), and a substring test says yes to `/uploads/photo-1.jpg` when the row only
 * holds `/uploads/photo-1.jpg.backup`. Deleting on that answer destroys a photo nobody
 * asked to remove, which is what these tests exist to prevent.
 */
const mocks = vi.hoisted(() => ({
  imageCount: vi.fn(async () => 0),
  userCount: vi.fn(async () => 0),
  profileCount: vi.fn(async () => 0),
  damageCount: vi.fn(async () => 0),
  safetyCount: vi.fn(async () => 0),
  queryRaw: vi.fn<(...args: unknown[]) => Promise<{ id: string; data: unknown }[]>>(async () => []),
}));

vi.mock("@/lib/db", () => ({
  db: {
    listingImage: { count: mocks.imageCount },
    user: { count: mocks.userCount },
    profile: { count: mocks.profileCount },
    damageReportEvidence: { count: mocks.damageCount },
    safetyCaseEvidence: { count: mocks.safetyCount },
    $queryRaw: mocks.queryRaw,
  },
}));

import {
  draftRowReferencesUpload,
  draftUploadUrls,
  isUploadStillReferenced,
} from "@/lib/storage/upload-references";

/** Whatever the substring pre-filter would hand back for the URL under test. */
function candidates(...rows: unknown[]) {
  mocks.queryRaw.mockResolvedValue(
    rows.map((data, index) => ({ id: `draft-${index}`, data })),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.imageCount.mockResolvedValue(0);
  mocks.userCount.mockResolvedValue(0);
  mocks.profileCount.mockResolvedValue(0);
  mocks.damageCount.mockResolvedValue(0);
  mocks.safetyCount.mockResolvedValue(0);
  mocks.queryRaw.mockResolvedValue([]);
});

describe("draftUploadUrls", () => {
  it("reads the current media list and the legacy one, deduplicated and in order", () => {
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

  it("skips entries that are not usable URLs rather than tripping over them", () => {
    expect(
      draftUploadUrls({
        mediaItems: [
          { url: "", mediaType: "IMAGE" },
          { url: "/uploads/1-real.jpg", mediaType: "IMAGE" },
        ] as never,
        imageUrls: [null, 42, "/uploads/2-real.jpg"] as never,
      }),
    ).toEqual(["/uploads/1-real.jpg", "/uploads/2-real.jpg"]);
  });
});

describe("draftRowReferencesUpload", () => {
  it("matches the whole URL, never a prefix of a longer one", () => {
    const row = { mediaItems: [{ url: "/uploads/photo-1.jpg.backup", mediaType: "IMAGE" }] };

    expect(draftRowReferencesUpload("/uploads/photo-1.jpg.backup", row)).toBe(true);
    // The old substring test said yes here, and deleting on it destroyed a live photo.
    expect(draftRowReferencesUpload("/uploads/photo-1.jpg", row)).toBe(false);
  });

  it("matches a whole URL in the legacy list too", () => {
    expect(
      draftRowReferencesUpload("/uploads/photo-1.jpg", { imageUrls: ["/uploads/photo-1.jpg"] }),
    ).toBe(true);
    expect(
      draftRowReferencesUpload("/uploads/photo-1.jpg", {
        imageUrls: ["/uploads/photo-1.jpg.backup"],
      }),
    ).toBe(false);
  });

  it("treats a draft it cannot read as holding the file", () => {
    // Malformed rows keep their old, conservative answer: an unreadable draft is exactly
    // the case where guessing wrong cannot be undone.
    expect(draftRowReferencesUpload("/uploads/1-a.jpg", "not an object")).toBe(true);
    expect(draftRowReferencesUpload("/uploads/1-a.jpg", ["an", "array"])).toBe(true);
    expect(draftRowReferencesUpload("/uploads/1-a.jpg", null)).toBe(true);
  });
});

describe("isUploadStillReferenced", () => {
  it("is false when nothing anywhere points at the file", async () => {
    expect(await isUploadStillReferenced("/uploads/1-a.jpg")).toBe(false);
  });

  it("is true when a draft genuinely holds it", async () => {
    candidates({ mediaItems: [{ url: "/uploads/1-a.jpg", mediaType: "IMAGE" }] });

    expect(await isUploadStillReferenced("/uploads/1-a.jpg")).toBe(true);
  });

  it("is false when the only draft that matched holds a longer, different URL", async () => {
    candidates({ mediaItems: [{ url: "/uploads/photo-1.jpg.backup", mediaType: "IMAGE" }] });

    expect(await isUploadStillReferenced("/uploads/photo-1.jpg")).toBe(false);
  });

  it("is true when one of several matching drafts holds it exactly", async () => {
    candidates(
      { mediaItems: [{ url: "/uploads/photo-1.jpg.backup", mediaType: "IMAGE" }] },
      { imageUrls: ["/uploads/photo-1.jpg"] },
    );

    expect(await isUploadStillReferenced("/uploads/photo-1.jpg")).toBe(true);
  });

  it("keeps the file when a matching draft's JSON cannot be read", async () => {
    candidates("corrupt");

    expect(await isUploadStillReferenced("/uploads/1-a.jpg")).toBe(true);
  });

  it("asks every table that can hold an upload URL", async () => {
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
