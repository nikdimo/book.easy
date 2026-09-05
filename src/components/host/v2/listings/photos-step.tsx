"use client";

import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ImagePlus, Plus, Upload, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { Tx, interpolate, useI18n } from "@/lib/i18n/client";
import {
  MIN_PUBLISH_PHOTOS,
  PHOTO_INPUT_ACCEPT,
  createDraftPhotos,
  draftMediaItems,
  isPersistedPhoto,
  markPhotoUploaded,
  movePhoto,
  photoProgress,
  removePhoto,
  singleFlight,
  uploadPendingPhotos,
  type DraftPhoto,
} from "@/lib/host/v2/photo-draft";
import type { ListingMediaItem, ListingMediaTypeValue } from "@/lib/types/listing-media";
import type { ListingSpaceTypeValue } from "@/lib/types/listing-space-type";
import type { PropertyTypeOption } from "@/lib/types/property-type";
import { cn } from "@/lib/utils";
import { reviewHref, stepNextTarget } from "@/lib/host/v2/listing-flow-return";
import { isEquirectangularPanoramaDimensions } from "@/lib/media/panorama";
import { ListingFlowFooter } from "./listing-flow-footer";
import { useHostStartDraft } from "./host-start-draft-provider";

/**
 * One picked photo. The whole tile is the drag handle: a separate grip would spend a
 * corner of every tile on something the tile already does, and it keeps the touch
 * target as large as the image itself.
 */
function PhotoTile({
  photo,
  index,
  onRemove,
  onPanoramaDetected,
}: {
  photo: DraftPhoto;
  index: number;
  onRemove: (id: string) => void;
  onPanoramaDetected: (id: string) => void;
}) {
  const { resolve } = useI18n();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: photo.id });
  const isCover = index === 0;
  const imageRef = useRef<HTMLImageElement>(null);
  const recognizePanorama = useCallback(
    (image: HTMLImageElement) => {
      if (
        !photo.isPanorama &&
        isEquirectangularPanoramaDimensions(image.naturalWidth, image.naturalHeight)
      ) {
        onPanoramaDetected(photo.id);
      }
    },
    [onPanoramaDetected, photo.id, photo.isPanorama],
  );

  // A persisted draft image can finish from the browser cache before React attaches
  // its load handler. Check the already-decoded element once as well as listening below.
  useEffect(() => {
    if (imageRef.current?.complete) recognizePanorama(imageRef.current);
  }, [recognizePanorama]);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-100",
        // The cover is larger than the rest, so which photo guests see first reads at a
        // glance and not only from its badge. It keeps its own aspect ratio across the
        // full width on the two-column layout, where spanning two rows would leave
        // those rows with nothing else to give them a height.
        isCover && "col-span-2 aspect-[3/2] sm:row-span-2 sm:aspect-auto",
        isDragging && "opacity-40",
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={resolve("host.v2.photos.reorder", "Drag to reorder photo").text}
        className="absolute inset-0 h-full w-full cursor-grab touch-manipulation select-none active:cursor-grabbing"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imageRef}
          src={photo.previewUrl}
          alt=""
          draggable={false}
          className="pointer-events-none h-full w-full object-cover"
          onLoad={(event) => recognizePanorama(event.currentTarget)}
        />
      </button>

      {isCover && (
        <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-slate-950/85 px-3 py-1 font-heading text-xs font-semibold text-white">
          <Tx k="host.v2.photos.cover_badge" source="Cover photo" />
        </span>
      )}

      {photo.isPanorama && (
        <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/65 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
          <Tx k="host.v2.photos.panorama_badge" source="360° detected" />
        </span>
      )}

      {/* Visible from the start on touch, where there is no hover to reveal it. */}
      <button
        type="button"
        onClick={() => onRemove(photo.id)}
        aria-label={resolve("host.v2.photos.remove", "Remove photo").text}
        className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-white/90 text-slate-700 shadow-sm transition-opacity hover:text-slate-950 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 md:opacity-0 md:group-hover:opacity-100"
      >
        <X className="size-4" aria-hidden />
      </button>
    </li>
  );
}

