"use client";

import * as React from "react";
import Image from "next/image";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tx, useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import {
  FlowSectionLabel,
  FlowStepHeading,
} from "@/components/host/flow-chrome";
import { InfoSheet } from "@/components/host/v2/listings/info-sheet";
import { ChannelName } from "@/components/host/promotion/promotion-step-where";
import { PromotionMediaPicker } from "@/components/host/promotion/promotion-media-picker";
import {
  PromotionAvailabilityPicker,
  type PromotionRange,
} from "@/components/host/promotion/promotion-availability-picker";
import { channelCapabilities, type PromotionChannel } from "@/lib/promotion/channels";
import type { PromotionListingView } from "@/lib/services/listing-promotion.service";

/**
 * Step two: one draft, previewed as each app will actually render it.
 *
 * Everything that changes the post sits above the post — the ordering the old
 * single-screen workspace got wrong, where ticking "starting price" updated a box the
 * host had already scrolled past. On a wide screen the controls and the preview are two
 * columns and neither moves; below `md` they become a Write/Preview pair, because
 * stacking them would put the preview a scroll beneath the toggles that rewrite it,
 * which is the same failure in a taller shape.
 *
 * Drafts are per channel. A Facebook post and an Instagram caption are genuinely
 * different pieces of writing — one ends in a link, the other cannot — so an edit to
 * one must not silently rewrite the other, and each keeps its own way back to the
 * generated version.
 */
