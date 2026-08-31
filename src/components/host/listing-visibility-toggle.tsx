"use client";

import { useTransition } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { unpublishListing, submitForReview } from "@/lib/actions/listing.actions";
import { toast } from "sonner";
import { interpolate, translatedClass, useI18n } from "@/lib/i18n/client";

/** Statuses a host can put back on the site themselves. Anything else (SUSPENDED,
 * ARCHIVED) is an admin state the host must not flip. */
const HOST_PUBLISHABLE = new Set(["UNPUBLISHED", "DRAFT"]);

export function isHostVisibilityToggleable(status: string) {
  return status === "APPROVED" || HOST_PUBLISHABLE.has(status);
}

/** Single control for "is this listing on the site?" — hides an approved listing and
 * puts a hidden one back up. Labelled rather than icon-only: two similar eye glyphs
 * side by side (preview vs. hide) read as the same action at a glance. */
export function ListingVisibilityToggle({
  listingId,
  title,
  status,
}: {
  listingId: string;
  title: string;
  status: string;
}) {
  const [isPending, startTransition] = useTransition();
  const { resolve } = useI18n();
  const isPublished = status === "APPROVED";

  function handleToggle() {
    if (isPublished) {
      if (
        !confirm(interpolate(resolve("host.visibility.confirm_hide", "Hide {title} from guests?\n\nNew guests will not be able to view or book it. Existing reservations and calendar connections stay active."), { title }).text)
      )
        return;

      startTransition(async () => {
        const result = await unpublishListing(listingId);
        if (result?.error) toast.error(result.error);
        else toast.success(resolve("host.visibility.hidden_success", "Listing hidden from the site").text);
      });
      return;
    }

    startTransition(async () => {
      const result = await submitForReview(listingId);
      if (result?.error) toast.error(result.error);
      else toast.success(resolve("host.visibility.live_success", "Listing is live on the site").text);
    });
  }

  const label = isPublished
    ? resolve("host.visibility.hide", "Hide")
    : resolve("host.visibility.unhide", "Unhide");
  const explanation = isPublished
    ? resolve("host.visibility.hide_tooltip", "Hide this listing from new guests. Existing reservations, dates, prices, and calendar connections stay active.")
    : resolve("host.visibility.unhide_tooltip", "Make this listing live immediately with its current availability, prices, and booking rules. Internal review may continue after publication.");
  const Icon = isPublished ? EyeOff : Eye;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          onClick={handleToggle}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Icon className="h-3 w-3" />
          )}
          {/* Bare text here would be a raw text node that Google Translate swaps out,
           * leaving React to reconcile a child the DOM no longer owns (insertBefore
           * NotFoundError) the moment the label flips Hide <-> Unhide. */}
          <span className={translatedClass(label)} translate={label.translated ? "no" : undefined}>
            {label.text}
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent className={translatedClass(explanation)} translate={explanation.translated ? "no" : undefined}>
        {explanation.text}
      </TooltipContent>
    </Tooltip>
  );
}
