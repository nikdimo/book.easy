"use client";

import { useTransition } from "react";
import { Archive, ArchiveRestore, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { archiveListing, unarchiveListing } from "@/lib/actions/listing.actions";
import { toast } from "sonner";
import { interpolate, useI18n } from "@/lib/i18n/client";

/** Archive takes a listing off the site and out of the active list; restore brings it
 * back as hidden. Same button both ways so the card keeps one slot for the action. */
export function ListingArchiveButton({
  listingId,
  title,
  archived,
}: {
  listingId: string;
  title: string;
  archived: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const { resolve } = useI18n();

  function handleClick() {
    if (!archived) {
      const prompt = interpolate(
        resolve(
          "host.archive_listing.confirm",
          'Archive "{title}"?\n\nIt comes off the site and moves to your Archived list. You can restore it any time.',
        ),
        { title },
      ).text;
      if (!confirm(prompt)) return;

      startTransition(async () => {
        const result = await archiveListing(listingId);
        if ("error" in result && result.error) toast.error(result.error);
        else
          toast.success(
            resolve("host.archive_listing.archived", "Listing archived").text,
          );
      });
      return;
    }

    startTransition(async () => {
      const result = await unarchiveListing(listingId);
      if ("error" in result && result.error) toast.error(result.error);
      else
        toast.success(
          resolve(
            "host.archive_listing.restored",
            "Listing restored — it's hidden until you unhide it",
          ).text,
        );
    });
  }

  const label = archived
    ? resolve("host.archive_listing.restore", "Restore").text
    : resolve("host.archive_listing.archive", "Archive").text;
  const explanation = archived
    ? resolve(
        "host.archive_listing.restore_tooltip",
        "Move this listing back to your active listings. It stays hidden until you unhide it.",
      ).text
    : resolve(
        "host.archive_listing.archive_tooltip",
        "Take this listing off the site and file it under Archived. Bookings and history are kept.",
      ).text;
  const Icon = archived ? ArchiveRestore : Archive;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          onClick={handleClick}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Icon className="h-3 w-3" />
          )}
          {/* notranslate: the label flips Archive <-> Restore, and a translated bare
           * text node breaks React's reconciliation (insertBefore NotFoundError). */}
          <span className="notranslate" translate="no">
            {label}
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent className="notranslate max-w-64" translate="no">
        {explanation}
      </TooltipContent>
    </Tooltip>
  );
}
