"use client";

import { interpolate, type useI18n } from "@/lib/i18n/client";
import type { Resolved } from "@/lib/i18n/t";
import {
  formatMoney as formatMoneyExactFromSnapshot,
  formatMoneyRounded as formatMoneyRoundedFromSnapshot,
  type CalendarFormats,
} from "@/lib/host/v2/calendar-format";
import type {
  HostCalendarDay,
  SelectionStayBookability,
} from "@/lib/host/v2/calendar-model";
import type {
  HostListingDiscoverability,
  HostListingStatusSummary,
  HostListingVisibility,
  ListingSaleBlocker,
  PublishBlocker,
} from "@/lib/host/v2/listing-status";
import type {
  Consequence,
  ReviewError,
  ReviewField,
  ReviewValue,
  SaveAction,
} from "@/lib/host/v2/calendar-review";
import type {
  WorkbenchCta,
  WorkbenchEditor,
  WorkbenchScope,
} from "@/lib/host/v2/calendar-workbench";
import type {
  ScheduledChangeKind,
  ScheduledFilter,
  ScheduledProtection,
} from "@/lib/host/v2/calendar-schedule";
import type { ListingCta } from "@/lib/host/v2/calendar-listing-draft";
import type { CalendarIntent } from "@/lib/host/v2/calendar-href";

/**
 * Every user-visible sentence the calendar can say, in one place.
 *
 * The model layer returns codes, not prose, so the arithmetic can be unit tested
 * without a translator and so no screen invents its own wording for the same state.
 * This module is the only thing that turns a code into words, and it always goes
 * through the catalog — there are no bare English literals rendered from here.
 */
export type Translator = ReturnType<typeof useI18n>;

/**
 * Money always goes through the server's snapshot, never `Intl` on the client — see
 * the note in `calendar-format.ts` for the hydration failure that caused.
 */
/**
 * The default: whole units, for every amount a host reads at a glance.
 *
 * Decimals belong where a number is computed, never where it is chosen, and almost
 * nothing here is computed — the slider rounds and promotions round by default. Use
 * `moneyExact` for the price breakdown, which is the receipt behind these numbers.
 */
export function money(
  amount: number,
  currency: string,
  formats: CalendarFormats,
): string {
  return formatMoneyRoundedFromSnapshot(amount, currency, formats);
}

/** To the cent. For the breakdown, where a rounded line would be a wrong number. */
export function moneyExact(
  amount: number,
  currency: string,
  formats: CalendarFormats,
): string {
  return formatMoneyExactFromSnapshot(amount, currency, formats);
}

function join(parts: Resolved[]): Resolved {
  return {
    text: parts.map((part) => part.text).join(" "),
    translated: parts.every((part) => part.translated),
  };
}

export function visibilityLabel(
  i18n: Translator,
  visibility: HostListingVisibility,
): Resolved {
  switch (visibility) {
    case "LIVE":
      return i18n.resolve("host.v2.calendar.visibility.live", "Live on the site");
    case "HIDDEN":
      return i18n.resolve(
        "host.v2.calendar.visibility.hidden",
        "Hidden from guests",
      );
    case "SUSPENDED":
      return i18n.resolve("host.v2.calendar.visibility.suspended", "Suspended");
    case "ARCHIVED":
      return i18n.resolve("host.v2.calendar.visibility.archived", "Archived");
    default:
      return i18n.resolve(
        "host.v2.calendar.visibility.draft",
        "Draft · not published",
      );
  }
}

export function discoverabilityLabel(
  i18n: Translator,
  discoverability: HostListingDiscoverability,
): Resolved {
  switch (discoverability) {
    case "SEARCH_AND_DATES":
      return i18n.resolve(
        "host.v2.calendar.discoverability.search",
        "Visible in search",
      );
    case "DATED_SEARCH_ONLY":
      return i18n.resolve(
        "host.v2.calendar.discoverability.dated_only",
        "Found only when guests search the dates you opened",
      );
    default:
      return i18n.resolve(
        "host.v2.calendar.discoverability.none",
        "Not shown in search",
      );
  }
}

/** Why an open date still cannot be sold. */
export function saleBlockerText(
  i18n: Translator,
  blockers: ListingSaleBlocker[],
): Resolved | null {
  if (blockers.length === 0) return null;
  if (blockers.includes("NO_PRICING") && blockers.includes("NOT_LIVE")) {
    return i18n.resolve(
      "host.v2.calendar.blocker.both",
      "These dates stay unbookable until the listing is on the site and has a price.",
    );
  }
  if (blockers.includes("NO_PRICING")) {
    return i18n.resolve(
      "host.v2.calendar.blocker.pricing",
      "These dates stay unbookable until this listing has a nightly price.",
    );
  }
  return i18n.resolve(
    "host.v2.calendar.blocker.not_live",
    "These dates stay unbookable until this listing is back on the site.",
  );
}

/** "Bookable" / "Not bookable" for the selected stay as a whole. */
export function stayBookabilityLabel(
  i18n: Translator,
  stay: SelectionStayBookability,
): Resolved {
  return stay.code === "BOOKABLE"
    ? i18n.resolve("host.v2.calendar.stay.bookable", "Bookable")
    : i18n.resolve("host.v2.calendar.stay.not_bookable", "Not bookable");
}

