/**
 * What a booking actually costs, resolved once.
 *
 * `Booking.totalPrice` and the frozen `Booking.priceBreakdown` are the authoritative
 * record. `Booking.nightlyRate` is not: `createBooking` stores
 * `round(discountedAccommodationCents / nights)`, a rounded *average* kept for
 * compatibility. Three nights at 100 / 100 / 101 store `100.33` against a `301.00`
 * total, so `nightlyRate * nights` reconstructs `300.99` — off by a cent, and off by
 * more the longer and more uneven the stay. Every surface that multiplied it was
 * printing a receipt whose lines did not add up (audit L2).
 *
 * This module is the single place that answers "what were the nights worth?", so the
 * guest page, the host page, the confirmation page, the host reservation panel and the
 * mobile API cannot drift apart on it.
 *
 * Two figures come out of it, and they are for different jobs:
 *
 *   - **`accommodationSubtotal`** — a real amount, net of promotions. Add it to
 *     `cleaningFee` and `serviceFee` and you get `totalPrice` exactly.
 *   - **`averageNightlyRate`** — a derived average, for a line labelled *"Average per
 *     night"* and nothing else. Never multiply it.
 *
 * The gross pair (`originalAccommodationSubtotal`, `originalCleaningFee`) exists for
 * receipts that itemise the promotion on its own line: gross + gross - discount +
 * service fee is the same total, and that is the only arrangement in which a discount
 * row is honest. A receipt showing the *net* figures **and** a discount row subtracts
 * the promotion twice.
 *
 * Kept free of Prisma, React and i18n so the same rules run on the server, in client
 * components and in tests.
 */

/** Where `accommodationSubtotal` came from. */
export type BookingAccommodationSource =
  /** The frozen `priceBreakdown` — what the guest was actually quoted. */
  | "BREAKDOWN"
  /** Derived from the stored totals, for a booking taken before the breakdown existed
   *  (or one whose breakdown does not reconcile with its own total). */
  | "DERIVED";

/**
 * A booking's money columns as they arrive from Prisma.
 *
 * Everything is `unknown` because `Decimal`, `string` and `number` all turn up on these
 * columns depending on the caller, and coercing here beats making five call sites
 * remember to.
 */
export interface BookingPricingInput {
  currency: string;
  totalPrice: unknown;
  cleaningFee: unknown;
  serviceFee?: unknown;
  discountAmount?: unknown;
  numberOfNights: number;
  /** Compatibility only; never multiplied. Present so callers can pass the row whole. */
  nightlyRate?: unknown;
  priceBreakdown?: unknown;
}

export interface BookingPricing {
  currency: string;
  nights: number;
  /** Authoritative. Every other figure here is reconciled against it. */
  totalPrice: number;
  /** Net of promotions. `+ cleaningFee + serviceFee === totalPrice`. */
  accommodationSubtotal: number;
  /** Net of promotions, as stored. */
  cleaningFee: number;
  serviceFee: number;
  discountAmount: number;
  /** Before promotions. Equal to the net figure when nothing was discounted. */
  originalAccommodationSubtotal: number;
  /** Before promotions. Equal to the net figure when nothing was discounted. */
  originalCleaningFee: number;
  /** `accommodationSubtotal / nights`, rounded to the cent. Display only. */
  averageNightlyRate: number;
  source: BookingAccommodationSource;
}

const CENTS = 100;

function toCents(value: number): number {
  return Math.round(value * CENTS);
}

function fromCents(cents: number): number {
  return Math.round(cents) / CENTS;
}

/**
 * A money column as a number, or null when it is not money.
 *
 * `Decimal` stringifies to a plain decimal and coerces cleanly; anything that does not
 * land on a finite number is treated as absent rather than as zero, because a missing
 * fee and a zero fee are different answers and only one of them may be invented.
 */