const DRAFT_PHOTOS_ENDPOINT = "/api/host-start/draft/photos";

/**
 * Sends one file to the server operation that stores it *and* records it on the owned
 * draft. There is no window in between for the two to disagree: if the draft write fails
 * the server unlinks the file it just wrote and answers with an error, so a rejected
 * upload leaves nothing behind.
 */
async function uploadDraftPhoto(
  photo: DraftPhoto,
): Promise<{
  url: string;
  mediaType?: ListingMediaTypeValue;
  isPanorama?: boolean;
}> {
  const body = new FormData();
  body.set("file", photo.file as File);
  body.set("alt", photo.name);
  const response = await fetch(DRAFT_PHOTOS_ENDPOINT, { method: "POST", body });
  const result = (await response.json().catch(() => ({}))) as {
    url?: string;
    mediaType?: ListingMediaTypeValue;
    isPanorama?: boolean;
    error?: string;
  };
  if (!response.ok || !result.url) {
    throw new Error(result.error ?? `Could not upload ${photo.name}.`);
  }
  return {
    url: result.url,
    mediaType: result.mediaType,
    isPanorama: result.isPanorama === true,
  };
}

/** Turns whatever the draft is already holding into tiles. Their URLs are stored URLs,
 *  not object URLs, so they arrive persisted and are never uploaded again — including the
 *  ones the listing importer copied in, which have no bytes in this tab at all. */
function photosFromDraft(items: ListingMediaItem[] | undefined): DraftPhoto[] {
  return (items ?? [])
    .filter((item) => item.mediaType === "IMAGE")
    .map((item, index) => ({
      id: item.id ?? `saved-${index}`,
      mediaId: item.id,
      name: item.alt ?? `Photo ${index + 1}`,
      previewUrl: item.url,
      uploadedUrl: item.url,
      mediaType: "IMAGE" as const,
      isPanorama: item.isPanorama === true,
    }));
}

/**
 * The second screen of phase two: the photos of the place.
 *
 * Unlike the phase-one screens this one writes as it goes. Each picked file is stored and
 * recorded on the host's draft in a single server call, so a batch that dies on its fifth
 * photo keeps the four that already landed: the grid still shows them, they are already
 * on the draft, and pressing Next again sends only what is still missing. The final save
 * then rewrites the whole list in the order the grid is showing, which is what makes the
 * first tile the cover.
 *
 * The reordering, the cover-is-position rule and the sensor setup are the listing
 * editor's, so both grids behave the same under a mouse, a finger and a keyboard. What
 * differs is the presentation, which drops the editor rooms, selection and density chrome
 * for one ordered grid.
 */
