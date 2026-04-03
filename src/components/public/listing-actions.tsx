"use client";

import { useState } from "react";
import { Share, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function ListingActions({ title }: { title: string }) {
  const [saved, setSaved] = useState(false);

  async function share() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied to clipboard");
      }
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
      } catch {
        toast.error("Could not share");
      }
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="rounded-full gap-2 font-medium underline-offset-4 hover:underline"
        onClick={() => void share()}
      >
        <Share className="h-4 w-4" />
        Share
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="rounded-full gap-2 font-medium underline-offset-4 hover:underline"
        onClick={() => setSaved((s) => !s)}
      >
        <Heart className={cn("h-4 w-4", saved && "fill-rose-600 text-rose-600")} />
        Save
      </Button>
    </div>
  );
}