/** Why the selected stay cannot be booked, in one sentence. Null when it can. */
export function stayBookabilityReason(
  i18n: Translator,
  stay: SelectionStayBookability,
): Resolved | null {
  switch (stay.code) {
    case "BOOKABLE":
      return null;
    case "LISTING_CANNOT_SELL":
      return saleBlockerText(i18n, stay.saleBlockers);
    case "DATES_UNAVAILABLE":
      return stay.booked > 0 && stay.blocked > 0
        ? interpolate(
            i18n.resolve(
              "host.v2.calendar.stay.reason_mixed",
              "{blocked} of these dates are blocked and {booked} are booked.",
            ),
            { blocked: stay.blocked, booked: stay.booked },
          )
        : stay.booked > 0
          ? interpolate(
              i18n.plural(
                "host.v2.calendar.stay.reason_booked",
                stay.booked,
                "{n} of these dates is already booked.",
                "{n} of these dates are already booked.",
              ),
              {},
            )
          : interpolate(
              i18n.plural(
                "host.v2.calendar.stay.reason_blocked",
                stay.blocked,
                "{n} of these dates is blocked.",
                "{n} of these dates are blocked.",
              ),
              {},
            );
    case "NOT_FIXED_STAY":
      return i18n.resolve(
        "host.v2.calendar.stay.reason_fixed_exact",
        "These dates are not one complete fixed stay. Guests can only book an exact stay from the list.",
      );
    case "BELOW_MINIMUM":
      return interpolate(
        i18n.plural(
          "host.v2.calendar.stay.reason_minimum",
          stay.minNights,
          "Minimum stay is {n} night.",
          "Minimum stay is {n} nights.",
        ),
        {},
      );
    default:
      // Named separately from the minimum rather than folded into one "stay length"
      // sentence: the host's way out of the two is opposite, and `booking.service`
      // refuses the request for this reason specifically.
      return interpolate(
        i18n.plural(
          "host.v2.calendar.stay.reason_maximum",
          stay.maxNights,
          "Maximum stay is {n} night.",
          "Maximum stay is {n} nights.",
        ),
        {},
      );
  }
}

export function publishBlockerText(
  i18n: Translator,
  blocker: PublishBlocker,
): Resolved {
  switch (blocker) {
    case "PRICING":
      return i18n.resolve(
        "host.v2.calendar.publish_blocker.pricing",
        "Set a nightly price and cleaning fee for this listing.",
      );
    case "PHOTOS":
      return i18n.resolve(
        "host.v2.calendar.publish_blocker.photos",
        "Add at least 3 photos.",
      );
    case "AVAILABILITY_UNCONFIRMED":
      return i18n.resolve(
        "host.v2.calendar.publish_blocker.availability",
        "Confirm when the property starts taking bookings in the listing editor.",
      );
    default:
      return i18n.resolve(
        "host.v2.calendar.publish_blocker.status",
        "This listing cannot be put on the site from here.",
      );
  }
}

export function bookableDatesLabel(
  i18n: Translator,
  bookable: number,
  horizonMonths: number,
): Resolved {
  return interpolate(
    i18n.plural(
      "host.v2.calendar.bookable_dates",
      bookable,
      "{n} bookable date in the next {months} months",
      "{n} bookable dates in the next {months} months",
    ),
    { months: horizonMonths },
  );
}

export function blockedDatesLabel(
  i18n: Translator,
  blocked: number,
  horizonMonths: number,
): Resolved {
  return interpolate(
    i18n.plural(
      "host.v2.calendar.blocked_dates",
      blocked,
      "{n} blocked date in the next {months} months",
      "{n} blocked dates in the next {months} months",
    ),
    { months: horizonMonths },
  );
}

export function openNotBookableLabel(
  i18n: Translator,
  count: number,
  horizonMonths: number,
): Resolved {
  return interpolate(
    i18n.plural(
      "host.v2.calendar.open_not_bookable_dates",
      count,
      "{n} date open but not bookable in the next {months} months",
      "{n} dates open but not bookable in the next {months} months",
    ),
    { months: horizonMonths },
  );
}

/** The short, truthful bookability line used on rail cards and the mobile header. */
export function bookabilityLine(
  i18n: Translator,
  summary: HostListingStatusSummary,
): Resolved {
  if (summary.bookability === "NO_PRICING") {
    return i18n.resolve(
      "host.v2.calendar.status.no_pricing",
      "Pricing not set — nothing can be booked yet",
    );
  }
  if (!summary.live) return visibilityLabel(i18n, summary.visibility);
  if (summary.bookability === "NONE_BOOKABLE") {
    return interpolate(
      i18n.resolve(
        "host.v2.calendar.status.live_not_bookable",
        "Live but not bookable · all dates blocked in the next {months} months",
      ),
      { months: summary.horizonMonths },
    );
  }
  return interpolate(
    i18n.plural(
      "host.v2.calendar.status.live_bookable",
      summary.counts.bookable,
      "Live and bookable · {n} bookable date in the next {months} months",
      "Live and bookable · {n} bookable dates in the next {months} months",
    ),
    { months: summary.horizonMonths },
  );
}

/**
 * The two-word flag a property card can carry without becoming a paragraph.
 *
 * `tone === "warning"` is set only when the listing is on the site and still cannot
 * sell a single date — the case that used to need a full-width banner. The card states
 * the fact; the management panel carries the explanation and the way out of it.
 */
export function needsAttentionLabel(i18n: Translator): Resolved {
  return i18n.resolve("host.v2.calendar.status.attention", "Needs attention");
}

/** Why a card is flagged, short enough for a rail. Null when nothing is wrong. */
export function attentionReason(
  i18n: Translator,
  summary: HostListingStatusSummary,
): Resolved | null {
  if (summary.tone !== "warning") return null;
  return i18n.resolve(
    "host.v2.calendar.status.no_bookable_dates",
    "Guests cannot book any dates",
  );
}

