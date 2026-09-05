"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  Ellipsis,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/host/v2/listings/confirm-dialog";
import {
  isVisibilitySwitchable,
  ListingHideDialog,
  useListingVisibility,
} from "@/components/host/v2/listings/listing-visibility";
import {
  archiveListing,
  deleteListing,
  unarchiveListing,
} from "@/lib/actions/listing.actions";
import { cn } from "@/lib/utils";
import { interpolate, useI18n } from "@/lib/i18n/client";

/**
 * The actions a host reaches for rarely — plus the one that is not rare at all.
 *
 * Edit is the row click and the calendar has its own button, so what is left here is
 * genuinely occasional or destructive, which is what a `…` is for.
 *
 * Publishing is the exception. It belongs on the switch, which says which way the
 * listing currently is without being opened — but the switch only fits the list row from
 * `sm` up, and this menu is the one control present at every width and in both views. So
 * the same action is named here too: on a phone, and on a grid tile, this is how a host
 * takes a listing down at all.
 */

type Pending = "archive" | "delete" | null;

/**
 * Where the unlabelled "Edit" goes: the V2 editor, the same place the row click opens.
 * The classic editor is still reachable, but only from the item that says so by name.
 */
export function listingEditHref(listingId: string) {
  return `/host/listings/${listingId}`;
}

export function ListingActionsMenu({
  listingId,
  slug,
  title,
  status,
  className,
}: {
  listingId: string;
  slug: string;
  title: string;
  status: string;
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<Pending>(null);
  const router = useRouter();
  const { resolve } = useI18n();
  const visibility = useListingVisibility({ listingId, title, status });

  const isArchived = status === "ARCHIVED";
  const isPublished = status === "APPROVED";
  const canChangeVisibility = isVisibilitySwitchable(status);
  const busy = isPending || visibility.isPending;

  function handleArchive() {
    startTransition(async () => {
      const result = isArchived
        ? await unarchiveListing(listingId)
        : await archiveListing(listingId);
      if ("error" in result && result.error) toast.error(result.error);
      else {
        setConfirming(null);
        toast.success(
          isArchived
            ? resolve(
                "host.archive_listing.restored",
                "Listing restored — it's hidden until you unhide it"
              ).text
            : resolve("host.archive_listing.archived", "Listing archived").text
        );
        router.refresh();
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteListing(listingId);
      if ("error" in result) toast.error(result.error);
      else {
        setConfirming(null);
        // A listing with past bookings is archived rather than deleted, so the message
        // has to report what happened instead of what the menu item offered.
        toast.success(
          result.outcome === "archived"
            ? resolve(
                "host.delete_listing.archived",
                "Listing archived (it has past bookings, so it's kept for your records)"
              ).text
            : resolve("host.delete_listing.deleted", "Listing deleted").text
        );
        router.refresh();
      }
    });
  }

  // Restoring an archived listing puts it back hidden, so nothing a guest can see
  // changes and there is nothing to warn about.
  function requestArchive() {
    if (isArchived) handleArchive();
    else setConfirming("archive");
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={
            interpolate(resolve("host.v2.listings.actions_for", "Actions for {title}"), {
              title,
            }).text
          }
          disabled={busy}
          // `cn`, not a template string: a caller that positions this button — the grid
          // tile pins it to the corner of the photo — passes `absolute`, and Tailwind
          // emits `.absolute` before `.relative`, so raw concatenation left the later
          // `.relative` winning and dropped the button back into the flow at the top
          // left of the tile. `twMerge` drops the losing utility instead of stacking it.
          className={cn(
            "relative z-10 grid size-9 shrink-0 place-items-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a] disabled:opacity-50",
            className,
          )}
          onClick={(event) => event.stopPropagation()}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Ellipsis className="size-4" aria-hidden />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-52"
          onClick={(event) => event.stopPropagation()}
        >
          <DropdownMenuItem asChild>
            <Link href={listingEditHref(listingId)}>
              <Pencil className="size-4" aria-hidden />
              {resolve("host.workspace.edit", "Edit").text}
            </Link>
          </DropdownMenuItem>
          {isPublished && (
            <DropdownMenuItem asChild>
              <Link href={`/properties/${slug}`}>
                <Eye className="size-4" aria-hidden />
                {resolve("host.v2.listings.view_as_guest", "View as a guest").text}
              </Link>
            </DropdownMenuItem>
          )}

          {/* Above the separator, with Edit and View: putting a listing on or off the
              site is ordinary work, not the archive-and-delete end of the menu. */}
          {canChangeVisibility && (
            <DropdownMenuItem
              data-testid="listing-visibility-item"
              onSelect={
                visibility.isPublished ? visibility.requestHide : visibility.publish
              }
            >
              {visibility.isPublished ? (
                <EyeOff className="size-4" aria-hidden />
              ) : (
                <Globe className="size-4" aria-hidden />
              )}
              {visibility.actionLabel}
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem onSelect={requestArchive}>
            {isArchived ? (
              <ArchiveRestore className="size-4" aria-hidden />
            ) : (
              <Archive className="size-4" aria-hidden />
            )}
            {isArchived
              ? resolve("host.archive_listing.restore", "Restore").text
              : resolve("host.archive_listing.archive", "Archive").text}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirming("delete")}>
            <Trash2 className="size-4" aria-hidden />
            {resolve("host.delete_listing.tooltip", "Delete").text}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirming === "archive"}
        onOpenChange={(open) => setConfirming(open ? "archive" : null)}
        pending={isPending}
        onConfirm={handleArchive}
        title={
          interpolate(resolve("host.v2.listings.archive_title", "Archive {title}?"), {
            title,
          }).text
        }
        description={
          resolve(
            "host.v2.listings.archive_body",
            "It comes off the site and moves out of this list into your archived listings. Bookings and history are kept, and you can bring it back at any time."
          ).text
        }
        confirmLabel={resolve("host.archive_listing.archive", "Archive").text}
      />

      <ConfirmDialog
        open={confirming === "delete"}
        onOpenChange={(open) => setConfirming(open ? "delete" : null)}
        pending={isPending}
        destructive
        onConfirm={handleDelete}
        title={
          interpolate(resolve("host.v2.listings.delete_title", "Delete {title}?"), {
            title,
          }).text
        }
        description={
          resolve(
            "host.v2.listings.delete_body",
            "The listing, its photos, prices and availability are gone for good. If it already has bookings we archive it instead, so your records and your guests' reservations survive."
          ).text
        }
        confirmLabel={resolve("host.delete_listing.tooltip", "Delete").text}
      />

      {/* Rendered here rather than inside the menu: choosing an item closes the menu,
          and a dialog nested in it would unmount before it painted. */}
      <ListingHideDialog visibility={visibility} />
    </>
  );
}
