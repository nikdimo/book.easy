"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  CircleAlert,
  Ellipsis,
  ExternalLink,
  ImageIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSaveState } from "@/components/host/v2/editor/save-state";
import type { EditorListingOption } from "@/lib/services/listing-editor.service";
import { Tx, useI18n } from "@/lib/i18n/client";

const DOT: Record<string, string> = {
  APPROVED: "bg-emerald-500",
  PENDING_REVIEW: "bg-amber-500",
  REJECTED: "bg-rose-500",
  SUSPENDED: "bg-rose-500",
  UNPUBLISHED: "bg-slate-400",
  DRAFT: "bg-slate-400",
  ARCHIVED: "bg-slate-300",
};

/**
 * The editor's only header.
 *
 * Deliberately not the app header: a back arrow instead of a logo, and the listing's own
 * thumbnail instead of the brand, because the one question this bar has to answer is
 * "which listing am I editing". The app chrome is one click behind the arrow.
 *
 * There is no Save button. Everything in the editor autosaves, so the right-hand side
 * reports state rather than asking for an action, and `Publish` appears only when the
 * listing genuinely is not live.
 */
export function EditorHeader({
  listingId,
  title,
  status,
  statusLabel,
  statusLabels,
  slug,
  coverUrl,
  listings,
}: {
  listingId: string;
  title: string;
  status: string;
  statusLabel: string;
  /** Resolved on the server so the switcher does not re-resolve seven strings per row. */
  statusLabels: Record<string, string>;
  slug: string;
  coverUrl: string | null;
  listings: EditorListingOption[];
}) {
  const { resolve } = useI18n();
  const saveState = useSaveState();
  const pathname = usePathname();
  const previewLabel = resolve("host.editor.preview", "Preview").text;
  const moreLabel = resolve("host.editor.more", "More actions").text;

  // Switching keeps you where you were: a host comparing photos across two properties
  // wants the other one's photos, not its front page.
  const section = pathname.split("/")[5] ?? "photos";

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-slate-100 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-2 px-4 md:h-16 md:gap-3 md:px-6">
        <Link
          href="/host/v2/listings"
          aria-label={resolve("host.editor.back", "Back to listings").text}
          className="grid size-9 shrink-0 place-items-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:bg-slate-100 focus-visible:outline-none"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </Link>

        {/* Thumbnail, name and status are one control: the thing that identifies the
            listing is also the thing that swaps it, which is where a host looks anyway
            when they want a different property. */}
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={resolve("host.editor.switch_listing", "Switch listing").text}
            className="group flex min-w-0 flex-1 items-center gap-2 rounded-full py-1 pl-1 pr-2 text-left transition-colors hover:bg-slate-100 focus-visible:outline-none md:gap-3"
          >
            <span className="relative size-8 shrink-0 overflow-hidden rounded-lg bg-slate-100 md:size-9">
              {coverUrl ? (
                <Image src={coverUrl} alt="" fill sizes="36px" className="object-cover" />
              ) : (
                <span className="grid h-full w-full place-items-center text-slate-300">
                  <ImageIcon className="size-4" aria-hidden />
                </span>
              )}
            </span>
            <span
              className="min-w-0 truncate text-sm font-medium text-slate-900 md:text-[0.9375rem]"
              data-user-generated-content
              translate="yes"
            >
              {title}
            </span>
            {/* The label is desktop detail; the dot alone carries the state on a phone,
                where the name needs every pixel it can get. */}
            <span className="flex shrink-0 items-center gap-1.5">
              <span
                className={`size-[7px] rounded-full ${DOT[status] ?? "bg-slate-400"}`}
                aria-hidden
              />
              <span className="hidden text-xs text-slate-500 sm:inline">{statusLabel}</span>
              <span className="sr-only sm:hidden">{statusLabel}</span>
            </span>
            <ChevronDown
              className="size-3.5 shrink-0 text-slate-400 transition-colors group-hover:text-slate-700"
              aria-hidden
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="max-h-[70dvh] w-72 overflow-y-auto bg-white"
          >
            <DropdownMenuLabel className="text-xs font-normal text-slate-500">
              <Tx k="host.editor.your_listings" source="Your listings" />
            </DropdownMenuLabel>
            {listings.map((listing) => {
              const current = listing.id === listingId;
              return (
                <DropdownMenuItem key={listing.id} asChild className="gap-2.5 py-2">
                  <Link href={`/host/v2/listings/${listing.id}/${section}`}>
                    <span className="relative size-9 shrink-0 overflow-hidden rounded-md bg-slate-100">
                      {listing.coverUrl ? (
                        <Image
                          src={listing.coverUrl}
                          alt=""
                          fill
                          sizes="36px"
                          className="object-cover"
                        />
                      ) : (
                        <span className="grid h-full w-full place-items-center text-slate-300">
                          <ImageIcon className="size-3.5" aria-hidden />
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate text-sm text-slate-900"
                        data-user-generated-content
                        translate="yes"
                      >
                        {listing.title}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span
                          className={`size-[6px] rounded-full ${DOT[listing.status] ?? "bg-slate-400"}`}
                          aria-hidden
                        />
                        <span className="truncate text-xs text-slate-500">
                          {statusLabels[listing.status] ?? listing.status}
                        </span>
                      </span>
                    </span>
                    {current && (
                      <Check className="size-4 shrink-0 text-slate-900" aria-hidden />
                    )}
                  </Link>
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/host/v2/listings">
                <Tx k="host.editor.all_listings" source="See all listings" />
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <SaveIndicator state={saveState} />

        <Link
          href={`/properties/${slug}`}
          target="_blank"
          rel="noreferrer"
          // Filled-on-hover rather than outlined. Keyboard focus is carried by the same
          // fill, so the control is still findable without drawing a box around it.
          className="hidden items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:bg-slate-100 focus-visible:outline-none sm:inline-flex"
        >
          {previewLabel}
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={moreLabel}
            className="grid size-9 shrink-0 place-items-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:bg-slate-100 focus-visible:outline-none"
          >
            <Ellipsis className="size-5" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild className="sm:hidden">
              <Link href={`/properties/${slug}`} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" aria-hidden />
                {previewLabel}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/host/v2/calendar?listing=${encodeURIComponent(listingId)}`}>
                <Tx k="host.editor.open_calendar" source="Dates and prices" />
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/host/listings/${listingId}/edit`}>
                <Tx k="host.editor.open_classic" source="Open the classic editor" />
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function SaveIndicator({ state }: { state: ReturnType<typeof useSaveState> }) {
  if (state === "idle") return null;
  if (state === "error") {
    return (
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-rose-600">
        <CircleAlert className="size-3.5" aria-hidden />
        <span className="hidden sm:inline">
          <Tx k="host.editor.save_failed" source="Not saved" />
        </span>
      </span>
    );
  }
  return (
    <span
      className="shrink-0 text-xs text-slate-400 tabular-nums"
      role="status"
      aria-live="polite"
    >
      {state === "saving" ? (
        <Tx k="host.editor.saving" source="Saving…" />
      ) : (
        <Tx k="host.editor.saved" source="Saved" />
      )}
    </span>
  );
}
