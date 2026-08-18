import { addDaysToYmd } from "@/lib/utils/date-only";
import {
  parseLocalYmd,
  selectApplicablePromotion,
  type StayPromotion,
} from "@/lib/utils/stay-pricing";
import type { CalendarSelection } from "./calendar-selection";
import type { ProposedPromotion } from "./calendar-quote";
import type {
  HostCalendarListing,
  HostCalendarPromotion,
} from "./calendar-types";

/**
 * Which offer a guest actually gets, at every stay length.
 *
 * Offers stack. A listing can carry an always-active 10% for stays of ten nights, a 20%
 * for twenty, and a dated offer on one week in August, and only ever *one* of them
 * reaches the guest. Which one is decided by rules the host cannot see, and the panel
 * used to guess at them — it told hosts a new dated offer "will take priority", which is
 * simply untrue against another dated offer with a bigger discount.
 *
 * So nothing here reimplements the rules. It asks `selectApplicablePromotion` — the same
 * function the booking transaction prices with — once per stay length, and groups the
 * answers into bands. If the rules ever change, this follows them.
 *
 * Splitting an offer to make room for another was considered and rejected. A dated offer
 * only applies when the guest's whole stay fits inside it, so cutting a month-long offer
 * in two to fit a three-night one would silently kill every long stay that spans the gap
 * — the exact stays a long-stay discount exists for.
 */

/**
 * How far the bands are computed. Long-stay offers are the reason this is not, say, ten:
 * a "30% for 15 nights or more" offer has to be visible on the ladder that explains it.
 */
export const PROMOTION_BAND_HORIZON = 30;

/** The id a not-yet-saved offer is given, so it can be ranked against saved ones. */
export const DRAFT_PROMOTION_ID = "__draft__";

export interface PromotionBand {
  /** Fewest nights at which this offer wins. */
  fromNights: number;
  /** Most nights at which it still wins; `openEnded` when it runs to the horizon. */
  toNights: number;
  openEnded: boolean;
  promotionId: string;
  discountPercent: number;
  freeCleaning: boolean;
  /** True when the winner is the offer the host is drafting right now. */
  draft: boolean;
  /** True when the winner runs on every date rather than a range. */
  evergreen: boolean;
}

function toStayPromotion(promotion: HostCalendarPromotion): StayPromotion {
  return {
    id: promotion.id,
    type: promotion.type,
    discountPercent: promotion.discountPercent,
    minimumNights: promotion.minimumNights,
    freeCleaning: promotion.freeCleaning,
    roundToWholeUnit: promotion.roundToWholeUnit,
    startDate: promotion.startDate ? parseLocalYmd(promotion.startDate) : null,
    endDate: promotion.endDate ? parseLocalYmd(promotion.endDate) : null,
    createdAt: promotion.createdAt,
  };
}

/**
 * Bands for a guest checking in on the first selected night.
 *
 * One arrival date, varying stay length: that is the only reading a host can picture,
 * and it makes the check-in/check-out pair the eligibility rules need concrete. A stay
 * shorter than the selection stays inside it; a longer one runs past its end, which is
 * exactly when a dated offer stops applying and the always-active ones take over.
 */
export function promotionBands(input: {
  listing: HostCalendarListing;
  selection: CalendarSelection;
  draft: ProposedPromotion | null;
  horizon?: number;
}): PromotionBand[] {
  return selectionLadder(input).flatMap((row) => row.bands);
}

/** The always-active offers, in the order the ladder screen lists them. */
export function evergreenPromotions(
  listing: HostCalendarListing,
): HostCalendarPromotion[] {
  return listing.promotions.filter(
    (promotion) => !promotion.startDate && !promotion.endDate,
  );
}

/**
 * Bands for the all-dates screen, where there is no selection to measure against.
 *
 * Only always-active offers are ranked. Whether a dated offer applies depends on dates
 * this screen is not about, and including one would let it shadow a ladder that claims
 * to describe every date.
 */
export function evergreenBands(input: {
  listing: HostCalendarListing;
  draft: ProposedPromotion | null;
  today: string;
  horizon?: number;
}): PromotionBand[] {
  return evergreenLadder(input).flatMap((row) => row.bands);
}

