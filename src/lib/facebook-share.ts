/**
 * Facebook's browser share composer only needs a public URL. It deliberately does not
 * receive a host's message: personal-profile text must stay under the person's control.
 */
export function facebookPropertyShareUrl(
  origin: string,
  slug: string,
  dates?: { checkIn?: string | null; checkOut?: string | null },
) {
  const propertyUrl = propertyShareUrl({
    origin,
    slug,
    checkIn: dates?.checkIn,
    checkOut: dates?.checkOut,
  });
  const shareUrl = new URL("https://www.facebook.com/sharer/sharer.php");
  shareUrl.searchParams.set("u", propertyUrl);
  return shareUrl.toString();
}

/** How much of a listing description survives into a social post. Long enough to say
 *  what the place is, short enough that Facebook does not fold it behind "See more"
 *  before the guest reaches the link. */
const POST_DESCRIPTION_LENGTH = 280;

/**
 * A listing description flattened into one social-media paragraph.
 *
 * Descriptions are authored in a textarea, so they arrive with hard line breaks,
 * double blank lines and the occasional run of spaces. Pasted into Facebook unchanged
 * they turn a post into a wall; collapsed to single spaces they read as a caption.
 * Truncation is on a word boundary — a sentence cut mid-word looks like a bug rather
 * than a summary.
 */
export function normalizeShareDescription(
  description: string,
  maxLength = POST_DESCRIPTION_LENGTH,
) {
  const clean = description.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  const cut = clean.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  // A description with no spaces in its first `maxLength` characters is not a sentence;
  // fall back to the hard cut rather than returning an empty string.
  const body = lastSpace > maxLength * 0.5 ? cut.slice(0, lastSpace) : cut;
  return `${body.replace(/[\s,;:.–-]+$/, "")}…`;
}

/**
 * The public property URL, optionally carrying the stay the host picked.
 *
 * `checkIn`/`checkOut` are the same parameters the property page already reads (see
 * `bookableStayFromSearch`), so a guest who follows the link lands with those dates
 * selected and priced instead of an empty picker. They are only added together: a
 * check-in with no check-out seeds nothing on the other end and would just be noise in
 * the URL.
 */
export function propertyShareUrl({
  origin,
  slug,
  checkIn,
  checkOut,
}: {
  origin: string;
  slug: string;
  checkIn?: string | null;
  checkOut?: string | null;
}) {
  const url = new URL(`/properties/${encodeURIComponent(slug)}`, origin);
  if (checkIn && checkOut) {
    url.searchParams.set("checkIn", checkIn);
    url.searchParams.set("checkOut", checkOut);
  }
  return url.toString();
}

export interface PromotionPostInput {
  /** The host's own opening line, above everything generated. Optional and free-form —
   *  this is where "Last-minute cancellation!" goes. */
  customMessage?: string | null;
  title: string;
  description: string;
  /** Already-formatted, already-translated lines. Nothing in this module decides copy:
   *  it decides order and spacing, so the same generator works in every language. */
  guestsLine?: string | null;
  availabilityLine?: string | null;
  freshnessLine?: string | null;
  priceLine?: string | null;
  callToAction: string;
  propertyUrl: string;
}

/**
 * The generated promotion post.
 *
 * One blank line between blocks, because that is what Facebook's composer renders as a
 * paragraph break. The availability and freshness lines sit together in a single block:
 * the freshness statement is a qualifier on the dates above it, and separating them
 * would read as an unrelated aside.
 *
 * Every optional part is omitted rather than replaced with a placeholder — a post that
 * says "Available: —" is worse than one that does not mention dates. In particular
 * nothing here invents availability; the caller supplies a line only for a range the
 * server has confirmed is bookable.
 */
export function promotionPostText({
  customMessage,
  title,
  description,
  guestsLine,
  availabilityLine,
  freshnessLine,
  priceLine,
  callToAction,
  propertyUrl,
}: PromotionPostInput) {
  const facts = [guestsLine, priceLine].filter(Boolean).join("\n");
  const dates = [availabilityLine, freshnessLine].filter(Boolean).join("\n");

  return [
    customMessage?.trim(),
    title.trim(),
    normalizeShareDescription(description),
    facts,
    dates,
    callToAction.trim(),
    propertyUrl,
  ]
    .filter((block) => Boolean(block && block.trim()))
    .join("\n\n");
}

/**
 * "1–8 October", or "28 September – 3 October" when the range crosses a month.
 *
 * Formatted from the `yyyy-MM-dd` strings the availability layer speaks, parsed as
 * local midnights so `Intl` never shifts a day across a timezone the way a UTC instant
 * would. The en dash is the range dash, and `formatRange` is not used because it would
 * introduce a second, locale-dependent separator into copy the host may edit by hand.
 */
export function formatAvailabilityRange(
  checkIn: string,
  checkOut: string,
  locale: string,
) {
  const from = localMidnight(checkIn);
  const to = localMidnight(checkOut);
  if (!from || !to) return "";

  const dayMonth = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
  });
  const dayOnly = new Intl.DateTimeFormat(locale, { day: "numeric" });

  const sameMonth =
    from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth();

  return sameMonth
    ? `${dayOnly.format(from)}–${dayMonth.format(to)}`
    : `${dayMonth.format(from)} – ${dayMonth.format(to)}`;
}

/** A single day, for the "Availability checked 30 August" freshness statement. */
export function formatCheckedOnDate(ymd: string, locale: string) {
  const date = localMidnight(ymd);
  if (!date) return "";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
  }).format(date);
}

/** `yyyy-MM-dd` as this browser's own midnight. Mirrors `ymdToLocalDate`, kept local so
 *  this module stays free of server-only imports and usable from a client component. */
function localMidnight(ymd: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}
