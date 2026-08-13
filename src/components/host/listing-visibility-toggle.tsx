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
 * ARCHIVED, PENDING_REVIEW) is an admin/queue state the host must not flip. */
const HOST_PUBLISHABLE = new Set(["UNPUBLISHED", "DRAFT", "REJECTED"]);

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
        !confirm(interpolate(resolve("host.visibility.confirm_hide", "Hide {title} from the site?\n\nIt will no longer be bookable until you publish it again."), { title }).text)
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
    ? resolve("host.visibility.hide_tooltip", "Take this listing off the site — guests can't find it or request it until you unhide it. Your dates, prices and bookings stay as they are.")
    : resolve("host.visibility.unhide_tooltip", "Put this listing back on the site so guests can find it and send booking requests again.");
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
