"use client";

import * as React from "react";
import { Check, Link2 } from "lucide-react";
import { Tx, useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import {
  FlowSectionLabel,
  FlowStepHeading,
} from "@/components/host/flow-chrome";
import { InfoSheet } from "@/components/host/v2/listings/info-sheet";
import {
  PROMOTION_CHANNELS,
  channelCapabilities,
  type PromotionChannel,
} from "@/lib/promotion/channels";
import { FacebookDestinationPicker } from "@/components/host/promotion/facebook-destination-picker";
import {
  FacebookGlyph,
  InstagramGlyph,
  WhatsAppGlyph,
} from "@/components/host/promotion/channel-glyphs";
import type { HostFacebookDestinationView } from "@/lib/services/facebook-destination.service";

/**
 * Step one: the places, chosen before the words.
 *
 * Destination first because it decides what the post has to be. A rentals group wants
 * dates and a price, a caption cannot carry a link at all, and a messenger takes the
 * whole thing in a URL — so a flow that asks for the text first is asking the host to
 * write something before anyone has established what it needs to contain.
 *
 * Channels are ticked rather than picked. A host promoting a cancellation wants it in
 * their groups *and* on their story, and the previous flow made that two full passes.
 * Only Facebook opens a list underneath, because it is the only one of the four with
 * named places inside it — see `channelCapabilities`.
 */
export function PromotionStepWhere({
  channels,
  onChannelsChange,
  destinations,
  onDestinationsChange,
  profileSelected,
  onProfileSelectedChange,
  selectedDestinationIds,
  onSelectedDestinationIdsChange,
}: {
  channels: PromotionChannel[];
  onChannelsChange: (next: PromotionChannel[]) => void;
  destinations: HostFacebookDestinationView[];
  onDestinationsChange: (next: HostFacebookDestinationView[]) => void;
  profileSelected: boolean;
  onProfileSelectedChange: (next: boolean) => void;
  selectedDestinationIds: string[];
  onSelectedDestinationIdsChange: (next: string[]) => void;
}) {
  const { resolve } = useI18n();
  const [infoOpen, setInfoOpen] = React.useState(false);
  const infoTriggerRef = React.useRef<HTMLButtonElement | null>(null);

  const helpLabel = resolve(
    "host.promote.where.help",
    "How promoting works",
  ).text;

  function toggleChannel(channel: PromotionChannel) {
    onChannelsChange(
      channels.includes(channel)
        ? channels.filter((value) => value !== channel)
        : [...channels, channel],
    );
  }

  return (
    <>
      <FlowStepHeading
        title={<Tx k="host.promote.where.heading" source="Where should this go?" />}
        helpLabel={helpLabel}
        onHelp={() => setInfoOpen(true)}
        helpRef={infoTriggerRef}
      />

      <div className="mt-5 grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {PROMOTION_CHANNELS.map((channel) => (
          <ChannelCard
            key={channel}
            channel={channel}
            selected={channels.includes(channel)}
            onToggle={() => toggleChannel(channel)}
          />
        ))}
      </div>

      {channelCapabilities("FACEBOOK").hasDestinations &&
      channels.includes("FACEBOOK") ? (
        <div className="mt-6">
          <FlowSectionLabel className="mb-2">
            <Tx k="host.promote.channel.facebook" source="Facebook" />
          </FlowSectionLabel>
          <FacebookDestinationPicker
            destinations={destinations}
            onDestinationsChange={onDestinationsChange}
            profileSelected={profileSelected}
            onProfileSelectedChange={onProfileSelectedChange}
            selectedIds={selectedDestinationIds}
            onSelectedIdsChange={onSelectedDestinationIdsChange}
          />
        </div>
      ) : null}

      <InfoSheet
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        title={helpLabel}
        returnFocusTo={infoTriggerRef}
      >
        <div className="space-y-4 text-sm leading-6 text-slate-600">
          <p>
            <Tx
              k="host.promote.where.help_body"
              source="We write the post from your listing. You paste it and post it yourself — we never sign in to your accounts."
            />
          </p>
          <p>
            <Tx
              k="host.promote.where.help_channels"
              source="Facebook shows your photo from the link. Instagram cannot make links clickable, so its caption points at your bio. WhatsApp and Viber carry the whole message, so there is nothing to copy."
            />
          </p>
          <p>
            <Tx
              k="host.promote.destination.privacy"
              source="Private groups are fine. We only store the name and the link, and open it in a new tab — we never read the group or post for you."
            />
          </p>
        </div>
      </InfoSheet>
    </>
  );
}

/** One channel, as a card in the listing flow's shape: an icon tile, a name, and the
 *  single thing about this app the host has to know before ticking it. */
function ChannelCard({
  channel,
  selected,
  onToggle,
}: {
  channel: PromotionChannel;
  selected: boolean;
  onToggle: () => void;
}) {
  const Icon = CHANNEL_ICONS[channel];
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      onClick={onToggle}
      className={cn(
        "group relative flex min-h-24 cursor-pointer flex-col rounded-2xl bg-white p-3.5 text-left shadow-[0_3px_14px_rgba(15,23,42,0.08)] outline-none transition-[box-shadow,transform,border-color] hover:-translate-y-0.5 hover:shadow-[0_7px_20px_rgba(15,23,42,0.12)] active:translate-y-0 focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2",
        selected
          ? "border-[1.5px] border-slate-950"
          : "border-[1.5px] border-transparent",
      )}
    >
      {selected ? (
        <span
          className="absolute right-2.5 top-2.5 grid size-4 place-items-center rounded-[5px] bg-slate-950 text-white"
          aria-hidden
        >
          <Check className="size-3" />
        </span>
      ) : null}
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-50 text-slate-800 transition-colors group-hover:bg-slate-100">
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <span className="mt-2.5 font-heading text-sm font-semibold text-slate-950">
        <ChannelName channel={channel} />
      </span>
      <span className="mt-0.5 text-xs leading-5 text-slate-500">
        <ChannelNote channel={channel} />
      </span>
    </button>
  );
}

const CHANNEL_ICONS: Record<
  PromotionChannel,
  React.ComponentType<{ className?: string }>
> = {
  FACEBOOK: FacebookGlyph,
  INSTAGRAM: InstagramGlyph,
  MESSAGING: WhatsAppGlyph,
  LINK: Link2,
};

/** Written out per channel rather than built from the code, so the i18n extractor sees
 *  every key. The same reason `ListingFlowFooter` spells out its CTA labels. */
export function ChannelName({ channel }: { channel: PromotionChannel }) {
  switch (channel) {
    case "FACEBOOK":
      return <Tx k="host.promote.channel.facebook" source="Facebook" />;
    case "INSTAGRAM":
      return <Tx k="host.promote.channel.instagram" source="Instagram" />;
    case "MESSAGING":
      return <Tx k="host.promote.channel.messaging" source="WhatsApp · Viber" />;
    case "LINK":
      return <Tx k="host.promote.channel.link" source="Copy link" />;
  }
}

function ChannelNote({ channel }: { channel: PromotionChannel }) {
  switch (channel) {
    case "FACEBOOK":
      return (
        <Tx k="host.promote.channel.facebook_note" source="Profile and groups" />
      );
    case "INSTAGRAM":
      return (
        <Tx k="host.promote.channel.instagram_note" source="Photo and caption" />
      );
    case "MESSAGING":
      return (
        <Tx k="host.promote.channel.messaging_note" source="Nothing to copy" />
      );
    case "LINK":
      return <Tx k="host.promote.channel.link_note" source="Anywhere else" />;
  }
}
