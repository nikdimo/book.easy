import "server-only";
import { db } from "@/lib/db";
import {
  arrivalCredentialsUnlockAt,
  arrivalGuideFromRow,
  canSeeArrivalField,
  emptyListingArrivalGuide,
  type CheckInMethod,
  type CheckoutInstruction,
  type InteractionPreference,
  type ListingArrivalGuideInput,
} from "@/lib/host/v2/listing-arrival-guide";
import {
  houseRulesFromRow,
  type ListingHouseRulesInput,
} from "@/lib/host/v2/listing-house-rules";
import { todayYmd, ymdToDbDate } from "@/lib/utils/date-only";

/**
 * The one module that reads `ListingArrivalGuide`.
 *
 * That is the containment the separate table buys, and it only holds while this stays
 * true: `wifiPassword` and `checkInMethodInstructions` open a real house, and the way to
 * keep them out of a public payload is for there to be exactly one place that can put
 * them into one. Anything that needs arrival details asks here and gets back a shape that
 * has already had the guest's entitlement applied — never the raw row.
 *
 * If a new surface needs these fields, add a reader here rather than a `select` there.
 */

/** The columns the editor reads. Shared with the server action so a field added to one is
 *  present in the other. */
export const LISTING_ARRIVAL_GUIDE_SELECT = {
  directions: true,
  checkInMethod: true,
  checkInMethodInstructions: true,
  wifiNetwork: true,
  wifiPassword: true,
  houseManual: true,
  checkoutInstructions: true,
  interactionPreference: true,
} as const;

export interface ListingArrivalGuideEditorData {
  listing: {
    id: string;
    slug: string;
    status: string;
  };
  /** Everything the nine cards render, already normalised: "" for a field the host has
   *  never filled in, null for a choice they have never made. */
  guide: ListingArrivalGuideInput;
  /**
   * The house rules, because two of the nine cards are about them: the check-in card
   * edits the three stay times and the house-rules card renders the whole rule set. They
   * are read here rather than fetched separately so the section is one round trip and the
   * two cards cannot show different values for the same listing.
   */
  rules: ListingHouseRulesInput;
  /** When the host last saved this section, or null if they never have. */
  reviewedAt: Date | null;
  /** The largest party on a stay that has not finished yet, or 0. Only used to warn on
   *  the house-rules card — see `conflictsWithBookedParty`. */
  largestUpcomingParty: number;
}

/**
 * Everything the Arrival guide section renders from.
 *
 * Scoped to `hostId` inside the query rather than checked afterwards, so a listing the
 * caller does not own comes back as "not found" instead of leaking that it exists — the
 * same shape the rest of the editor's reads use.
 *
 * A listing with no `ListingArrivalGuide` row is not an error and is not created here: a
 * host who has never opened this section has an empty guide, which is exactly what
 * `emptyListingArrivalGuide()` describes. The row is written the first time they save,
 * which keeps a read out of the business of creating rows.
 */
export async function getListingArrivalGuideEditorData(
  listingId: string,
  hostId: string,
): Promise<ListingArrivalGuideEditorData | null> {
  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId },
    select: {
      id: true,
      slug: true,
      status: true,
      checkInTime: true,
      checkInEndTime: true,
      checkOutTime: true,
      maxGuests: true,
      petPolicy: true,
      smokingPolicy: true,
      eventPolicy: true,
      quietHoursPolicy: true,
      quietHoursStart: true,
      quietHoursEnd: true,
      additionalRules: true,
      arrivalGuide: {
        select: { ...LISTING_ARRIVAL_GUIDE_SELECT, reviewedAt: true },
      },
    },
  });
  if (!listing) return null;

  // A stay is still "upcoming" on the morning a guest leaves, so the comparison is
  // against today rather than now — `checkOut` is a date column with no time on it.
  const busiest = await db.booking.aggregate({
    where: {
      listingId: listing.id,
      status: { in: ["PENDING", "CONFIRMED"] },
      checkOut: { gte: ymdToDbDate(todayYmd()) },
    },
    _max: { guestCount: true },
  });

  return {
    listing: { id: listing.id, slug: listing.slug, status: listing.status },
    guide: arrivalGuideFromRow(listing.arrivalGuide),
    rules: houseRulesFromRow(listing),
    reviewedAt: listing.arrivalGuide?.reviewedAt ?? null,
    largestUpcomingParty: busiest._max.guestCount ?? 0,
  };
}

