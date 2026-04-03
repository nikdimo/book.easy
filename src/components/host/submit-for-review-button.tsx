"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { submitForReview } from "@/lib/actions/listing.actions";
import { toast } from "sonner";
import { Send } from "lucide-react";

export function SubmitForReviewButton({ listingId }: { listingId: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-3">
        Ready to go live? Submit your listing for platform review. Once approved, it will be visible to guests.
      </p>
      <Button
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            const result = await submitForReview(listingId);
            if (result?.error) {
              toast.error(result.error);
            } else {
              toast.success("Listing submitted for review!");
              router.refresh();
            }
          });
        }}
      >
        <Send className="h-4 w-4 mr-2" />
        {isPending ? "Submitting..." : "Submit for Review"}
      </Button>
    </div>
  );
}
