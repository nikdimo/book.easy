/**
 * Who is actually coming on a booking.
 *
 * The picker has always collected four numbers — adults, children, infants and pets —
 * and the booking has always stored one: `guestCount`. This module is the single place
 * that says what those numbers mean, so the server rule, the screens that print the
 * party and the mobile API cannot drift apart on it.
 *
 * Two rules, and they are the whole model:
 *
 *   1. **Capacity is adults + children.** That sum is `guestCount`, it is what
 *      `maxGuests` is checked against, and it is what pricing and search already work
 *      from. Infants and pets never enter it — a cot is not a bed and a dog is not a
 *      guest — so nothing here ever adds them in.
 *   2. **Infants and pets are still facts the host needs.** Cleaning, access, a cot,
 *      the other guests. They ride alongside the count rather than inside it.
 *
 * Kept free of i18n, React and Prisma so the same rules run in the booking service, in
 * server components, in client components and in tests.
 */

export const BOOKING_PARTY_KINDS = [
  "adults",
  "children",
  "infants",
  "pets",
] as const;
export type BookingPartyKind = (typeof BOOKING_PARTY_KINDS)[number];

/**
 * The ceiling any single counter may hold.
 *
 * Matches `MAX_GUESTS_MAX` in the house rules — the largest party a listing can declare
 * capacity for — so a request cannot carry a number the listing form could never have
 * produced. Applied per counter and again to adults + children, which is the one that
 * has to stay inside the range `guestCount` has always been validated against.
 */
export const BOOKING_PARTY_COUNT_MAX = 20;

export interface BookingParty {
  adults: number;
  children: number;
  infants: number;
  pets: number;
}

/** The party as it arrives from a caller: only `adults` has to be stated. */
export interface BookingPartyInput {
  adults: number;
  children?: number;
  infants?: number;
  pets?: number;
}

export function normalizeBookingParty(input: BookingPartyInput): BookingParty {
  return {
    adults: input.adults,
    children: input.children ?? 0,
    infants: input.infants ?? 0,
    pets: input.pets ?? 0,
  };
}

/**
 * The capacity number: adults + children, and never the other two.
 *
 * This is the value that becomes `Booking.guestCount`, so every existing rule reading
 * that column keeps comparing exactly what it always compared.
 */
export function bookingPartyOccupancy(party: BookingParty): number {
  return party.adults + party.children;
}

export type BookingPartyIssue =
  /** A party with nobody old enough to hold the booking. Infants and pets cannot. */
  | "NO_ADULTS"
  | "COUNT_OUT_OF_RANGE"
  /** A pet at a listing whose house rules say no. `ASK_HOST` is a conversation rather
   *  than a refusal, so only an outright `NOT_ALLOWED` raises this. */
  | "PETS_NOT_ALLOWED";

/**
 * Everything wrong with a party, independent of any listing capacity check.
 *
 * `petsAllowed` is resolved by the caller from the listing's own house-rules snapshot —
 * this module deliberately does not know the policy enum, so there is no second
 * interpretation of `ASK_HOST` living here.
 */
export function bookingPartyIssues(
  party: BookingParty,
  options: { petsAllowed: boolean },
): BookingPartyIssue[] {
  const issues: BookingPartyIssue[] = [];
  const counts = [party.adults, party.children, party.infants, party.pets];
  if (
    counts.some(
      (count) =>
        !Number.isInteger(count) || count < 0 || count > BOOKING_PARTY_COUNT_MAX,
    ) ||
    bookingPartyOccupancy(party) > BOOKING_PARTY_COUNT_MAX
  ) {
    issues.push("COUNT_OUT_OF_RANGE");
  }
  if (!(party.adults >= 1)) issues.push("NO_ADULTS");
  if (!options.petsAllowed && party.pets > 0) issues.push("PETS_NOT_ALLOWED");
  return issues;
}

/** The stored columns exactly as Prisma hands them back. */
export interface BookingPartyRow {
  guestCount: number;
  adults: number | null;
  children: number | null;
  infants: number | null;
  pets: number | null;
}

/**
 * What a booking row says about its party.
 *
 * `recorded: false` is the honest answer for every booking taken before the four
 * columns existed: those rows hold NULL, and NULL is not zero. A reader must not print
 * "0 infants, 0 pets" for a guest who was never asked — it shows the guest count that
 * booking has always had and stops there.
 *
 * `adults` is the discriminator rather than all four together: the service refuses a
 * party without an adult, so a recorded party always has one, and a row that has one
 * has been through that rule.
 */
