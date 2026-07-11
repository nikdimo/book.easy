"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteListingDraft } from "@/lib/actions/listing.actions";
import { toast } from "sonner";

export function DeleteDraftButton({ draftId, title }: { draftId: string; title: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleDelete() {
    if (!confirm(`Delete draft "${title}"?\n\nThis cannot be undone.`)) return;

    startTransition(async () => {
      const result = await deleteListingDraft(draftId);
      if (result && "error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Draft deleted");
        router.refresh();
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