export function PhotosStep({
  propertyType,
  spaceType,
  returnToReview = false,
}: {
  propertyType: PropertyTypeOption;
  spaceType: ListingSpaceTypeValue;
  /** Reached from the Review screen's "Edit". */
  returnToReview?: boolean;
}) {
  const { resolve } = useI18n();
  const { data, save } = useHostStartDraft();
  const [photos, setPhotos] = useState<DraftPhoto[]>(() => photosFromDraft(data.mediaItems));
  const [dropping, setDropping] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const query = `propertyType=${encodeURIComponent(propertyType.value)}&spaceType=${encodeURIComponent(spaceType)}`;
  /** Where the CTA goes, and what it says: on to the next question, or back to the
   *  summary the host came from. */
  const { href: nextHref, label: nextLabel, route: nextRoute } = stepNextTarget(
    returnToReview,
    query,
    `/host/start/description?${query}`,
  );

  // The ordered list is the single source of truth for what gets saved, and an upload run
  // reads it between awaits — after a reorder the host may have made mid-flight. A ref
  // written in the same breath as the state keeps "what is on screen" and "what the run
  // sees" from drifting apart, which a state value captured at the top of an async
  // function cannot do.
  const photosRef = useRef(photos);
  const applyPhotos = useCallback((update: (current: DraftPhoto[]) => DraftPhoto[]) => {
    photosRef.current = update(photosRef.current);
    setPhotos(photosRef.current);
  }, []);

  // Every object URL this component created, so it owns revoking them — and only them: a
  // persisted photo's `previewUrl` is a storage URL and revoking it would be meaningless.
  // Held in a ref because the cleanup runs after the state that listed them is gone.
  const previewUrls = useRef(new Set<string>());
  useEffect(() => {
    const urls = previewUrls.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  const releasePreview = useCallback((url: string) => {
    if (!previewUrls.current.has(url)) return;
    // Deferred a frame: revoking while the tile that renders it is still mounted paints a
    // broken image for the frame between the removal and the unmount.
    window.requestAnimationFrame(() => {
      URL.revokeObjectURL(url);
      previewUrls.current.delete(url);
    });
  }, []);

  const addFiles = useCallback(
    (files: FileList | File[] | null) => {
      if (!files) return;
      const added = createDraftPhotos(files);
      if (added.length === 0) return;
      for (const photo of added) previewUrls.current.add(photo.previewUrl);
      applyPhotos((current) => [...current, ...added]);
    },
    [applyPhotos],
  );

  const remove = useCallback(
    (id: string) => {
      const target = photosRef.current.find((photo) => photo.id === id);
      applyPhotos((current) => removePhoto(current, id).photos);
      if (!target) return;
      releasePreview(target.previewUrl);
      // A photo that never reached the server has nothing to take back. One that did is
      // dropped from the draft server-side, which is also the only place allowed to decide
      // whether its stored file may go with it.
      if (!isPersistedPhoto(target)) return;
      void (async () => {
        try {
          const response = await fetch(DRAFT_PHOTOS_ENDPOINT, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: target.uploadedUrl }),
          });
          if (response.ok) return;
          const result = (await response.json().catch(() => ({}))) as { error?: string };
          toast.error(
            result.error ??
              resolve(
                "host.v2.photos.remove_failed",
                "That photo could not be removed. Please try again.",
              ).text,
          );
        } catch {
          toast.error(
            resolve(
              "host.v2.photos.remove_failed",
              "That photo could not be removed. Please try again.",
            ).text,
          );
        }
      })();
    },
    [applyPhotos, releasePreview, resolve],
  );

  // Local previews exist before the upload endpoint can inspect their bytes. Recognize
  // the standard 2:1 projection as soon as the browser decodes each tile, so hosts get
  // immediate feedback. This also repairs an older persisted draft item that predates
  // the server-side flag; the next draft save carries the detected value forward.
  const markPanoramaDetected = useCallback(
    (id: string) => {
      applyPhotos((current) =>
        current.map((photo) =>
          photo.id === id && !photo.isPanorama ? { ...photo, isPanorama: true } : photo,
        ),
      );
    },
    [applyPhotos],
  );

  // Next both uploads and navigates, so a double-click would otherwise start two batches
  // over the same files. The footer disables its own CTA while the handler runs, but that
  // is React state settling a frame later; this gate is created once and closes the gap in
  // between, whatever the second click's timing.
  const [guardNext] = useState(() =>
    singleFlight(async (job: () => Promise<void>) => {
      await job();
    }),
  );

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    applyPhotos((current) => movePhoto(current, String(active.id), String(over.id)));
  }

  function openFilePicker() {
    fileInput.current?.click();
  }

  function handleFileDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDropping(false);
    addFiles(event.dataTransfer.files);
  }

  function handleFileDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDropping(true);
  }

  /** Shown once the host has tried to move on, beside the counter that says how many
   *  are still needed — a toast that scrolls away is the wrong place for a rule the
   *  host has to act on right here. */
  const [showMinimumError, setShowMinimumError] = useState(false);
  const progress = photoProgress(photos.length);
  /** Counting up to the floor answers the only question a host has while they are still
   *  blocked; once they are past it, the useful number is the set we recommend. */
  const counter = interpolate(
    progress.met
      ? resolve("host.v2.photos.counter_added", "{added} photos added")
      : resolve("host.v2.photos.counter", "{added} of {required} photos added"),
    { added: progress.added, required: progress.required },
  );

  async function savePhotos() {
    if (!progress.met) {
      // Nothing is uploaded and nothing navigates: the host is left on this screen with
      // the picker focused and the count they still have to reach.
      setShowMinimumError(true);
      fileInput.current?.focus();
      return;
    }
    setShowMinimumError(false);

    const run = await uploadPendingPhotos(
      photosRef.current,
      uploadDraftPhoto,
      // Recorded the instant it lands. From here on this photo is on the draft and out of
      // every later run's reach, whatever the rest of the batch does.
      // The object URL stays the tile's preview even after the file is stored: it is
      // already decoded in this tab, and swapping it for the storage URL would refetch a
      // photo the host is looking at. It is revoked on unmount like every other one.
      (photo, url, mediaType, isPanorama) =>
        applyPhotos((current) =>
          markPhotoUploaded(current, photo.id, url, mediaType, isPanorama),
        ),
    );

    if (run.failed) {
      // The tiles stay exactly as they are — the landed ones persisted, the failed and
      // untouched ones still local — and the host stays on this screen to try again.
      throw run.failed.error;
    }

    const mediaItems = draftMediaItems(photosRef.current);
    if (!mediaItems) throw new Error("Your photos could not be uploaded.");
    if (await save({ mediaItems, currentStepId: "description", currentRoute: nextRoute })) {
      window.location.assign(nextHref);
    }
  }

  return (
    <>
      <main className="flex flex-1 flex-col px-5 pb-28 pt-6 md:px-8 md:pb-32 md:pt-10">
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">
          <p className="font-heading text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            <Tx k="host.v2.photos.eyebrow" source="Photos" />
          </p>

          {/* One row while the counter still fits beside the copy, two once it does not. */}
          <div className="mt-3 flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
            <div className="min-w-0">
              <h1 className="font-heading text-[1.75rem] font-semibold leading-[1.15] tracking-[-0.02em] text-slate-950 sm:text-[2rem] md:text-[2.35rem]">
                <Tx k="host.v2.photos.heading" source="Add some photos of your place" />
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
                <Tx
                  k="host.v2.photos.hint"
                  source="Add at least 3 photos — listings with 5 or more get more bookings. Put your best photo first; you can reorder them at any time."
                />
              </p>
            </div>

            <div className="w-full sm:w-56">
              <p className="flex items-baseline justify-between gap-2 text-sm font-semibold text-slate-700">
                <span className={counter.translated ? "notranslate" : undefined}>
                  {counter.text}
                </span>
                {progress.met && (
                  <span className="text-xs font-semibold text-slate-500">
                    {progress.recommendationMet ? (
                      <Tx k="host.v2.photos.great_set" source="Great set" />
                    ) : (
                      <Tx k="host.v2.photos.minimum_met" source="Minimum reached" />
                    )}
                  </span>
                )}
              </p>
              <span className="mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                <span
                  className="block h-full rounded-full bg-slate-950 transition-[width] duration-300"
                  style={{ width: `${progress.percent}%` }}
                />
              </span>
              {/* Past the floor but short of a good set: an encouragement, never a gate —
                  Next already works from here. */}
              {progress.met && !progress.recommendationMet ? (
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {
                    interpolate(
                      resolve(
                        "host.v2.photos.recommendation",
                        "Listings with {recommended} or more photos get more bookings.",
                      ),
                      { recommended: progress.recommended },
                    ).text
                  }
                </p>
              ) : null}

              {/* Always in the tree, so the live region exists to announce into rather
                  than being created at the moment it has something to say. */}
              <p
                id="listing-flow-photos-error"
                role="alert"
                className="mt-2 text-sm text-rose-600 empty:hidden"
              >
                {showMinimumError && !progress.met
                  ? interpolate(
                      resolve(
                        "host.v2.photos.error_minimum",
                        "Add at least {required} photos before continuing.",
                      ),
                      { required: MIN_PUBLISH_PHOTOS },
                    ).text
                  : null}
              </p>
            </div>
          </div>

          <input
            ref={fileInput}
            type="file"
            accept={PHOTO_INPUT_ACCEPT}
            multiple
            aria-invalid={showMinimumError && !progress.met}
            aria-describedby="listing-flow-photos-error"
            className="sr-only"
            onChange={(event) => {
              addFiles(event.target.files);
              // Cleared so re-picking the same file still fires a change event.
              event.target.value = "";
            }}
          />

          {photos.length === 0 ? (
            <div
              onDragOver={handleFileDragOver}
              onDragLeave={() => setDropping(false)}
              onDrop={handleFileDrop}
              className={cn(
                "mt-8 flex flex-1 flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 px-6 py-14 text-center transition-colors md:py-24",
                dropping && "border-slate-950 bg-slate-50",
              )}
            >
              <span className="grid size-14 place-items-center rounded-2xl bg-slate-100 text-slate-700">
                <ImagePlus className="size-6" strokeWidth={1.5} aria-hidden />
              </span>
              <h2 className="mt-5 font-heading text-lg font-semibold text-slate-950">
                <Tx k="host.v2.photos.empty_title" source="Drag your photos here" />
              </h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
                <Tx
                  k="host.v2.photos.empty_hint"
                  source="You can add more or reorder them at any time."
                />
              </p>
              <button
                type="button"
                onClick={openFilePicker}
                className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-slate-950 px-6 font-heading text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
              >
                <Upload className="size-4" aria-hidden />
                <Tx k="host.v2.photos.upload" source="Upload from your device" />
              </button>
            </div>
          ) : (
            <div
              onDragOver={handleFileDragOver}
              onDragLeave={() => setDropping(false)}
              onDrop={handleFileDrop}
              className={cn(
                "mt-8 rounded-3xl transition-colors",
                dropping && "outline-dashed outline-2 outline-offset-8 outline-slate-300",
              )}
            >
              <DndContext
                id="listing-flow-photos-dnd"
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={photos.map((photo) => photo.id)}
                  strategy={rectSortingStrategy}
                >
                  <ul className="grid auto-rows-auto grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {photos.map((photo, index) => (
                      <PhotoTile
                        key={photo.id}
                        photo={photo}
                        index={index}
                        onRemove={remove}
                        onPanoramaDetected={markPanoramaDetected}
                      />
                    ))}
                    <li className="aspect-[4/3]">
                      <button
                        type="button"
                        onClick={openFilePicker}
                        className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 text-sm font-semibold text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
                      >
                        <Plus className="size-5" aria-hidden />
                        <Tx k="host.v2.photos.add_more" source="Add more" />
                      </button>
                    </li>
                  </ul>
                </SortableContext>
              </DndContext>
            </div>
          )}
        </div>
      </main>

      <ListingFlowFooter
        {...(progress.met ? { nextHref } : {})}
        backHref={returnToReview ? reviewHref(query) : `/host/start/amenities?${query}`}
        nextLabel={nextLabel}
        onNext={() =>
          guardNext(async () => {
            try {
              await savePhotos();
            } catch {
              // Not `error.message`: what lands here is an upload transport
              // fault, and "Failed to fetch" is the browser talking to a developer.
              toast.error(
                resolve(
                  "host.v2.photos.upload_failed",
                  "Your photos could not be uploaded.",
                ).text,
              );
            }
          })
        }
        phaseOneProgress={100}
        phaseTwoProgress={40}
      />
    </>
  );
}
