"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  type DragEndEvent,
  type DragStartEvent,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CircleAlert,
  GripVertical,
  ImagePlus,
  Loader2,
  Play,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Tx, interpolate, useI18n } from "@/lib/i18n/client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { ListingMediaItem } from "@/lib/types/listing-media";
import { cn } from "@/lib/utils";

export interface ListingMediaUploadState {
  active: boolean;
  progress: number;
  message: string;
}

interface ListingImagesFieldProps {
  initialItems?: ListingMediaItem[];
  items?: ListingMediaItem[];
  onItemsChange?: (
    next: ListingMediaItem[] | ((current: ListingMediaItem[]) => ListingMediaItem[])
  ) => void;
  onUploadStateChange?: (state: ListingMediaUploadState) => void;
}

type UploadTaskStatus = "queued" | "uploading" | "processing" | "error";

interface UploadTask {
  id: string;
  file: File;
  previewUrl: string;
  mediaType: "IMAGE" | "VIDEO";
  progress: number;
  status: UploadTaskStatus;
  error?: string;
}

interface UploadResponse {
  error?: string;
  url?: string;
  mediaType?: string;
}

const MAX_PARALLEL_UPLOADS = 3;

function fileMediaType(file: File): "IMAGE" | "VIDEO" {
  return file.type.startsWith("video/") ||
    /\.(mp4|mov|webm)$/i.test(file.name)
    ? "VIDEO"
    : "IMAGE";
}

function uploadErrorMessage(status: number, data: UploadResponse): string {
  if (status === 413) {
    return "Video is too large for the server. Maximum upload size is 50 MB.";
  }
  return data.error || `Upload failed (${status})`;
}

function uploadFile(
  task: UploadTask,
  onProgress: (progress: number) => void,
  onProcessing: () => void
): Promise<{ url: string; mediaType: "IMAGE" | "VIDEO" }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.set("file", task.file);

    xhr.open("POST", "/api/upload");
    xhr.withCredentials = true;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.upload.onload = onProcessing;
    xhr.onerror = () => reject(new Error("Check your connection and try again."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    xhr.onload = () => {
      let data: UploadResponse = {};
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : {};
      } catch {
        // Reverse proxies can return an HTML error page, notably for HTTP 413.
      }

      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(uploadErrorMessage(xhr.status, data)));
        return;
      }

      if (
        data.url &&
        (data.mediaType === "IMAGE" || data.mediaType === "VIDEO")
      ) {
        resolve({ url: data.url, mediaType: data.mediaType });
        return;
      }

      reject(new Error("The server returned an invalid upload response."));
    };
    xhr.send(formData);
  });
}