/** State of a single date, spelled out so colour is never the only signal. */
export function dayStateLabel(
  i18n: Translator,
  day: HostCalendarDay,
): Resolved {
  if (day.state === "past") {
    return i18n.resolve("host.v2.calendar.day.past", "Past");
  }
  if (day.state === "booked") {
    return i18n.resolve("host.v2.calendar.day.booked", "Booked");
  }
  if (day.state === "blocked") {
    if (day.reason === "external") {
      return i18n.resolve(
        "host.v2.calendar.day.external",
        "Blocked by a connected calendar",
      );
    }
    if (day.reason === "closed_default") {
      return i18n.resolve(
        "host.v2.calendar.day.closed_default",
        "Closed until you open it",
      );
    }
    return i18n.resolve("host.v2.calendar.day.blocked", "Blocked");
  }
  if (day.state === "open_not_bookable") {
    return i18n.resolve(
      "host.v2.calendar.day.open_not_bookable",
      "Open, but not bookable",
    );
  }
  return i18n.resolve("host.v2.calendar.day.available", "Available");
}

/** The compact word that fits inside a date cell. */
export function dayStateBadge(
  i18n: Translator,
  day: HostCalendarDay,
): Resolved | null {
  if (day.state === "booked") {
    return i18n.resolve("host.v2.calendar.day.badge_booked", "Booked");
  }
  if (day.state === "blocked") {
    // An imported hold reads "Booked" too. The grid no longer separates the two, and
    // the channel mark drawn on the stay's first and last night says which calendar is
    // holding it — a second word for the same fact only made the host sort them.
    if (day.reason === "external") {
      return i18n.resolve("host.v2.calendar.day.badge_booked", "Booked");
    }
    if (day.reason === "closed_default") {
      return i18n.resolve("host.v2.calendar.day.badge_closed", "Closed");
    }
    return i18n.resolve("host.v2.calendar.day.badge_blocked", "Blocked");
  }
  if (day.state === "open_not_bookable") {
    return i18n.resolve("host.v2.calendar.day.badge_not_bookable", "Not bookable");
  }
  return null;
}

/**
 * The state of a selection in one or two words, for a summary row.
 *
 * Deliberately shorter than the review's `AVAILABILITY_MIXED` sentence: a menu row is
 * a signpost, and the four exact counts belong behind the availability editor's "How
 * this works" rather than in a line the host reads on the way past.
 */
export function availabilitySummaryWord(
  i18n: Translator,
  counts: {
    available: number;
    openNotBookable: number;
    blocked: number;
    booked: number;
  },
): Resolved {
  const present = [
    counts.available > 0,
    counts.openNotBookable > 0,
    counts.blocked > 0,
    counts.booked > 0,
  ].filter(Boolean).length;
  if (present > 1) {
    return i18n.resolve("host.v2.calendar.summary.mixed", "Mixed");
  }
  if (counts.booked > 0) {
    return i18n.resolve("host.v2.calendar.value.booked", "Booked");
  }
  if (counts.blocked > 0) {
    return i18n.resolve("host.v2.calendar.value.blocked", "Blocked");
  }
  if (counts.openNotBookable > 0) {
    return i18n.resolve(
      "host.v2.calendar.summary.open_not_bookable",
      "Open, not bookable",
    );
  }
  return i18n.resolve("host.v2.calendar.value.available", "Available");
}

/** "Selected dates" or "All future dates". Said once, at the top of the panel. */
export function workbenchScopeLabel(
  i18n: Translator,
  scope: WorkbenchScope,
): Resolved {
  return scope === "DATES"
    ? i18n.resolve("host.v2.calendar.scope.dates", "Selected dates")
    : i18n.resolve("host.v2.calendar.scope.all_future", "All future dates");
}

/**
 * What the calendar is waiting for, when the host arrived from a contextual link.
 *
 * Each one names the action *and* the missing half of it, because the sentence started
 * on the page the host came from: they pressed "Set prices for specific dates" and this
 * is the calendar finishing it. Generic wording — "select some dates" — would throw
 * that context away and leave them wondering what they were about to do.
 */
export function intentPromptLabel(
  i18n: Translator,
  intent: CalendarIntent,
): Resolved {
  switch (intent) {
    case "availability":
      return i18n.resolve(
        "host.v2.calendar.intent.availability",
        "Select the dates you want to open or block.",
      );
    case "pricing":
      return i18n.resolve(
        "host.v2.calendar.intent.pricing",
        "Select the dates you want to give their own price.",
      );
    case "promotion":
      return i18n.resolve(
        "host.v2.calendar.intent.promotion",
        "Select the dates your offer should run on.",
      );
  }
}

/** The name of a destination, used by both its menu row and its editor header. */
export function workbenchEditorLabel(
  i18n: Translator,
  editor: WorkbenchEditor,
): Resolved {
  switch (editor) {
    case "availability":
      return i18n.resolve("host.v2.calendar.section.availability", "Availability");
    case "pricing":
      return i18n.resolve("host.v2.calendar.menu.price", "Nightly price");
    case "promotions":
      return i18n.resolve("host.v2.calendar.menu.promotion", "Promotion");
    case "booking-method":
      return i18n.resolve(
        "host.v2.calendar.menu.booking_method",
        "Booking method",
      );
  }
}

/** The one sticky action at the foot of a focused editor. */
export function workbenchCtaLabel(
  i18n: Translator,
  cta: WorkbenchCta,
): Resolved {
  switch (cta) {
    case "REVIEW_AVAILABILITY":
      return i18n.resolve("host.v2.calendar.cta.availability", "Review availability");
    case "REVIEW_PRICE":
      return i18n.resolve("host.v2.calendar.cta.price", "Review price");
    case "REVIEW_PROMOTION":
      return i18n.resolve("host.v2.calendar.cta.promotion", "Review promotion");
  }
}

/**
 * The single action while a listing-wide editor is open.
 *
 * Named from the staged change rather than from which editor is showing: the Pricing
 * section stages a default-pricing edit and an offer edit from one screen, and
 * "Review removal" is a materially different promise from "Review ongoing promotion".
 */
