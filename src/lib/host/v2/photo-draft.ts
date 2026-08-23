/**
 * The photo selection behind the from-scratch flow's Photos step.
 *
 * Pure and browser-free, so the ordering, the cover rule and the upload run can all be
 * exercised without a DOM. A "photo" here is one of two things, and telling them apart is
 * the point of the module: a **local** photo still holds the `File` the host picked and
 * has nothing in storage yet, while a **persisted** photo has a `uploadedUrl` that the
 * server has already written onto the owned draft. Only local photos are ever uploaded,
 * which is what makes a retry after a half-failed batch cheap and idempotent.
 */

import type { ListingMediaItem, ListingMediaTypeValue } from "@/lib/types/listing-media";

/**
 * The one enforced floor, everywhere: this step, the Review screen, `submitNewListing`,
 * the classic form and the mobile app all hold a listing to exactly this number. It is
 * deliberately a single constant — the previous arrangement had the step asking for one
 * count and the server enforcing another, which is how a host with four photos could be
 * blocked from finishing something publishing would have accepted.
 */
export const MIN_PUBLISH_PHOTOS = 3;

/**
 * What a good set of photos looks like — a recommendation, never a gate.
 *
 * Listings with five or more photos get noticeably more bookings, so the counter and the
 * progress bar both aim here and the step says so. Nothing is ever refused for falling
 * short of it: `photoProgress().met` is decided by `MIN_PUBLISH_PHOTOS` alone.
 */
export const RECOMMENDED_LISTING_PHOTOS = 5;

/** The editor's image types, minus the video ones — this step is photos only. */
export const PHOTO_INPUT_ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

export interface DraftPhoto {
  id: string;
  name: string;
  /** What the tile renders: an object URL for a local photo, the stored URL for one that
   *  came back from the draft. The owner is responsible for revoking the object URLs, so
   *  removal and unmount both have to go through this module's callers rather than drop
   *  the list. */
  previewUrl: string;
  /** Present only while the photo still has to be uploaded. Cleared the moment its
   *  upload lands, so a retry cannot send the same bytes twice. */
  file?: File;
  /** The storage URL, once the server has both stored the file and recorded it on the
   *  draft. Its presence is the definition of "persisted". */
  uploadedUrl?: string;
  /** The id the draft's own media item carries, when it had one. Kept so re-saving the
   *  list does not strip identities the draft was already holding. */
  mediaId?: string;
  mediaType?: ListingMediaTypeValue;
}

/** A photo the server has already stored and written onto the draft. */
export function isPersistedPhoto(photo: DraftPhoto): boolean {
  return typeof photo.uploadedUrl === "string" && photo.uploadedUrl.length > 0;
}

/**
 * A photo that still has to go up.
 *
 * A photo without a `File` and without an `uploadedUrl` came from the draft rather than
 * from this tab's file picker. There are no bytes here to send, so it is not pending; it
 * is already as persisted as it is going to get.
 */
export function needsUpload(photo: DraftPhoto): boolean {
  return photo.file !== undefined && !isPersistedPhoto(photo);
}

export function pendingUploads(photos: readonly DraftPhoto[]): DraftPhoto[] {
  return photos.filter(needsUpload);
}

/** Records a landed upload in place. The `File` goes with it: the bytes are on the server
 *  now, and keeping them would let the next run offer to send them again. */
export function markPhotoUploaded(
  photos: readonly DraftPhoto[],
  id: string,
  uploadedUrl: string,
  mediaType: ListingMediaTypeValue = "IMAGE",
): DraftPhoto[] {
  return photos.map((photo) =>
    photo.id === id ? { ...photo, uploadedUrl, mediaType, file: undefined } : photo,
  );
}

/**
 * The list as the draft should store it: current UI order, cover first.
 *
 * Returns null while anything is still local — a partial list saved as if it were the
 * whole one would silently drop the photos that have not landed yet.
 */
export function draftMediaItems(photos: readonly DraftPhoto[]): ListingMediaItem[] | null {
  const items: ListingMediaItem[] = [];
  for (const photo of photos) {
    const url = photo.uploadedUrl ?? (photo.file ? undefined : photo.previewUrl);
    if (!url) return null;
    items.push({
      ...(photo.mediaId ? { id: photo.mediaId } : {}),
      url,
      mediaType: photo.mediaType ?? "IMAGE",
      alt: photo.name,
    });
  }
  return items;
}

/**
 * Wraps a handler so a second call while the first is still running is dropped.
 *
 * The Photos step's Next both uploads and navigates, and a double-click on it would
 * otherwise start two batches over the same files. The footer already disables its own
 * CTA, but that is React state settling a frame later; this closes the gap in between.
 */
export function singleFlight<T extends unknown[]>(
  run: (...args: T) => Promise<void>,
): (...args: T) => Promise<void> {
  let running = false;
  return async (...args: T) => {
    if (running) return;
    running = true;
    try {
      await run(...args);
    } finally {
      running = false;
    }
  };
}