export function ListingImagesField({
  initialItems = [],
  items,
  onItemsChange,
  onUploadStateChange,
}: ListingImagesFieldProps) {
  const [internalItems, setInternalItems] = useState<ListingMediaItem[]>(initialItems);
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
  const [dropActive, setDropActive] = useState(false);
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const previewUrlsRef = useRef(new Set<string>());

  const mediaItems = items ?? internalItems;
  const activeUploadTasks = useMemo(
    () => uploadTasks.filter((task) => task.status !== "error"),
    [uploadTasks]
  );
  const uploading = activeUploadTasks.length > 0;
  const uploadProgress = useMemo(() => {
    if (activeUploadTasks.length === 0) return 0;
    const total = activeUploadTasks.reduce((sum, task) => {
      if (task.status === "processing") return sum + 95;
      if (task.status === "queued") return sum;
      return sum + task.progress * 0.9;
    }, 0);
    return Math.round(total / activeUploadTasks.length);
  }, [activeUploadTasks]);
  const processingCount = activeUploadTasks.filter(
    (task) => task.status === "processing"
  ).length;
  const uploadMessage =
    processingCount > 0
      ? `Processing ${processingCount} ${processingCount === 1 ? "file" : "files"}`
      : `Uploading ${activeUploadTasks.length} ${
          activeUploadTasks.length === 1 ? "file" : "files"
        }`;
  const sortableItems = mediaItems.map((item, index) => ({
    id: `${item.mediaType}-${item.url}-${index}`,
    ...item,
    index,
  }));
  const activeItem = sortableItems.find((item) => item.id === activeId) ?? null;
  // Mouse drags start after a small move so ordinary clicks still work; touch
  // drags need a press-and-hold so a swipe across the grid still scrolls the page.
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    onUploadStateChange?.({
      active: uploading,
      progress: uploadProgress,
      message: uploading ? uploadMessage : "",
    });
  }, [onUploadStateChange, uploadMessage, uploadProgress, uploading]);

  useEffect(() => {
    const previewUrls = previewUrlsRef.current;
    return () => {
      for (const url of previewUrls) URL.revokeObjectURL(url);
      previewUrls.clear();
    };
  }, []);

  function updateItems(
    next: ListingMediaItem[] | ((current: ListingMediaItem[]) => ListingMediaItem[])
  ) {
    if (items === undefined) setInternalItems(next);
    onItemsChange?.(next);
  }

  function updateUploadTask(
    taskId: string,
    update: Partial<Pick<UploadTask, "status" | "progress" | "error">>
  ) {
    setUploadTasks((current) =>
      current.map((task) => (task.id === taskId ? { ...task, ...update } : task))
    );
  }

  function releasePreviewUrl(url: string) {
    window.requestAnimationFrame(() => {
      URL.revokeObjectURL(url);
      previewUrlsRef.current.delete(url);
    });
  }

  async function runUploadTask(task: UploadTask) {
    updateUploadTask(task.id, {
      status: "uploading",
      progress: 0,
      error: undefined,
    });

    try {
      const uploaded = await uploadFile(
        task,
        (progress) => updateUploadTask(task.id, { progress }),
        () =>
          updateUploadTask(task.id, {
            status: "processing",
            progress: 100,
          })
      );
      updateItems((current) => [...current, uploaded]);
      setUploadTasks((current) =>
        current.filter((currentTask) => currentTask.id !== task.id)
      );
      releasePreviewUrl(task.previewUrl);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Upload failed. Please try again.";
      updateUploadTask(task.id, {
        status: "error",
        error: message,
      });
      toast.error(`${task.file.name}: ${message}`);
    }
  }

  async function runUploadQueue(tasks: UploadTask[]) {
    let nextIndex = 0;
    const workerCount = Math.min(MAX_PARALLEL_UPLOADS, tasks.length);
    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (nextIndex < tasks.length) {
          const task = tasks[nextIndex];
          nextIndex += 1;
          await runUploadTask(task);
        }
      })
    );
  }

  async function uploadFiles(files: FileList | File[]) {
    const tasks = Array.from(files).map((file, index) => {
      const previewUrl = URL.createObjectURL(file);
      previewUrlsRef.current.add(previewUrl);
      return {
        id: `${Date.now()}-${index}-${crypto.randomUUID()}`,
        file,
        previewUrl,
        mediaType: fileMediaType(file),
        progress: 0,
        status: "queued" as const,
      };
    });
    if (tasks.length === 0) return;

    setUploadTasks((current) => [...current, ...tasks]);
    await runUploadQueue(tasks);
  }

  function retryUpload(task: UploadTask) {
    void runUploadTask(task);
  }

  function removeUploadTask(task: UploadTask) {
    setUploadTasks((current) =>
      current.filter((currentTask) => currentTask.id !== task.id)
    );
    releasePreviewUrl(task.previewUrl);
  }

  async function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;

    try {
      await uploadFiles(files);
    } finally {
      e.target.value = "";
    }
  }

  function removeAt(index: number) {
    updateItems((prev) => prev.filter((_, i) => i !== index));
  }

  function moveMedia(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    updateItems((prev) => {
      if (fromIndex >= prev.length || toIndex >= prev.length) return prev;
      return arrayMove(prev, fromIndex, toIndex);
    });
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) return;

    const fromIndex = sortableItems.findIndex((item) => item.id === active.id);
    const toIndex = sortableItems.findIndex((item) => item.id === over.id);
    if (fromIndex === -1 || toIndex === -1) return;

    moveMedia(fromIndex, toIndex);
  }

  function onDropFiles(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDropActive(false);
    if (e.dataTransfer.files.length > 0) {
      void uploadFiles(e.dataTransfer.files);
    }
  }

  return (
    <div className="notranslate space-y-4" translate="no">
      <div
        className={cn(
          "relative rounded-lg border border-dashed p-5 transition-colors",
          dropActive ? "border-primary bg-primary/5" : "border-border bg-muted/30"
        )}
        onDragOver={(e) => {
          e.preventDefault();
          if (e.dataTransfer.types.includes("Files")) setDropActive(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropActive(false);
        }}
        onDrop={onDropFiles}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-background ring-1 ring-border">
              <ImagePlus className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <Label className="text-sm font-medium">Photos and videos</Label>
              <p className="mt-1 text-sm text-muted-foreground">
                Drop JPEG, PNG, WebP, HEIC, MP4, MOV, or WebM files here. At least one photo is required for the cover.
              </p>
            </div>
          </div>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm,.heic,.heif,.mp4,.mov,.webm"
            multiple
            id="listing-media-upload"
            className="sr-only"
            onChange={onFileChange}
            disabled={uploading}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-disabled={uploading}
            className={cn(uploading && "pointer-events-none opacity-50")}
            asChild
          >
            <label htmlFor="listing-media-upload" className="cursor-pointer">
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading {uploadProgress}%
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Choose files
                </>
              )}
            </label>
          </Button>
        </div>
        {uploading && (
          <div
            className="mt-4 rounded-lg border bg-background p-3 shadow-sm"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 font-medium">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                {uploadMessage}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {uploadProgress}%
              </span>
            </div>
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="Media upload progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={uploadProgress}
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {mediaItems.length > 0 || uploadTasks.length > 0 ? (
        <DndContext
          id="listing-images-dnd"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <SortableContext items={sortableItems.map((item) => item.id)} strategy={rectSortingStrategy}>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {sortableItems.map(({ id, index, ...item }) => (
                <SortableImageTile
                  key={id}
                  id={id}
                  item={item}
                  index={index}
                  isCover={index === 0 && item.mediaType === "IMAGE"}
                  onRemove={() => removeAt(index)}
                />
              ))}
              {uploadTasks.map((task) => (
                <PendingUploadTile
                  key={task.id}
                  task={task}
                  onRetry={() => retryUpload(task)}
                  onRemove={() => removeUploadTask(task)}
                />
              ))}
            </ul>
          </SortableContext>

          <DragOverlay>
            {activeItem ? (
              <div className="relative aspect-[4/3] w-40 overflow-hidden rounded-lg border border-border bg-muted shadow-2xl">
                <MediaThumb item={activeItem} interactive={false} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="flex aspect-[4/3] items-center justify-center rounded-lg border bg-muted/30 text-sm text-muted-foreground sm:aspect-[16/5]">
          Add photos and videos to build the guest gallery.
        </div>
      )}

      {mediaItems.map((item, i) => (
        <input
          key={`mediaItems-${item.mediaType}-${i}`}
          type="hidden"
          name="mediaItems"
          value={JSON.stringify({ url: item.url, mediaType: item.mediaType })}
        />
      ))}
    </div>
  );
}

function PendingUploadTile({
  task,
  onRetry,
  onRemove,
}: {
  task: UploadTask;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const failed = task.status === "error";
  const statusLabel =
    task.status === "queued"
      ? "Waiting to upload"
      : task.status === "processing"
        ? "Processing"
        : task.status === "uploading"
          ? `Uploading ${task.progress}%`
          : "Upload failed";

  return (
    <li className="relative aspect-[4/3] overflow-hidden rounded-lg border bg-muted">
      {task.mediaType === "VIDEO" ? (
        <video
          src={task.previewUrl}
          className="h-full w-full object-cover"
          muted
          playsInline
          preload="metadata"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={task.previewUrl}
          alt=""
          className="h-full w-full object-cover"
        />
      )}
      <div
        className={cn(
          "absolute inset-0 flex flex-col justify-end p-3 text-white",
          failed ? "bg-black/65" : "bg-gradient-to-t from-black/75 via-black/20 to-black/10"
        )}
      >
        <p className="truncate text-sm md:text-xs font-medium" title={task.file.name}>
          {task.file.name}
        </p>
        {failed ? (
          <>
            <p className="mt-1 line-clamp-2 flex items-start gap-1 text-[11px] text-white/85">
              <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" />
              {task.error}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex min-h-7 items-center gap-1 rounded-md bg-white px-2 text-[11px] font-medium text-black transition-colors hover:bg-white/90"
              >
                <RotateCcw className="h-3 w-3" />
                <Tx k="host.images.retry" source="Retry" />
              </button>
              <button
                type="button"
                onClick={onRemove}
                className="inline-flex min-h-7 items-center gap-1 rounded-md border border-white/40 px-2 text-[11px] font-medium transition-colors hover:bg-white/10"
              >
                <Trash2 className="h-3 w-3" />
                <Tx k="host.images.remove" source="Remove" />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-1 flex items-center gap-1.5 text-[11px]">
              <Loader2 className="h-3 w-3 animate-spin" />
              {statusLabel}
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/30">
              <div
                className={cn(
                  "h-full rounded-full bg-white transition-[width] duration-200",
                  task.status === "processing" && "animate-pulse"
                )}
                style={{
                  width: `${
                    task.status === "processing"
                      ? 95
                      : task.status === "queued"
                        ? 6
                        : Math.max(6, task.progress)
                  }%`,
                }}
              />
            </div>
          </>
        )}
      </div>
    </li>
  );
}

function SortableImageTile({
  id,
  item,
  index,
  isCover,
  onRemove,
}: {
  id: string;
  item: ListingMediaItem;
  index: number;
  isCover: boolean;
  onRemove: () => void;
}) {
  const { resolve } = useI18n();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <li
      ref={setNodeRef}
      {...listeners}
      className={cn(
        "group relative aspect-[4/3] cursor-grab touch-manipulation select-none overflow-hidden rounded-lg border bg-muted transition-shadow active:cursor-grabbing",
        isDragging && "z-10 shadow-2xl"
      )}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <MediaThumb item={item} interactive={false} />
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={
          interpolate(
            resolve("host.images.reorder_label", "Reorder media item {position}"),
            { position: index + 1 },
          ).text
        }
        className="absolute left-1 top-1 inline-flex min-h-9 touch-none cursor-grab select-none items-center gap-1 rounded-md bg-background/90 px-2 py-1.5 text-xs md:text-[10px] font-medium shadow-sm transition-transform hover:scale-[1.02] active:cursor-grabbing md:min-h-0 md:px-1.5 md:py-1"
      >
        <GripVertical className="h-3 w-3" />
        <Tx k="host.images.drag" source="Drag" />
      </button>
      {/* Hover cannot reveal anything on a touch screen, so the delete control is
          always visible below md and only hides behind hover on pointer devices. */}
      <div className="absolute right-1 top-1 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
        <Button
          type="button"
          size="icon"
          variant="destructive"
          className="h-9 w-9 md:h-7 md:w-7"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onRemove}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      {isCover && (
        <span className="absolute bottom-1 left-1 rounded bg-background/90 px-1.5 py-0.5 text-xs md:text-[10px] font-medium shadow-sm">
          <Tx k="host.images.cover" source="Cover" />
        </span>
      )}
    </li>
  );
}

function MediaThumb({
  item,
  interactive = true,
}: {
  item: ListingMediaItem;
  interactive?: boolean;
}) {
  if (item.mediaType === "VIDEO") {
    // Inside a sortable tile the native controls would swallow the drag, so the
    // video renders as a plain poster with a play badge instead.
    return (
      <>
        <video
          src={item.url}
          className={cn(
            "h-full w-full object-cover",
            !interactive && "pointer-events-none"
          )}
          controls={interactive}
          muted
          playsInline
          preload="metadata"
        />
        {!interactive && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="flex size-9 items-center justify-center rounded-full bg-black/55 text-white">
              <Play className="h-4 w-4 fill-current" />
            </span>
          </span>
        )}
      </>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.url}
      alt=""
      className={cn(
        "h-full w-full object-cover",
        !interactive && "pointer-events-none"
      )}
      draggable={false}
    />
  );
}