export function listingCtaLabel(i18n: Translator, cta: ListingCta): Resolved {
  switch (cta) {
    case "REVIEW_AVAILABILITY_RULE":
      return i18n.resolve(
        "host.v2.calendar.cta.availability_rule",
        "Review availability rule",
      );
    case "REVIEW_DEFAULTS":
      return i18n.resolve(
        "host.v2.calendar.cta.default_pricing",
        "Review default pricing",
      );
    case "REVIEW_ONGOING_PROMOTION":
      return i18n.resolve(
        "host.v2.calendar.cta.ongoing_promotion",
        "Review ongoing promotion",
      );
    case "REVIEW_PROMOTION_REMOVAL":
      return i18n.resolve("host.v2.calendar.cta.removal", "Review removal");
  }
}

export function scheduledFilterLabel(
  i18n: Translator,
  filter: ScheduledFilter,
): Resolved {
  switch (filter) {
    case "all":
      return i18n.resolve("host.v2.calendar.schedule.filter_all", "All");
    case "availability":
      return i18n.resolve(
        "host.v2.calendar.schedule.filter_availability",
        "Availability",
      );
    case "pricing":
      return i18n.resolve("host.v2.calendar.schedule.filter_pricing", "Pricing");
    case "promotions":
      return i18n.resolve(
        "host.v2.calendar.schedule.filter_promotions",
        "Promotions",
      );
    case "reservations":
      return i18n.resolve(
        "host.v2.calendar.schedule.filter_reservations",
        "Reservations",
      );
  }
}

/** What kind of decision a scheduled row represents. */
export function scheduledKindLabel(
  i18n: Translator,
  kind: ScheduledChangeKind,
): Resolved {
  switch (kind) {
    case "MANUAL_BLOCK":
      return i18n.resolve("host.v2.calendar.schedule.manual_block", "Blocked");
    case "OPEN_WINDOW":
      return i18n.resolve("host.v2.calendar.schedule.open_window", "Opened");
    case "DATE_PRICE":
      return i18n.resolve("host.v2.calendar.schedule.date_price", "Custom price");
    case "DATED_PROMOTION":
      return i18n.resolve("host.v2.calendar.schedule.promotion", "Offer");
    case "RESERVATION":
      return i18n.resolve("host.v2.calendar.schedule.reservation", "Booked");
    case "EXTERNAL_BLOCK":
      return i18n.resolve(
        "host.v2.calendar.schedule.external",
        "From a connected calendar",
      );
  }
}

/** Why a scheduled row cannot be edited here. */
export function scheduledProtectionText(
  i18n: Translator,
  protection: ScheduledProtection,
): Resolved {
  return protection === "RESERVATION"
    ? i18n.resolve(
        "host.v2.calendar.schedule.protected_reservation",
        "A guest has booked these dates, so they cannot be changed here.",
      )
    : i18n.resolve(
        "host.v2.calendar.schedule.protected_external",
        "These dates come from a calendar you connected. Change them there and the change syncs back.",
      );
}

export function reviewFieldLabel(
  i18n: Translator,
  field: ReviewField,
): Resolved {
  switch (field) {
    case "availability":
      return i18n.resolve("host.v2.calendar.field.availability", "Availability");
    case "block_note":
      return i18n.resolve("host.v2.calendar.field.block_note", "Private note");
    case "price":
      return i18n.resolve("host.v2.calendar.field.price", "Nightly price");
    case "promotion":
      return i18n.resolve("host.v2.calendar.field.promotion", "Promotion");
    case "availability_mode":
      return i18n.resolve(
        "host.v2.calendar.field.availability_mode",
        "Availability rule",
      );
    case "base_price":
      return i18n.resolve(
        "host.v2.calendar.field.base_price",
        "Default nightly price",
      );
    case "cleaning_fee":
      return i18n.resolve(
        "host.v2.calendar.field.cleaning_fee",
        "Cleaning fee",
      );
  }
}

function promotionBenefit(
  i18n: Translator,
  value: { discountPercent: number; freeCleaning: boolean },
): Resolved {
  if (value.discountPercent > 0 && value.freeCleaning) {
    return interpolate(
      i18n.resolve(
        "host.v2.calendar.value.promotion_both",
        "{percent}% off and free cleaning",
      ),
      { percent: value.discountPercent },
    );
  }
  if (value.discountPercent > 0) {
    return interpolate(
      i18n.resolve("host.v2.calendar.value.promotion_percent", "{percent}% off"),
      { percent: value.discountPercent },
    );
  }
  return i18n.resolve(
    "host.v2.calendar.value.promotion_cleaning",
    "Free cleaning",
  );
}

/** `+15`, `−15`, `0`. The minus is the typographic one; the fields accept either. */
export function formatSignedPercent(percent: number): string {
  const rounded = Math.round(percent);
  if (rounded === 0) return "0";
  return rounded > 0 ? `+${rounded}` : `−${Math.abs(rounded)}`;
}

/**
 * The currency's own symbol, taken from the same formatter the amounts use rather than
 * from a table of our own — the panel already renders every price through it.
 */
export function currencySymbol(currency: string, formats: CalendarFormats): string {
  return money(0, currency, formats).replace(/[\d.,\s ]/g, "");
}

/**
 * A promotion in a menu row's worth of words.
 *
 * `reviewValueText` describes an offer in full — the minimum stay, the rounding rule,
 * whether it is always on — because the review dialog has to state all of it before a
 * host confirms anything. A summary row is one line beside its label, and putting the
 * review sentence there produced a value long enough to run over the label next to it.
 *
 * This is the short form: what the guest gets, and how many other offers are running.
 * The detail is one tap away in the editor the row opens.
 */