/**
 * What one guest may read about arriving, right now.
 *
 * Every field is passed through `canSeeArrivalField` rather than returned and hidden by
 * the caller, so a field the guest has not earned is not merely unrendered — it never
 * left the server. That distinction is the whole point: a value in a props object reaches
 * the browser's page source whether or not a component chose to print it.
 *
 * `null` for a field means one of two different things, and the flags say which: the host
 * never wrote it, or the guest cannot see it yet. A guest page that could not tell those
 * apart would either nag hosts about details they had already added or leave a guest
 * wondering whether the host had forgotten the door code.
 */
export interface GuestArrivalGuide {
  directions: string | null;
  checkInMethod: CheckInMethod | null;
  checkInMethodInstructions: string | null;
  wifiNetwork: string | null;
  wifiPassword: string | null;
  houseManual: string | null;
  checkoutInstructions: CheckoutInstruction[];
  interactionPreference: InteractionPreference | null;
  /** True when the host wrote something the guest cannot see yet, so the page can say
   *  when it arrives instead of saying nothing. */
  hasWithheldDirections: boolean;
  hasWithheldCredentials: boolean;
  /** The moment the credentials become readable, for a stay that is confirmed. Null when
   *  there is nothing withheld to wait for. */
  credentialsUnlockAt: Date | null;
}

/**
 * The arrival guide for a booking, with this guest's entitlement already applied.
 *
 * `now` is a parameter so a test can stand at any point in the release schedule, and so a
 * server render and an assertion about it cannot disagree by a few milliseconds.
 */
export async function getGuestArrivalGuide(
  listingId: string,
  booking: { status: string; checkIn: Date },
  now: Date = new Date(),
): Promise<GuestArrivalGuide> {
  const row = await db.listingArrivalGuide.findUnique({
    where: { listingId },
    select: LISTING_ARRIVAL_GUIDE_SELECT,
  });
  const guide = row ? arrivalGuideFromRow(row) : emptyListingArrivalGuide();

  const see = (field: Parameters<typeof canSeeArrivalField>[0]) =>
    canSeeArrivalField(field, booking, now);
  // One decision for all four, because they are released together and a page that showed
  // the network name without the password would be worse than showing neither.
  const credentialsVisible = see("wifiPassword");
  const written = (value: string) => (value === "" ? null : value);

  return {
    directions: see("directions") ? written(guide.directions) : null,
    checkInMethod: guide.checkInMethod,
    checkInMethodInstructions: credentialsVisible
      ? written(guide.checkInMethodInstructions)
      : null,
    wifiNetwork: credentialsVisible ? written(guide.wifiNetwork) : null,
    wifiPassword: credentialsVisible ? written(guide.wifiPassword) : null,
    houseManual: credentialsVisible ? written(guide.houseManual) : null,
    checkoutInstructions: guide.checkoutInstructions,
    interactionPreference: guide.interactionPreference,
    hasWithheldDirections: !see("directions") && guide.directions !== "",
    hasWithheldCredentials:
      !credentialsVisible &&
      (guide.checkInMethodInstructions !== "" ||
        guide.wifiNetwork !== "" ||
        guide.wifiPassword !== "" ||
        guide.houseManual !== ""),
    credentialsUnlockAt: credentialsVisible
      ? null
      : arrivalCredentialsUnlockAt(booking.checkIn),
  };
}

/**
 * The public half of an arrival guide — what anybody may read before they book.
 *
 * Deliberately a different function from `getGuestArrivalGuide` rather than the same one
 * called with no booking. A public listing page must not be one wrong argument away from
 * a door code, and the surest way to guarantee that is for the function it calls to have
 * no access to the secret columns at all: this `select` does not name them.
 */
export async function getPublicArrivalGuide(listingId: string): Promise<{
  checkInMethod: CheckInMethod | null;
  checkoutInstructions: CheckoutInstruction[];
  interactionPreference: InteractionPreference | null;
} | null> {
  const row = await db.listingArrivalGuide.findUnique({
    where: { listingId },
    select: {
      checkInMethod: true,
      checkoutInstructions: true,
      interactionPreference: true,
    },
  });
  if (!row) return null;
  const guide = arrivalGuideFromRow({
    ...emptyRowShape(),
    checkInMethod: row.checkInMethod,
    checkoutInstructions: row.checkoutInstructions,
    interactionPreference: row.interactionPreference,
  });
  return {
    checkInMethod: guide.checkInMethod,
    checkoutInstructions: guide.checkoutInstructions,
    interactionPreference: guide.interactionPreference,
  };
}

/** The secret columns as absent, so the public read can reuse the same row mapper without
 *  ever having selected them. */
function emptyRowShape() {
  return {
    directions: null,
    checkInMethodInstructions: null,
    wifiNetwork: null,
    wifiPassword: null,
    houseManual: null,
  };
}
