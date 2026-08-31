"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/host/v2/listings/confirm-dialog";
import { submitForReview, unpublishListing } from "@/lib/actions/listing.actions";
import { interpolate, useI18n } from "@/lib/i18n/client";

/**
 * "Is this listing on the site?" as one control that shows the answer and changes it.
 *
 * A menu item cannot do that: the host has to open the menu to find out which way it
 * currently is. Only APPROVED and the host-recoverable states are binary, though, so
 * anything an admin owns (SUSPENDED, ARCHIVED) keeps the status dot instead — a switch
 * there would offer a host a move that is not theirs to make.
 */

const HOST_PUBLISHABLE = new Set(["UNPUBLISHED", "DRAFT"]);

export function isVisibilitySwitchable(status: string) {
  return status === "APPROVED" || HOST_PUBLISHABLE.has(status);
}

export function ListingVisibilitySwitch({
  listingId,
  title,
  status,
}: {
  listingId: string;
  title: string;
  status: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();
  const { resolve } = useI18n();
  const isPublished = status === "APPROVED";

  function publish() {
    startTransition(async () => {
      const result = await submitForReview(listingId);
      if (result?.error) toast.error(result.error);
      else {
        toast.success(
          resolve("host.visibility.live_success", "Listing is live on the site").text
        );
        router.refresh();
      }
    });
  }

  function hide() {
    startTransition(async () => {
      const result = await unpublishListing(listingId);
      if (result?.error) toast.error(result.error);
      else {
        setConfirming(false);
        toast.success(
          resolve("host.visibility.hidden_success", "Listing hidden from the site").text
        );
        router.refresh();
      }
    });
  }

  // Going live is confirmed by its own result — the listing appears, and the switch is
  // one click from undoing it. Coming down is the direction that loses bookings, so only
  // that one stops to explain what a guest will and will not still be able to do.
  function handleChange(next: boolean) {
    if (next) publish();
    else setConfirming(true);
  }

  const label = interpolate(
    resolve(
      isPublished
        ? "host.v2.listings.switch_hide"
        : "host.v2.listings.switch_publish",
      isPublished ? "Take {title} off the site" : "Put {title} on the site"
    ),
    { title }
  ).text;

  return (
    <>
      <span className="flex items-center gap-2.5">
        <span className="hidden text-sm text-slate-600 sm:inline">
          {isPublished
            ? resolve("host.v2.listings.listed", "Listed").text
            : resolve("host.v2.listings.unlisted", "Unlisted").text}
        </span>
        <Switch
          checked={isPublished}
          onCheckedChange={handleChange}
          disabled={isPending}
          aria-label={label}
          title={label}
          onClick={(event) => event.stopPropagation()}
        />
      </span>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        pending={isPending}
        onConfirm={hide}
        title={
          interpolate(
            resolve("host.v2.listings.hide_confirm_title", "Hide {title} from guests?"),
            { title }
          ).text
        }
        description={
          resolve(
            "host.v2.listings.hide_confirm_body",
            "It comes off search straight away and no one can make a new booking. Bookings you already have, your dates, prices and calendar connections all stay exactly as they are — and you can put it back up whenever you want."
          ).text
        }
        confirmLabel={resolve("host.v2.listings.hide_confirm_action", "Take it down").text}
      />
    </>
  );
}