export function promotionSummary(
  i18n: Translator,
  offers: Array<{ discountPercent: number; freeCleaning: boolean }>,
): Resolved {
  const [first] = offers;
  if (!first) return i18n.resolve("host.v2.calendar.summary.none", "None");
  const benefit = promotionBenefit(i18n, first);
  if (offers.length === 1) return benefit;
  return interpolate(
    i18n.resolve(
      "host.v2.calendar.summary.promotion_more",
      "{benefit} +{count} more",
    ),
    { benefit: benefit.text, count: offers.length - 1 },
  );
}

export function reviewValueText(
  i18n: Translator,
  value: ReviewValue,
  currency: string,
  formats: CalendarFormats,
): Resolved {
  switch (value.code) {
    case "AVAILABILITY_AVAILABLE":
      return i18n.resolve("host.v2.calendar.value.available", "Available");
    case "AVAILABILITY_OPEN_NOT_BOOKABLE":
      return i18n.resolve(
        "host.v2.calendar.value.open_not_bookable",
        "Open, but not bookable",
      );
    case "AVAILABILITY_BLOCKED":
      return i18n.resolve("host.v2.calendar.value.blocked", "Blocked");
    case "AVAILABILITY_BOOKED":
      return i18n.resolve("host.v2.calendar.value.booked", "Booked");
    case "AVAILABILITY_MIXED": {
      const base = interpolate(
        i18n.resolve(
          "host.v2.calendar.value.mixed",
          "Mixed — {available} available, {blocked} blocked, {booked} booked",
        ),
        {
          available: value.available,
          blocked: value.blocked,
          booked: value.booked,
        },
      );
      if (value.openNotBookable === 0) return base;
      return join([
        base,
        interpolate(
          i18n.resolve(
            "host.v2.calendar.value.mixed_not_bookable",
            "and {count} open but not bookable",
          ),
          { count: value.openNotBookable },
        ),
      ]);
    }
    case "PRICE_SINGLE":
      return interpolate(
        i18n.resolve("host.v2.calendar.value.price", "{amount} per night"),
        { amount: money(value.amount, currency, formats) },
      );
    case "PRICE_RANGE":
      return interpolate(
        i18n.resolve(
          "host.v2.calendar.value.price_range",
          "{min} to {max} per night",
        ),
        {
          min: money(value.min, currency, formats),
          max: money(value.max, currency, formats),
        },
      );
    case "PRICE_BASE":
      return interpolate(
        i18n.resolve(
          "host.v2.calendar.value.price_base",
          "Base price {amount} per night",
        ),
        { amount: money(value.amount, currency, formats) },
      );
    case "MONEY":
      return {
        text: money(value.amount, currency, formats),
        translated: true,
      };
    case "PROMOTION_NONE":
      return i18n.resolve("host.v2.calendar.value.no_promotion", "No promotion");
    case "PROMOTION_OFFER": {
      const benefit = promotionBenefit(i18n, value);
      const withMinimum = interpolate(
        i18n.resolve(
          "host.v2.calendar.value.promotion_minimum",
          "{benefit}, stays of {nights} nights or more",
        ),
        { benefit: benefit.text, nights: value.minimumNights },
      );
      const details: Resolved[] = [withMinimum];
      if (value.discountPercent > 0) {
        details.push(
          value.roundToWholeUnit
            ? i18n.resolve(
                "host.v2.calendar.value.promotion_rounding_on",
                "Discounted nightly prices are rounded to whole currency units.",
              )
            : i18n.resolve(
                "host.v2.calendar.value.promotion_rounding_off",
                "Discounted nightly prices keep their decimal amounts.",
              ),
        );
      }
      if (value.evergreen) {
        details.push(
          i18n.resolve(
            "host.v2.calendar.value.promotion_evergreen",
            "This offer is always active.",
          ),
        );
      }
      return join(details);
    }
    case "MODE_OPEN":
      return i18n.resolve(
        "host.v2.calendar.value.mode_open",
        "Open unless you block a date",
      );
    case "MODE_CLOSED":
      return i18n.resolve(
        "host.v2.calendar.value.mode_closed",
        "Closed unless you open a date",
      );
    case "NIGHTS":
      return interpolate(
        i18n.plural(
          "host.v2.calendar.value.nights",
          value.nights,
          "{n} night",
          "{n} nights",
        ),
        {},
      );
    case "NOTE_NONE":
      return i18n.resolve("host.v2.calendar.value.note_none", "No note");
    case "NOTE_TEXT":
      // The host's own words, echoed exactly. Marked as already-final so the page
      // translator leaves them alone — a note is not copy to be rendered into
      // another language, it is a thing the host wrote and has to recognise.
      return { text: value.note, translated: true };
  }
}

/**
 * The sentence every default-availability confirmation ends on.
 *
 * A host changing how untouched dates begin is, in the moment, asking one question:
 * "does this cancel anything?" The counts above answer what moves; this answers the
 * question they were actually asking, and it is stated in both directions because
 * closing dates by default is the direction that sounds like it might.
 */
function reservationsUnaffected(i18n: Translator): Resolved {
  return i18n.resolve(
    "host.v2.calendar.consequence.mode_reservations_safe",
    "Reservations guests have already made are not affected.",
  );
}

