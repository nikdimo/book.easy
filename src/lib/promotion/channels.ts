import {
  normalizeShareDescription,
  promotionPostText,
  propertyShareUrl,
} from "@/lib/facebook-share";

/**
 * What a host can promote a property to, and what each of those places is actually
 * capable of.
 *
 * The whole flow turns on this table. None of these platforms lets an outside site post
 * on someone's behalf, so what differs between them is narrower and more mechanical:
 * whether the text can ride in a link, whether a URL in the body is clickable, and
 * whether the host has to have a file on their device before they can post at all.
 * Every screen reads those three answers rather than testing for a channel by name.
 *
 * Pure and free of server imports: the wizard is a client component and its post text
 * has to regenerate as the host types.
 */

export type PromotionChannel =
  | "FACEBOOK"
  | "INSTAGRAM"
  | "MESSAGING"
  | "LINK";

/** Declaration order is the order the channel cards are offered in. */
export const PROMOTION_CHANNELS: readonly PromotionChannel[] = [
  "FACEBOOK",
  "INSTAGRAM",
  "MESSAGING",
  "LINK",
] as const;

export interface ChannelCapabilities {
  /**
   * The post text can be carried in the outgoing URL, so the host never touches the
   * clipboard. True only of the messenger apps — Facebook strips prefilled text from
   * its share composer deliberately, and Instagram has no web composer at all.
   */
  prefillsText: boolean;
  /** Whether a URL written into the body is a link rather than dead characters. */
  linksAreClickable: boolean;
  /** Posting is impossible without media already on the host's device. */
  needsMediaFile: boolean;
  /** The host picks named places inside this channel — today, Facebook groups. */
  hasDestinations: boolean;
}

const CAPABILITIES: Record<PromotionChannel, ChannelCapabilities> = {
  // A group has no share intent of any kind, and `sharer.php` accepts only a URL. Both
  // therefore go through the clipboard. The photo needs no attaching: the link card
  // carries the listing's primary image from its Open Graph tags.
  FACEBOOK: {
    prefillsText: false,
    linksAreClickable: true,
    needsMediaFile: false,
    hasDestinations: true,
  },
  // The one channel that cannot be completed in a browser. Captions do not linkify, so
  // the URL is replaced by a line pointing at the profile bio, and a post needs a real
  // file — which is why the compose step offers the media the host already uploaded.
  INSTAGRAM: {
    prefillsText: false,
    linksAreClickable: false,
    needsMediaFile: true,
    hasDestinations: false,
  },
  // The easiest of the four and the one that was missing: the entire post travels in
  // the query string, so there is nothing to copy and nothing to paste.
  MESSAGING: {
    prefillsText: true,
    linksAreClickable: true,
    needsMediaFile: false,
    hasDestinations: false,
  },
  // Not a place, a fallback: the property URL on its own, for a forum or an email the
  // host writes themselves.
  LINK: {
    prefillsText: false,
    linksAreClickable: true,
    needsMediaFile: false,
    hasDestinations: false,
  },
};

export function channelCapabilities(
  channel: PromotionChannel,
): ChannelCapabilities {
  return CAPABILITIES[channel];
}

/** The already-translated lines a post is assembled from. Nothing in this module
 *  decides copy — it decides which of these lines a given channel may carry. */
export interface ChannelPostLines {
  customMessage?: string | null;
  title: string;
  description: string;
  guestsLine?: string | null;
  priceLine?: string | null;
  availabilityLine?: string | null;
  freshnessLine?: string | null;
  /** "Check availability and send an inquiry:" — dropped where a link is dead. */
  callToAction: string;
  /** "Link in bio" and its equivalents, for a channel that cannot carry a URL. */
  linkInBioLine: string;
  propertyUrl: string;
  /** The listing's city, as the host wrote it. Becomes the one hashtag Instagram
   *  gets — see `cityHashtag`. */
  city?: string | null;
}

/**
 * One hashtag, built from the city the host typed.
 *
 * Exactly one, and never invented: a generated set of "#greece #holiday #summer2026"
 * is spam a host did not write, and transliterating a Cyrillic place name into Latin
 * guesses at a spelling nobody searches. Instagram indexes Cyrillic tags perfectly
 * well, so the city goes in as written with its spaces closed up. Anything else the
 * host wants belongs in their own opening line.
 */