export function PromotionStepCompose({
  listing,
  channels,
  customMessage,
  onCustomMessageChange,
  range,
  onRangeChange,
  includeGuests,
  onIncludeGuestsChange,
  includePrice,
  onIncludePriceChange,
  selectedMediaIds,
  onSelectedMediaIdsChange,
  onMediaSaved,
  postFor,
  drafts,
  onDraftChange,
}: {
  listing: PromotionListingView;
  channels: PromotionChannel[];
  customMessage: string;
  onCustomMessageChange: (next: string) => void;
  range: PromotionRange | null;
  onRangeChange: (next: PromotionRange | null) => void;
  includeGuests: boolean;
  onIncludeGuestsChange: (next: boolean) => void;
  includePrice: boolean;
  onIncludePriceChange: (next: boolean) => void;
  selectedMediaIds: string[];
  onSelectedMediaIdsChange: (next: string[]) => void;
  onMediaSaved: (count: number) => void;
  /** The generated text for a channel, before any edit of the host's. */
  postFor: (channel: PromotionChannel) => string;
  drafts: Partial<Record<PromotionChannel, string>>;
  onDraftChange: (channel: PromotionChannel, next: string | null) => void;
}) {
  const { resolve } = useI18n();
  const messageId = React.useId();
  const [tab, setTab] = React.useState<"write" | "preview">("write");
  const [infoOpen, setInfoOpen] = React.useState(false);
  const infoTriggerRef = React.useRef<HTMLButtonElement | null>(null);

  // Only ever a channel the host actually chose, so removing one on the way back
  // cannot leave the preview showing an app they are no longer posting to.
  // Annotated rather than inferred: filtering on `!== "LINK"` narrows the element type,
  // and a narrowed array cannot be asked whether it contains the wider union below.
  const previewable: PromotionChannel[] = channels.filter(
    (channel) => channel !== "LINK",
  );
  const [previewChannel, setPreviewChannel] = React.useState<PromotionChannel>(
    previewable[0] ?? "FACEBOOK",
  );
  const active = previewable.includes(previewChannel)
    ? previewChannel
    : (previewable[0] ?? "FACEBOOK");

  const helpLabel = resolve(
    "host.promote.compose.help",
    "Why each app looks different",
  ).text;

  const draft = drafts[active];
  const text = draft ?? postFor(active);
  const capabilities = channelCapabilities(active);

  return (
    <>
      <FlowStepHeading
        title={<Tx k="host.promote.compose.heading" source="Write it once" />}
        helpLabel={helpLabel}
        onHelp={() => setInfoOpen(true)}
        helpRef={infoTriggerRef}
      />

      <div className="mt-4 flex rounded-full bg-slate-100 p-1 md:hidden">
        {(["write", "preview"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            aria-pressed={tab === value}
            className={cn(
              "flex-1 rounded-full py-2 text-sm font-semibold transition-colors",
              tab === value ? "bg-white text-slate-950 shadow-sm" : "text-slate-500",
            )}
          >
            {value === "write" ? (
              <Tx k="host.promote.compose.tab_write" source="Write" />
            ) : (
              <Tx k="host.promote.compose.tab_preview" source="Preview" />
            )}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <div className={cn(tab === "write" ? "block" : "hidden", "md:block")}>
          <FlowSectionLabel className="mb-2">
            <Tx k="host.promote.custom_message" source="Your opening line (optional)" />
          </FlowSectionLabel>
          <Textarea
            id={messageId}
            value={customMessage}
            rows={2}
            onChange={(event) => onCustomMessageChange(event.target.value)}
            placeholder={
              resolve(
                "host.promote.custom_message_placeholder",
                "Last-minute opening after a cancellation!",
              ).text
            }
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <PromotionAvailabilityPicker
              listing={listing}
              value={range}
              onChange={onRangeChange}
            />
            <FactChip
              pressed={includeGuests}
              onToggle={() => onIncludeGuestsChange(!includeGuests)}
            >
              <Tx k="host.promote.details.guests_short" source="Guests" />
            </FactChip>
            {listing.baseNightlyRate !== null && listing.currency ? (
              <FactChip
                pressed={includePrice}
                onToggle={() => onIncludePriceChange(!includePrice)}
              >
                <Tx k="host.promote.details.price_short" source="Price" />
              </FactChip>
            ) : null}
          </div>

          <div className="mt-5">
            <PromotionMediaPicker
              media={listing.media}
              slug={listing.slug}
              selectedIds={selectedMediaIds}
              onSelectedIdsChange={onSelectedMediaIdsChange}
              onSaved={onMediaSaved}
            />
          </div>
        </div>

        <div className={cn(tab === "preview" ? "block" : "hidden", "md:block")}>
          {previewable.length > 1 ? (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {previewable.map((channel) => (
                <button
                  key={channel}
                  type="button"
                  onClick={() => setPreviewChannel(channel)}
                  aria-pressed={channel === active}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                    channel === active
                      ? "border-slate-950 text-slate-950"
                      : "border-slate-300 text-slate-500 hover:border-slate-400",
                  )}
                >
                  <ChannelName channel={channel} />
                </button>
              ))}
            </div>
          ) : null}

          <div className="overflow-hidden rounded-xl border border-slate-200">
            <Textarea
              value={text}
              rows={10}
              aria-label={resolve("host.promote.post.heading", "Post text").text}
              onChange={(event) => onDraftChange(active, event.target.value)}
              className="min-h-52 resize-none rounded-none border-0 bg-white text-sm leading-6 shadow-none focus-visible:ring-0"
            />
            {/* The link card, drawn only where a link is one. It is the reason a host
                does not have to attach a photo on Facebook, and seeing it is what tells
                them so — the old workspace had to say it in a sentence instead. */}
            {capabilities.linksAreClickable && listing.imageUrl ? (
              <div className="flex items-center gap-3 border-t border-slate-200 bg-slate-50 px-3 py-2.5">
                <Image
                  src={listing.imageUrl}
                  alt=""
                  width={64}
                  height={48}
                  className="h-12 w-16 shrink-0 rounded-lg object-cover"
                />
                <div className="min-w-0">
                  <p
                    className="truncate text-sm font-medium text-slate-900"
                    data-user-generated-content
                    translate="yes"
                  >
                    {listing.title}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    <Tx
                      k="host.promote.preview.link_card"
                      source="Your photo comes with the link"
                    />
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          {draft !== undefined ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-1.5"
              onClick={() => onDraftChange(active, null)}
            >
              <RotateCcw className="size-4" aria-hidden />
              <Tx
                k="host.promote.post.regenerate"
                source="Reset to generated text"
              />
            </Button>
          ) : null}
        </div>
      </div>

      <InfoSheet
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        title={helpLabel}
        returnFocusTo={infoTriggerRef}
      >
        <div className="space-y-4 text-sm leading-6 text-slate-600">
          <p>
            <Tx
              k="host.promote.compose.help_body"
              source="One post, adjusted for what each app can do. Editing one does not change the others, and each can be reset."
            />
          </p>
          <p>
            <Tx
              k="host.promote.compose.help_instagram"
              source="Instagram captions cannot hold a working link, so yours points at your bio instead, with the city as a hashtag."
            />
          </p>
          <p>
            <Tx
              k="host.promote.compose.help_dates"
              source="Dates are optional, and only ever ones your calendar still has open. They go in the link too, so a guest arrives with that stay already priced."
            />
          </p>
        </div>
      </InfoSheet>
    </>
  );
}

/** One fact the post may carry, as a chip that reads as on or off. Deliberately the
 *  same shape as the availability control beside it — to a host they are three
 *  switches, not a switch and two checkboxes. */
function FactChip({
  pressed,
  onToggle,
  children,
}: {
  pressed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400",
        pressed
          ? "border-slate-950 text-slate-950"
          : "border-slate-300 text-slate-500 hover:border-slate-400",
      )}
    >
      {children}
    </button>
  );
}