export type ResolvedBookingParty =
  | ({ recorded: true; guestCount: number } & BookingParty)
  | { recorded: false; guestCount: number };

export function resolveBookingParty(row: BookingPartyRow): ResolvedBookingParty {
  if (typeof row.adults !== "number" || row.adults < 1) {
    return { recorded: false, guestCount: row.guestCount };
  }
  return {
    recorded: true,
    guestCount: row.guestCount,
    adults: row.adults,
    children: row.children ?? 0,
    infants: row.infants ?? 0,
    pets: row.pets ?? 0,
  };
}

export interface BookingPartySegment {
  kind: BookingPartyKind;
  count: number;
}

/** The non-empty parts of a party, in the order the picker asks for them. A count of
 *  zero is left out rather than printed: "0 pets" is noise on every booking without
 *  one. */
export function bookingPartySegments(party: BookingParty): BookingPartySegment[] {
  return BOOKING_PARTY_KINDS.map((kind) => ({ kind, count: party[kind] })).filter(
    (segment) => segment.count > 0,
  );
}

/**
 * The parts `guestCount` does not already say.
 *
 * A party of three adults is "3 guests" twice over, so it returns nothing and the
 * screen prints the count on its own. Anything else — children, an infant, a pet —
 * gets spelled out beneath it. An unrecorded party returns nothing at all, which is
 * what keeps a pre-migration booking rendering exactly as it always did.
 */
export function bookingPartyDetailSegments(
  party: ResolvedBookingParty,
): BookingPartySegment[] {
  if (!party.recorded) return [];
  const segments = bookingPartySegments(party);
  return segments.length > 1 ? segments : [];
}

/**
 * The i18n keys the four counters are printed under, and the English they fall back to.
 *
 * These are the same keys `booking-widget.tsx` resolves inline, and the widget's
 * literal `i18n.plural(...)` calls are what registers them in the extracted catalog.
 * Written as data here on purpose: a second set of literals would be a second catalog
 * entry for the same key, and the extractor rejects two different sources under one
 * key. The sources below must therefore stay identical to the widget's.
 */
const PARTY_LABEL_SOURCES: Record<
  BookingPartyKind,
  { key: string; one: string; other: string }
> = {
  adults: { key: "booking.adults", one: "{n} adult", other: "{n} adults" },
  children: { key: "booking.children", one: "{n} child", other: "{n} children" },
  infants: { key: "booking.infants", one: "{n} infant", other: "{n} infants" },
  pets: { key: "booking.pets", one: "{n} pet", other: "{n} pets" },
};

/** The half of a translator this module needs. Both the server `Translator` and the
 *  client `useI18n()` value satisfy it, so one helper serves both kinds of screen. */
export interface BookingPartyTranslator {
  locale: string;
  resolve(key: string, source: string): { text: string; translated: boolean };
}

export function bookingPartySegmentLabel(
  translator: BookingPartyTranslator,
  segment: BookingPartySegment,
): { text: string; translated: boolean } {
  const label = PARTY_LABEL_SOURCES[segment.kind];
  const category = new Intl.PluralRules(translator.locale).select(segment.count);
  const resolved = translator.resolve(
    `${label.key}.${category}`,
    category === "one" ? label.one : label.other,
  );
  return {
    text: resolved.text.replace("{n}", String(segment.count)),
    translated: resolved.translated,
  };
}

/**
 * The party as one line — "2 adults, 1 child, 1 infant, 1 pet" — or null when there is
 * nothing the guest count does not already say.
 */
export function bookingPartyDetailLine(
  translator: BookingPartyTranslator,
  party: ResolvedBookingParty,
): { text: string; translated: boolean } | null {
  const segments = bookingPartyDetailSegments(party);
  if (segments.length === 0) return null;
  const parts = segments.map((segment) =>
    bookingPartySegmentLabel(translator, segment),
  );
  return {
    text: parts.map((part) => part.text).join(", "),
    translated: parts.every((part) => part.translated),
  };
}

/** The party as the mobile API carries it: four plain numbers, or null for a booking
 *  whose party was never recorded. Null rather than zeroes for the same reason the
 *  columns are nullable — a client must be able to tell "no pets" from "never asked". */
export function bookingPartyPayload(
  party: ResolvedBookingParty,
): BookingParty | null {
  return party.recorded
    ? {
        adults: party.adults,
        children: party.children,
        infants: party.infants,
        pets: party.pets,
      }
    : null;
}
