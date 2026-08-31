"use client";

import * as React from "react";
import Image from "next/image";
import { Loader2, Megaphone } from "lucide-react";
import { toast } from "sonner";
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tx, interpolate, useI18n } from "@/lib/i18n/client";
import { SITE_URL } from "@/lib/branding";
import { isSafeFacebookGroupUrl } from "@/lib/facebook-destinations";
import {
  facebookPropertyShareUrl,
  formatAvailabilityRange,
  formatCheckedOnDate,
} from "@/lib/facebook-share";
import {
  channelPostText,
  channelPropertyUrl,
  type PromotionChannel,
} from "@/lib/promotion/channels";
import {
  checkPromotionRangeAction,
  getPromotionWorkspaceAction,
  listFacebookDestinationsAction,
  markFacebookDestinationUsedAction,
} from "@/lib/actions/facebook-promotion.actions";
import type { HostFacebookDestinationView } from "@/lib/services/facebook-destination.service";
import type { PromotionListingView } from "@/lib/services/listing-promotion.service";
import { PromotionFlowFooter } from "@/components/host/promotion/promotion-flow-footer";
import { PromotionStepWhere } from "@/components/host/promotion/promotion-step-where";
import { PromotionStepCompose } from "@/components/host/promotion/promotion-step-compose";
import {
  PromotionStepPost,
  type PromotionTarget,
} from "@/components/host/promotion/promotion-step-post";
import {
  useRangeRejectionMessage,
  type PromotionRange,
} from "@/components/host/promotion/promotion-availability-picker";

/**
 * "Promote your property" — the one workspace behind every promotion entry point.
 *
 * What it does: prepares text the host owns, hands it to them, and opens the place they
 * are posting it. What it deliberately does not do: post. There is no login here, no
 * token, no Pages API and no automation, and every word of copy is written so a host
 * never expects otherwise. Each app opens in a real tab in their own browser — never
 * embedded, because an iframe around someone's social account is both blocked and the
 * wrong thing to build.
 *
 * Three steps, in the order the decisions actually depend on each other: where it goes,
 * what it says, and the handover. It was one long scrolling form, which asked for the
 * words first and the destination last — the reverse of what determines what, since an
 * Instagram caption cannot carry the link a group post is built around.
 *
 * The shape and the chrome are the new-listing flow's, down to the progress rail and
 * the black pill; see `components/host/flow-chrome`. This is a host learning a second
 * flow from a product where they have already learned the first.
 */

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; listing: PromotionListingView };

type Step = "where" | "compose" | "post" | "done";

