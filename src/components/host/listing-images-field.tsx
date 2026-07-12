"use client";

import { useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
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
import { GripVertical, ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { ListingMediaItem } from "@/lib/types/listing-media";
import { cn } from "@/lib/utils";

interface ListingImagesFieldProps {
  initialItems?: ListingMediaItem[];
  items?: ListingMediaItem[];
  onItemsChange?: (
    next: ListingMediaItem[] | ((current: ListingMediaItem[]) => ListingMediaItem[])
  ) => void;
}

export function ListingImagesField({
  initialItems = [],
  items,
  onItemsChange,
}: ListingImagesFieldProps) {
  const [internalItems, setInternalItems] = useState<ListingMediaItem[]>(initialItems);
  const [uploading, setUploading] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);

  const mediaItems = items ?? internalItems;
  const sortableItems = mediaItems.map((item, index) => ({
    id: `${item.mediaType}-${item.url}-${index}`,
    ...item,
    index,
  }));
  const activeItem = sortableItems.find((item) => item.id === activeId) ?? null;
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function updateItems(
    next: ListingMediaItem[] | ((current: ListingMediaItem[]) => ListingMediaItem[])
  ) {
    if (items === undefined) setInternalItems(next);
    onItemsChange?.(next);
  }

  async function uploadFiles(files: FileList | File[]) {
    const fileList = Array.from(files);
    if (fileList.length === 0) return;

    setUploading(true);
    try {
      for (const file of fileList) {
        const formData = new FormData();
        formData.set("file", file);
        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
          credentials: "same-origin",
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error || "Upload failed");
          continue;
        }
        if (data.url && (data.mediaType === "IMAGE" || data.mediaType === "VIDEO")) {
          updateItems((prev) => [...prev, { url: data.url, mediaType: data.mediaType }]);
        }
      }
    } finally {
      setUploading(false);
    }
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
    <div className="space-y-4">
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
                  Uploading
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
      </div>

      {mediaItems.length > 0 ? (
        <DndContext
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
            </ul>
          </SortableContext>

          <DragOverlay>
            {activeItem ? (
              <div className="aspect-[4/3] w-40 overflow-hidden rounded-lg border border-border bg-muted shadow-2xl">
                <MediaThumb item={activeItem} />
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
      className={cn(
        "group relative aspect-[4/3] overflow-hidden rounded-lg border bg-muted transition-shadow",
        isDragging && "z-10 shadow-2xl"
      )}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <MediaThumb item={item} />
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Reorder media item ${index + 1}`}
        className="absolute left-1 top-1 inline-flex touch-none cursor-grab select-none items-center gap-1 rounded-md bg-background/90 px-1.5 py-1 text-[10px] font-medium shadow-sm transition-transform hover:scale-[1.02] active:cursor-grabbing"
      >
        <GripVertical className="h-3 w-3" />
        Drag
      </button>
      <div className="absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <Button
          type="button"
          size="icon"
          variant="destructive"
          className="h-7 w-7"
          onClick={onRemove}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      {isCover && (
        <span className="absolute bottom-1 left-1 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-medium shadow-sm">
          Cover
        </span>
      )}
    </li>
  );
}

function MediaThumb({ item }: { item: ListingMediaItem }) {
  if (item.mediaType === "VIDEO") {
    return (
      <video
        src={item.url}
        className="h-full w-full object-cover"
        controls
        muted
        playsInline
        preload="metadata"
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={item.url} alt="" className="h-full w-full object-cover" />
  );
}
