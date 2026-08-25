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
import { useListingDayPrices } from "./use-listing-day-prices";
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
  reserveTooltip: Resolved;
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
 * The panels the booking frame can show in place of its summary.
 *
 * Deliberately not a modal each: the frame's header (what a night costs) and its
 * footer (the total and the button) stay put while the middle changes, so the card
 * is one fixed height no matter which panel is open — the whole point of the
 * rewrite. A guest reading the rules can still see what they are about to pay.
 */
type PanelView = "rules" | "message" | "price";

/** Matches the horizon the card grid ranges over (pricing.service.ts), so the same
 * listing quotes the same span in search results and on its own page. */
const RATE_RANGE_HORIZON_MONTHS = 12;
const BOOKINGS_UNAVAILABLE_KEY = "mobile.bookings.unavailable";
const BOOKINGS_UNAVAILABLE_SOURCE = "Bookings unavailable";

/**
 * The guests row is only a trigger: the counts themselves live in the stay
 * picker's own guests step, so dates → guests → reserve is one uninterrupted
 * sheet instead of two dialogs animating past each other.
 */
function BookingGuestRow({
  summary,
  onOpen,
}: {
  summary: Resolved;
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
 * A row in the summary stack that leads into a panel.
 *
 * Deliberately the same shape as the guests row above it: to a guest, the house rules
 * and the message to the host are the same kind of thing as the party size — one line
 * saying where they stand, and a way in. What used to be a rules table and an empty
 * textarea sitting open in the card is two of these.
 */
function BookingSummaryRow({
  label,
  value,
  done = false,
  onOpen,
}: {
  label: Resolved;
  value: Resolved;
  done?: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center justify-between gap-3 bg-background px-4 py-3 text-left text-sm transition-colors hover:bg-muted/30 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <span className="flex min-w-0 items-center gap-2">
        {done ? (
          <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
        ) : null}
        <span className="min-w-0 truncate">
          <span className="font-medium text-foreground">
            <Txt value={label} />
          </span>
          <span className="text-muted-foreground">
            {" · "}
            <Txt value={value} />
          </span>
        </span>
      </span>
      <ChevronRight
        className="size-4 shrink-0 text-foreground"
        aria-hidden="true"
      />
    </button>
  );
}

/**
 * The title strip of an open panel.
 *
 * The close control is a corner X rather than a row at the bottom: the frame is a
 * fixed height and a footer row is 40px of it. On phones the panel is a drawer that
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
  reserveTooltip,
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
    showCurrencySymbol: true,
  });
  // `status` and not just the session: "not signed in" and "not known yet" have to
  // be told apart, or the first press of reserve on a slow session fetch throws the
  // guest at the login page they were already past.
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  // Which presentation the panels get: swapped into the card, or slid up as a
  // drawer. The same query the results sheet uses, so the two agree on where the
  // phone layout ends.
  const isSmallScreen = useSheetEnabled();
  const [isPending, startTransition] = useTransition();
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  // Which step the picker opens on — the dates row and the guests row lead into
  // the same sheet, they just start it in different places.
  const [pickerStep, setPickerStep] = useState<"dates" | "guests">("dates");
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
  /** Unticked every time. An agreement the guest did not actively give is not an
   *  agreement, so this is never seeded from a previous visit or a query parameter. */
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Which panel the frame is showing; `null` is the summary it rests on.
   *
   * One piece of state for both breakpoints, because it is one decision: the card
   * swaps its middle to this panel, the phone slides the same panel up as a drawer.
   * What the guest is looking at does not depend on how wide their screen is.
   */
  const [panel, setPanel] = useState<PanelView | null>(null);
  /** Phones only: the request summary the sticky bar opens. Panels stack over it. */
  const [confirmOpen, setConfirmOpen] = useState(false);
  /** Edited in the message panel and committed to `note` on save, so leaving the
   *  panel by any other route discards the draft rather than half-keeping it. */
  const [noteDraft, setNoteDraft] = useState("");
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
  const guestSummary: Resolved = guestParts.length
    ? {
        text: guestParts.map((part) => part.text).join(", "),
        translated: guestParts.every((part) => part.translated),
      }
    : i18n.resolve("booking.add_guests", "Add guests");
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
  // Agreement is the last thing missing rather than a condition the button fails on:
  // pressing reserve without it opens the rules, where agreeing and reserving are the
  // same press. That is why there is no longer an error telling the guest to go back
  // and tick something.
  const reserveStep: "dates" | "guests" | "rules" | "reserve" =
    selectionValidation.status !== "valid"
      ? "dates"
      : // A party of nobody is not a party: infants and pets don't consume capacity,
        // so a selection made only of them has no one the booking is for. The server
        // refuses `guestCount: 0` outright, and this is what keeps the guest from
        // meeting that refusal as a validation error after they pressed reserve.
        !guestsConfirmed || guests < 1
        ? "guests"
        : !rulesAccepted && houseRules
          ? "rules"
          : "reserve";
  const reserveLabel = i18n.resolve("booking.reserve", "Reserve");
  // Reuses the search catalog's existing key so the copy stays translated.
  const whosComingLabel = i18n.resolve("search.whos_coming", "Who's coming");
  /**
   * What the picker's last press promises.
   *
   * Not "Reserve", which is what it used to say: nothing is sent from inside the
   * picker, and a button that says reserve while the guest is still counting heads
   * either lies or — on a listing with no rules left to agree to — sends a request
   * from a dialog that never showed them the total. It hands back to the summary,
   * and says so.
   */
  const continueLabel = i18n.resolve("mobile.generic.continue", "Continue");
  const datesRowLabel = i18n.resolve("booking.dates", "Dates");
  const addDatesLabel = i18n.resolve("search.add_dates", "Add dates");
  const stayRangeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.locale, { month: "short", day: "numeric" }),
    [i18n.locale],
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
        : reserveLabel;
  const pickerMessage =
    selectionValidation.status === "unavailable"
      ? unavailableDatesMessage
      : minimumStayMessage;
  const houseRulesTitle = i18n.resolve("booking.house_rules_title", "House rules");
  const houseRulesState = rulesAccepted
    ? i18n.resolve("booking.house_rules_agreed", "Agreed")
    : i18n.resolve("booking.house_rules_review", "Review and agree");
  const agreeAndReserveLabel = i18n.resolve(
    "booking.house_rules_agree_and_reserve",
    "I agree and reserve",
  );
  const messageTitle = i18n.resolve(
    "booking.message_optional",
    "Message to host (optional)",
  );
  const messageRowLabel = i18n.resolve("booking.message_row_label", "Message");
  // The host's own note back, not a label: once written, the row is the message.
  const messageState: Resolved = note
    ? { text: note, translated: false }
    : i18n.resolve("booking.message_add", "Add a note for the host");
  const saveMessageLabel = i18n.resolve("booking.message_save", "Save message");
  const priceDetailsLabel = i18n.resolve(
    "booking.price_details",
    "Price details",
  );
  const closePanelLabel = i18n.resolve("booking.close_panel", "Close");
  const confirmTitle = i18n.resolve(
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
   * Opens a panel. One path for both breakpoints — the card renders `panel` in place
   * of its summary, the phone renders it as a drawer — so nothing here has to know
   * how wide the screen is. The media query this replaced was the only reason a
   * guest could see the breakdown in two different shapes from one press.
   */
  function openPanel(next: PanelView) {
    if (next === "price" && !hasStayQuote) return;
    if (next === "message") setNoteDraft(note);
    setPanel(next);
  }

  function closePanel() {
    setPanel(null);
  }

  function openPicker(step: "dates" | "guests") {
    setPickerStep(step);
    // Opening straight at guests counts as the confirmation the sticky button
    // was waiting for; the picker's own onStepChange covers the dates → guests path.
    if (step === "guests") setGuestsConfirmed(true);
    setDatePickerOpen(true);
  }

  /**
   * The picker's last press. It never sends the request — it closes the picker and
   * hands the guest back to the summary that shows what the stay costs, which on a
   * phone is the confirm sheet the sticky bar opens and on desktop is the card the
   * picker was opened from. Reserve lives there, next to the total, and nowhere else.
   */
  function handlePickerDone() {
    setError(null);
    if (isSmallScreen) setConfirmOpen(true);
  }

  /**
   * Sends the guest to sign in, with the stay on the URL so they come back to this
   * listing still holding it.
   *
   * Called before the house rules rather than after them: an acceptance is never
   * carried across a redirect — deliberately, see `rulesAccepted` — so collecting it
   * from a guest who is about to be bounced to a login page only makes them give it
   * twice.
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
   * The primary button never dead-ends: until the selection is complete it
   * opens whichever step is missing, and only then does it reserve.
   */
  function handlePrimaryAction() {
    setError(null);

    if (reserveStep === "dates") {
      openPicker("dates");
      return;
    }

    if (reserveStep === "guests") {
      openPicker("guests");
      return;
    }

    if (sessionStatus === "unauthenticated") {
      goToLogin();
      return;
    }

    // The rules are the last missing step, and the panel's own button both agrees
    // and sends — so this opens it rather than refusing the press.
    if (reserveStep === "rules") {
      openPanel("rules");
      return;
    }

    handleSubmit();
  }

  /**
   * The sticky bar's button. It finishes the selection the same way the card's does,
   * but once the selection is whole it opens the request summary rather than sending:
   * on a phone the bar is all a guest can see of the booking, and nobody should send
   * a request from a control that never showed them what is in it.
   */
  function handleBarAction() {
    setError(null);

    if (reserveStep === "dates") {
      openPicker("dates");
      return;
    }

    if (reserveStep === "guests") {
      openPicker("guests");
      return;
    }

    setConfirmOpen(true);
  }

  /** The rules panel's button: the agreement and the request are one press, because
   *  the guest is looking at the rules as they make it. */
  function acceptRulesAndSubmit() {
    setRulesAccepted(true);
    setPanel(null);
    handleSubmit({ rulesAccepted: true });
  }

  function saveMessage() {
    setNote(noteDraft);
    setPanel(null);
  }

  /** `accepted` lets the rules panel submit in the same press it agrees in, without
   *  waiting a render for the state it just set. */
  function handleSubmit({ rulesAccepted: accepted = rulesAccepted } = {}) {
    setError(null);

    if (reserveProblem) {
      setError(reserveProblem.text);
      return;
    }

    // Checked here as well as on the server. The server is the one that decides — it
    // refuses a request that does not carry the acceptance — and this exists so the
    // guest is told which control they missed instead of watching a request fail.
    if (!accepted) {
      const message = i18n.resolve(
        "booking.house_rules_required",
        "Please agree to the house rules before you send your request.",
      ).text;
      setError(message);
      toast.error(message);
      return;
    }

    // The backstop for the check `handlePrimaryAction` makes before the rules panel:
    // a session that expired while the guest was reading them still lands here.
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
    setNoteDraft("");
    setRulesAccepted(false);
    setError(null);
    setPanel(null);
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
    const showEachNight =
      breakdown.length <= 7 ||
      (hasVariableRates && uniqueRates > 1 && breakdown.length <= 14);

    let subtotalLine;
    if (showEachNight) {
      subtotalLine = breakdown.map((n) => (
        <div key={n.date} className="flex justify-between gap-2">
          <span className="text-muted-foreground truncate">{n.date}</span>
          <LocalizedPrice
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
                  amount={stayPricing.originalCleaningFee}
                  currency={currency}
                  locale={i18n.locale}
                  className="text-muted-foreground line-through"
                />
                <LocalizedPrice
                  amount={0}
                  currency={currency}
                  locale={i18n.locale}
                />
              </span>
            ) : (
              <LocalizedPrice
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
            amount={total}
            currency={currency}
            locale={i18n.locale}
          />
        </div>
        <OfficialAmountNotice amount={total} officialCurrency={currency} />
      </div>
    );
  }


  /**
   * The button under the total belongs to whatever the frame is showing: it reserves
   * from the summary, agrees and reserves from the rules, saves from the message. One
   * button in one place, so the frame never grows a second one to hold a panel's action.
   */
  const footerAction =
    panel === "rules"
      ? { label: agreeAndReserveLabel, run: acceptRulesAndSubmit }
      : panel === "message"
        ? { label: saveMessageLabel, run: saveMessage }
        : { label: primaryActionLabel, run: handlePrimaryAction };

  const hasSelection =
    Boolean(checkInStr) ||
    Boolean(checkOutStr) ||
    Boolean(note) ||
    rulesAccepted ||
    guests !== 1 ||
    guestDetails.infants > 0 ||
    guestDetails.pets > 0;

  /**
   * The stay, the party and the two things a guest still owes the host, as one stack
   * of rows. The picker is a row of it rather than a section above it, so opening the
   * calendar, the guest count, the rules or the message are all the same gesture.
   *
   * `mountPicker` is false in exactly one place: the phone's confirm sheet, which
   * shows the same rows over a card that is only hidden by CSS and therefore still
   * mounted. Two mounts of the picker means two dialogs in the portal from one press
   * — the same calendar drawn twice over itself — so the sheet's dates row opens the
   * card's picker instead of bringing its own.
   */
  function renderSummary({ mountPicker = true } = {}) {
    return (
      <div className="space-y-2">
        <div className="overflow-hidden rounded-xl border border-border/50 bg-background">
          {mountPicker ? (
            <MarketplaceStayDatePicker
              layout="compact"
              checkIn={checkInStr}
              checkOut={checkOutStr}
              open={datePickerOpen}
              onOpenChange={(next) => {
                setDatePickerOpen(next);
                // Otherwise the next open from a date field would land on the
                // guests step this one was left on.
                if (!next) setPickerStep("dates");
              }}
              initialSegment={checkInStr && !checkOutStr ? "checkout" : "checkin"}
              dateFlexibility={dateFlexibility}
              showDateFlexibility
              onDateFlexibilityChange={setDateFlexibility}
              dayMeta={dayPrice}
              dayVariant="booking"
              initialStep={pickerStep}
              onStepChange={(step) => {
                // Reaching the guests step is the confirmation — the counts are
                // always valid, so the step is about intent, not validity.
                if (step === "guests") setGuestsConfirmed(true);
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
              onFinalAction={handlePickerDone}
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
          ) : (
            <BookingSummaryRow
              label={datesRowLabel}
              value={stayRangeSummary}
              done={selectionValidation.status === "valid"}
              onOpen={() => openPicker("dates")}
            />
          )}
          <div className="border-t border-border/50">
            <BookingGuestRow
              summary={guestSummary}
              onOpen={() => openPicker("guests")}
            />
          </div>
          {houseRules ? (
            <div className="border-t border-border/50">
              <BookingSummaryRow
                label={houseRulesTitle}
                value={houseRulesState}
                done={rulesAccepted}
                onOpen={() => openPanel("rules")}
              />
            </div>
          ) : null}
          <div className="border-t border-border/50">
            <BookingSummaryRow
              label={messageRowLabel}
              value={messageState}
              done={Boolean(note)}
              onOpen={() => openPanel("message")}
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
   * A panel's own content, without a button: the frame's footer supplies that.
   *
   * `dismissable` is the corner X, which the card needs and the drawer does not — a
   * drawer closes itself. A panel scrolls inside its own box, so a host with a lot to
   * say about their rules cannot push the button off the screen.
   */
  function renderPanel(dismissable: boolean) {
    if (panel === "rules") {
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <BookingPanelHeader
            title={houseRulesTitle}
            closeLabel={closePanelLabel}
            onClose={dismissable ? closePanel : undefined}
          />
          {/* The listing's own rules, rendered by the server and shown here in full
              rather than linked. A guest agreeing to rules they would have to scroll
              away to read has not been shown them — which is why the button that
              agrees to them sits under this panel and nowhere else. */}
          <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border/40 bg-muted/15 px-4">
            {houseRules}
          </div>
        </div>
      );
    }

    if (panel === "message") {
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <BookingPanelHeader
            title={messageTitle}
            closeLabel={closePanelLabel}
            onClose={dismissable ? closePanel : undefined}
          />
          <Textarea
            autoFocus
            placeholder={
              i18n.resolve(
                "booking.message_placeholder",
                "Introduce yourself and share your travel plans...",
              ).text
            }
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value)}
            className="min-h-0 flex-1 resize-none"
          />
        </div>
      );
    }

    if (panel === "price") {
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <BookingPanelHeader
            title={priceDetailsLabel}
            closeLabel={closePanelLabel}
            onClose={dismissable ? closePanel : undefined}
          />
          <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border/40 bg-muted/15 px-4 py-3">
            {renderPriceBreakdown()}
          </div>
        </div>
      );
    }

    return null;
  }

  function renderFooterButton() {
    return (
      <Button
        onClick={footerAction.run}
        className="w-full rounded-lg py-6 text-base font-semibold disabled:bg-muted disabled:text-muted-foreground"
        size="lg"
        disabled={isPending}
      >
        {isPending ? (
          <Tx k="booking.sending_request" source="Sending request…" />
        ) : (
          footerAction.label.text
        )}
      </Button>
    );
  }

  /** The total and the button, pinned under every view so the price is never the
   *  thing a guest has to leave a panel to check. */
  function renderFooter() {
    return (
      <div className="mt-auto space-y-3 pt-3">
        {nights > 0 && stayPricing ? (
          <button
            type="button"
            onClick={() =>
              panel === "price" ? closePanel() : openPanel("price")
            }
            aria-expanded={panel === "price"}
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
                {panel === "price" ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </span>
            </span>
            <span className="flex flex-col items-end">
              {stayPricing.discountAmount > 0 ? (
                <LocalizedPrice
                  amount={stayPricing.originalTotal}
                  currency={currency}
                  locale={i18n.locale}
                  className="text-sm text-muted-foreground line-through"
                />
              ) : null}
              <LocalizedPrice
                amount={total}
                currency={currency}
                locale={i18n.locale}
                className="text-xl font-semibold"
              />
            </span>
          </button>
        ) : null}

        {bookingMessage && panel === null && (
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

        {panel === null ? (
          <Tooltip>
            <TooltipTrigger asChild>{renderFooterButton()}</TooltipTrigger>
            <TooltipContent
              className={
                (blockingProblem ?? reserveTooltip).translated
                  ? "notranslate"
                  : undefined
              }
            >
              {(blockingProblem ?? reserveTooltip).text}
            </TooltipContent>
          </Tooltip>
        ) : (
          renderFooterButton()
        )}

        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          <Tx
            k="booking.no_charge_notice"
            source="You won't be charged yet. The host will approve or decline your request."
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
                onClick={() =>
                  panel === "price" ? closePanel() : openPanel("price")
                }
                aria-expanded={panel === "price"}
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
        {/* The frame: a middle the views take turns in, and a footer that never moves.
            The minimum height is the tallest view's, so swapping panels does not
            resize a card the page is already scrolled against. */}
        <CardContent className="flex min-h-[21rem] flex-1 flex-col pt-0">
          {panel === null ? renderSummary() : renderPanel(true)}
          {renderFooter()}
        </CardContent>
      </Card>

      <div
        className="notranslate fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 pt-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden"
        translate="no"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        {bookingMessage && !confirmOpen && (
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
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            className="flex min-w-0 flex-col items-start text-left disabled:pointer-events-none"
            onClick={() => openPanel("price")}
            disabled={!(nights > 0 && stayPricing)}
          >
            {nights > 0 && stayPricing ? (
              <>
                <LocalizedPrice
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
          <Button
            onClick={handleBarAction}
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

      {/* Phones show the same views as drawers rather than in place: there is no card
          to swap the middle of, and a sheet that slides up from the bottom is what
          this app already does with the map's results. Mounted only at the breakpoint
          that uses them, so a panel opened in the card never also opens an overlay. */}
      {isSmallScreen ? (
        <>
          <Sheet
            open={confirmOpen}
            onOpenChange={(next) => {
              setConfirmOpen(next);
              if (!next) closePanel();
            }}
          >
            <SheetContent
              side="bottom"
              className="notranslate max-h-[88vh] rounded-t-2xl px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-10px_30px_rgba(15,23,42,0.14)]"
              translate="no"
            >
              {drawerHandle}
              <SheetHeader className="p-0">
                <SheetTitle className="text-base">
                  <Txt value={confirmTitle} />
                </SheetTitle>
              </SheetHeader>
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                {renderSummary({ mountPicker: false })}
                {renderFooter()}
              </div>
            </SheetContent>
          </Sheet>

          <Sheet
            open={panel !== null}
            onOpenChange={(next) => {
              if (!next) closePanel();
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
                  <Txt
                    value={
                      panel === "rules"
                        ? houseRulesTitle
                        : panel === "message"
                          ? messageTitle
                          : priceDetailsLabel
                    }
                  />
                </SheetTitle>
              </SheetHeader>
              {renderPanel(false)}
              {renderFooter()}
            </SheetContent>
          </Sheet>
        </>
      ) : null}
    </>
  );
}
