/**
 * Which channel a calendar came from, read from its own URL.
 *
 * The feed's `name` is free text the host typed when they connected it — "Airbnb",
 * "airbnb 2", "Mum's cottage" — so it identifies the feed to its owner and nothing more.
 * Putting a channel's mark beside it on the strength of that name would be showing a
 * brand because someone typed six letters.
 *
 * The URL is different. Hosts do not compose these by hand; they copy them out of the
 * channel, and each channel serves them from its own domain. Matching the registered
 * domain is therefore evidence rather than a guess — and where it matches nothing this
 * says so, because "some other calendar" is a true answer and "Airbnb" would not be.
 *
 * For an imported *block*, this is resolved on the server and the URL never sent
 * onward: a feed URL carries the private token that reads the host's real calendar, and
 * the calendar grid has no use for it. The connections panel runs the same matcher in
 * the browser on a URL the host is in the middle of pasting, which is theirs already.
 */

export type CalendarPlatform = "AIRBNB" | "BOOKING" | "VRBO";

/** What each channel calls itself. Proper nouns: never translated. */
export const PLATFORM_LABEL: Record<CalendarPlatform, string> = {
  AIRBNB: "Airbnb",
  BOOKING: "Booking.com",
  VRBO: "Vrbo",
};

/**
 * The registered name each channel serves calendars from, without its ending.
 *
 * Written without the top-level domain on purpose: Airbnb serves the same host a feed
 * from `airbnb.com`, `airbnb.co.uk` or `airbnb.com.au` depending on where they signed
 * up, and enumerating endings would leave the tenth country unrecognised. Vrbo's
 * European sites still carry their pre-acquisition names, which is why they are listed
 * as themselves rather than as spellings of "vrbo".
 */
const PLATFORM_DOMAINS: Array<{ platform: CalendarPlatform; names: string[] }> = [
  { platform: "AIRBNB", names: ["airbnb"] },
  { platform: "BOOKING", names: ["booking"] },
  { platform: "VRBO", names: ["vrbo", "homeaway", "abritel", "fewo-direkt", "stayz"] },
];

/**
 * The registered part of a host name — "airbnb" out of `www.airbnb.co.uk`.
 *
 * Matching this rather than a suffix of the whole string is what keeps the answer
 * evidence: `notairbnb.com` and `airbnb.com.example.net` both contain the word and
 * neither is Airbnb, and only the registered label can tell you so. The ending is taken
 * to be one short label, or two where the second is also short — the shape of `co.uk`
 * and `com.au` — which is all this needs to decide, since a wrong reading here means no
 * chip rather than the wrong one.
 */
function registeredName(host: string): string | null {
  const labels = host.split(".").filter(Boolean);
  if (labels.length < 2) return null;
  const isEnding = (label: string) => label.length <= 3 && /^[a-z]+$/.test(label);

  let index = labels.length - 1;
  if (!isEnding(labels[index])) return null;
  // Only treat a second short label as part of the ending while something is still
  // left in front of it — otherwise `abritel.fr` would have no name at all.
  if (index >= 2 && isEnding(labels[index - 1])) index -= 1;
  return labels[index - 1] ?? null;
}

export function platformFromFeedUrl(url: string | null | undefined): CalendarPlatform | null {
  if (!url) return null;
  let name: string | null;
  try {
    name = registeredName(new URL(url).hostname.toLowerCase());
  } catch {
    // A stored value that is not a URL identifies nothing. It cannot reach the sync
    // either, so the calendar simply has no channel to name.
    return null;
  }
  if (!name) return null;
  return (
    PLATFORM_DOMAINS.find((entry) => entry.names.includes(name))?.platform ?? null
  );
}

/**
 * What to call a calendar the host did not name.
 *
 * A host pasting an Airbnb link should not also have to type the word "Airbnb"; where
 * the URL says which channel it is, that is the name, and where it does not, the row
 * still needs something to be called.
 */
export function defaultFeedName(url: string): string {
  const platform = platformFromFeedUrl(url);
  return platform ? PLATFORM_LABEL[platform] : "Connected calendar";
}