export function consequenceText(
  i18n: Translator,
  consequence: Consequence,
  currency: string,
  formats: CalendarFormats,
): Resolved {
  switch (consequence.code) {
    case "DATES_OPENED": {
      const parts: Resolved[] = [];
      // "Bookable" is only claimed when the listing can actually sell the date.
      parts.push(
        consequence.bookable > 0
          ? interpolate(
              i18n.plural(
                "host.v2.calendar.consequence.bookable",
                consequence.bookable,
                "Guests will be able to book {n} date immediately after you save.",
                "Guests will be able to book {n} dates immediately after you save.",
              ),
              {},
            )
          : interpolate(
              i18n.plural(
                "host.v2.calendar.consequence.opened_only",
                consequence.dates,
                "{n} date will be open on your calendar, but still not bookable.",
                "{n} dates will be open on your calendar, but still not bookable.",
              ),
              {},
            ),
      );
      const blocker = saleBlockerText(i18n, consequence.saleBlockers);
      if (blocker) parts.push(blocker);
      if (consequence.lockedDates > 0) {
        parts.push(
          interpolate(
            i18n.plural(
              "host.v2.calendar.consequence.bookable_locked",
              consequence.lockedDates,
              "{n} date in this range stays unavailable — it is booked or held by a connected calendar.",
              "{n} dates in this range stay unavailable — they are booked or held by a connected calendar.",
            ),
            {},
          ),
        );
      }
      return join(parts);
    }
    case "DATES_CLOSED": {
      const parts: Resolved[] = [
        interpolate(
          i18n.plural(
            "host.v2.calendar.consequence.not_bookable",
            consequence.dates,
            "{n} date will be blocked after you save.",
            "{n} dates will be blocked after you save.",
          ),
          {},
        ),
      ];
      if (consequence.bookable > 0) {
        parts.push(
          interpolate(
            i18n.plural(
              "host.v2.calendar.consequence.losing_bookable",
              consequence.bookable,
              "{n} of them can be booked right now, and will stop being bookable.",
              "{n} of them can be booked right now, and will stop being bookable.",
            ),
            {},
          ),
        );
      }
      if (consequence.bookedDates > 0) {
        parts.push(
          i18n.resolve(
            "host.v2.calendar.consequence.bookings_protected",
            "Existing reservations in this range are not affected.",
          ),
        );
      }
      return join(parts);
    }
    case "BLOCK_NOTE_SAVED": {
      const parts: Resolved[] = [
        interpolate(
          i18n.plural(
            "host.v2.calendar.consequence.block_note",
            consequence.dates,
            "Your note is saved on {n} date and stays private — guests never see it.",
            "Your note is saved on {n} dates and stays private — guests never see it.",
          ),
          {},
        ),
      ];
      if (consequence.keptOnExisting > 0) {
        parts.push(
          interpolate(
            i18n.plural(
              "host.v2.calendar.consequence.block_note_kept",
              consequence.keptOnExisting,
              "{n} date in this range is already blocked and keeps the note it was saved with.",
              "{n} dates in this range are already blocked and keep the note they were saved with.",
            ),
            {},
          ),
        );
      }
      return join(parts);
    }
    case "PRICE_APPLIES": {
      const base = interpolate(
        i18n.plural(
          "host.v2.calendar.consequence.price",
          consequence.dates,
          "New bookings for {n} date will be quoted at the new price. Existing bookings keep what guests already paid.",
          "New bookings for {n} dates will be quoted at the new price. Existing bookings keep what guests already paid.",
        ),
        {},
      );
      return consequence.sellable
        ? base
        : join([
            base,
            i18n.resolve(
              "host.v2.calendar.consequence.price_not_sellable",
              "No guest can book these dates yet, so the new price is not on offer.",
            ),
          ]);
    }
    case "PRICE_RESET":
      return interpolate(
        i18n.plural(
          "host.v2.calendar.consequence.price_reset",
          consequence.dates,
          "{n} date goes back to your base price.",
          "{n} dates go back to your base price.",
        ),
        {},
      );
    case "PROMOTION_APPLIES": {
      const parts: Resolved[] = [
        consequence.mode === "EDIT"
          ? i18n.resolve(
              "host.v2.calendar.consequence.promotion_edit",
              "Your existing offer for these dates is updated.",
            )
          : consequence.mode === "OVERRIDE"
            ? i18n.resolve(
                "host.v2.calendar.consequence.promotion_override",
                "This new date-specific offer takes priority over the one running today, which keeps running on every other date.",
              )
            : i18n.resolve(
                "host.v2.calendar.consequence.promotion_create",
                "A new offer starts running on these dates.",
              ),
      ];
      if (consequence.sellable) {
        parts.push(
          interpolate(
            i18n.plural(
              "host.v2.calendar.consequence.promotion",
              consequence.dates,
              "Guests booking {n} date will see the discounted price.",
              "Guests booking these {n} dates will see the discounted price.",
            ),
            {},
          ),
        );
      }
      return join(parts);
    }
    case "MODE_TO_OPEN": {
      const parts: Resolved[] = [
        interpolate(
          i18n.resolve(
            "host.v2.calendar.consequence.mode_open",
            "Every date becomes open unless you block it. {opened} dates in the next {months} months become open.",
          ),
          {
            opened: consequence.becomingOpen,
            months: consequence.horizonMonths,
          },
        ),
      ];
      parts.push(
        consequence.becomingBookable > 0
          ? interpolate(
              i18n.resolve(
                "host.v2.calendar.consequence.mode_open_bookable",
                "{bookable} of them become bookable immediately.",
              ),
              { bookable: consequence.becomingBookable },
            )
          : i18n.resolve(
              "host.v2.calendar.consequence.mode_open_none_bookable",
              "None of them become bookable yet.",
            ),
      );
      const blocker = saleBlockerText(i18n, consequence.saleBlockers);
      if (blocker) parts.push(blocker);
      if (consequence.stayingBlocked > 0) {
        parts.push(
          interpolate(
            i18n.resolve(
              "host.v2.calendar.consequence.mode_open_still_blocked",
              "{blocked} dates stay blocked by reservations, your own blocks or a connected calendar.",
            ),
            { blocked: consequence.stayingBlocked },
          ),
        );
      }
      parts.push(reservationsUnaffected(i18n));
      return join(parts);
    }
    case "MODE_TO_CLOSED": {
      // One statement of what saving does, rather than two numbers the host has to
      // reconcile. Which sentence applies depends on whether anything bookable is
      // actually lost — a listing that sells nothing today loses nothing today.
      const parts: Resolved[] = [
        consequence.losingBookability > 0
          ? interpolate(
              i18n.plural(
                "host.v2.calendar.consequence.mode_closed_losing",
                consequence.losingBookability,
                "Saving will make {n} currently bookable date unavailable until you open it again. The listing will also leave undated search.",
                "Saving will make {n} currently bookable dates unavailable until you open them again. The listing will also leave undated search.",
              ),
              {},
            )
          : consequence.closing > 0
            ? interpolate(
                i18n.plural(
                  "host.v2.calendar.consequence.mode_closed_open_only",
                  consequence.closing,
                  "Saving will close {n} open date until you open it again. None of them can be booked today, so nothing changes for guests right now. The listing will also leave undated search.",
                  "Saving will close {n} open dates until you open them again. None of them can be booked today, so nothing changes for guests right now. The listing will also leave undated search.",
                ),
                {},
              )
            : i18n.resolve(
                "host.v2.calendar.consequence.mode_closed_none",
                "No open dates are affected. The listing will leave undated search.",
              ),
      ];
      if (consequence.stayingOpenViaWindows > 0) {
        parts.push(
          interpolate(
            i18n.plural(
              "host.v2.calendar.consequence.mode_closed_windows",
              consequence.stayingOpenViaWindows,
              "{n} date stays open because you already opened it explicitly.",
              "{n} dates stay open because you already opened them explicitly.",
            ),
            {},
          ),
        );
      }
      parts.push(reservationsUnaffected(i18n));
      return join(parts);
    }
    case "BASE_PRICE_FALLBACK":
      return interpolate(
        i18n.resolve(
          "host.v2.calendar.consequence.base_price",
          "New bookings on dates without a custom price will start from a base price of {amount} per night, before promotions. Custom date prices and existing bookings do not change.",
        ),
        { amount: money(consequence.amount, currency, formats) },
      );
    case "CLEANING_FEE_ALL_STAYS": {
      const base = consequence.amount === 0
        ? i18n.resolve(
            "host.v2.calendar.consequence.cleaning_fee_removed",
            "The cleaning fee is removed from new bookings. Existing bookings keep their confirmed total.",
          )
        : interpolate(
            i18n.resolve(
              "host.v2.calendar.consequence.cleaning_fee",
              "New bookings will include a cleaning fee of {amount}. Existing bookings keep their confirmed total.",
            ),
            { amount: money(consequence.amount, currency, formats) },
          );
      if (consequence.freeCleaningBenefitsRemoved === 0) return base;
      return join([
        base,
        interpolate(
          i18n.plural(
            "host.v2.calendar.consequence.free_cleaning_removed",
            consequence.freeCleaningBenefitsRemoved,
            "Free cleaning will also be removed from {n} active promotion; any percentage discount on it keeps running.",
            "Free cleaning will also be removed from {n} active promotions; any percentage discounts on them keep running.",
          ),
          {},
        ),
      ]);
    }
    case "EVERGREEN_PROMOTION_SAVED":
      return consequence.mode === "EDIT"
        ? i18n.resolve(
            "host.v2.calendar.consequence.evergreen_edit",
            "This always-active offer is updated for future eligible bookings on every date. Existing bookings do not change, and date-specific offers can still take priority.",
          )
        : i18n.resolve(
            "host.v2.calendar.consequence.evergreen_create",
            "This offer becomes active for future eligible bookings on every date. Existing bookings do not change, and date-specific offers can still take priority.",
          );
    case "EVERGREEN_PROMOTION_REMOVED":
      return i18n.resolve(
        "host.v2.calendar.consequence.evergreen_removed",
        "This always-active offer stops applying to new bookings. Existing bookings do not change; another eligible offer may still apply.",
      );
    case "DATE_PROMOTION_REMOVED":
      return consequence.fallsBackToOngoing
        ? i18n.resolve(
            "host.v2.calendar.consequence.date_promotion_removed_fallback",
            "This offer stops running on these dates. An always-active offer applies to them instead, so guests still see a discount. Existing bookings do not change.",
          )
        : i18n.resolve(
            "host.v2.calendar.consequence.date_promotion_removed",
            "This offer stops running on these dates and guests pay the full price for them. Existing bookings do not change.",
          );
  }
}

