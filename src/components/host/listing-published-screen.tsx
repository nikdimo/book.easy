"use client";

import Link from "next/link";
import { Eye, ListChecks, PartyPopper, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tx } from "@/lib/i18n/client";

/**
 * The last screen of the create wizard. A screen rather than a dialog on purpose:
 * publishing ends the wizard, so there is nothing left underneath worth keeping
 * interactive, and a sheet that can be swiped away leaves the host staring at a
 * form for a listing that no longer exists as a draft.
 *
 * Every link replaces the history entry. The wizard route it came from
 * (`/host/listings/new?draft=…`) points at a draft that publishing consumed, so
 * Back must never land there.
 */
export function ListingPublishedScreen({
  listingId,
  slug,
}: {
  listingId: string;
  slug: string;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="listing-published-title"
      className="fixed inset-0 z-[60] overflow-y-auto bg-background"
    >
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-6 px-5 py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))] text-center">
        <div className="flex flex-col items-center gap-3">
          {/* Publishing is the one genuinely celebratory moment in the wizard, so
              the screen leads with a mark rather than a line of text. The ring
              animates once on mount; the icon itself never moves, so the moment
              reads as festive without becoming a distraction. */}
          <span className="relative flex h-20 w-20 items-center justify-center">
            <span
              aria-hidden
              className="absolute inset-0 animate-ping rounded-full bg-primary/20 [animation-iteration-count:3]"
            />
            <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">
              <PartyPopper className="h-10 w-10" />
            </span>
          </span>
          <h1
            id="listing-published-title"
            className="font-heading text-3xl leading-tight font-semibold tracking-tight text-balance"
          >
            <Tx
              k="host.form.published_title"
              source="Your listing is published!"
            />
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground text-balance">
            <Tx
              k="host.form.published_body"
              source="Nice work — guests can find and book it right now."
            />
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {/* Seeing the live page is what the host actually wants to do next, so
              it gets the full-width primary rather than sharing a row. */}
          <Button size="lg" className="h-14 w-full text-base" asChild>
            <Link href={`/properties/${slug}`} replace>
              <Eye className="h-5 w-5" />
              <Tx
                k="host.form.published_preview_cta"
                source="Preview your listing"
              />
            </Link>
          </Button>

          {/* Stacked rather than a two-up grid, and full width rather than
              icon-over-label: buttons are `whitespace-nowrap`, and half a phone
              width is not enough for these labels once they are translated. */}
          <Button variant="outline" size="lg" className="w-full" asChild>
            <Link href="/host/listings" replace>
              <ListChecks className="h-4 w-4" />
              <Tx k="host.form.go_to_listings" source="My listings" />
            </Link>
          </Button>
          <Button variant="outline" size="lg" className="w-full" asChild>
            <Link href={`/host/listings/${listingId}/edit`} replace>
              <Pencil className="h-4 w-4" />
              <Tx k="host.form.continue_editing" source="Keep editing" />
            </Link>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          <Tx
            k="host.form.published_footnote"
            source="Our team still reviews new listings, so keep the details accurate. Questions?"
          />{" "}
          <a
            href="mailto:hello@lingerhomes.com"
            className="notranslate underline underline-offset-2"
            translate="no"
          >
            hello@lingerhomes.com
          </a>
        </p>
      </div>
    </div>
  );
}
