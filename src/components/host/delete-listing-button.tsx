"use client";

import { useTransition } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { deleteListing } from "@/lib/actions/listing.actions";
import { toast } from "sonner";
import { Tx, interpolate, useI18n } from "@/lib/i18n/client";

export function DeleteListingButton({
  listingId,
  title,
}: {
  listingId: string;
  title: string;
}) {
  const [isPending, startTransition] = useTransition();
  const { resolve } = useI18n();

  function handleDelete() {
    const prompt = interpolate(
      resolve(
        "host.delete_listing.confirm",
        'Delete "{title}"?\n\nThis cannot be undone.',
      ),
      { title },
    ).text;
    if (!confirm(prompt)) return;

    startTransition(async () => {
      const result = await deleteListing(listingId);
      if ("error" in result) {
        toast.error(result.error);
      } else if (result.outcome === "archived") {
        toast.success(
          resolve(
            "host.delete_listing.archived",
            "Listing archived (it has past bookings, so it's kept for your records)",
          ).text,
        );
      } else {
        toast.success(resolve("host.delete_listing.deleted", "Listing deleted").text);
      }
    });
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDelete}
          disabled={isPending}
          className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
        >
          {isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Trash2 className="h-3 w-3" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <Tx k="host.delete_listing.tooltip" source="Delete" />
      </TooltipContent>
    </Tooltip>
  );
}
