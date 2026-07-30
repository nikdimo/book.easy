"use client";

import type { ChangeEvent } from "react";
import { useState } from "react";
import { Camera, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface Evidence {
  url: string;
  fileName: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  sizeBytes: number;
}

export function DamageReportDialog({
  conversationId,
  onCreated,
}: {
  conversationId: string;
  onCreated: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || evidence.length >= 5) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/support/evidence", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json()) as {
        error?: string;
        url?: string;
        fileName?: string;
        mimeType?: Evidence["mimeType"];
        sizeBytes?: number;
      };
      if (
        !response.ok ||
        !result.url ||
        !result.fileName ||
        !result.mimeType ||
        !result.sizeBytes
      ) {
        throw new Error(result.error || "Photo upload failed");
      }
      if (!result.mimeType.startsWith("image/")) {
        throw new Error("Damage reports currently accept photos only");
      }
      setEvidence((current) => [
        ...current,
        {
          url: result.url!,
          fileName: result.fileName!,
          mimeType: result.mimeType!,
          sizeBytes: result.sizeBytes!,
        },
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Photo upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const response = await fetch(
        `/api/conversations/${conversationId}/damage-reports`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description, evidence }),
        }
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not report damage");
      setDescription("");
      setEvidence([]);
      setOpen(false);
      await onCreated();
      toast.success("Damage report added to the booking timeline");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not report damage");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <ShieldAlert className="mr-2 h-4 w-4" />
          Report damage
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Report property damage</DialogTitle>
          <DialogDescription>
            Add clear photos and describe what you found. This becomes part of the
            booking record visible to both sides and support.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={5}
          maxLength={3000}
          placeholder="Describe the damage and where it is located..."
          aria-label="Damage description"
        />
        <div className="grid grid-cols-3 gap-2">
          {evidence.map((item, index) => (
            <div
              key={`${item.url}-${index}`}
              className="relative aspect-square overflow-hidden rounded-lg border bg-muted"
            >
              {/* Uploaded evidence URLs are served by the authenticated application. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                aria-label={`Remove ${item.fileName}`}
                className="absolute right-1 top-1 rounded-full bg-background/90 p-1"
                onClick={() =>
                  setEvidence((current) =>
                    current.filter((_, itemIndex) => itemIndex !== index)
                  )
                }
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {evidence.length < 5 ? (
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground hover:bg-muted">
              <Camera className="mb-1 h-5 w-5" />
              {uploading ? "Uploading..." : "Add photo"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={uploading}
                onChange={(event) => void upload(event)}
              />
            </label>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={
              submitting ||
              uploading ||
              description.trim().length < 10 ||
              evidence.length === 0
            }
          >
            {submitting ? "Submitting..." : "Add to timeline"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
