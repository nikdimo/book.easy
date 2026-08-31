import { describe, expect, it, vi } from "vitest";
import {
  MIN_PUBLISH_PHOTOS,
  RECOMMENDED_LISTING_PHOTOS,
  coverPhotoId,
  createDraftPhotos,
  draftMediaItems,
  isCoverPhoto,
  isPersistedPhoto,
  isPhotoFile,
  markPhotoUploaded,
  movePhoto,
  needsUpload,
  pendingUploads,
  photoProgress,
  removePhoto,
  singleFlight,
  uploadPendingPhotos,
  type DraftPhoto,
} from "@/lib/host/v2/photo-draft";

function file(name: string, type = "image/jpeg"): File {
  return new File(["x"], name, { type });
}

/** The browser factories are injected so the module runs outside a DOM: a fake object
 *  URL per file is enough to prove one preview was made for each. */
function draft(...names: string[]) {
  return createDraftPhotos(
    names.map((name) => file(name)),
    (chosen) => `blob:${chosen.name}`,
    (_chosen, index) => `photo-${index}`,
  );
}

describe("createDraftPhotos", () => {
  it("makes one tile with its own preview for every picked file", () => {
    const photos = draft("kitchen.jpg", "bedroom.jpg", "terrace.jpg");

    expect(photos).toHaveLength(3);
    expect(photos.map((photo) => photo.name)).toEqual([
      "kitchen.jpg",
      "bedroom.jpg",
      "terrace.jpg",
    ]);
    expect(photos.map((photo) => photo.previewUrl)).toEqual([
      "blob:kitchen.jpg",
      "blob:bedroom.jpg",
      "blob:terrace.jpg",
    ]);
    expect(new Set(photos.map((photo) => photo.id)).size).toBe(3);
  });

  it("keeps images and drops anything else the picker let through", () => {
    const photos = createDraftPhotos(
      [file("plan.pdf", "application/pdf"), file("hall.png", "image/png")],
      (chosen) => `blob:${chosen.name}`,
      (chosen) => chosen.name,
    );

    expect(photos.map((photo) => photo.name)).toEqual(["hall.png"]);
  });

  it("accepts a HEIC file that arrives without a MIME type", () => {
    expect(isPhotoFile(file("IMG_0001.HEIC", ""))).toBe(true);
    expect(isPhotoFile(file("notes.txt", "text/plain"))).toBe(false);
  });
});

describe("movePhoto", () => {
  it("reorders a photo to the position it was dropped on", () => {
    const photos = draft("a.jpg", "b.jpg", "c.jpg");

    expect(movePhoto(photos, "photo-2", "photo-0").map((photo) => photo.name)).toEqual([
      "c.jpg",
      "a.jpg",
      "b.jpg",
    ]);
    expect(movePhoto(photos, "photo-0", "photo-1").map((photo) => photo.name)).toEqual([
      "b.jpg",
      "a.jpg",
      "c.jpg",
    ]);
  });

  it("leaves the order alone for a drop on itself or on an unknown id", () => {
    const photos = draft("a.jpg", "b.jpg");

    expect(movePhoto(photos, "photo-0", "photo-0")).toEqual(photos);
    expect(movePhoto(photos, "photo-0", "gone")).toEqual(photos);
  });

  it("does not mutate the list it was given", () => {
    const photos = draft("a.jpg", "b.jpg");
    movePhoto(photos, "photo-1", "photo-0");

    expect(photos.map((photo) => photo.name)).toEqual(["a.jpg", "b.jpg"]);
  });
});

describe("cover photo", () => {
  it("is whichever photo is first, with no separate flag to keep in step", () => {
    const photos = draft("a.jpg", "b.jpg", "c.jpg");

    expect(coverPhotoId(photos)).toBe("photo-0");
    expect(isCoverPhoto(photos, "photo-0")).toBe(true);
    expect(isCoverPhoto(photos, "photo-1")).toBe(false);
  });

  it("follows a drag to the front", () => {
    const reordered = movePhoto(draft("a.jpg", "b.jpg", "c.jpg"), "photo-2", "photo-0");

    expect(coverPhotoId(reordered)).toBe("photo-2");
  });

  it("passes to the next photo when the cover is removed, and is null once empty", () => {
    const photos = draft("a.jpg", "b.jpg");
    const { photos: afterFirst } = removePhoto(photos, "photo-0");

    expect(coverPhotoId(afterFirst)).toBe("photo-1");
    expect(coverPhotoId(removePhoto(afterFirst, "photo-1").photos)).toBeNull();
  });
});