/**
 * One offer, with the stay lengths it wins.
 *
 * A row exists for every offer in scope whether or not it wins anything, which is the
 * difference between this and a plain list of bands. An offer that another one shadows
 * everywhere produces no band at all, and a screen built from bands alone would leave it
 * invisible — and therefore uneditable, since the row is how a host opens it. The offer
 * a host most needs to reach is precisely the one doing nothing.
 */
export interface PromotionRow {
  promotionId: string;
  discountPercent: number;
  freeCleaning: boolean;
  minimumNights: number;
  evergreen: boolean;
  draft: boolean;
  /** Empty when another offer beats this one at every stay length examined. */
  bands: PromotionBand[];
  /**
   * The minimum is longer than the range examined, so nothing can be said about where
   * it wins. Distinct from losing everywhere: it may well apply, only to stays longer
   * than this screen looks at.
   */
  beyondHorizon: boolean;
}

interface Candidate {
  stay: StayPromotion;
  minimumNights: number;
  evergreen: boolean;
  draft: boolean;
}

/** The offers in scope, the draft among them, ready to be ranked. */
function candidates({
  listing,
  selection,
  draft,
  evergreenOnly,
}: {
  listing: HostCalendarListing;
  selection: CalendarSelection | null;
  draft: ProposedPromotion | null;
  evergreenOnly: boolean;
}): Candidate[] {
  const saved = (
    evergreenOnly ? evergreenPromotions(listing) : listing.promotions
  ).filter(
    (promotion) => !draft?.promotionId || promotion.id !== draft.promotionId,
  );

  const list: Candidate[] = saved.map((promotion) => ({
    stay: toStayPromotion(promotion),
    minimumNights: promotion.minimumNights ?? 1,
    evergreen: !promotion.startDate && !promotion.endDate,
    draft: false,
  }));

  if (draft && (draft.discountPercent > 0 || draft.freeCleaning)) {
    const dated = !evergreenOnly && selection !== null;
    list.push({
      stay: {
        id: DRAFT_PROMOTION_ID,
        type: "PERCENT_DISCOUNT",
        discountPercent: draft.discountPercent,
        minimumNights: draft.minimumNights,
        freeCleaning: draft.freeCleaning,
        roundToWholeUnit: draft.roundToWholeUnit,
        startDate: dated && selection ? parseLocalYmd(selection.start) : null,
        endDate:
          dated && selection
            ? parseLocalYmd(addDaysToYmd(selection.end, 1))
            : null,
        // Newest, so a draft that ties with a saved offer on every other rule wins —
        // which is what saving it would make true.
        createdAt: new Date().toISOString(),
      },
      minimumNights: draft.minimumNights,
      evergreen: !dated,
      draft: true,
    });
  }
  return list;
}

/** Group the winner at each stay length into runs. */
function bandsOf(
  candidateList: Candidate[],
  startDate: string,
  maxNights: number,
): PromotionBand[] {
  if (candidateList.length === 0) return [];
  const stays = candidateList.map((candidate) => candidate.stay);
  const byId = new Map(
    candidateList.map((candidate) => [candidate.stay.id ?? "", candidate]),
  );
  const checkIn = parseLocalYmd(startDate);
  const bands: PromotionBand[] = [];

  for (let nights = 1; nights <= maxNights; nights += 1) {
    const checkOut = parseLocalYmd(addDaysToYmd(startDate, nights));
    const winner = selectApplicablePromotion(stays, checkIn, checkOut, nights);
    if (!winner?.id) continue;
    const last = bands[bands.length - 1];
    if (last && last.promotionId === winner.id && last.toNights === nights - 1) {
      last.toNights = nights;
      continue;
    }
    bands.push({
      fromNights: nights,
      toNights: nights,
      openEnded: false,
      promotionId: winner.id,
      discountPercent: winner.discountPercent ?? 0,
      freeCleaning: Boolean(winner.freeCleaning),
      draft: winner.id === DRAFT_PROMOTION_ID,
      evergreen: byId.get(winner.id)?.evergreen ?? false,
    });
  }

  const last = bands[bands.length - 1];
  // A band still winning at the horizon has no upper end to report; saying "20–30
  // nights" of an offer that runs for ever would be a limit this panel invented.
  if (last && last.toNights === maxNights) last.openEnded = true;
  return bands;
}

