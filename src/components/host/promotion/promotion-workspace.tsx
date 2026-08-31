"use client";

import * as React from "react";
import Image from "next/image";
import { Copy, ExternalLink, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tx, interpolate, useI18n } from "@/lib/i18n/client";
import { SITE_URL } from "@/lib/branding";
import { copyTextRobustly } from "@/lib/clipboard";
import { isSafeFacebookGroupUrl } from "@/lib/facebook-destinations";
import {
  facebookPropertyShareUrl,
  formatAvailabilityRange,
  formatCheckedOnDate,
  promotionPostText,
  propertyShareUrl,
} from "@/lib/facebook-share";
import {
  checkPromotionRangeAction,
  getPromotionWorkspaceAction,
  listFacebookDestinationsAction,
  markFacebookDestinationUsedAction,
} from "@/lib/actions/facebook-promotion.actions";
import type { HostFacebookDestinationView } from "@/lib/services/facebook-destination.service";
import type { PromotionListingView } from "@/lib/services/listing-promotion.service";
import {
  FacebookDestinationPicker,
  type PromotionDestination,
} from "@/components/host/promotion/facebook-destination-picker";
import {
  PromotionAvailabilityPicker,
  useRangeRejectionMessage,
  type PromotionRange,
} from "@/components/host/promotion/promotion-availability-picker";

/**
 * "Promote your property" — the one workspace behind every promotion entry point.
 *
 * What it does: prepares text the host owns, copies it, and opens Facebook. What it
 * deliberately does not do: post. There is no Facebook login here, no token, no Pages
 * API and no automation, and every word of copy is written so a host never expects
 * otherwise. Facebook is opened in a real tab in their own browser — never embedded,
 * because an iframe around someone's social account is both blocked by Facebook and
 * the wrong thing to build.
 *
 * Photographs are not downloaded and not preselected. The public link carries an Open
 * Graph preview with the listing's primary photo, so the post already shows the
 * property without putting a single file on the host's phone.
 */

/** Facebook folds a post behind "See more" around here. Not a limit — a marker, so a
 *  host can see when their opening line is about to be the only thing anyone reads. */
const POST_PREVIEW_LIMIT = 500;

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; listing: PromotionListingView };

