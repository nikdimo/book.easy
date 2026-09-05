"use client";

import { Switch } from "@/components/ui/switch";
import {
  isVisibilitySwitchable,
  ListingHideDialog,
  useListingVisibility,
} from "@/components/host/v2/listings/listing-visibility";
import { useI18n } from "@/lib/i18n/client";

/**
 * "Is this listing on the site?" as one control that shows the answer and changes it.
 *
 * A menu item cannot do that: the host has to open the menu to find out which way it
 * currently is. So the switch stays the primary control wherever there is room for it —
 * the listings row from `sm` up. Where there is not (a phone row, a grid tile, the
 * editor) the same behaviour is offered as a named item instead; see
 * `listing-visibility.tsx`, which both shapes share.
 */

export { isVisibilitySwitchable };

export function ListingVisibilitySwitch({
  listingId,
  title,
  status,
}: {
  listingId: string;
  title: string;
  status: string;
}) {
  const { resolve } = useI18n();
  const visibility = useListingVisibility({ listingId, title, status });

  return (
    <>
      <span className="flex items-center gap-2.5">
        <span className="hidden text-sm text-slate-600 sm:inline">
          {visibility.isPublished
            ? resolve("host.v2.listings.listed", "Listed").text
            : resolve("host.v2.listings.unlisted", "Unlisted").text}
        </span>
        <Switch
          checked={visibility.isPublished}
          onCheckedChange={(next) =>
            next ? visibility.publish() : visibility.requestHide()
          }
          disabled={visibility.isPending}
          aria-label={visibility.toggleLabel}
          title={visibility.toggleLabel}
          onClick={(event) => event.stopPropagation()}
        />
      </span>

      <ListingHideDialog visibility={visibility} />
    </>
  );
}