describe("removePhoto", () => {
  it("drops the photo and hands back its preview so the URL can be revoked", () => {
    const photos = draft("a.jpg", "b.jpg", "c.jpg");
    const { photos: next, removed } = removePhoto(photos, "photo-1");

    expect(next.map((photo) => photo.name)).toEqual(["a.jpg", "c.jpg"]);
    expect(removed?.previewUrl).toBe("blob:b.jpg");
    expect(photos).toHaveLength(3);
  });

  it("is a no-op for an id that is no longer in the list", () => {
    const photos = draft("a.jpg");
    const { photos: next, removed } = removePhoto(photos, "gone");

    expect(next).toHaveLength(1);
    expect(removed).toBeUndefined();
  });
});

describe("photoProgress", () => {
  it("gates on the one enforced floor, which is the number publishing enforces", () => {
    expect(MIN_PUBLISH_PHOTOS).toBe(3);
    expect(photoProgress(0)).toMatchObject({ remaining: 3, met: false });
    expect(photoProgress(2)).toMatchObject({ remaining: 1, met: false });
    expect(photoProgress(3)).toMatchObject({ remaining: 0, met: true });
  });

  it("keeps the bar moving past the floor, towards the set we recommend", () => {
    expect(RECOMMENDED_LISTING_PHOTOS).toBe(5);
    // Already allowed to continue, and the bar still has somewhere to go.
    expect(photoProgress(3)).toMatchObject({ percent: 60, met: true, recommendationMet: false });
    expect(photoProgress(4)).toMatchObject({ percent: 80, met: true, recommendationMet: false });
    expect(photoProgress(5)).toMatchObject({ percent: 100, met: true, recommendationMet: true });
  });

  it("never lets the recommendation gate anything", () => {
    // The whole point of the split: four photos is short of the recommendation and is
    // still a listing the host may publish.
    const progress = photoProgress(RECOMMENDED_LISTING_PHOTOS - 1);
    expect(progress.met).toBe(true);
    expect(progress.recommendationMet).toBe(false);
  });

  it("caps the bar rather than overfilling it", () => {
    expect(photoProgress(12)).toMatchObject({
      added: 12,
      remaining: 0,
      percent: 100,
      met: true,
      recommendationMet: true,
    });
  });
});

// ─── Uploading: partial failure, retry and the saved order ────────────────────

/** A photo that already came back from the draft — an uploaded one, or an imported
 *  remote URL, neither of which has a `File` left to send. */
function persisted(id: string, url: string, extra: Partial<DraftPhoto> = {}): DraftPhoto {
  return { id, name: `${id}.jpg`, previewUrl: url, uploadedUrl: url, ...extra };
}

/** An uploader that answers with a predictable URL, and fails for the names told to. */
function uploader(failing: string[] = []) {
  return vi.fn(async (photo: DraftPhoto) => {
    if (failing.includes(photo.name)) throw new Error(`Could not upload ${photo.name}.`);
    return { url: `/uploads/stored-${photo.name}` };
  });
}

describe("local versus persisted photos", () => {
  it("counts only a photo that still holds its file as needing an upload", () => {
    const [local] = draft("kitchen.jpg");
    const uploaded = persisted("saved-0", "/uploads/1-kitchen.jpg");
    const imported = { id: "import-0", name: "Photo 1", previewUrl: "https://cdn.example/a.jpg", uploadedUrl: "https://cdn.example/a.jpg" };

    expect(needsUpload(local)).toBe(true);
    expect(isPersistedPhoto(local)).toBe(false);
    expect(needsUpload(uploaded)).toBe(false);
    expect(isPersistedPhoto(uploaded)).toBe(true);
    expect(needsUpload(imported)).toBe(false);
    expect(pendingUploads([uploaded, local, imported])).toEqual([local]);
  });

  it("drops the file when an upload is recorded, so nothing can send it twice", () => {
    const photos = draft("kitchen.jpg");
    const [marked] = markPhotoUploaded(photos, "photo-0", "/uploads/1-kitchen.jpg");

    expect(marked.uploadedUrl).toBe("/uploads/1-kitchen.jpg");
    expect(marked.file).toBeUndefined();
    expect(needsUpload(marked)).toBe(false);
  });
});