export function saveActionLabel(
  i18n: Translator,
  action: SaveAction,
): Resolved {
  switch (action) {
    case "SAVE_AND_OPEN":
      return i18n.resolve(
        "host.v2.calendar.save.open",
        "Save and open these dates",
      );
    case "SAVE_AND_BLOCK":
      return i18n.resolve(
        "host.v2.calendar.save.block",
        "Save and block these dates",
      );
    case "SAVE_PRICE":
      return i18n.resolve("host.v2.calendar.save.price", "Save price changes");
    case "SAVE_PROMOTION":
      return i18n.resolve("host.v2.calendar.save.promotion", "Save this promotion");
    case "SAVE_MODE_OPEN":
      return i18n.resolve(
        "host.v2.calendar.save.mode_open",
        "Save and open dates by default",
      );
    case "SAVE_MODE_CLOSED":
      return i18n.resolve(
        "host.v2.calendar.save.mode_closed",
        "Save and close dates by default",
      );
    case "SAVE_DEFAULT_PRICING":
      return i18n.resolve(
        "host.v2.calendar.save.default_pricing",
        "Save default pricing for all dates",
      );
    case "SAVE_EVERGREEN_PROMOTION":
      return i18n.resolve(
        "host.v2.calendar.save.evergreen_promotion",
        "Save this always-active offer",
      );
    case "REMOVE_EVERGREEN_PROMOTION":
      return i18n.resolve(
        "host.v2.calendar.save.remove_evergreen_promotion",
        "Remove this always-active offer",
      );
    case "REMOVE_DATE_PROMOTION":
      return i18n.resolve(
        "host.v2.calendar.save.remove_date_promotion",
        "Remove this offer from these dates",
      );
  }
}