export function cityHashtag(city: string | null | undefined): string | null {
  if (!city) return null;
  // Punctuation would end the tag where it appears, so a city that carries any is
  // better off with no tag than with a truncated one.
  const collapsed = city.replace(/\s+/g, "");
  if (!collapsed || /[^\p{L}\p{N}_]/u.test(collapsed)) return null;
  return `#${collapsed}`;
}

/**
 * The post as this channel should carry it.
 *
 * Facebook and the messengers get what the workspace has always generated. Instagram
 * gets the same body with the two things a caption cannot use taken out — the call to
 * action and the URL beneath it — and the bio line and city tag put in their place. A
 * caption ending in an unclickable `https://…` is the single most common way a listing
 * post wastes its own last line.
 */
export function channelPostText(
  channel: PromotionChannel,
  lines: ChannelPostLines,
): string {
  if (channel === "LINK") return lines.propertyUrl;

  const capabilities = CAPABILITIES[channel];
  if (capabilities.linksAreClickable) {
    return promotionPostText({
      customMessage: lines.customMessage,
      title: lines.title,
      description: lines.description,
      guestsLine: lines.guestsLine,
      priceLine: lines.priceLine,
      availabilityLine: lines.availabilityLine,
      freshnessLine: lines.freshnessLine,
      callToAction: lines.callToAction,
      propertyUrl: lines.propertyUrl,
    });
  }

  const facts = [lines.guestsLine, lines.priceLine].filter(Boolean).join("\n");
  const dates = [lines.availabilityLine, lines.freshnessLine]
    .filter(Boolean)
    .join("\n");
  const tag = cityHashtag(lines.city);

  return [
    lines.customMessage?.trim(),
    lines.title.trim(),
    normalizeShareDescription(lines.description),
    facts,
    dates,
    lines.linkInBioLine.trim(),
    tag,
  ]
    .filter((block) => Boolean(block && block.trim()))
    .join("\n\n");
}

/** The messenger apps a `MESSAGING` post can be handed to, in the order they are
 *  offered. Viber is second rather than absent: it is the app a great many hosts in
 *  this market actually use. */
export type MessagingApp = "WHATSAPP" | "VIBER" | "TELEGRAM";

export const MESSAGING_APPS: readonly MessagingApp[] = [
  "WHATSAPP",
  "VIBER",
  "TELEGRAM",
] as const;

/**
 * A link that opens the app with the post already written.
 *
 * WhatsApp and Telegram are https addresses that fall back to their own web clients on
 * a desktop with no app installed. Viber has no web client and only a custom scheme, so
 * a browser with no Viber to hand it to does nothing at all — which is why the app
 * buttons sit beside a copy control rather than replacing it.
 */
export function messagingShareUrl(
  app: MessagingApp,
  text: string,
  propertyUrl: string,
): string {
  switch (app) {
    case "WHATSAPP":
      return `https://wa.me/?text=${encodeURIComponent(text)}`;
    case "VIBER":
      return `viber://forward?text=${encodeURIComponent(text)}`;
    case "TELEGRAM": {
      const url = new URL("https://t.me/share/url");
      url.searchParams.set("url", propertyUrl);
      // Telegram renders `text` above its own preview of `url`, so the property URL is
      // stripped from the body to keep it from appearing twice in one message.
      url.searchParams.set("text", withoutTrailingUrl(text, propertyUrl));
      return url.toString();
    }
  }
}

/** Drops a trailing copy of `url` from `text`, for a target that appends its own. */
function withoutTrailingUrl(text: string, url: string): string {
  const trimmed = text.trimEnd();
  return trimmed.endsWith(url)
    ? trimmed.slice(0, -url.length).trimEnd()
    : trimmed;
}

/**
 * The property link a channel should advertise.
 *
 * Split out because the dates a host picked belong in the URL for every channel that
 * can carry one — a guest who follows it lands on the property page with that stay
 * already selected and priced.
 */
export function channelPropertyUrl({
  origin,
  slug,
  checkIn,
  checkOut,
}: {
  origin: string;
  slug: string;
  checkIn?: string | null;
  checkOut?: string | null;
}): string {
  return propertyShareUrl({ origin, slug, checkIn, checkOut });
}