describe("uploadPendingPhotos", () => {
  it("reports the failure but keeps the photo that already landed", async () => {
    const photos = draft("first.jpg", "second.jpg");
    const upload = uploader(["second.jpg"]);
    const landed: string[] = [];

    const run = await uploadPendingPhotos(photos, upload, (photo) => landed.push(photo.name));

    expect(run.failed?.photo.name).toBe("second.jpg");
    expect(run.failed?.error.message).toBe("Could not upload second.jpg.");
    expect(run.uploaded).toBe(1);
    expect(landed).toEqual(["first.jpg"]);
    // The first is persisted; the second is untouched and still available to retry.
    expect(isPersistedPhoto(run.photos[0])).toBe(true);
    expect(run.photos[0].uploadedUrl).toBe("/uploads/stored-first.jpg");
    expect(needsUpload(run.photos[1])).toBe(true);
    expect(run.photos).toHaveLength(2);
  });

  it("leaves every photo behind the failure untried, so a retry starts where it stopped", async () => {
    const photos = draft("a.jpg", "b.jpg", "c.jpg");
    const upload = uploader(["b.jpg"]);

    const run = await uploadPendingPhotos(photos, upload);

    expect(upload.mock.calls.map(([photo]) => photo.name)).toEqual(["a.jpg", "b.jpg"]);
    expect(pendingUploads(run.photos).map((photo) => photo.name)).toEqual(["b.jpg", "c.jpg"]);
  });

  it("does not send the photo that already succeeded when the host retries", async () => {
    const photos = draft("first.jpg", "second.jpg");
    const first = await uploadPendingPhotos(photos, uploader(["second.jpg"]));

    const retry = uploader();
    const second = await uploadPendingPhotos(first.photos, retry);

    expect(retry.mock.calls.map(([photo]) => photo.name)).toEqual(["second.jpg"]);
    expect(second.failed).toBeUndefined();
    expect(second.photos.every(isPersistedPhoto)).toBe(true);
  });

  it("never re-uploads a photo the draft already holds, uploaded or imported", async () => {
    const upload = uploader();
    const photos: DraftPhoto[] = [
      persisted("saved-0", "/uploads/1-hall.jpg"),
      persisted("import-0", "https://cdn.example/terrace.jpg"),
      ...draft("new.jpg"),
    ];

    const run = await uploadPendingPhotos(photos, upload);

    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0][0].name).toBe("new.jpg");
    expect(run.uploaded).toBe(1);
  });

  it("has nothing to do when every photo is already stored", async () => {
    const upload = uploader();

    const run = await uploadPendingPhotos([persisted("saved-0", "/uploads/1-a.jpg")], upload);

    expect(upload).not.toHaveBeenCalled();
    expect(run.uploaded).toBe(0);
    expect(run.failed).toBeUndefined();
  });
});

describe("draftMediaItems", () => {
  it("keeps an automatically detected panorama flag through the draft", async () => {
    const run = await uploadPendingPhotos(draft("tour.jpg"), async () => ({
      url: "/uploads/tour.jpg",
      mediaType: "IMAGE" as const,
      isPanorama: true,
    }));

    expect(draftMediaItems(run.photos)).toEqual([
      {
        url: "/uploads/tour.jpg",
        mediaType: "IMAGE",
        isPanorama: true,
        alt: "tour.jpg",
      },
    ]);
  });

  it("saves the list in the order the grid is showing", async () => {
    const run = await uploadPendingPhotos(draft("a.jpg", "b.jpg", "c.jpg"), uploader());

    expect(draftMediaItems(run.photos)).toEqual([
      { url: "/uploads/stored-a.jpg", mediaType: "IMAGE", alt: "a.jpg" },
      { url: "/uploads/stored-b.jpg", mediaType: "IMAGE", alt: "b.jpg" },
      { url: "/uploads/stored-c.jpg", mediaType: "IMAGE", alt: "c.jpg" },
    ]);
  });

  it("keeps the cover as whatever the host dragged to the front, including after a retry", async () => {
    // A batch that failed on its last photo, reordered while the host looked at it, then
    // retried: the cover is the first tile of the final order, not the first uploaded.
    const first = await uploadPendingPhotos(draft("a.jpg", "b.jpg", "c.jpg"), uploader(["c.jpg"]));
    const reordered = movePhoto(first.photos, "photo-2", "photo-0");
    const retry = await uploadPendingPhotos(reordered, uploader());

    const items = draftMediaItems(retry.photos);
    expect(items?.map((item) => item.alt)).toEqual(["c.jpg", "a.jpg", "b.jpg"]);
    expect(items?.[0].url).toBe("/uploads/stored-c.jpg");
    expect(coverPhotoId(retry.photos)).toBe("photo-2");
  });

  it("carries a draft media item's own id through untouched", () => {
    const items = draftMediaItems([persisted("saved-0", "/uploads/1-a.jpg", { mediaId: "media-1" })]);

    expect(items).toEqual([
      { id: "media-1", url: "/uploads/1-a.jpg", mediaType: "IMAGE", alt: "saved-0.jpg" },
    ]);
  });

  it("refuses to describe a list that still has a photo waiting to go up", () => {
    expect(draftMediaItems(draft("a.jpg"))).toBeNull();
  });
});

describe("singleFlight", () => {
  it("ignores a second press while the first upload batch is still running", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const run = vi.fn(async () => { await gate; });
    const guarded = singleFlight(run);

    const first = guarded();
    const second = guarded();
    release();
    await Promise.all([first, second]);

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("lets the host try again once the batch has finished or failed", async () => {
    const run = vi.fn(async () => { throw new Error("upload failed"); });
    const guarded = singleFlight(run);

    await expect(guarded()).rejects.toThrow("upload failed");
    await expect(guarded()).rejects.toThrow("upload failed");

    expect(run).toHaveBeenCalledTimes(2);
  });
});
