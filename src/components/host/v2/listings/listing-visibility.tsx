"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/host/v2/listings/confirm-dialog";
import { submitForReview, unpublishListing } from "@/lib/actions/listing.actions";
import { interpolate, useI18n } from "@/lib/i18n/client";

/**
 * "Is this listing on the site?", as one piece of behaviour every surface can borrow.
 *
 * It used to live inside the switch on the listings row, which made that row the only
 * place in the whole panel a host could publish or take a listing down — invisible below
 * `sm`, absent from the grid, and absent from the editor. The rules did not need to
 * change, only their reach: the same two server actions, the same confirmation, the same
 * catalog strings, now shared by the switch, the row's overflow menu and the editor
 * header.
 *
 * Taking a listing down is the direction that loses bookings, so only that one stops to
 * explain what a guest will and will not still be able to do. Going live is confirmed by
 * its own result — the listing appears, and undoing it is one click away.
 */

const HOST_PUBLISHABLE = new Set(["UNPUBLISHED", "DRAFT"]);

/** Only APPROVED and the host-recoverable states are the host's to change. Anything an
 *  admin owns (SUSPENDED, ARCHIVED) keeps a status dot instead — offering a control there
 *  would offer a move that is not theirs to make, and `submitForReview` would refuse it. */
export function isVisibilitySwitchable(status: string) {
  return status === "APPROVED" || HOST_PUBLISHABLE.has(status);
}

export interface ListingVisibility {
  isPublished: boolean;
  isPending: boolean;
  /** Put it on the site now. */
  publish: () => void;
  /** Ask first — this is the direction that loses bookings. */
  requestHide: () => void;
  confirming: boolean;
  setConfirming: (open: boolean) => void;
  hide: () => void;
  /** "Take {title} off the site" / "Put {title} on the site", for a control whose own
   *  shape carries no words (a switch). */
  toggleLabel: string;
  /** "Hide" / "Publish", for a control that is read as text (a menu item, a button). */
  actionLabel: string;
  dialog: { title: string; description: string; confirmLabel: string };
}

export function useListingVisibility({
  listingId,
  title,
  status,
}: {
  listingId: string;
  title: string;
  status: string;
}): ListingVisibility {
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

  return {
    isPublished,
    isPending,
    publish,
    requestHide: () => setConfirming(true),
    confirming,
    setConfirming,
    hide,
    toggleLabel: interpolate(
      resolve(
        isPublished
          ? "host.v2.listings.switch_hide"
          : "host.v2.listings.switch_publish",
        isPublished ? "Take {title} off the site" : "Put {title} on the site"
      ),
      { title }
    ).text,
    actionLabel: isPublished
      ? resolve("host.visibility.hide", "Hide").text
      : resolve("host.form.publish", "Publish").text,
    dialog: {
      title: interpolate(
        resolve("host.v2.listings.hide_confirm_title", "Hide {title} from guests?"),
        { title }
      ).text,
      description: resolve(
        "host.v2.listings.hide_confirm_body",
        "It comes off search straight away and no one can make a new booking. Bookings you already have, your dates, prices and calendar connections all stay exactly as they are — and you can put it back up whenever you want."
      ).text,
      confirmLabel: resolve("host.v2.listings.hide_confirm_action", "Take it down").text,
    },
  };
}

/** The one dialog every visibility control shares. Rendered by whichever surface owns
 *  the control, so it is never nested inside a menu that unmounts on select. */
export function ListingHideDialog({ visibility }: { visibility: ListingVisibility }) {
  return (
    <ConfirmDialog
      open={visibility.confirming}
      onOpenChange={visibility.setConfirming}
      pending={visibility.isPending}
      onConfirm={visibility.hide}
      title={visibility.dialog.title}
      description={visibility.dialog.description}
      confirmLabel={visibility.dialog.confirmLabel}
    />
  );
}
