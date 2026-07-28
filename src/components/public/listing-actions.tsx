"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Share, Heart, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleFavorite } from "@/lib/actions/favorite.actions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Tx, useI18n } from "@/lib/i18n/client";
import { StartConversationButton } from "@/components/communication/start-conversation-button";

export function ListingActions({
  title,
  listingId,
  initialSaved = false,
  isAuthenticated,
}: {
  title: string;
  listingId: string;
  initialSaved?: boolean;
  isAuthenticated: boolean;
}) {
  const i18n = useI18n();
  const router = useRouter();
  const [saved, setSaved] = useState(initialSaved);
  const [, startTransition] = useTransition();

  function handleToggleSaved() {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    const next = !saved;
    setSaved(next);
    startTransition(async () => {
      const result = await toggleFavorite(listingId);
      if (result?.error) {
        setSaved(!next);
        toast.error(result.error);
      }
    });
  }

  async function share() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success(i18n.resolve("listing.link_copied_clipboard", "Link copied to clipboard").text);
      }
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        toast.success(i18n.resolve("listing.link_copied", "Link copied").text);
      } catch {
        toast.error(i18n.resolve("listing.share_failed", "Could not share").text);
      }
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <StartConversationButton
        listingId={listingId}
        isAuthenticated={isAuthenticated}
        label="Message host"
        variant="outline"
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="rounded-full gap-2 font-medium underline-offset-4 hover:underline"
        onClick={() => void share()}
      >
        <Share className="h-4 w-4" />
        <Tx k="listing.share" source="Share" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="rounded-full gap-2 font-medium underline-offset-4 hover:underline"
        onClick={handleToggleSaved}
      >
        <Heart className={cn("h-4 w-4", saved && "fill-rose-600 text-rose-600")} />
        <Tx k="listing.save" source="Save" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="rounded-full gap-2 font-medium underline-offset-4 hover:underline"
        onClick={() => {
          const target = `/account/support/new?type=REPORT&targetType=LISTING&listingId=${listingId}`;
          router.push(
            isAuthenticated
              ? target
              : `/login?callbackUrl=${encodeURIComponent(target)}`
          );
        }}
      >
        <Flag className="h-4 w-4" />
        <Tx k="listing.report" source="Report" />
      </Button>
    </div>
  );
}
