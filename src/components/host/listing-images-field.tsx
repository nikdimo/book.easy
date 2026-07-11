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
import { cn } from "@/lib/utils";

interface ListingImagesFieldProps {
  initialUrls?: string[];
  urls?: string[];
  onUrlsChange?: (next: string[] | ((current: string[]) => string[])) => void;
}

export function ListingImagesField({
  initialUrls = [],
  urls,
  onUrlsChange,
}: ListingImagesFieldProps) {
  const [internalUrls, setInternalUrls] = useState<string[]>(initialUrls);
  const [uploading, setUploading] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);

  const imageUrls = urls ?? internalUrls;
  const sortableItems = imageUrls.map((url, index) => ({
    id: `${url}-${index}`,
    url,
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

  function updateUrls(next: string[] | ((current: string[]) => string[])) {
    if (urls === undefined) setInternalUrls(next);
    onUrlsChange?.(next);
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
        if (data.url) {
          updateUrls((prev) => [...prev, data.url]);
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
    updateUrls((prev) => prev.filter((_, i) => i !== index));
  }

  function moveImage(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    updateUrls((prev) => {
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

    moveImage(fromIndex, toIndex);
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
              <Label className="text-sm font-medium">Photos</Label>
              <p className="mt-1 text-sm text-muted-foreground">
                Drop JPEG, PNG, WebP, or iPhone HEIC files here. The first photo is the cover.
              </p>
            </div>
          </div>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
            multiple
            id="listing-photo-upload"
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
            <label htmlFor="listing-photo-upload" className="cursor-pointer">
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

      {imageUrls.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <SortableContext items={sortableItems.map((item) => item.id)} strategy={rectSortingStrategy}>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {sortableItems.map(({ id, url }, index) => (
                <SortableImageTile
                  key={id}
                  id={id}
                  url={url}
                  index={index}
                  isCover={index === 0}
                  onRemove={() => removeAt(index)}
                />
              ))}
            </ul>
          </SortableContext>

          <DragOverlay>
            {activeItem ? (
              <div className="aspect-[4/3] w-40 overflow-hidden rounded-lg border border-border bg-muted shadow-2xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={activeItem.url} alt="" className="h-full w-full object-cover" />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="flex aspect-[4/3] items-center justify-center rounded-lg border bg-muted/30 text-sm text-muted-foreground sm:aspect-[16/5]">
          Add photos to build the guest gallery.
        </div>
      )}

      {imageUrls.map((url, i) => (
        <input key={`imageUrls-${i}`} type="hidden" name="imageUrls" value={url} />
      ))}
    </div>
  );
}

function SortableImageTile({
  id,
  url,
  index,
  isCover,
  onRemove,
}: {
  id: string;
  url: string;
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="h-full w-full object-cover" />
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Reorder photo ${index + 1}`}
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
