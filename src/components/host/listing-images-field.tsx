"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { GripVertical, ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

interface ListingImagesFieldProps {
  initialUrls?: string[];
  urls?: string[];
  onUrlsChange?: (urls: string[]) => void;
}

export function ListingImagesField({
  initialUrls = [],
  urls,
  onUrlsChange,
}: ListingImagesFieldProps) {
  const [internalUrls, setInternalUrls] = useState<string[]>(initialUrls);
  const [uploading, setUploading] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const imageUrls = urls ?? internalUrls;

  function updateUrls(next: string[] | ((current: string[]) => string[])) {
    const resolved = typeof next === "function" ? next(imageUrls) : next;
    if (urls === undefined) setInternalUrls(resolved);
    onUrlsChange?.(resolved);
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

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
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
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  function onDropFiles(e: React.DragEvent<HTMLDivElement>) {
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
                Drop JPEG, PNG, or WebP files here. The first photo is the cover.
              </p>
            </div>
          </div>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
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
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {imageUrls.map((url, index) => (
            <li
              key={`${url}-${index}`}
              draggable
              onDragStart={(e) => {
                setDraggedIndex(index);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(index));
              }}
              onDragEnd={() => setDraggedIndex(null)}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => {
                e.preventDefault();
                const fromIndex = draggedIndex ?? Number(e.dataTransfer.getData("text/plain"));
                moveImage(fromIndex, index);
                setDraggedIndex(null);
              }}
              className={cn(
                "group relative aspect-[4/3] cursor-grab overflow-hidden rounded-lg border bg-muted active:cursor-grabbing",
                draggedIndex === index && "opacity-50"
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="object-cover w-full h-full" />
              <div className="absolute left-1 top-1 flex items-center gap-1 rounded-md bg-background/90 px-1.5 py-1 text-[10px] font-medium shadow-sm">
                <GripVertical className="h-3 w-3" />
                Drag
              </div>
              <div className="absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  className="h-7 w-7"
                  onClick={() => removeAt(index)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              {index === 0 && (
                <span className="absolute bottom-1 left-1 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-medium shadow-sm">
                  Cover
                </span>
              )}
            </li>
          ))}
        </ul>
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
