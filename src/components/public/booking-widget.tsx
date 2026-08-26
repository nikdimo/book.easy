"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { addMonths, startOfDay } from "date-fns";
import {
  computeNightlyRateRange,
  computeStayQuote,
  parseLocalYmd,
  type StayPromotion,
} from "@/lib/utils/stay-pricing";
import { validateBookingSelection } from "@/lib/utils/booking-selection";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { MarketplaceStayDatePicker } from "@/components/marketplace/marketplace-stay-date-picker";
import { useSheetEnabled } from "@/components/marketplace/results-sheet";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { LocalizedPrice } from "@/components/shared/localized-price";
import { OfficialAmountNotice } from "@/components/shared/official-amount-notice";
import { createBookingAction } from "@/lib/actions/booking.actions";
import { toast } from "sonner";
import { Check, ChevronDown, ChevronRight, ChevronUp, X } from "lucide-react";
import { updateActiveSearchState } from "@/lib/marketplace-search-state";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Resolved } from "@/lib/i18n/t";
import { Tx, useI18n } from "@/lib/i18n/client";
import { BookingReviewPaymentTerms } from "@/components/booking/booking-review-payment-terms";
import type { AcceptedPaymentMethodsPresentation } from "@/components/booking/accepted-payment-methods";
import type { DepositPolicySnapshotV1 } from "@/lib/payments/deposit-policy";
import {
  useCellCurrencyNote,
  useListingDayPrices,
} from "./use-listing-day-prices";
import { resolvePromotionLabel } from "./promotion-label";
import { useListingStayRange } from "./listing-stay-context";

interface BookingWidgetProps {
  listingId: string;
  maxGuests: number;
  nightlyRate: number;
  cleaningFee: number;
  currency: string;
  minNights: number;
  promotions?: StayPromotion[];
  disabledDateRanges: { from: Date; to: Date }[];
  /** yyyy-MM-dd → override nightly rate for that night */
  priceOverrides?: { date: string; rate: number }[];
  /** Seeds the widget from the search the guest arrived with (checkIn/checkOut/guests query params). */
  initialCheckIn?: string;
  initialCheckOut?: string;
  initialGuests?: number;
  initialGuestDetails?: GuestDetails;
  hasExplicitSearchSelection?: boolean;
  requestToBookTooltip: Resolved;
  /** Public method names only. Never payment instructions, account details or links. */
  acceptedPaymentMethods: AcceptedPaymentMethodsPresentation;
  /** Validated public terms only; no payment destination or operational payment data. */
  depositPolicy: DepositPolicySnapshotV1;
  /**
   * The "message host" button, already built by the server so this widget does not
   * have to know who the host is. Rendered only in the phone's sticky bar — the
   * page's own copy sits next to the host further up, out of reach once you have
   * scrolled down to the price.
   */
  messageHost?: React.ReactNode;
  /**
   * The listing's house rules, already rendered by the server.
   *
   * A node rather than the rules themselves, on purpose: this widget must not be able to
   * decide what the rules say. It shows what the page showed, collects the guest's
   * acceptance of it, and sends nothing but that yes — the booking's stored snapshot is
   * built on the server from the listing row, where a client cannot reach it.
   */
  houseRules?: React.ReactNode;
  /** Fingerprint of the rules rendered above. The server rejects the request if the
   * host changed them before booking, so the guest can review the new version. */
  houseRulesVersion: string;
}

type GuestDetails = {
  adults: number;
  children: number;
  infants: number;
  pets: number;
};

/**
 * The steps of the one overlay a booking is made in.
 *
 * Dates, then who is coming, then the review the request is sent from — the house
 * rules, the price and the two buttons under them. The card behind it never sends
 * anything: it summarises the stay and opens this at whichever step is unfinished,
 * so there is exactly one path to a booking however the guest arrived at the page.
 */
type PickerStep = "dates" | "guests" | "review";

/** Matches the horizon the card grid ranges over (pricing.service.ts), so the same
 * listing quotes the same span in search results and on its own page. */
const RATE_RANGE_HORIZON_MONTHS = 12;
const BOOKINGS_UNAVAILABLE_KEY = "mobile.bookings.unavailable";
const BOOKINGS_UNAVAILABLE_SOURCE = "Bookings unavailable";

/**
 * The guests row is only a trigger: the counts themselves live in the stay picker's
 * own guests step, so dates → guests → review → request is one uninterrupted overlay
 * instead of a card and a dialog handing the guest back and forth.
 */