/** Every offer in scope, shortest minimum first, each carrying the bands it wins. */
function ladderOf(
  candidateList: Candidate[],
  bands: PromotionBand[],
  maxNights: number,
): PromotionRow[] {
  return candidateList
    .map((candidate) => ({
      promotionId: candidate.stay.id ?? "",
      discountPercent: candidate.stay.discountPercent ?? 0,
      freeCleaning: Boolean(candidate.stay.freeCleaning),
      minimumNights: candidate.minimumNights,
      evergreen: candidate.evergreen,
      draft: candidate.draft,
      bands: bands.filter(
        (band) => band.promotionId === (candidate.stay.id ?? ""),
      ),
      beyondHorizon: candidate.minimumNights > maxNights,
    }))
    .sort((left, right) => left.minimumNights - right.minimumNights);
}

function horizonFor(listing: HostCalendarListing, horizon: number): number {
  return Math.min(horizon, listing.pricing?.maxNights ?? horizon);
}

/** The offers on the selected dates, each with the stay lengths it wins. */
export function selectionLadder({
  listing,
  selection,
  draft,
  horizon = PROMOTION_BAND_HORIZON,
}: {
  listing: HostCalendarListing;
  selection: CalendarSelection;
  draft: ProposedPromotion | null;
  horizon?: number;
}): PromotionRow[] {
  const list = candidates({ listing, selection, draft, evergreenOnly: false });
  const maxNights = horizonFor(listing, horizon);
  return ladderOf(list, bandsOf(list, selection.start, maxNights), maxNights);
}

/** The always-active offers, each with the stay lengths it wins. */
export function evergreenLadder({
  listing,
  draft,
  today,
  horizon = PROMOTION_BAND_HORIZON,
}: {
  listing: HostCalendarListing;
  draft: ProposedPromotion | null;
  today: string;
  horizon?: number;
}): PromotionRow[] {
  const list = candidates({
    listing,
    selection: null,
    draft,
    evergreenOnly: true,
  });
  const maxNights = horizonFor(listing, horizon);
  return ladderOf(list, bandsOf(list, today, maxNights), maxNights);
}


/**
 * The saved always-active offer this draft would collide with.
 *
 * `saveEvergreenPromotionForManagedListing` refuses two offers that run on every date
 * and start at the same stay length — with nothing to tell them apart, one could only
 * ever shadow the other. Found here so the editor can say so before the host saves,
 * rather than letting the server refuse afterwards.
 */
export function evergreenMinimumClash({
  listing,
  draft,
}: {
  listing: HostCalendarListing;
  draft: ProposedPromotion | null;
}): HostCalendarPromotion | null {
  if (!draft) return null;
  return (
    evergreenPromotions(listing).find(
      (promotion) =>
        promotion.id !== draft.promotionId &&
        (promotion.minimumNights ?? 1) === draft.minimumNights,
    ) ?? null
  );
}

/**
 * Why the offer being drafted would never reach a guest.
 *
 * `NEVER_WINS` is the one the old panel got wrong: an offer can be saved, be perfectly
 * valid, sit on exactly the right dates, and still lose to something already running.
 */
export type PromotionDraftProblem =
  | { code: "NO_BENEFIT" }
  /** The minimum is longer than the selection, so these dates alone cannot earn it. */
  | { code: "MINIMUM_ABOVE_SELECTION"; minimumNights: number; nights: number }
  | { code: "NEVER_WINS"; discountPercent: number; winnerIsEvergreen: boolean };

export function promotionDraftProblem({
  draft,
  bands,
  nights,
}: {
  draft: ProposedPromotion | null;
  bands: PromotionBand[];
  /** Nights in the selection. */
  nights: number;
}): PromotionDraftProblem | null {
  if (!draft) return null;
  if (draft.discountPercent <= 0 && !draft.freeCleaning) {
    return { code: "NO_BENEFIT" };
  }
  if (draft.minimumNights > nights) {
    return {
      code: "MINIMUM_ABOVE_SELECTION",
      minimumNights: draft.minimumNights,
      nights,
    };
  }
  if (!bands.some((band) => band.draft)) {
    const winner = bands.find(
      (band) => nights >= band.fromNights && nights <= band.toNights,
    );
    return {
      code: "NEVER_WINS",
      discountPercent: winner?.discountPercent ?? 0,
      winnerIsEvergreen: winner?.evergreen ?? false,
    };
  }
  return null;
}
