"use client";

import { useTransition } from "react";
import { EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { unpublishListing } from "@/lib/actions/listing.actions";
import { toast } from "sonner";

export function UnpublishListingButton({
  listingId,
  title,
}: {
  listingId: string;
  title: string;
}) {
  const [isPending, startTransition] = useTransition();

  function handleUnpublish() {
    if (
      !confirm(
        `Hide "${title}" from the site?\n\nIt will no longer be bookable until you submit it for review again.`
      )
    )
      return;

    startTransition(async () => {
      const result = await unpublishListing(listingId);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Listing hidden from the site");
      }
    });
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          onClick={handleUnpublish}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <EyeOff className="h-3 w-3" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>Hide from site</TooltipContent>
    </Tooltip>
  );
}
