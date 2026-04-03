"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Upload, Trash2, ChevronUp, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ListingImagesFieldProps {
  initialUrls: string[];
}

export function ListingImagesField({ initialUrls }: ListingImagesFieldProps) {
  const [urls, setUrls] = useState<string[]>(initialUrls);
  const [uploading, setUploading] = useState(false);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
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
          setUrls((prev) => [...prev, data.url]);
        }
      }
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  function removeAt(index: number) {
    setUrls((prev) => prev.filter((_, i) => i !== index));
  }

  function moveUp(index: number) {
    if (index <= 0) return;
    setUrls((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }

  function moveDown(index: number) {
    setUrls((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Photos</Label>
        <div className="relative">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
            onChange={onFileChange}
            disabled={uploading}
          />
          <Button type="button" variant="outline" size="sm" disabled={uploading}>
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload images
              </>
            )}
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        JPEG, PNG, or WebP. First photo is the cover image. Drag order with arrows.
      </p>

      {urls.length > 0 && (
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {urls.map((url, index) => (
            <li
              key={`${url}-${index}`}
              className="relative aspect-[4/3] rounded-lg border overflow-hidden bg-muted group"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="object-cover w-full h-full" />
              <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="h-7 w-7"
                  onClick={() => moveUp(index)}
                  disabled={index === 0}
                >
                  <ChevronUp className="h-3 w-3" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="h-7 w-7"
                  onClick={() => moveDown(index)}
                  disabled={index === urls.length - 1}
                >
                  <ChevronDown className="h-3 w-3" />
                </Button>
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
                <span className="absolute bottom-1 left-1 text-[10px] bg-background/90 px-1.5 py-0.5 rounded">
                  Cover
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {urls.map((url, i) => (
        <input key={`imageUrls-${i}`} type="hidden" name="imageUrls" value={url} />
      ))}
    </div>
  );
}