/**
 * The review button, naming the action and the dates it is about.
 *
 * "Review changes" described nothing — a host reading it had to remember which of
 * three editors they had touched. `scope` is the same phrase the panel header shows,
 * so the button and the scope line cannot drift apart.
 */
export function reviewActionLabel(
  i18n: Translator,
  action: SaveAction,
  scope: string,
): Resolved {
  switch (action) {
    case "SAVE_AND_OPEN":
      return interpolate(
        i18n.resolve("host.v2.calendar.review_action.open", "Review opening {scope}"),
        { scope },
      );
    case "SAVE_AND_BLOCK":
      return interpolate(
        i18n.resolve(
          "host.v2.calendar.review_action.block",
          "Review blocking {scope}",
        ),
        { scope },
      );
    case "SAVE_PRICE":
      return interpolate(
        i18n.resolve(
          "host.v2.calendar.review_action.price",
          "Review the new price for {scope}",
        ),
        { scope },
      );
    case "SAVE_PROMOTION":
      return interpolate(
        i18n.resolve(
          "host.v2.calendar.review_action.promotion",
          "Review this promotion for {scope}",
        ),
        { scope },
      );
    case "SAVE_MODE_OPEN":
      return i18n.resolve(
        "host.v2.calendar.review_action.mode_open",
        "Review opening dates by default",
      );
    case "SAVE_MODE_CLOSED":
      return i18n.resolve(
        "host.v2.calendar.review_action.mode_closed",
        "Review closing dates by default",
      );
    case "SAVE_DEFAULT_PRICING":
      return i18n.resolve(
        "host.v2.calendar.review_action.default_pricing",
        "Review default pricing for all dates",
      );
    case "SAVE_EVERGREEN_PROMOTION":
      return i18n.resolve(
        "host.v2.calendar.review_action.evergreen_promotion",
        "Review this always-active offer",
      );
    case "REMOVE_EVERGREEN_PROMOTION":
      return i18n.resolve(
        "host.v2.calendar.review_action.remove_evergreen_promotion",
        "Review removing this always-active offer",
      );
    case "REMOVE_DATE_PROMOTION":
      return interpolate(
        i18n.resolve(
          "host.v2.calendar.review_action.remove_date_promotion",
          "Review removing this offer from {scope}",
        ),
        { scope },
      );
  }
}

export function reviewErrorText(
  i18n: Translator,
  error: ReviewError,
): Resolved {
  switch (error.code) {
    case "NO_SELECTION":
      return i18n.resolve(
        "host.v2.calendar.error.no_selection",
        "Choose dates first.",
      );
    case "NO_CHANGES":
      return i18n.resolve(
        "host.v2.calendar.error.no_changes",
        "Nothing has changed yet.",
      );
    case "PAST_DATE":
      return i18n.resolve(
        "host.v2.calendar.error.past",
        "Past dates cannot be changed. Choose dates from today onwards.",
      );
    case "NO_PRICING":
      return i18n.resolve(
        "host.v2.calendar.error.no_pricing",
        "Set this listing's pricing before changing prices or promotions.",
      );
    case "INVALID_PRICE":
      return i18n.resolve(
        "host.v2.calendar.error.price",
        "Enter a nightly price greater than zero.",
      );
    case "INVALID_CLEANING_FEE":
      return i18n.resolve(
        "host.v2.calendar.error.cleaning_fee",
        "Enter a cleaning fee of zero or more.",
      );
    case "INVALID_PROMOTION":
      return i18n.resolve(
        "host.v2.calendar.error.promotion",
        "Enter a discount of up to 50%, free cleaning, or both, and a valid minimum stay.",
      );
    case "FREE_CLEANING_WITHOUT_FEE":
      return i18n.resolve(
        "host.v2.calendar.error.free_cleaning",
        "Add a cleaning fee before offering free cleaning.",
      );
    case "PROMOTION_REQUIRES_LIVE":
      return i18n.resolve(
        "host.v2.calendar.error.promotion_live",
        "Put the listing on the site before adding a promotion.",
      );
    case "NOTHING_TO_OPEN":
      return i18n.resolve(
        "host.v2.calendar.error.nothing_to_open",
        "None of these dates can be opened from here. They are already open, booked, or held by a connected calendar.",
      );
    case "NOTHING_TO_BLOCK":
      return i18n.resolve(
        "host.v2.calendar.error.nothing_to_block",
        "None of these dates are open to block.",
      );
    case "MODE_UNCHANGED":
      return i18n.resolve(
        "host.v2.calendar.error.mode_unchanged",
        "That is already the current setting.",
      );
    case "PROMOTION_NOT_FOUND":
      return i18n.resolve(
        "host.v2.calendar.error.promotion_not_found",
        "This promotion no longer exists. Refresh the calendar and try again.",
      );
    case "PROMOTION_NOT_EVERGREEN":
      return i18n.resolve(
        "host.v2.calendar.error.promotion_not_evergreen",
        "This offer applies only to specific dates and cannot be changed from the all-dates editor.",
      );
    case "PROMOTION_NOT_DATED":
      return i18n.resolve(
        "host.v2.calendar.error.promotion_not_dated",
        "This offer runs on every date, so it cannot be removed from just these ones. Change it in the all-dates editor.",
      );
    case "PROMOTION_CONFLICT":
      return interpolate(
        i18n.resolve(
          "host.v2.calendar.error.promotion_conflict",
          "Another always-active offer already uses a minimum stay of {nights} nights. Edit that offer or choose a different minimum stay.",
        ),
        { nights: error.minimumNights },
      );
  }
}