export function PromotionWorkspace({
  listingId,
  onOpenChange,
}: {
  listingId: string;
  /** Lets the workspace close itself once the host has been sent to Facebook. */
  onOpenChange?: (open: boolean) => void;
}) {
  const i18n = useI18n();
  const { resolve } = useI18n();
  const rejectionMessage = useRangeRejectionMessage();
  const messageId = React.useId();
  const postId = React.useId();

  const [state, setState] = React.useState<LoadState>({ status: "loading" });
  const [destinations, setDestinations] = React.useState<
    HostFacebookDestinationView[]
  >([]);
  const [destination, setDestination] = React.useState<PromotionDestination>({
    kind: "profile",
  });

  const [customMessage, setCustomMessage] = React.useState("");
  const [range, setRange] = React.useState<PromotionRange | null>(null);
  const [includeGuests, setIncludeGuests] = React.useState(true);
  const [includePrice, setIncludePrice] = React.useState(false);
  const [editedDatesNeedReview, setEditedDatesNeedReview] = React.useState(false);
  /**
   * The host's own version of the post, or `null` while they have not touched it.
   *
   * The generation rule, stated once and enforced by this one nullable field: while it
   * is null the textarea *is* the generated text, so toggling "starting price" or
   * picking dates updates it live. The first keystroke stores a draft here and
   * generation stops — no toggle, no date change and no availability re-check can
   * overwrite the host's words after that. Getting the generated version back is an
   * explicit button, which is the only thing that clears this.
   *
   * Derived rather than mirrored into state by an effect: an effect would re-render
   * twice per keystroke's worth of upstream change and would make "which one wins"
   * a question of ordering rather than of a single expression.
   */
  const [draftPost, setDraftPost] = React.useState<string | null>(null);
  const [copying, setCopying] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [listing, saved] = await Promise.all([
          getPromotionWorkspaceAction(listingId),
          listFacebookDestinationsAction(),
        ]);
        if (cancelled) return;
        setDestinations(saved.ok ? saved.data : []);
        setState(
          listing.ok
            ? { status: "ready", listing: listing.data }
            : { status: "error" },
        );
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  const listing = state.status === "ready" ? state.listing : null;
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== "undefined" ? window.location.origin : SITE_URL);

  /** The link that goes in the post — carrying the chosen stay, so the guest lands on
   *  the property page with those dates already selected and priced. */
  const shareUrl = React.useMemo(
    () =>
      listing
        ? propertyShareUrl({
            origin,
            slug: listing.slug,
            checkIn: range?.checkIn,
            checkOut: range?.checkOut,
          })
        : "",
    [listing, origin, range],
  );

  const generated = React.useMemo(() => {
    if (!listing) return "";
    const locale = i18n.requestedLocale;
    return promotionPostText({
      customMessage,
      title: listing.title,
      description: listing.description,
      guestsLine: includeGuests
        ? interpolate(
            resolve("host.promote.post.guests", "👥 Sleeps up to {count} guests"),
            { count: listing.maxGuests },
          ).text
        : null,
      priceLine:
        includePrice && listing.baseNightlyRate && listing.currency
          ? interpolate(
              resolve("host.promote.post.price", "💶 From {price} per night"),
              {
                price: new Intl.NumberFormat(locale, {
                  style: "currency",
                  currency: listing.currency,
                  maximumFractionDigits: 0,
                }).format(listing.baseNightlyRate),
              },
            ).text
          : null,
      availabilityLine: range
        ? interpolate(
            resolve("host.promote.post.available", "📅 Available: {range}"),
            {
              range: formatAvailabilityRange(
                range.checkIn,
                range.checkOut,
                locale,
              ),
            },
          ).text
        : null,
      freshnessLine: range
        ? interpolate(
            resolve(
              "host.promote.post.checked",
              "Availability checked {date} — dates can be taken at any time.",
            ),
            { date: formatCheckedOnDate(range.checkedOn, locale) },
          ).text
        : null,
      callToAction: resolve(
        "host.promote.post.cta",
        "Check availability and send an inquiry:",
      ).text,
      propertyUrl: shareUrl,
    });
  }, [
    customMessage,
    i18n.requestedLocale,
    includeGuests,
    includePrice,
    listing,
    range,
    resolve,
    shareUrl,
  ]);

  const postText = draftPost ?? generated;
  const edited = draftPost !== null;

  /**
   * Confirms the picked dates are still bookable.
   *
   * Clears a stale range so the host cannot copy the same dead week twice — the error
   * is actionable rather than advisory. A draft they wrote by hand is left alone:
   * losing their words is a worse outcome than a post they are being told to re-date.
   */
  async function revalidateRange(): Promise<boolean> {
    if (!listing || !range) return true;
    const result = await checkPromotionRangeAction(
      listing.id,
      range.checkIn,
      range.checkOut,
    );
    if (!result.ok) {
      toast.error(rejectionMessage("LISTING_NOT_PROMOTABLE"));
      return false;
    }
    if (!result.data.ok) {
      setRange(null);
      if (draftPost !== null) setEditedDatesNeedReview(true);
      toast.error(rejectionMessage(result.data.reason, result.data));
      return false;
    }
    return true;
  }

  /**
   * Re-checks selected dates before copying. Facebook opens through a separate native
   * link, so this action does not lose clipboard permission by opening another tab and
   * never puts a stale advertised range on the clipboard before the server answers.
   */
  async function copyPost(): Promise<boolean> {
    if (editedDatesNeedReview) {
      toast.error(
        resolve(
          "host.promote.post.review_old_dates",
          "Your edited post may still contain old dates. Update the text or reset it before copying.",
        ).text,
      );
      return false;
    }
    setCopying(true);
    try {
      const stillAvailable = range ? await revalidateRange() : true;
      if (!stillAvailable) return false;

      const copied = await copyTextRobustly(postText);
      if (copied) {
        toast.success(
          resolve(
            "host.promote.copied",
            "Post text copied. Paste it into Facebook with Ctrl+V.",
          ).text,
        );
      } else {
        toast.error(
          resolve(
            "host.promote.copy_failed",
            "The text could not be copied. Select it in the box and copy it manually.",
          ).text,
        );
      }
      return copied;
    } catch {
      toast.error(
        resolve(
          "host.promote.range_error.verify",
          "We could not verify those dates. Check your connection and try again.",
        ).text,
      );
      return false;
    } finally {
      setCopying(false);
    }
  }

  // Every branch below renders the header: Radix labels the dialog from `DialogTitle`,
  // and a loading state without one would open an unnamed dialog for a screen reader.
  if (state.status === "loading") {
    return (
      <div className="space-y-4">
        <DialogHeader>
          <DialogTitle>
            <Tx k="host.promote.title" source="Promote your property" />
          </DialogTitle>
        </DialogHeader>
        <div className="flex min-h-40 items-center justify-center">
          <Loader2
            className="size-5 animate-spin text-muted-foreground"
            aria-hidden
          />
          <span className="sr-only">
            {resolve("host.promote.loading", "Loading promotion tools").text}
          </span>
        </div>
      </div>
    );
  }

  if (state.status === "error" || !listing) {
    return (
      <div className="space-y-4">
        <DialogHeader>
          <DialogTitle>
            <Tx k="host.promote.title" source="Promote your property" />
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          <Tx
            k="host.promote.unavailable"
            source="Only published properties can be promoted. Publish this one first, then try again."
          />
        </p>
      </div>
    );
  }

  const overLimit = postText.length > POST_PREVIEW_LIMIT;
  const selectedGroupUrl =
    destination.kind === "saved" || destination.kind === "custom"
      ? isSafeFacebookGroupUrl(destination.url)
        ? destination.url
        : ""
      : "";
  const canOpenGroup = Boolean(selectedGroupUrl);
  const profileShareUrl = facebookPropertyShareUrl(origin, listing.slug, {
    checkIn: range?.checkIn,
    checkOut: range?.checkOut,
  });

  return (
    <div className="flex min-h-0 min-w-0 w-full flex-col gap-5">
      <DialogHeader>
        <DialogTitle>
          <Tx k="host.promote.title" source="Promote your property" />
        </DialogTitle>
        <DialogDescription>
          <Tx
            k="host.promote.subtitle"
            source="We prepare the text and open Facebook. You paste it and post it yourself — we never post for you."
          />
        </DialogDescription>
      </DialogHeader>

      <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-3">
        {listing.imageUrl ? (
          <Image
            src={listing.imageUrl}
            alt=""
            width={64}
            height={48}
            className="h-12 w-16 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <span className="h-12 w-16 shrink-0 rounded-lg bg-muted" aria-hidden />
        )}
        <span className="min-w-0">
          <span
            className="block truncate text-sm font-medium"
            data-user-generated-content
            translate="yes"
          >
            {listing.title}
          </span>
          {listing.city && (
            <span
              className="block truncate text-xs text-muted-foreground"
              data-user-generated-content
              translate="yes"
            >
              {listing.city}
            </span>
          )}
        </span>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={messageId}>
          <Tx
            k="host.promote.custom_message"
            source="Your opening line (optional)"
          />
        </Label>
        <Textarea
          id={messageId}
          value={customMessage}
          rows={2}
          onChange={(event) => setCustomMessage(event.target.value)}
          placeholder={
            resolve(
              "host.promote.custom_message_placeholder",
              "Last-minute opening after a cancellation!",
            ).text
          }
        />
      </div>

      <div className="space-y-2">
        <span className="text-sm font-medium">
          <Tx k="host.promote.availability.heading" source="Availability" />
        </span>
        <PromotionAvailabilityPicker
          listing={listing}
          value={range}
          onChange={(next) => {
            setRange(next);
            setEditedDatesNeedReview(false);
          }}
        />
      </div>

      <fieldset className="min-w-0 space-y-2">
        <legend className="text-sm font-medium">
          <Tx k="host.promote.details.heading" source="Include in the post" />
        </legend>
        <Label className="font-normal">
          <Checkbox
            checked={includeGuests}
            onCheckedChange={(checked) => setIncludeGuests(checked === true)}
          />
          <span>
            {
              interpolate(
                resolve("host.promote.details.guests", "Sleeps up to {count} guests"),
                { count: listing.maxGuests },
              ).text
            }
          </span>
        </Label>
        {listing.baseNightlyRate !== null && listing.currency && (
          <Label className="font-normal">
            <Checkbox
              checked={includePrice}
              onCheckedChange={(checked) => setIncludePrice(checked === true)}
            />
            <span>
              <Tx
                k="host.promote.details.price"
                source="Starting price per night"
              />
            </span>
          </Label>
        )}
      </fieldset>

      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor={postId}>
            <Tx k="host.promote.post.heading" source="Post text" />
          </Label>
          {edited && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraftPost(null);
                setEditedDatesNeedReview(false);
              }}
            >
              <RotateCcw className="size-4" aria-hidden />
              <Tx k="host.promote.post.regenerate" source="Reset to generated text" />
            </Button>
          )}
        </div>
        <Textarea
          id={postId}
          value={postText}
          rows={10}
          className="min-h-52 font-normal"
          onChange={(event) => {
            setDraftPost(event.target.value);
            setEditedDatesNeedReview(false);
          }}
        />
        {editedDatesNeedReview && (
          <p role="alert" className="text-sm text-destructive">
            <Tx
              k="host.promote.post.review_old_dates"
              source="Your edited post may still contain old dates. Update the text or reset it before copying."
            />
          </p>
        )}
        <p
          className={
            overLimit
              ? "text-xs font-medium text-amber-700 dark:text-amber-500"
              : "text-xs text-muted-foreground"
          }
        >
          {
            interpolate(
              resolve(
                "host.promote.post.count",
                "{count} characters. Facebook hides anything past about {limit} behind “See more”.",
              ),
              { count: postText.length, limit: POST_PREVIEW_LIMIT },
            ).text
          }
        </p>
      </div>

      <FacebookDestinationPicker
        destinations={destinations}
        onDestinationsChange={setDestinations}
        value={destination}
        onChange={setDestination}
      />

      {/* The instruction stays on screen rather than appearing as a toast after the
          tab opens — by then the host is looking at Facebook, not at this. */}
      <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
        <Tx
          k="host.promote.instructions"
          source="Copy the text first. Then open Facebook, paste with Ctrl+V, add your photos if desired, and post."
        />
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="default"
          disabled={copying}
          onClick={() => void copyPost()}
        >
          {copying ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Copy className="size-4" aria-hidden />
          )}
          <Tx k="host.promote.copy" source="Copy text" />
        </Button>
        {destination.kind === "profile" ? (
          <Button asChild variant="outline">
            <a
              href={profileShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onOpenChange?.(false)}
            >
              <ExternalLink className="size-4" aria-hidden />
              <Tx
                k="host.promote.open_profile"
                source="Post on Facebook profile"
              />
            </a>
          </Button>
        ) : (
          canOpenGroup ? (
            <Button asChild variant="outline">
              <a
                href={selectedGroupUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  if (destination.kind === "saved") {
                    void markFacebookDestinationUsedAction(destination.id);
                  }
                  onOpenChange?.(false);
                }}
              >
                <ExternalLink className="size-4" aria-hidden />
                <Tx k="host.promote.open_group" source="Open selected group" />
              </a>
            </Button>
          ) : (
            <Button type="button" variant="outline" disabled>
              <ExternalLink className="size-4" aria-hidden />
              <Tx k="host.promote.open_group" source="Open selected group" />
            </Button>
          )
        )}
      </div>
    </div>
  );
}