function money(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Same, but an absent or unusable column reads as zero — right for the fee columns,
 *  which are `NOT NULL DEFAULT 0` and where "no fee" genuinely is zero. */
function feeCents(value: unknown): number {
  const parsed = money(value);
  return parsed === null ? 0 : toCents(parsed);
}

/** One numeric field of `priceBreakdown`, or null when it is absent or not a number. */
function breakdownNumber(
  breakdown: Record<string, unknown>,
  key: string,
): number | null {
  const parsed = money(breakdown[key]);
  return parsed === null || parsed < 0 ? null : parsed;
}

/**
 * `priceBreakdown` as an object, or null.
 *
 * The column is `Json`, so it can hold a string, an array or `null` as easily as the
 * shape written by `createBooking`. Anything that is not a plain object is no breakdown.
 */
function asBreakdown(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      return asBreakdown(JSON.parse(value) as unknown);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function resolveAccommodation(args: {
  breakdown: Record<string, unknown> | null;
  totalCents: number;
  serviceCents: number;
  storedCleaningCents: number;
  storedDiscountCents: number;
}): {
  accommodationCents: number;
  cleaningCents: number;
  accommodationDiscountCents: number;
  cleaningDiscountCents: number;
  discountCents: number;
  source: BookingAccommodationSource;
} {
  const { breakdown, totalCents, serviceCents } = args;

  if (breakdown) {
    const accommodation = breakdownNumber(breakdown, "accommodationSubtotal");
    if (accommodation !== null) {
      const accommodationCents = toCents(accommodation);
      const cleaning = breakdownNumber(breakdown, "cleaningFee");
      const cleaningCents =
        cleaning === null ? args.storedCleaningCents : toCents(cleaning);
      const accommodationDiscount = breakdownNumber(
        breakdown,
        "accommodationDiscount",
      );
      const cleaningDiscount = breakdownNumber(breakdown, "cleaningDiscount");
      const accommodationDiscountCents =
        accommodationDiscount === null ? 0 : toCents(accommodationDiscount);
      const cleaningDiscountCents =
        cleaningDiscount === null ? 0 : toCents(cleaningDiscount);
      // All persisted quote amounts are already stored at currency precision. Require
      // exact reconciliation after converting them to cents; accepting a one-cent
      // mismatch would preserve the very receipt inconsistency this resolver exists
      // to eliminate.
      if (accommodationCents + cleaningCents + serviceCents === totalCents) {
        return {
          accommodationCents,
          cleaningCents,
          accommodationDiscountCents,
          cleaningDiscountCents,
          discountCents: accommodationDiscountCents + cleaningDiscountCents,
          source: "BREAKDOWN",
        };
      }
    }
  }

  // Legacy: no usable breakdown. The nights are whatever the total has left after the
  // fees it is known to contain, and the promotion — which the stored columns record as
  // one number — is attributed entirely to them. That is the only split the stored
  // columns support, and it reconciles by construction.
  const accommodationCents = Math.max(
    0,
    totalCents - args.storedCleaningCents - serviceCents,
  );
  return {
    accommodationCents,
    cleaningCents: args.storedCleaningCents,
    accommodationDiscountCents: args.storedDiscountCents,
    cleaningDiscountCents: 0,
    discountCents: args.storedDiscountCents,
    source: "DERIVED",
  };
}

/**
 * Resolve one booking's price lines.
 *
 * The breakdown is used when it is present *and* reconciles against `totalPrice`;
 * otherwise the stored totals are. Either way the returned figures add up.
 */
export function resolveBookingPricing(
  booking: BookingPricingInput,
): BookingPricing {
  const nights = Number.isFinite(booking.numberOfNights)
    ? Math.max(0, Math.trunc(booking.numberOfNights))
    : 0;
  const totalCents = Math.max(0, feeCents(booking.totalPrice));
  // Legacy or manually repaired rows can contain components larger than the payable
  // total. The total remains authoritative, so cap known fees deterministically before
  // assigning the remainder to accommodation. This keeps even the fallback result
  // internally reconcilable instead of returning (for example) 0 + 25 against a total
  // of 10.
  const serviceCents = Math.min(
    Math.max(0, feeCents(booking.serviceFee)),
    totalCents,
  );
  const storedCleaningCents = Math.min(
    Math.max(0, feeCents(booking.cleaningFee)),
    totalCents - serviceCents,
  );
  const storedDiscountCents = Math.max(0, feeCents(booking.discountAmount));

  const resolved = resolveAccommodation({
    breakdown: asBreakdown(booking.priceBreakdown),
    totalCents,
    serviceCents,
    storedCleaningCents,
    storedDiscountCents,
  });

  return {
    currency: booking.currency,
    nights,
    totalPrice: fromCents(totalCents),
    accommodationSubtotal: fromCents(resolved.accommodationCents),
    cleaningFee: fromCents(resolved.cleaningCents),
    serviceFee: fromCents(serviceCents),
    discountAmount: fromCents(resolved.discountCents),
    originalAccommodationSubtotal: fromCents(
      resolved.accommodationCents + resolved.accommodationDiscountCents,
    ),
    originalCleaningFee: fromCents(
      resolved.cleaningCents + resolved.cleaningDiscountCents,
    ),
    averageNightlyRate:
      nights > 0
        ? fromCents(Math.round(resolved.accommodationCents / nights))
        : 0,
    source: resolved.source,
  };
}