function BookingGuestRow({
  summary,
  detail,
  onOpen,
}: {
  summary: Resolved;
  detail?: Resolved | null;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center justify-between gap-3 bg-background px-4 py-3 text-left transition-colors hover:bg-muted/30 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      onClick={onOpen}
    >
      <span className="min-w-0">
        <span className="block text-[0.68rem] font-semibold uppercase tracking-wide text-foreground">
          <Tx k="booking.guests_label" source="Guests" />
        </span>
        <span
          className={`mt-0.5 block truncate text-sm ${
            summary.text ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          <span className={summary.translated ? "notranslate" : undefined}>
            {summary.text}
          </span>
        </span>
        {detail ? (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            <span className={detail.translated ? "notranslate" : undefined}>
              {detail.text}
            </span>
          </span>
        ) : null}
      </span>
      <ChevronDown
        className="size-4 shrink-0 text-foreground"
        aria-hidden="true"
      />
    </button>
  );
}

/** Resolved copy, with the opt-out the page translator needs when it is already translated. */
function Txt({ value }: { value: Resolved }) {
  return (
    <span className={value.translated ? "notranslate" : undefined}>
      {value.text}
    </span>
  );
}

/**
 * A row that says where one part of the stay stands and leads back to the step that
 * sets it. Deliberately the same shape as the guests row: to a guest, the dates and
 * the party are the same kind of thing — one line, and a way in.
 */
function BookingSummaryRow({
  label,
  value,
  detail,
  done = false,
  onOpen,
}: {
  label: Resolved;
  value: Resolved;
  /** A quieter second line, for what the value on its own leaves out. */
  detail?: Resolved | null;
  done?: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center justify-between gap-3 bg-background px-4 py-3 text-left text-sm transition-colors hover:bg-muted/30 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <span className="flex min-w-0 items-start gap-2">
        {done ? (
          <Check
            className="mt-0.5 size-4 shrink-0 text-primary"
            aria-hidden="true"
          />
        ) : null}
        <span className="min-w-0">
          <span className="block truncate">
            <span className="font-medium text-foreground">
              <Txt value={label} />
            </span>
            <span className="text-muted-foreground">
              {" · "}
              <Txt value={value} />
            </span>
          </span>
          {detail ? (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              <Txt value={detail} />
            </span>
          ) : null}
        </span>
      </span>
      <ChevronRight
        className="mt-0.5 size-4 shrink-0 text-foreground"
        aria-hidden="true"
      />
    </button>
  );
}

/**
 * The title strip of the card's price breakdown.
 *
 * The close control is a corner X rather than a row at the bottom: the card is a fixed
 * height and a footer row is 40px of it. On phones the breakdown is a drawer that
 * closes itself, so `onClose` is left off and the strip is only a title.
 */
function BookingPanelHeader({
  title,
  closeLabel,
  onClose,
}: {
  title: Resolved;
  closeLabel: Resolved;
  onClose?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <p className="text-sm font-semibold">
        <Txt value={title} />
      </p>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel.text}
          className="-mr-1 -mt-1 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

export function BookingWidget({
  listingId,
  maxGuests,
  nightlyRate,
  cleaningFee,
  currency,
  minNights,
  promotions = [],
  disabledDateRanges,
  priceOverrides = [],
  initialCheckIn = "",
  initialCheckOut = "",
  initialGuests,
  initialGuestDetails = { adults: 0, children: 0, infants: 0, pets: 0 },
  requestToBookTooltip,
  acceptedPaymentMethods,
  depositPolicy,
  messageHost,
  houseRules,
  houseRulesVersion,
}: BookingWidgetProps) {
  const i18n = useI18n();
  const dayPrice = useListingDayPrices({
    baseNightlyRate: nightlyRate,
    currency,
    priceOverrides,
    promotions,
    boundedPromotionsOnly: true,
    // The picker in this widget is a dialog over a phone-width card, and its cells
    // are half the listing page's: a symbol in front of every amount is the
    // difference between "3,127" and a number with its tail cut off. The widget
    // around it prices the stay in full, currency and all.
    showCurrencySymbol: false,
  });
  const priceNote = useCellCurrencyNote(currency);
  // `status` and not just the session: "not signed in" and "not known yet" have to
  // be told apart, or the first press of the primary action on a slow session fetch throws the
  // guest at the login page they were already past.
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  // Which presentation the panels get: swapped into the card, or slid up as a
  // drawer. The same query the results sheet uses, so the two agree on where the
  // phone layout ends.
  const isSmallScreen = useSheetEnabled();
  const [isPending, startTransition] = useTransition();
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  // Which step the picker opens on. Every row of the card leads into the same
  // overlay; they differ only in where they start it, and the last of them —
  // request to book — starts it on the step the request is sent from.
  const [pickerStep, setPickerStep] = useState<PickerStep>("dates");
  const [dateFlexibility, setDateFlexibility] = useState(0);
  // Shared with the page's inline availability calendar (and with this widget's
  // own second mount at the other breakpoint) when a provider is above.
  const [{ checkIn: checkInStr, checkOut: checkOutStr }, setStayRange] =
    useListingStayRange({
      checkIn: initialCheckIn,
      checkOut: initialCheckOut,
    });
  const [guestDetails, setGuestDetails] = useState(() => {
    const occupancy = initialGuestDetails.adults + initialGuestDetails.children;
    if (occupancy > 0) return initialGuestDetails;
    return {
      ...initialGuestDetails,
      adults: initialGuests
        ? Math.min(Math.max(initialGuests, 1), maxGuests)
        : 1,
    };
  });
  // Guests always hold a valid value, so the guest step is about intent rather
  // than validity: it is already satisfied when the guest arrived from a search
  // that carried guest counts, and otherwise the moment they open the editor.
  const [guestsConfirmed, setGuestsConfirmed] = useState(
    () =>
      Boolean(initialGuests) ||
      initialGuestDetails.adults +
        initialGuestDetails.children +
        initialGuestDetails.infants +
        initialGuestDetails.pets >
        0,
  );
  const [note, setNote] = useState("");
  /** Whether the review step is showing its note editor. Opened by the second of the
   *  two buttons under the rules, and never open on arrival: the note is optional and
   *  a textarea in the way of the total does not say so. */
  const [noteOpen, setNoteOpen] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * Whether the card is showing its price breakdown in place of the summary.
   *
   * The one thing the card still opens on its own, because it is the one thing a
   * guest wants without committing to anything: what the total is made of. Everything
   * else the card used to swap in — the rules, the note — now lives in the review
   * step, next to the button that acts on it.
   */
  const [priceOpen, setPriceOpen] = useState(false);
  /** The review step's own breakdown, folded away until asked for: the row above it
   *  already carries the number a guest came to check. */
  const [reviewPriceOpen, setReviewPriceOpen] = useState(false);
  const hasSyncedSearchRef = useRef(false);

  useEffect(() => {
    if (!hasSyncedSearchRef.current) {
      hasSyncedSearchRef.current = true;
      return;
    }
    updateActiveSearchState({
      checkIn: checkInStr,
      checkOut: checkOutStr,
      guestCounts: guestDetails,
      dateFlexibility,
    });
  }, [checkInStr, checkOutStr, dateFlexibility, guestDetails]);

  const checkIn = checkInStr ? parseLocalYmd(checkInStr) : undefined;
  const checkOut = checkOutStr ? parseLocalYmd(checkOutStr) : undefined;
  const selectionValidation = validateBookingSelection(
    checkIn,
    checkOut,
    minNights,
    disabledDateRanges,
  );
  const nights = Math.max(0, selectionValidation.nights);

  const overrideMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of priceOverrides) {
      m.set(o.date, o.rate);
    }
    return m;
  }, [priceOverrides]);

  const stayPricing =
    checkIn && checkOut
      ? computeStayQuote({
          baseNightly: nightlyRate,
          cleaningFee,
          checkIn,
          checkOut,
          overrides: overrideMap,
          promotions,
        })
      : null;
  const subtotal = stayPricing?.originalAccommodationSubtotal ?? 0;
  const total = stayPricing?.total ?? 0;
  const hasVariableRates = priceOverrides.length > 0;
  // Once dates are picked the headline rate is the stay's own average rather
  // than the base rate, because the nights it covers may each be priced apart.
  const hasStayQuote = nights > 0 && stayPricing !== null;
  // Before that, the headline spans what the listing actually charges across the year.
  // Same overrides and blocked days the calendar below is already working from, so no
  // extra payload — and a flat-rate listing collapses back to one number.
  const rateRange = useMemo(() => {
    if (hasStayQuote) return null;
    const from = startOfDay(new Date());
    const range = computeNightlyRateRange({
      baseNightly: nightlyRate,
      overrides: overrideMap,
      blockedRanges: disabledDateRanges,
      from,
      to: addMonths(from, RATE_RANGE_HORIZON_MONTHS),
    });
    return range && range.max > range.min ? range : null;
  }, [hasStayQuote, nightlyRate, overrideMap, disabledDateRanges]);

  const guests = guestDetails.adults + guestDetails.children;
  const guestParts = [
    guestDetails.adults > 0 &&
      i18n.plural(
        "booking.adults",
        guestDetails.adults,
        "{n} adult",
        "{n} adults",
      ),
    guestDetails.children > 0 &&
      i18n.plural(
        "booking.children",
        guestDetails.children,
        "{n} child",
        "{n} children",
      ),
    guestDetails.infants > 0 &&
      i18n.plural(
        "booking.infants",
        guestDetails.infants,
        "{n} infant",
        "{n} infants",
      ),
    guestDetails.pets > 0 &&
      i18n.plural("booking.pets", guestDetails.pets, "{n} pet", "{n} pets"),
  ].filter((part): part is Resolved => Boolean(part));
  /**
   * The party as one number, which is the number everything else in the app quotes:
   * the search bar, the listing's capacity, the limit the server checks against.
   */
  const guestSummary: Resolved = guests
    ? i18n.plural("booking.guests", guests, "{n} guest", "{n} guests")
    : i18n.resolve("booking.add_guests", "Add guests");
  /**
   * What that number leaves out, spelled out beneath it — but only when it leaves
   * something out.
   *
   * Infants and pets are not guests for the purpose of capacity, so a party of two
   * adults, an infant and a dog is "3 guests" and the host would never see the rest.
   * A party that is only adults says the same thing twice, so it says nothing.
   */
  const guestBreakdownSummary: Resolved | null =
    guestParts.length > 1
      ? {
          text: guestParts.map((part) => part.text).join(", "),
          translated: guestParts.every((part) => part.translated),
        }
      : null;
  const nightLabel = i18n.plural(
    "booking.nights",
    nights,
    "{n} night",
    "{n} nights",
  );
  const averageNightsLabel = i18n.plural(
    "booking.average_over_nights",
    nights,
    "Average over {n} night",
    "Average over {n} nights",
  );
  const minimumStayMessage = i18n.plural(
    "booking.minimum_stay",
    minNights,
    "Minimum stay is {n} night",
    "Minimum stay is {n} nights",
  );
  const selectDatesMessage = i18n.resolve(
    "booking.select_dates_error",
    "Please select check-in and check-out dates",
  );
  const bookingsUnavailableMessage = i18n.resolve(
    BOOKINGS_UNAVAILABLE_KEY,
    BOOKINGS_UNAVAILABLE_SOURCE,
  );
  const unavailableDatesMessage: Resolved = {
    text: `${bookingsUnavailableMessage.text}. ${selectDatesMessage.text}`,
    translated:
      bookingsUnavailableMessage.translated && selectDatesMessage.translated,
  };
  // "The selection is wrong" (worth an error message) is a different thing from
  // "the selection isn't finished yet" (the primary button says what's next).
  const reserveProblem: Resolved | null =
    selectionValidation.status === "unavailable"
      ? unavailableDatesMessage
      : selectionValidation.status === "minimum-stay"
        ? minimumStayMessage
        : selectionValidation.status === "valid"
          ? null
          : selectDatesMessage;
  const blockingProblem: Resolved | null =
    selectionValidation.status === "incomplete" ? null : reserveProblem;
  /**
   * The step of the overlay this stay is up to — which is also what the card's button
   * offers to do next. A guest who arrived from a search carrying dates and a party is
   * already at `review`, and presses request to book once.
   */
  const reserveStep: PickerStep =
    selectionValidation.status !== "valid"
      ? "dates"
      : // A party of nobody is not a party: infants and pets don't consume capacity,
        // so a selection made only of them has no one the booking is for. The server
        // refuses `guestCount: 0` outright, and this is what keeps the guest from
        // meeting that refusal as a validation error after they pressed request to book.
        !guestsConfirmed || guests < 1
        ? "guests"
        : "review";
  // "Request to book" and not "Reserve": nothing is held and nothing is charged by
  // pressing it. It sends a request the host still has to accept, and the line under
  // the button says what happens if they do.
  const requestToBookLabel = i18n.resolve(
    "booking.request_to_book",
    "Request to book",
  );
  // Reuses the search catalog's existing key so the copy stays translated.
  const whosComingLabel = i18n.resolve("search.whos_coming", "Who's coming");
  /**
   * What the guest step's button promises.
   *
   * Not the request itself, which is what it used to offer while the guest was still counting
   * heads — and which, on a listing whose rules were already agreed, really did send
   * the request from a dialog that had never shown a total. It moves to the review,
   * and says so.
   */
  const continueLabel = i18n.resolve("mobile.generic.continue", "Continue");
  const datesRowLabel = i18n.resolve("booking.dates", "Dates");
  const guestsRowLabel = i18n.resolve("booking.guests_label", "Guests");
  const addDatesLabel = i18n.resolve("search.add_dates", "Add dates");
  const stayRangeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.requestedLocale, {
        month: "short",
        day: "numeric",
      }),
    [i18n.requestedLocale],
  );
  const stayRangeSummary: Resolved =
    checkIn && checkOut
      ? {
          text: `${stayRangeFormatter.format(checkIn)} – ${stayRangeFormatter.format(checkOut)}`,
          translated: true,
        }
      : checkIn
        ? { text: stayRangeFormatter.format(checkIn), translated: true }
        : addDatesLabel;
  const primaryActionLabel =
    reserveStep === "dates"
      ? i18n.resolve("booking.select_dates_cta", "Select dates")
      : reserveStep === "guests"
        ? i18n.resolve("booking.select_guests_cta", "Select guests")
        : requestToBookLabel;
  const pickerMessage =
    selectionValidation.status === "unavailable"
      ? unavailableDatesMessage
      : minimumStayMessage;
  const houseRulesTitle = i18n.resolve("booking.house_rules_title", "House rules");
  /**
   * The disclosure that makes the request an acceptance.
   *
   * The rules are in this step, a finger's scroll above the button, and this says what
   * pressing it means. It replaces a separate "I agree and reserve" panel of its
   * own: same acceptance, same record on the server — `houseRulesAcceptedAt` and the
   * version fingerprint are still written from this press — one fewer screen between a
   * guest and the request they came to send.
   */
  const rulesAgreementNotice = i18n.resolve(
    "booking.house_rules_agreement_request",
    "By sending this request you agree to the house rules above.",
  );
  const messageTitle = i18n.resolve(
    "booking.message_optional",
    "Message to host (optional)",
  );
  // Short on purpose: this button sits beside request to book and must not out-weigh it.
  // What the note is for is the heading over the box it opens.
  const addNoteLabel = i18n.resolve("booking.message_add_cta", "Add a note");
  const priceDetailsLabel = i18n.resolve(
    "booking.price_details",
    "Price details",
  );
  const closePanelLabel = i18n.resolve("booking.close_panel", "Close");
  const reviewTitle = i18n.resolve(
    "booking.confirm_title",
    "Confirm your request",
  );
  const bookingMessage = error
    ? { text: error, translated: false }
    : blockingProblem;
  const bookingMessageIsError = Boolean(bookingMessage);
  const appliedPromotion = stayPricing?.appliedPromotion ?? null;
  const promotionLabel =
    (stayPricing?.appliedPromotions.length ?? 0) > 1
      ? i18n.resolve(
          "booking.multiple_promotions_applied",
          "Best promotions applied",
        )
      : appliedPromotion
        ? resolvePromotionLabel(i18n, appliedPromotion)
        : null;

  /**
   * The price breakdown, in place of the card's summary or as a drawer on a phone.
   * One path for both breakpoints, so a guest cannot meet the breakdown in two
   * different shapes from one press.
   */
  function openPrice() {
    if (!hasStayQuote) return;
    setPriceOpen(true);
  }

  function closePrice() {
    setPriceOpen(false);
  }

  function openPicker(step: PickerStep) {
    setPickerStep(step);
    // Opening straight at guests counts as the confirmation the sticky button
    // was waiting for; the picker's own onStepChange covers the dates → guests path.
    if (step !== "dates") setGuestsConfirmed(true);
    setError(null);
    // The overlay carries its own copy of the breakdown, so leaving the card's open
    // underneath it would only be something to come back to and close.
    setPriceOpen(false);
    setDatePickerOpen(true);
  }

  /**
   * Sends the guest to sign in, with the stay on the URL so they come back to this
   * listing still holding it.
   *
   * Called before the review step rather than from inside it: sending a guest to log
   * in from under a button they have just read the house rules for makes them do the
   * whole step twice.
   */
  function goToLogin() {
    const returnUrl = new URL(window.location.href);
    returnUrl.searchParams.set("checkIn", checkInStr);
    returnUrl.searchParams.set("checkOut", checkOutStr);
    returnUrl.searchParams.set("adults", String(guestDetails.adults));
    returnUrl.searchParams.set("children", String(guestDetails.children));
    returnUrl.searchParams.set("infants", String(guestDetails.infants));
    returnUrl.searchParams.set("pets", String(guestDetails.pets));
    router.push(
      `/login?callbackUrl=${encodeURIComponent(`${returnUrl.pathname}${returnUrl.search}`)}`,
    );
  }

  /**
   * The card's button, at both breakpoints. It never dead-ends and it never sends:
   * whatever the stay is still missing, it opens the overlay on that step, and when
   * nothing is missing it opens the step the request is sent from.
   */
  function handlePrimaryAction() {
    setError(null);

    if (reserveStep !== "review") {
      openPicker(reserveStep);
      return;
    }

    if (sessionStatus === "unauthenticated") {
      goToLogin();
      return;
    }

    openPicker("review");
  }

  /**
   * Sends the request. Reachable from one control only — the review step's request to book —
   * which is the same press that accepts the house rules printed above it.
   */
  function handleSubmit() {
    setError(null);

    if (reserveProblem) {
      setError(reserveProblem.text);
      return;
    }

    // The backstop for the check `handlePrimaryAction` makes before opening the
    // review: a session that expired while the guest read the rules still lands here.
    if (!session) {
      goToLogin();
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("listingId", listingId);
      formData.set("checkIn", checkInStr);
      formData.set("checkOut", checkOutStr);
      formData.set("guestCount", String(guests));
      formData.set("houseRulesAccepted", "true");
      formData.set("houseRulesVersion", houseRulesVersion);
      if (note) formData.set("guestNote", note);

      const result = await createBookingAction(formData);
      if (result?.error) {
        setError(result.error);
        toast.error(result.error);
      }
    });
  }

  function clearSelection() {
    setStayRange({ checkIn: "", checkOut: "" });
    setDateFlexibility(0);
    setGuestDetails({ adults: 1, children: 0, infants: 0, pets: 0 });
    setGuestsConfirmed(false);
    setNote("");
    setNoteOpen(false);
    setError(null);
    setPriceOpen(false);
    updateActiveSearchState({
      checkIn: "",
      checkOut: "",
      guestCounts: { adults: 1, children: 0, infants: 0, pets: 0 },
      dateFlexibility: 0,
    });

    const cleanUrl = new URL(window.location.href);
    [
      "checkIn",
      "checkOut",
      "guests",
      "adults",
      "children",
      "infants",
      "pets",
    ].forEach((key) => cleanUrl.searchParams.delete(key));
    window.history.replaceState(
      window.history.state,
      "",
      `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`,
    );
  }

  function renderPriceBreakdown() {
    if (!(nights > 0 && stayPricing)) return null;
    const breakdown = stayPricing.nightlyBreakdown;
    const uniqueRates = new Set(breakdown.map((n) => n.rate)).size;
    // Nights are listed one by one only when they cost different things. A week at one
    // rate used to print the same figure seven times over — the length test came first
    // and short-circuited the grouping below, which had been written for exactly this
    // and never ran on any stay short enough to reach it.
    const showEachNight = uniqueRates > 1 && breakdown.length <= 14;

    let subtotalLine;
    if (showEachNight) {
      subtotalLine = breakdown.map((n) => (
        <div key={n.date} className="flex justify-between gap-2">
          <span className="text-muted-foreground truncate">{n.date}</span>
          <LocalizedPrice
            exact
            amount={n.rate}
            currency={currency}
            locale={i18n.locale}
          />
        </div>
      ));
    } else if (uniqueRates > 1) {
      subtotalLine = (
        <div className="flex justify-between">
          <span>
            {(() => {
              const value = i18n.plural(
                "booking.variable_rates",
                nights,
                "{n} night (variable nightly rates)",
                "{n} nights (variable nightly rates)",
              );
              return (
                <span className={value.translated ? "notranslate" : undefined}>
                  {value.text}
                </span>
              );
            })()}
          </span>
          <LocalizedPrice
            exact
            amount={subtotal}
            currency={currency}
            locale={i18n.locale}
          />
        </div>
      );
    } else {
      subtotalLine = (
        <div className="flex justify-between">
          <span>
            <LocalizedPrice
              exact
              amount={breakdown[0]?.rate ?? nightlyRate}
              currency={currency}
              locale={i18n.locale}
            />{" "}
            ×{" "}
            <span className={nightLabel.translated ? "notranslate" : undefined}>
              {nightLabel.text}
            </span>
          </span>
          <LocalizedPrice
            exact
            amount={subtotal}
            currency={currency}
            locale={i18n.locale}
          />
        </div>
      );
    }

    return (
      <div className="space-y-2 text-sm">
        {subtotalLine}
        <div className="flex justify-between font-medium pt-1 border-t border-border/60">
          <span>
            <Tx k="booking.subtotal" source="Subtotal (stay)" />
          </span>
          <LocalizedPrice
            exact
            amount={subtotal}
            currency={currency}
            locale={i18n.locale}
          />
        </div>
        {stayPricing.accommodationDiscount > 0 && (
          <div className="flex justify-between text-green-700">
            <span
              className={promotionLabel?.translated ? "notranslate" : undefined}
            >
              {promotionLabel?.text}
            </span>
            <span>
              −
              <LocalizedPrice
                exact
                amount={stayPricing.accommodationDiscount}
                currency={currency}
                locale={i18n.locale}
              />
            </span>
          </div>
        )}
        {stayPricing.originalCleaningFee > 0 && (
          <div className="flex justify-between">
            <span>
              <Tx k="booking.cleaning_fee" source="Cleaning fee" />
            </span>
            {stayPricing.cleaningDiscount > 0 ? (
              <span className="flex items-baseline gap-2">
                <LocalizedPrice
                  exact
                  amount={stayPricing.originalCleaningFee}
                  currency={currency}
                  locale={i18n.locale}
                  className="text-muted-foreground line-through"
                />
                <LocalizedPrice
                  exact
                  amount={0}
                  currency={currency}
                  locale={i18n.locale}
                />
              </span>
            ) : (
              <LocalizedPrice
                exact
                amount={stayPricing.cleaningFee}
                currency={currency}
                locale={i18n.locale}
              />
            )}
          </div>
        )}
        {stayPricing.cleaningDiscount > 0 && (
          <div className="flex justify-between text-green-700">
            <span>
              <Tx k="promotion.free_cleaning" source="Free cleaning" />
            </span>
            <span>
              −
              <LocalizedPrice
                exact
                amount={stayPricing.cleaningDiscount}
                currency={currency}
                locale={i18n.locale}
              />
            </span>
          </div>
        )}
        <Separator />
        <div className="flex justify-between font-semibold">
          <span>
            <Tx k="booking.total" source="Total" />
          </span>
          <LocalizedPrice
            exact
            amount={total}
            currency={currency}
            locale={i18n.locale}
          />
        </div>
        <OfficialAmountNotice amount={total} officialCurrency={currency} />
      </div>
    );
  }


  const hasSelection =
    Boolean(checkInStr) ||
    Boolean(checkOutStr) ||
    Boolean(note) ||
    guests !== 1 ||
    guestDetails.infants > 0 ||
    guestDetails.pets > 0;

  /**
   * What the card rests on: the stay and the party, as two rows over one overlay.
   *
   * The house rules and the note used to be rows here too. They are in the review step
   * now, where the button that acts on them is — a row in a card that can only open a
   * panel in that same card was a second place to do the same thing, and the guest had
   * to find both before the request could be sent.
   */
  function renderSummary() {
    return (
      <div className="space-y-2">
        <div className="overflow-hidden rounded-xl border border-border/50 bg-background">
            <MarketplaceStayDatePicker
              layout="compact"
              checkIn={checkInStr}
              checkOut={checkOutStr}
              open={datePickerOpen}
              onOpenChange={(next) => {
                setDatePickerOpen(next);
                // Otherwise the next open from a date field would land on the
                // step this one was left on.
                if (!next) {
                  setPickerStep("dates");
                  setNoteOpen(false);
                  setReviewPriceOpen(false);
                }
              }}
              initialSegment={checkInStr && !checkOutStr ? "checkout" : "checkin"}
              dateFlexibility={dateFlexibility}
              showDateFlexibility
              onDateFlexibilityChange={setDateFlexibility}
              dayMeta={dayPrice}
              priceNote={priceNote}
              dayVariant="booking"
              initialStep={pickerStep}
              onStepChange={(step) => {
                // Reaching the guests step is the confirmation — the counts are
                // always valid, so the step is about intent, not validity.
                if (step !== "dates") setGuestsConfirmed(true);
                setPickerStep(step);
              }}
              guestCounts={guestDetails}
              onGuestCountsChange={(next) => {
                setGuestDetails(next);
                setGuestsConfirmed(true);
                setError(null);
              }}
              maxOccupancy={maxGuests}
              nextActionLabel={whosComingLabel}
              guestStepTitle={whosComingLabel}
              finalActionLabel={continueLabel}
              finalActionDisabled={
                isPending || selectionValidation.status !== "valid" || guests < 1
              }
              showFinalActionIcon={false}
              // The guest step is a step, not a checkout: it gets the title and the way
              // back to the dates that the search pill's own version does without.
              showGuestStepChrome
              reviewStepTitle={reviewTitle}
              renderReviewStep={renderReviewStep}
              pagedCalendarOnDesktop
              searchPresentation
              showPillGuestAction
              disabledDateRanges={disabledDateRanges}
              minimumStayNights={minNights}
              minimumStayMessage={minimumStayMessage}
              onRangeStringsChange={({ checkIn: ci, checkOut: co }) => {
                setStayRange({ checkIn: ci, checkOut: co });
                setError(null);
              }}
              className="w-full [&_button]:!rounded-none [&_button]:!border-0"
            />
          <div className="border-t border-border/50">
            <BookingGuestRow
              summary={guestSummary}
              detail={guestBreakdownSummary}
              onOpen={() => openPicker("guests")}
            />
          </div>
        </div>
        {selectionValidation.status !== "valid" && checkInStr && checkOutStr && (
          <p aria-live="polite" className="text-sm text-destructive">
            <Txt value={pickerMessage} />
          </p>
        )}
        {hasSelection && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={clearSelection}
              className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              <Tx k="booking.clear_selection" source="Clear selection" />
            </button>
          </div>
        )}
      </div>
    );
  }

  /**
   * The breakdown, without a button: the card's footer supplies that.
   *
   * `dismissable` is the corner X, which the card needs and the drawer does not — a
   * drawer closes itself. It scrolls inside its own box, so a stay priced night by
   * night cannot push the footer off the card.
   */
  function renderPricePanel(dismissable: boolean) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <BookingPanelHeader
          title={priceDetailsLabel}
          closeLabel={closePanelLabel}
          onClose={dismissable ? closePrice : undefined}
        />
        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border/40 bg-muted/15 px-4 py-3">
          {renderPriceBreakdown()}
        </div>
      </div>
    );
  }

  /**
   * The last step of the overlay, and the only place a booking is sent from.
   *
   * Everything the request is made of, in the order a guest checks it: what they
   * picked, what it costs, what the host asks of them, and — behind the second of the
   * two buttons — the note they may want to send along. The rules are printed in full
   * rather than linked, because the line above the button says that pressing it agrees to
   * them, and that is only true of rules the guest was actually shown.
   */
  function renderReviewStep({
    goToStep,
  }: {
    goToStep: (step: "dates" | "guests") => void;
    close: () => void;
  }) {
    return (
      <>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 md:px-6">
          {/* What the request is made of, in one stack: the two things a guest can go
              back and change, and under them what it comes to. The rows navigate, the
              price folds open in place — a press on the price should not cost the
              guest their place in the step. */}
          <div className="overflow-hidden rounded-xl border border-border/50">
            <BookingSummaryRow
              label={datesRowLabel}
              value={stayRangeSummary}
              done={selectionValidation.status === "valid"}
              onOpen={() => goToStep("dates")}
            />
            <div className="border-t border-border/50">
              <BookingSummaryRow
                label={guestsRowLabel}
                value={guestSummary}
                detail={guestBreakdownSummary}
                done={guests > 0}
                onOpen={() => goToStep("guests")}
              />
            </div>
            {hasStayQuote ? (
              <div className="border-t border-border/50">
                <button
                  type="button"
                  onClick={() => setReviewPriceOpen((open) => !open)}
                  aria-expanded={reviewPriceOpen}
                  className="flex w-full items-center justify-between gap-3 bg-muted/20 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/30 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span className="min-w-0 truncate">
                    <span className="font-medium text-foreground">
                      <Txt value={nightLabel} />
                    </span>
                    <span className="text-muted-foreground">{" · "}</span>
                    <LocalizedPrice
                      exact
                      amount={total}
                      currency={currency}
                      locale={i18n.locale}
                      className="font-medium text-foreground"
                    />
                  </span>
                  {reviewPriceOpen ? (
                    <ChevronUp
                      className="size-4 shrink-0 text-foreground"
                      aria-hidden="true"
                    />
                  ) : (
                    <ChevronDown
                      className="size-4 shrink-0 text-foreground"
                      aria-hidden="true"
                    />
                  )}
                </button>
                {reviewPriceOpen ? (
                  <div className="border-t border-border/50 bg-muted/20 px-4 py-3">
                    {renderPriceBreakdown()}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {houseRules ? (
            <div>
              <p className="mb-2 text-sm font-semibold">
                <Txt value={houseRulesTitle} />
              </p>
              <div className="rounded-xl border border-border/40 bg-muted/15 px-4">
                {houseRules}
              </div>
            </div>
          ) : null}

          {noteOpen || note ? (
            <div>
              <p className="mb-2 text-sm font-semibold">
                <Txt value={messageTitle} />
              </p>
              <Textarea
                ref={noteRef}
                autoFocus={noteOpen}
                placeholder={
                  i18n.resolve(
                    "booking.message_placeholder",
                    "Introduce yourself and share your travel plans...",
                  ).text
                }
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="min-h-24 resize-none"
              />
            </div>
          ) : null}

          <BookingReviewPaymentTerms
            t={i18n}
            acceptedPaymentMethods={acceptedPaymentMethods}
            depositPolicy={depositPolicy}
          />
        </div>

        <div className="shrink-0 space-y-3 border-t border-border bg-background px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:px-6 md:pb-4">
          {error ? (
            <p
              aria-live="polite"
              className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm"
            >
              {error}
            </p>
          ) : null}

          {houseRules ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              <Txt value={rulesAgreementNotice} />
            </p>
          ) : null}

          <div className="flex items-center gap-3">
            {/* The note rides along with the request rather than opening a
                conversation: the guest is one press from booking, and a thread is
                where a guest goes when they are not. It takes only the width of its
                own label — the request is what this step is for, and gets the rest. */}
            <Button
              type="button"
              variant="outline"
              className="shrink-0 rounded-full px-5"
              onClick={() => {
                setNoteOpen(true);
                noteRef.current?.focus();
              }}
              disabled={isPending}
            >
              <Txt value={addNoteLabel} />
            </Button>
            <Button
              type="button"
              className="min-w-0 flex-1 rounded-full font-semibold"
              onClick={handleSubmit}
              disabled={isPending}
            >
              {isPending ? (
                <Tx k="booking.sending_request" source="Sending request…" />
              ) : (
                requestToBookLabel.text
              )}
            </Button>
          </div>

          <p className="text-center text-xs leading-relaxed text-muted-foreground">
            <Tx
              k="booking.host_review_notice"
              source="The host will review your request and share payment instructions if it is accepted."
            />
          </p>
        </div>
      </>
    );
  }

  /** The card's one button. It opens the overlay on the step this stay is up to;
   *  the request itself is sent from in there and never from here. */
  function renderFooterButton() {
    return (
      <Button
        onClick={handlePrimaryAction}
        className="w-full rounded-lg py-6 text-base font-semibold disabled:bg-muted disabled:text-muted-foreground"
        size="lg"
        disabled={isPending}
      >
        {isPending ? (
          <Tx k="booking.sending_request" source="Sending request…" />
        ) : (
          primaryActionLabel.text
        )}
      </Button>
    );
  }

  /** The total and the button, pinned under both views of the card so the price is
   *  never the thing a guest has to leave the breakdown to check. */
  function renderFooter() {
    return (
      <div className="mt-auto space-y-3 pt-3">
        {nights > 0 && stayPricing ? (
          <button
            type="button"
            onClick={() => (priceOpen ? closePrice() : openPrice())}
            aria-expanded={priceOpen}
            className="flex w-full items-end justify-between gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span>
              <span className="block text-sm font-medium">
                <Txt value={nightLabel} /> ·{" "}
                <span className="text-muted-foreground">
                  <Tx k="booking.total" source="Total" />
                </span>
              </span>
              <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2">
                <Txt value={priceDetailsLabel} />
                {priceOpen ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </span>
            </span>
            <span className="flex flex-col items-end">
              {stayPricing.discountAmount > 0 ? (
                <LocalizedPrice
                  exact
                  amount={stayPricing.originalTotal}
                  currency={currency}
                  locale={i18n.locale}
                  className="text-sm text-muted-foreground line-through"
                />
              ) : null}
              <LocalizedPrice
                exact
                amount={total}
                currency={currency}
                locale={i18n.locale}
                className="text-xl font-semibold"
              />
            </span>
          </button>
        ) : null}

        {bookingMessage && !priceOpen && (
          <p
            aria-live="polite"
            className={
              bookingMessageIsError
                ? "rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm"
                : "text-sm text-muted-foreground"
            }
          >
            <Txt value={bookingMessage} />
          </p>
        )}

        {priceOpen ? (
          renderFooterButton()
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>{renderFooterButton()}</TooltipTrigger>
            <TooltipContent
              className={
                (blockingProblem ?? requestToBookTooltip).translated
                  ? "notranslate"
                  : undefined
              }
            >
              {(blockingProblem ?? requestToBookTooltip).text}
            </TooltipContent>
          </Tooltip>
        )}

        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          <Tx
            k="booking.host_review_notice"
            source="The host will review your request and share payment instructions if it is accepted."
          />
        </p>
      </div>
    );
  }

  /** The grab handle the results sheet uses, so a drawer here reads as the same kind
   *  of object a guest already met over the map. */
  const drawerHandle = (
    <span
      aria-hidden
      className="mx-auto mt-1 mb-3 block h-1 w-9 shrink-0 rounded-full bg-border"
    />
  );

  return (
    <>
      <Card
        className="notranslate hidden overflow-hidden rounded-2xl border border-border/50 shadow-[0_2px_12px_rgba(15,23,42,0.06)] lg:sticky lg:top-24 lg:flex"
        translate="no"
      >
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-col gap-1 font-normal">
            {hasStayQuote && stayPricing ? (
              <button
                type="button"
                onClick={() => (priceOpen ? closePrice() : openPrice())}
                aria-expanded={priceOpen}
                className="flex flex-col items-start gap-0.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex items-baseline gap-1">
                  {stayPricing.accommodationDiscount > 0 && (
                    <LocalizedPrice
                      amount={stayPricing.averageNightly}
                      currency={currency}
                      locale={i18n.locale}
                      className="text-base text-muted-foreground line-through"
                    />
                  )}
                  <LocalizedPrice
                    amount={stayPricing.effectiveAverageNightly}
                    currency={currency}
                    locale={i18n.locale}
                    className="text-2xl font-semibold"
                  />
                  <span className="text-base font-normal text-muted-foreground">
                    / <Tx k="property_card.per_night" source="night" />
                  </span>
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground underline underline-offset-2">
                  <Txt value={averageNightsLabel} />
                </span>
              </button>
            ) : (
              <div className="flex flex-wrap items-baseline gap-1">
                <LocalizedPrice
                  amount={rateRange ? rateRange.min : nightlyRate}
                  currency={currency}
                  locale={i18n.locale}
                  className="text-2xl font-semibold"
                />
                {rateRange ? (
                  <>
                    <span className="text-2xl font-semibold" aria-hidden="true">
                      –
                    </span>
                    <LocalizedPrice
                      amount={rateRange.max}
                      currency={currency}
                      locale={i18n.locale}
                      className="text-2xl font-semibold"
                    />
                  </>
                ) : null}
                <span className="text-base font-normal text-muted-foreground">
                  / <Tx k="property_card.per_night" source="night" />
                </span>
              </div>
            )}
            {hasVariableRates && !hasStayQuote && (
              <span className="text-xs font-normal text-muted-foreground">
                <Tx
                  k="booking.variable_rate_notice"
                  source="Selected dates may use custom nightly rates shown in the breakdown below."
                />
              </span>
            )}
            {promotionLabel ? (
              <Badge variant="secondary" className="mt-1 w-fit rounded-md">
                <Txt value={promotionLabel} />
              </Badge>
            ) : null}
          </CardTitle>
        </CardHeader>
        {/* The frame: a middle that is either the summary or the breakdown, and a
            footer that never moves. The minimum height is the taller of the two, so
            opening the breakdown does not resize a card the page is scrolled against. */}
        <CardContent className="flex min-h-[21rem] flex-1 flex-col pt-0">
          {/* Below `lg` this card is hidden and the breakdown is the drawer below, so
              the swap is desktop's alone. It also keeps the summary — and with it the
              one mount of the stay picker — in the tree at every width, which is what
              lets the sticky bar open the picker over a drawer. */}
          {priceOpen && !isSmallScreen ? renderPricePanel(true) : renderSummary()}
          {renderFooter()}
        </CardContent>
      </Card>

      <div
        className="notranslate fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 pt-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden"
        translate="no"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        {bookingMessage && !datePickerOpen && (
          <p
            aria-live="polite"
            className={
              bookingMessageIsError
                ? "mb-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm"
                : "mb-2 text-sm text-muted-foreground"
            }
          >
            {bookingMessage.text}
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            className="flex min-w-0 flex-1 flex-col items-start text-left disabled:pointer-events-none"
            onClick={openPrice}
            disabled={!(nights > 0 && stayPricing)}
          >
            {nights > 0 && stayPricing ? (
              <>
                <LocalizedPrice
                  exact
                  amount={total}
                  currency={currency}
                  locale={i18n.locale}
                  className="text-base font-semibold"
                />
                <span className="flex items-center gap-0.5 text-xs text-muted-foreground underline underline-offset-2">
                  <Txt value={nightLabel} /> · <Txt value={priceDetailsLabel} />
                  <ChevronUp className="h-3 w-3" />
                </span>
              </>
            ) : (
              <>
                <span className="flex items-baseline gap-1 text-base font-semibold">
                  <LocalizedPrice
                    amount={rateRange ? rateRange.min : nightlyRate}
                    currency={currency}
                    locale={i18n.locale}
                  />
                  {rateRange ? (
                    <>
                      <span aria-hidden="true">–</span>
                      <LocalizedPrice
                        amount={rateRange.max}
                        currency={currency}
                        locale={i18n.locale}
                      />
                    </>
                  ) : null}
                  <span className="text-xs font-normal text-muted-foreground">
                    / <Tx k="property_card.per_night" source="night" />
                  </span>
                </span>
                {/* The button already says "Select dates", so this line goes to
                    the one constraint worth knowing before opening the picker. */}
                {minNights > 1 && (
                  <span
                    className={`text-xs text-muted-foreground ${
                      minimumStayMessage.translated ? "notranslate" : ""
                    }`}
                  >
                    {minimumStayMessage.text}
                  </span>
                )}
              </>
            )}
          </button>
          {messageHost}
          <Button
            onClick={handlePrimaryAction}
            className="shrink-0 rounded-xl px-6 font-semibold disabled:bg-muted disabled:text-muted-foreground"
            size="lg"
            disabled={isPending}
          >
            {isPending ? (
              <Tx k="booking.sending" source="Sending…" />
            ) : (
              primaryActionLabel.text
            )}
          </Button>
        </div>
      </div>

      {/* The breakdown is a drawer on a phone rather than a swap in place: there is no
          card here to swap the middle of. It is the only thing the bar opens on its
          own — the booking itself is made in the picker's own overlay — and it is
          mounted only at the breakpoint that uses it. */}
      {isSmallScreen ? (
        <Sheet
          open={priceOpen}
          onOpenChange={(next) => {
            if (!next) closePrice();
          }}
        >
          <SheetContent
            side="bottom"
            className="notranslate flex h-[80vh] flex-col rounded-t-2xl px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-10px_30px_rgba(15,23,42,0.14)]"
            translate="no"
          >
            {drawerHandle}
            <SheetHeader className="sr-only">
              <SheetTitle>
                <Txt value={priceDetailsLabel} />
              </SheetTitle>
            </SheetHeader>
            {renderPricePanel(false)}
            {renderFooter()}
          </SheetContent>
        </Sheet>
      ) : null}
    </>
  );
}
