"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Share, Heart, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleFavorite } from "@/lib/actions/favorite.actions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Tx, useI18n } from "@/lib/i18n/client";

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
      // Sign-in used to drop the guest on the home page, losing
      // the listing they were reading. Come back to exactly where the heart
      // was pressed, query string and all.
      const returnTo = `${window.location.pathname}${window.location.search}`;
      router.push(`/login?callbackUrl=${encodeURIComponent(returnTo)}`);
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

  // Share, save and report on one row that never wraps: on a phone these used to
  // break onto three lines under the title, with "Message host" — an action of a
  // different weight entirely — leading them. That one moved next to the host.
  return (
    <div className="flex shrink-0 items-center gap-0.5 sm:gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="rounded-full gap-1.5 px-2 font-medium underline-offset-4 hover:underline sm:gap-2 sm:px-3"
        onClick={() => void share()}
      >
        <Share className="h-4 w-4" />
        <Tx k="listing.share" source="Share" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="rounded-full gap-1.5 px-2 font-medium underline-offset-4 hover:underline sm:gap-2 sm:px-3"
        onClick={handleToggleSaved}
      >
        <Heart className={cn("h-4 w-4", saved && "fill-rose-600 text-rose-600")} />
        <Tx k="listing.save" source="Save" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="rounded-full gap-1.5 px-2 font-medium underline-offset-4 hover:underline sm:gap-2 sm:px-3"
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