export function PromotionWorkspace({
  listingId,
  onOpenChange,
}: {
  listingId: string;
  /** Lets the workspace close itself once the host is finished. */
  onOpenChange?: (open: boolean) => void;
}) {
  const i18n = useI18n();
  const { resolve } = useI18n();
  const rejectionMessage = useRangeRejectionMessage();

  const [state, setState] = React.useState<LoadState>({ status: "loading" });
  const [destinations, setDestinations] = React.useState<
    HostFacebookDestinationView[]
  >([]);

  const [step, setStep] = React.useState<Step>("where");
  const [channels, setChannels] = React.useState<PromotionChannel[]>([
    "FACEBOOK",
  ]);
  const [profileSelected, setProfileSelected] = React.useState(true);
  const [selectedDestinationIds, setSelectedDestinationIds] = React.useState<
    string[]
  >([]);

  const [customMessage, setCustomMessage] = React.useState("");
  const [range, setRange] = React.useState<PromotionRange | null>(null);
  const [includeGuests, setIncludeGuests] = React.useState(true);
  const [includePrice, setIncludePrice] = React.useState(false);
  const [selectedMediaIds, setSelectedMediaIds] = React.useState<string[]>([]);
  const [savedMediaCount, setSavedMediaCount] = React.useState(0);

  /**
   * The host's own version of a post, per channel, or absent while they have not
   * touched it.
   *
   * While a channel has no entry here its preview *is* the generated text, so a toggle
   * or a date change updates it live. The first keystroke stores a draft and generation
   * stops for that channel only — a Facebook post and an Instagram caption are
   * different pieces of writing, and an edit to one must not rewrite the other.
   */
  const [drafts, setDrafts] = React.useState<
    Partial<Record<PromotionChannel, string>>
  >({});
  const [done, setDone] = React.useState<string[]>([]);

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

  /** The link that goes in the post — carrying the chosen stay, so a guest lands on the
   *  property page with those dates already selected and priced. */
  const shareUrl = React.useMemo(
    () =>
      listing
        ? channelPropertyUrl({
            origin,
            slug: listing.slug,
            checkIn: range?.checkIn,
            checkOut: range?.checkOut,
          })
        : "",
    [listing, origin, range],
  );

  /** The generated post for one channel. Not memoised per channel: it is string
   *  assembly over a handful of lines, and the preview only ever asks for one. */
  const postFor = React.useCallback(
    (channel: PromotionChannel) => {
      if (!listing) return "";
      const locale = i18n.requestedLocale;
      return channelPostText(channel, {
        customMessage,
        title: listing.title,
        description: listing.description,
        city: listing.city,
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
        linkInBioLine: resolve("host.promote.post.link_in_bio", "🔗 Link in bio")
          .text,
        propertyUrl: shareUrl,
      });
    },
    [
      customMessage,
      i18n.requestedLocale,
      includeGuests,
      includePrice,
      listing,
      range,
      resolve,
      shareUrl,
    ],
  );

  const textFor = React.useCallback(
    (channel: PromotionChannel) => drafts[channel] ?? postFor(channel),
    [drafts, postFor],
  );

  /**
   * Confirms the picked dates are still bookable, on the way into the posting step.
   *
   * Here rather than inside the copy, which is what makes the posting step's one-press
   * hand-over possible at all: an await before `copyTextRobustly` spends the user
   * activation that its synchronous fallback depends on. A stale range is cleared so
   * the host cannot advertise the same dead week twice; a draft they wrote by hand is
   * left alone, since losing their words is worse than being told to re-date them.
   */
  async function rangeStillOpen(): Promise<boolean> {
    if (!listing || !range) return true;
    try {
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
        toast.error(rejectionMessage(result.data.reason, result.data));
        return false;
      }
      return true;
    } catch {
      toast.error(
        resolve(
          "host.promote.range_error.verify",
          "We could not verify those dates. Check your connection and try again.",
        ).text,
      );
      return false;
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

  /** Every Facebook place the host ticked, as rows the posting step can open. Groups
   *  whose stored URL no longer passes the safety check are dropped rather than
   *  rendered as a dead control. */
  const facebookTargets: PromotionTarget[] = [
    ...(profileSelected
      ? [
          {
            kind: "facebook-profile" as const,
            id: "facebook-profile",
            name: "",
            url: facebookPropertyShareUrl(origin, listing.slug, {
              checkIn: range?.checkIn,
              checkOut: range?.checkOut,
            }),
          },
        ]
      : []),
    ...destinations
      .filter(
        (destination) =>
          selectedDestinationIds.includes(destination.id) &&
          isSafeFacebookGroupUrl(destination.url),
      )
      .map((destination) => ({
        kind: "facebook-group" as const,
        id: destination.id,
        name: destination.name,
        url: destination.url,
      })),
  ];

  const hasFacebook = channels.includes("FACEBOOK") && facebookTargets.length > 0;
  const totalStops =
    (hasFacebook ? facebookTargets.length : 0) +
    (channels.includes("INSTAGRAM") ? 2 : 0) +
    (channels.includes("MESSAGING") ? 1 : 0) +
    (channels.includes("LINK") ? 1 : 0);
  const doneStops = done.filter((key) =>
    key.startsWith("messaging-") ? done.indexOf(key) === done.findIndex((k) => k.startsWith("messaging-")) : true,
  ).length;

  const nothingChosen =
    channels.length === 0 ||
    (channels.length === 1 && channels[0] === "FACEBOOK" && !hasFacebook);

  return (
    <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col">
      <DialogHeader className="shrink-0 space-y-0 pb-3">
        <DialogTitle className="sr-only">
          <Tx k="host.promote.title" source="Promote your property" />
        </DialogTitle>
        <DialogDescription className="sr-only">
          <Tx
            k="host.promote.subtitle"
            source="We prepare the text and open Facebook. You paste it and post it yourself — we never post for you."
          />
        </DialogDescription>
        {/* The property this is about, kept in view on every step: the dialog is opened
            from a card and its title is now a screen-reader label, so without this the
            host has nothing telling them which listing they are promoting. */}
        <div className="flex items-center gap-2.5 pr-8">
          {listing.imageUrl ? (
            <Image
              src={listing.imageUrl}
              alt=""
              width={40}
              height={30}
              className="h-[30px] w-10 shrink-0 rounded-md object-cover"
            />
          ) : null}
          <span
            className="min-w-0 truncate text-sm text-slate-500"
            data-user-generated-content
            translate="yes"
          >
            {listing.title}
          </span>
        </div>
      </DialogHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {step === "where" ? (
          <PromotionStepWhere
            channels={channels}
            onChannelsChange={setChannels}
            destinations={destinations}
            onDestinationsChange={setDestinations}
            profileSelected={profileSelected}
            onProfileSelectedChange={setProfileSelected}
            selectedDestinationIds={selectedDestinationIds}
            onSelectedDestinationIdsChange={setSelectedDestinationIds}
          />
        ) : null}

        {step === "compose" ? (
          <PromotionStepCompose
            listing={listing}
            channels={channels}
            customMessage={customMessage}
            onCustomMessageChange={setCustomMessage}
            range={range}
            onRangeChange={setRange}
            includeGuests={includeGuests}
            onIncludeGuestsChange={setIncludeGuests}
            includePrice={includePrice}
            onIncludePriceChange={setIncludePrice}
            selectedMediaIds={selectedMediaIds}
            onSelectedMediaIdsChange={setSelectedMediaIds}
            onMediaSaved={setSavedMediaCount}
            postFor={postFor}
            drafts={drafts}
            onDraftChange={(channel, next) =>
              setDrafts((current) => {
                const updated = { ...current };
                if (next === null) delete updated[channel];
                else updated[channel] = next;
                return updated;
              })
            }
          />
        ) : null}

        {step === "post" ? (
          <PromotionStepPost
            channels={channels}
            facebookTargets={facebookTargets}
            facebookText={textFor("FACEBOOK")}
            instagramCaption={textFor("INSTAGRAM")}
            messagingText={textFor("MESSAGING")}
            propertyUrl={shareUrl}
            savedMediaCount={savedMediaCount}
            needsMedia={channels.includes("INSTAGRAM") && savedMediaCount === 0}
            done={done}
            onDone={(key) =>
              setDone((current) =>
                current.includes(key) ? current : [...current, key],
              )
            }
            onGroupOpened={(destinationId) => {
              void markFacebookDestinationUsedAction(destinationId);
            }}
          />
        ) : null}

        {step === "done" ? <PromotionDone targets={totalStops} /> : null}
      </div>

      <PromotionFlowFooter
        segments={FOOTER_SEGMENTS[step]}
        onBack={
          step === "where"
            ? undefined
            : () =>
                setStep(
                  step === "compose"
                    ? "where"
                    : step === "post"
                      ? "compose"
                      : "post",
                )
        }
        status={
          step === "post" && totalStops > 0 ? (
            <>
              {
                interpolate(
                  resolve("host.promote.post.progress", "{done} of {total}"),
                  { done: Math.min(doneStops, totalStops), total: totalStops },
                ).text
              }
            </>
          ) : null
        }
        nextDisabled={step === "where" && nothingChosen}
        nextLabel={
          step === "post" ? (
            <Tx k="host.promote.finish" source="Finish" />
          ) : step === "done" ? (
            <Tx k="host.promote.close" source="Done" />
          ) : (
            <Tx k="host.v2.flow.continue" source="Continue" />
          )
        }
        onNext={async () => {
          if (step === "where") {
            setStep("compose");
            return;
          }
          if (step === "compose") {
            if (!(await rangeStillOpen())) return;
            setStep("post");
            return;
          }
          if (step === "post") {
            setStep("done");
            return;
          }
          onOpenChange?.(false);
        }}
      />
    </div>
  );
}

/** Where each step sits on the listing flow's three-part rail. */
const FOOTER_SEGMENTS: Record<Step, number[]> = {
  where: [100, 0, 0],
  compose: [100, 100, 0],
  post: [100, 100, 60],
  done: [100, 100, 100],
};

/**
 * The closing screen, in the shape the listing flow closes a phase with: an eyebrow, a
 * heading that says what just happened, and a line about what it means next time.
 *
 * No illustration yet. The listing flow's is eight staged PNGs whose order retells the
 * phase just finished, and a promotion has no equivalent artwork drawn for it. The
 * screen reads as intended without one, so it ships plain rather than borrowing a
 * picture about houses to end a screen about posting.
 */
function PromotionDone({ targets }: { targets: number }) {
  const { resolve } = useI18n();
  return (
    <div className="flex min-h-56 flex-col justify-center py-4">
      <p className="font-heading text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        <Tx k="host.promote.done.eyebrow" source="All posted" />
      </p>
      <h2 className="mt-3 max-w-md font-heading text-[1.9rem] font-semibold leading-[1.1] tracking-[-0.025em] text-slate-950 sm:text-[2.25rem]">
        <Tx k="host.promote.done.heading" source="Your place is out there" />
      </h2>
      <p className="mt-4 max-w-md text-sm leading-6 text-slate-500">
        {
          interpolate(
            resolve(
              "host.promote.done.body",
              "{count} places, one sitting. Next time, Promote opens right where you left off.",
            ),
            { count: targets },
          ).text
        }
      </p>
      <Megaphone className="mt-6 size-8 text-slate-300" aria-hidden />
    </div>
  );
}
