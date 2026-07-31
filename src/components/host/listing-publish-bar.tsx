"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Eye } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { submitForReview } from "@/lib/actions/listing.actions";
import { listingStopHref } from "@/lib/host/listing-workspace";
import { Tx, useI18n } from "@/lib/i18n/client";

/**
 * The Preview/Publish pair from the edit screen, for the screens that are not the
 * edit form. Publish stays visible but disabled once the listing is live, so the row
 * keeps the same shape everywhere rather than appearing and shifting the nav above it.
 */
export function ListingPublishBar({
  listingId,
  published,
}: {
  listingId: string;
  published: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { resolve } = useI18n();

  function publish() {
    startTransition(async () => {
      const result = await submitForReview(listingId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(resolve("host.publish_bar.success", "Listing published").text);
      router.refresh();
    });
  }

  return (
    <div className="z-30 shrink-0 border-t bg-background px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] md:hidden">
      <div className="flex items-stretch gap-2">
        <Button variant="outline" size="lg" className="flex-1" asChild>
          <Link href={listingStopHref(listingId, "preview")}>
            <Eye className="h-4 w-4" />
            <Tx k="host.workspace.preview" source="Preview" />
          </Link>
        </Button>
        <Button
          type="button"
          size="lg"
          className="flex-1"
          disabled={pending || published}
          onClick={publish}
        >
          {published
            ? resolve("host.publish_bar.published", "Published").text
            : pending
              ? resolve("host.publish_bar.pending", "Publishing…").text
              : resolve("host.publish_bar.publish", "Publish").text}
        </Button>
      </div>
    </div>
  );
}