export interface PhotoUploadRun {
  /** The input list with every landed upload recorded, in the order it came in. */
  photos: DraftPhoto[];
  uploaded: number;
  /** The photo that stopped the run, if one did. Everything after it was left untouched
   *  and is still pending, so the next run picks up exactly where this one gave up. */
  failed?: { photo: DraftPhoto; error: Error };
}

/**
 * Uploads the photos that still need it, one at a time, and stops at the first failure.
 *
 * Sequential on purpose: order is meaning here (the first photo is the cover) and a host
 * on a phone uplink gets a clearer story from one file at a time than from three racing.
 * `onUploaded` fires per landed file so the caller can persist the win immediately —
 * whatever happens to the rest of the batch, that photo is already safe.
 */
export async function uploadPendingPhotos(
  photos: readonly DraftPhoto[],
  upload: (photo: DraftPhoto) => Promise<{ url: string; mediaType?: ListingMediaTypeValue }>,
  onUploaded?: (photo: DraftPhoto, url: string, mediaType: ListingMediaTypeValue) => void,
): Promise<PhotoUploadRun> {
  let current = [...photos];
  let uploaded = 0;

  for (const photo of photos) {
    if (!needsUpload(photo)) continue;
    try {
      const result = await upload(photo);
      const mediaType = result.mediaType ?? "IMAGE";
      current = markPhotoUploaded(current, photo.id, result.url, mediaType);
      uploaded += 1;
      onUploaded?.(photo, result.url, mediaType);
    } catch (error) {
      return {
        photos: current,
        uploaded,
        failed: {
          photo,
          error: error instanceof Error ? error : new Error(`Could not upload ${photo.name}.`),
        },
      };
    }
  }

  return { photos: current, uploaded };
}

/** HEIC files reach the picker with an empty `type` on some browsers, so the extension
 *  is the fallback rather than the primary test. */
export function isPhotoFile(file: File): boolean {
  return file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name);
}

/**
 * Turns a picked batch into tiles. The URL and id factories are injected so the module
 * stays testable outside a browser — callers in the app pass nothing and get the real
 * `URL.createObjectURL` / `crypto.randomUUID`.
 */
export function createDraftPhotos(
  files: Iterable<File>,
  makePreviewUrl: (file: File) => string = (file) => URL.createObjectURL(file),
  makeId: (file: File, index: number) => string = () => crypto.randomUUID(),
): DraftPhoto[] {
  return Array.from(files)
    .filter(isPhotoFile)
    .map((file, index) => ({
      id: makeId(file, index),
      name: file.name,
      previewUrl: makePreviewUrl(file),
      file,
    }));
}

/**
 * Moves `activeId` to where `overId` sits. Order is the whole meaning of the list — the
 * first entry is the cover — so this is the only way position changes.
 */
export function movePhoto(
  photos: readonly DraftPhoto[],
  activeId: string,
  overId: string,
): DraftPhoto[] {
  const from = photos.findIndex((photo) => photo.id === activeId);
  const to = photos.findIndex((photo) => photo.id === overId);
  if (from < 0 || to < 0 || from === to) return [...photos];

  const next = [...photos];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Returns the shortened list alongside the entry that left, so its object URL can be
 *  revoked without the caller searching for it again. */
export function removePhoto(
  photos: readonly DraftPhoto[],
  id: string,
): { photos: DraftPhoto[]; removed: DraftPhoto | undefined } {
  return {
    photos: photos.filter((photo) => photo.id !== id),
    removed: photos.find((photo) => photo.id === id),
  };
}

/** The cover is positional, never a flag: whatever the host dragged to the front is it. */
export function coverPhotoId(photos: readonly DraftPhoto[]): string | null {
  return photos[0]?.id ?? null;
}

export function isCoverPhoto(photos: readonly DraftPhoto[], id: string): boolean {
  return coverPhotoId(photos) === id;
}

export interface PhotoProgress {
  added: number;
  /** The number that actually gates the step. */
  required: number;
  /** The number the bar aims at, and the one the nudge names. Never gates anything. */
  recommended: number;
  remaining: number;
  /** 0–100, capped: the bar tracks progress towards the *recommendation*, so it keeps
   *  moving after the host is already allowed to continue. A seventh photo does not
   *  overfill it. */
  percent: number;
  /** Whether the host may continue. */
  met: boolean;
  /** Whether they have reached the set we actually recommend. */
  recommendationMet: boolean;
}

export function photoProgress(
  added: number,
  required: number = MIN_PUBLISH_PHOTOS,
  recommended: number = RECOMMENDED_LISTING_PHOTOS,
): PhotoProgress {
  const target = Math.max(required, recommended);
  const capped = Math.min(Math.max(added, 0), target);
  return {
    added,
    required,
    recommended: target,
    remaining: Math.max(0, required - Math.max(added, 0)),
    percent: Math.round((capped / target) * 100),
    met: added >= required,
    recommendationMet: added >= target,
  };
}
