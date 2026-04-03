"use client";

import { useTransition } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteListing } from "@/lib/actions/listing.actions";
import { toast } from "sonner";

export function DeleteListingButton({
  listingId,
  title,
}: {
  listingId: string;
  title: string;
}) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(`Delete "${title}"?\n\nThis cannot be undone.`)) return;

    startTransition(async () => {
      const result = await deleteListing(listingId);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Listing deleted");
      }
    });
  }

  return (
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
  );
}
