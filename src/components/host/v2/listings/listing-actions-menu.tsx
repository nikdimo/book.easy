"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  Ellipsis,
  Eye,
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
  archiveListing,
  deleteListing,
  unarchiveListing,
} from "@/lib/actions/listing.actions";
import { interpolate, useI18n } from "@/lib/i18n/client";

/**
 * The actions a host reaches for rarely.
 *
 * Edit is the row click, the calendar has its own button, and being on or off the site is
 * the switch — so what is left here is genuinely occasional or destructive, which is what
 * a `…` is for. The previous overview put all six on the row at equal weight, so Delete
 * sat the same distance from the pointer as Edit.
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

  const isArchived = status === "ARCHIVED";
  const isPublished = status === "APPROVED";

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
          disabled={isPending}
          className={`relative z-10 grid size-9 shrink-0 place-items-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a] disabled:opacity-50 ${className ?? ""}`}
          onClick={(event) => event.stopPropagation()}
        >
          {isPending ? (
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
    </>
  );
}
