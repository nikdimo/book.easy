"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { addMonthsToYmd, todayYmd } from "@/lib/utils/date-only";
import {
  computeNightlyRateRange,
  computeStayQuote,
  parseLocalYmd,
  type StayPromotion,
} from "@/lib/utils/stay-pricing";
import {
  bookableStayFromSearch,
  stayLengthCap,
  validateBookingSelection,
} from "@/lib/utils/booking-selection";
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
import { ChevronDown, ChevronUp, X } from "lucide-react";
import {
  ACTIVE_SEARCH_STORAGE_KEY,
  parseActiveSearchState,
  updateActiveSearchState,
  type ActiveSearchState,
} from "@/lib/marketplace-search-state";
import type { GuestCounts } from "@/components/marketplace/marketplace-guest-selector";
import {
  clearBookingResumeDraft,
  takeBookingResumeDraft,
  writeBookingResumeDraft,
} from "@/lib/booking-resume";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Resolved } from "@/lib/i18n/t";
import { Tx, useI18n } from "@/lib/i18n/client";
import { BookingReviewPaymentTerms } from "@/components/booking/booking-review-payment-terms";
import {
  acceptedPaymentMethodCodes,
  hasReviewedPaymentMethods,
  type AcceptedPaymentMethodCode,
  type AcceptedPaymentMethodsPresentation,
} from "@/components/booking/accepted-payment-methods";
import type { DepositPoliciesSnapshotV2 } from "@/lib/payments/deposit-policies";
import type { CancellationPolicySnapshotV1 } from "@/lib/payments/cancellation-policy";
import {
  useCellCurrencyNote,
  useListingDayPrices,
} from "./use-listing-day-prices";
import { applyPetPolicy } from "@/lib/booking-flow";
import { resolvePromotionLabel } from "./promotion-label";
import {
  useListingStayRange,
  usePublishListingBooking,
} from "./listing-stay-context";
import { FixedStayOptions } from "./fixed-stay-options";
import {
  bookingStayFormFields,
  findSelectableFixedStayOption,
  fixedStaySelectionStatus,
  hasSelectableFixedStayOption,
  selectableFixedStayOptions,
  type GuestFixedStayOption,
} from "@/lib/fixed-stay-options";

interface BookingWidgetProps {
  listingId: string;
  maxGuests: number;
  nightlyRate: number;
  cleaningFee: number;
  currency: string;
  minNights: number;
  /** The host's stay-length cap, when the pricing rule sets one. The server has always
   *  enforced it; passing it here is what stops the guest meeting it for the first time
   *  as an error after they pressed request to book. */
  maxNights?: number | null;
  promotions?: StayPromotion[];
  /** Blocked runs as calendar dates — see `BlockedDateRange`. Kept as `yyyy-MM-dd`
   *  across the server boundary so a browser behind UTC does not read the server's
   *  midnight as the day before. */
  disabledDateRanges: { from: string; to: string }[];
  /** yyyy-MM-dd → override nightly rate for that night */
  priceOverrides?: { date: string; rate: number }[];
  /** Seeds the widget from the search the guest arrived with (checkIn/checkOut/guests query params). */
  initialCheckIn?: string;
  initialCheckOut?: string;
  initialGuests?: number;
  initialGuestDetails?: GuestDetails;
  hasExplicitSearchSelection?: boolean;
  /**
   * Whether the listing's house rules take pets. False and the party cannot hold one:
   * not from the picker, and not from a `pets=` link either.
   */
  petsAllowed?: boolean;
  requestToBookTooltip: Resolved;
  /** Public method names only. Never payment instructions, account details or links. */
  acceptedPaymentMethods: AcceptedPaymentMethodsPresentation;
  /** Validated public terms only; no payment destination or operational payment data. */
  depositPolicies: DepositPoliciesSnapshotV2;
  cancellationPolicy?: CancellationPolicySnapshotV1;
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
  /**
   * How this listing sells its dates.
   *
   * Anything but FIXED_STAYS is the calendar every listing has always had, and every
   * branch below leaves that path exactly as it was. FIXED_STAYS swaps the calendar step
   * for the host's list of whole stays and nothing else: the same card, the same sheet,
   * the same guest step, review, payment terms, house rules and breakdown.
   */
  bookingMode?: "FLEXIBLE" | "FIXED_STAYS";
  /**
   * The host's whole stays, as the server projected them for a guest. Past and
   * switched-off stays are already absent; taken ones arrive with `selectable: false`
   * and no reason, which is deliberate.
   */
  fixedStayOptions?: GuestFixedStayOption[];
  /**
   * A stay to open on, when the guest arrived from a dated search that matched one.
   *
   * A pointer, never a selection. It is resolved against `fixedStayOptions` — the
   * projection this same render was handed — so an id that is unknown, switched off,
   * already taken, belongs to another listing, or is simply stale selects nothing at all
   * and leaves the guest choosing for themselves.
   */
  initialFixedStayPeriodId?: string | null;
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
 * sets it.
 *
 * Quiet label over the value, with the way back named as `Edit` on the right. It used
 * to be a chevron row carrying a tick, inside a box with the others — which read as a
 * checklist a guest still had work left in. Nothing on this step is unconfirmed: the
 * dates and the party are both already chosen, and the row is only there for the guest
 * who wants to change one.
 */
function BookingSummaryRow({
  label,
  value,
  detail,
  editLabel,
  onOpen,
}: {
  label: Resolved;
  value: Resolved;
  /** A quieter second line, for what the value on its own leaves out. */
  detail?: Resolved | null;
  editLabel: Resolved;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="-mx-2 flex w-[calc(100%+1rem)] items-start justify-between gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="min-w-0">
        <span className="block text-xs text-muted-foreground">
          <Txt value={label} />
        </span>
        <span className="mt-0.5 block truncate text-sm text-foreground">
          <Txt value={value} />
        </span>
        {detail ? (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            <Txt value={detail} />
          </span>
        ) : null}
      </span>
      <span className="shrink-0 text-sm font-medium text-foreground underline underline-offset-4">
        <Txt value={editLabel} />
      </span>
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

/**
 * The stay the header's search bar is still showing, or null when there is none and
 * whenever the URL already carried one of its own.
 *
 * Read through `useSyncExternalStore` rather than in an effect: the server has no
 * storage to read, so it returns null there and through hydration, and the card fills
 * in on the first client render instead of a beat later. The subscription is the same
 * `storage` event the search bar listens on, which keeps a second tab's search from
 * leaving the two disagreeing.
 */
function useRememberedSearch(skip: boolean): ActiveSearchState | null {
  const raw = useSyncExternalStore(
    (onChange) => {
      window.addEventListener("storage", onChange);
      return () => window.removeEventListener("storage", onChange);
    },
    () => {
      try {
        return window.localStorage.getItem(ACTIVE_SEARCH_STORAGE_KEY);
      } catch {
        // Storage off or full: the card simply opens on no dates, as before.
        return null;
      }
    },
    () => null,
  );
  return useMemo(() => (skip ? null : parseActiveSearchState(raw)), [skip, raw]);
}

export function BookingWidget({
  listingId,
  maxGuests,
  nightlyRate,
  cleaningFee,
  currency,
  minNights,
  maxNights,
  promotions = [],
  disabledDateRanges,
  priceOverrides = [],
  initialCheckIn = "",
  initialCheckOut = "",
  initialGuests,
  initialGuestDetails = { adults: 0, children: 0, infants: 0, pets: 0 },
  hasExplicitSearchSelection = false,
  petsAllowed = true,
  requestToBookTooltip,
  acceptedPaymentMethods,
  depositPolicies,
  cancellationPolicy,
  messageHost,
  houseRules,
  houseRulesVersion,
  bookingMode = "FLEXIBLE",
  fixedStayOptions = [],
  initialFixedStayPeriodId = null,
}: BookingWidgetProps) {
  const isFixedMode = bookingMode === "FIXED_STAYS";
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
  // Shared with the page's inline availability calendar (and with this widget's
  // own second mount at the other breakpoint) when a provider is above.
  const [{ checkIn: checkInStr, checkOut: checkOutStr }, setStayRange] =
    useListingStayRange({
      checkIn: initialCheckIn,
      checkOut: initialCheckOut,
    });
  // The stay the search bar is still showing. It keeps it in browser storage rather
  // than in the URL, so a listing opened from anywhere the results grid did not build
  // the link — the home page, a carousel, favourites, a link followed back — arrives
  // with nothing while the header above it reads "6 sep - 12 sep, 2 guests". Read from
  // the same place the header does, and the card no longer asks for a stay the guest
  // has already given. Only when the URL asked for nothing: an explicit `?checkIn=`
  // wins, and so does one this page dropped on purpose for having gone by.
  const rememberedSearch = useRememberedSearch(hasExplicitSearchSelection);
  const rememberedGuests = useMemo(() => {
    const counts = rememberedSearch?.guestCounts;
    if (!counts || counts.adults + counts.children < 1) return null;
    return applyPetPolicy(
      {
        adults: Math.min(Math.max(counts.adults, 1), maxGuests),
        children: Math.min(counts.children, maxGuests),
        infants: counts.infants,
        pets: counts.pets,
      },
      petsAllowed,
    );
  }, [rememberedSearch, maxGuests, petsAllowed]);
  const urlGuests = useMemo(() => {
    const seed = applyPetPolicy(initialGuestDetails, petsAllowed);
    const occupancy = seed.adults + seed.children;
    if (occupancy > 0) return seed;
    return {
      ...seed,
      adults: initialGuests
        ? Math.min(Math.max(initialGuests, 1), maxGuests)
        : 1,
    };
  }, [initialGuestDetails, initialGuests, maxGuests, petsAllowed]);
  // Null until the guest edits the party themselves, so a remembered search can still
  // seed it after hydration without the card overwriting a choice already made here.
  const [chosenGuestDetails, setGuestDetails] = useState<GuestCounts | null>(
    null,
  );
  const guestDetails = chosenGuestDetails ?? rememberedGuests ?? urlGuests;
  // Guests always hold a valid value, so the guest step is about intent rather
  // than validity: it is already satisfied when the guest arrived from a search
  // that carried guest counts, and otherwise the moment they open the editor.
  // Null the same way: untouched, and answered by whatever the guest arrived with.
  const [guestsAnswered, setGuestsConfirmed] = useState<boolean | null>(null);
  const guestsConfirmed =
    guestsAnswered ??
    (Boolean(rememberedGuests) ||
      Boolean(initialGuests) ||
      initialGuestDetails.adults +
        initialGuestDetails.children +
        initialGuestDetails.infants +
        initialGuestDetails.pets >
        0);
  /**
   * Which of the host's whole stays the guest picked. Null in flexible mode, always.
   *
   * The id and not the dates: the dates are the server's, and holding them here as the
   * source of truth would let a stale copy in this browser outlive the stay it names.
   * The shared range below is set *from* the chosen option, for the summary and the
   * quote, and is cleared again the moment the option stops being selectable.
   */
  const [selectedFixedStayId, setSelectedFixedStayId] = useState<string | null>(
    () =>
      bookingMode === "FIXED_STAYS"
        ? // Resolved, not trusted: only an id this listing is currently offering, and
          // that a guest could actually take, survives into the selection. Everything
          // else — a guessed id, one from another listing, one whose stay was booked
          // between the search and the click — resolves to null, which is the same
          // state as arriving with no link at all.
          (findSelectableFixedStayOption(
            fixedStayOptions,
            initialFixedStayPeriodId,
          )?.id ?? null)
        : null,
  );
  const [note, setNote] = useState("");
  const selectablePaymentMethods = useMemo(
    () =>
      hasReviewedPaymentMethods(acceptedPaymentMethods.reviewedAt)
        ? acceptedPaymentMethodCodes(acceptedPaymentMethods.methodCodes)
        : [],
    [acceptedPaymentMethods],
  );
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<AcceptedPaymentMethodCode | null>(() => {
      const methods = hasReviewedPaymentMethods(acceptedPaymentMethods.reviewedAt)
        ? acceptedPaymentMethodCodes(acceptedPaymentMethods.methodCodes)
        : [];
      return methods.length === 1 ? methods[0] : null;
    });
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
    // Dates travel back only when there are dates. The card renders empty for the
    // render before it adopts a remembered stay, and stays empty for good on a listing
    // whose calendar has those nights taken — neither is the guest giving up their
    // search, and writing the emptiness back would take the stay out of the header
    // they can still see it in. Clearing on purpose is published by `clearSelection`.
    updateActiveSearchState(
      checkInStr || checkOutStr
        ? {
            checkIn: checkInStr,
            checkOut: checkOutStr,
            guestCounts: guestDetails,
          }
        : { guestCounts: guestDetails },
    );
  }, [checkInStr, checkOutStr, guestDetails]);

  // The dates half of the same seed. The selection is shared with the page's
  // availability calendar through a provider above, so it is set rather than derived.
  const hasSeededRememberedRef = useRef(false);
  useEffect(() => {
    if (hasSeededRememberedRef.current) return;
    // A remembered search carries dates, and dates are not a selection on a listing that
    // sells whole stays. Seeding one would put a range in the card that matches no stay
    // the host offers, and price it.
    if (isFixedMode) return;
    if (!rememberedSearch) return;
    hasSeededRememberedRef.current = true;
    if (checkInStr || checkOutStr) return;
    const stay = bookableStayFromSearch(
      rememberedSearch.checkIn,
      rememberedSearch.checkOut,
      todayYmd(),
    );
    // A stay remembered from a search across listings can land on nights this one has
    // taken. Those open an empty picker rather than a selection the card refuses on
    // sight — the guest has not asked this listing anything yet.
    if (
      stay.checkIn &&
      stay.checkOut &&
      validateBookingSelection(
        parseLocalYmd(stay.checkIn),
        parseLocalYmd(stay.checkOut),
        minNights,
        disabledDateRanges,
        maxNights,
      ).status !== "unavailable"
    ) {
      setStayRange({ checkIn: stay.checkIn, checkOut: stay.checkOut });
    }
    // Arrival only: every later change to the dates is the guest's own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rememberedSearch]);

  const checkIn = checkInStr ? parseLocalYmd(checkInStr) : undefined;
  const checkOut = checkOutStr ? parseLocalYmd(checkOutStr) : undefined;
  // Turned into this browser's own midnights once, here, for the picker below — which
  // works in `Date`s throughout and must compare them against the days it renders.
  const disabledDayRanges = useMemo(
    () =>
      disabledDateRanges.map((range) => ({
        from: parseLocalYmd(range.from),
        to: parseLocalYmd(range.to),
      })),
    [disabledDateRanges],
  );
  /** The chosen stay, but only while it is still one a guest may take. */
  const selectedFixedStay = useMemo(
    () =>
      isFixedMode
        ? findSelectableFixedStayOption(fixedStayOptions, selectedFixedStayId)
        : null,
    [isFixedMode, fixedStayOptions, selectedFixedStayId],
  );
  const anyFixedStayOpen = useMemo(
    () => isFixedMode && hasSelectableFixedStayOption(fixedStayOptions),
    [isFixedMode, fixedStayOptions],
  );
  /**
   * A fixed stay is measured against nothing the browser knows.
   *
   * The host chose its dates and its length when they put it on sale, so the minimum,
   * the maximum and the blocked-night test have nothing to say about it — the server
   * skips all three for exactly the same reason. What remains is whether a stay was
   * chosen, in the shape the rest of this card already reads.
   */
  const selectionValidation = isFixedMode
    ? fixedStaySelectionStatus(selectedFixedStay)
    : validateBookingSelection(
        checkIn,
        checkOut,
        minNights,
        disabledDateRanges,
        maxNights,
      );
  const nights = Math.max(0, selectionValidation.nights);

  const overrideMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of priceOverrides) {
      m.set(o.date, o.rate);
    }
    return m;
  }, [priceOverrides]);

  /**
   * What one of the host's stays costs.
   *
   * The product's own quote engine, over the option's two dates, against this listing's
   * ordinary nightly rate, date overrides, cleaning fee and promotions — the same call
   * the selected stay is priced with below and the same one the server runs when the
   * request lands. There is no fixed-stay price, and no second engine that could
   * disagree with the total the guest is about to be shown.
   */
  const quoteFixedStayTotal = (option: GuestFixedStayOption) =>
    computeStayQuote({
      baseNightly: nightlyRate,
      cleaningFee,
      checkIn: parseLocalYmd(option.checkIn),
      checkOut: parseLocalYmd(option.checkOut),
      overrides: overrideMap,
      promotions,
    }).total;
  const openFixedStayOptions = isFixedMode
    ? selectableFixedStayOptions(fixedStayOptions)
    : [];
  const fixedStayStartingTotal =
    openFixedStayOptions.length > 0
      ? Math.min(...openFixedStayOptions.map(quoteFixedStayTotal))
      : null;

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
    // The marketplace's day and the marketplace's horizon — the same two the server
    // builds the card's `nightlyRange` from. Off the browser's own midnight these two
    // readings of the same listing could span different days and print different
    // numbers on the card and in the widget beside it.
    const fromYmd = todayYmd();
    const range = computeNightlyRateRange({
      baseNightly: nightlyRate,
      overrides: overrideMap,
      blockedRanges: disabledDateRanges,
      from: parseLocalYmd(fromYmd),
      to: parseLocalYmd(addMonthsToYmd(fromYmd, RATE_RANGE_HORIZON_MONTHS)),
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
  const chooseStayMessage = i18n.resolve(
    "booking.fixed_stay.choose_prompt",
    "Choose one of the stays the host offers",
  );
  const noStaysOpenMessage = i18n.resolve(
    "booking.fixed_stay.none_open_title",
    "No stays are open right now",
  );
  /**
   * What is missing before a request can be sent, in this listing's own terms.
   *
   * One variable so every button, error line and step below asks the same question of
   * both modes: a flexible listing wants dates, a fixed one wants one of the host's
   * stays, and a fixed one with nothing left to offer says so instead of asking.
   */
  const stayPromptMessage: Resolved = isFixedMode
    ? anyFixedStayOpen
      ? chooseStayMessage
      : noStaysOpenMessage
    : selectDatesMessage;
  const unavailableDatesMessage: Resolved = {
    text: `${bookingsUnavailableMessage.text}. ${selectDatesMessage.text}`,
    translated:
      bookingsUnavailableMessage.translated && selectDatesMessage.translated,
  };
  // "The selection is wrong" (worth an error message) is a different thing from
  // "the selection isn't finished yet" (the primary button says what's next).
  // `maximum-stay` deliberately takes the generic "pick your dates" line rather than a
  // maximum of its own: the calendar refuses to *draw* an over-cap range (it reads the
  // second click as a new check-in), so the only way to arrive here is a stay carried in
  // on a shared link — and the answer to that is the same, reopen the picker at dates.
  const reserveProblem: Resolved | null =
    selectionValidation.status === "unavailable"
      ? unavailableDatesMessage
      : selectionValidation.status === "minimum-stay"
        ? minimumStayMessage
        : selectionValidation.status === "valid"
          ? null
          : stayPromptMessage;
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
        // refuses a party with no adult in it outright, and this is what keeps the
        // guest from meeting that refusal as a validation error after they pressed
        // request to book. The adult check is its own condition rather than folded into
        // the count: the counters let adults fall to zero while children stand, which
        // is a party of two that still has nobody who can hold the booking.
        !guestsConfirmed || guests < 1 || guestDetails.adults < 1
        ? "guests"
        : "review";
  /**
   * The far side of a sign-in the guest was sent to from the request-to-book button.
   *
   * The stay comes back on the URL and is already seeded above; this puts back the note
   * and the payment choice, which travelled in browser storage, and reopens the review
   * so the guest presses one button rather than walking the whole overlay a second time.
   *
   * Waits for the session to be known: `useSession` reports "loading" first, and taking
   * the draft then would spend it on a visitor who turns out not to be signed in.
   */
  /**
   * Lets go of a stay that is no longer on offer.
   *
   * Runs whenever the server's list changes — which is what a `router.refresh()` after a
   * refused request produces. The guest is left with nothing chosen and the card asking
   * for a stay again, rather than being moved onto a different one behind their back.
   */
  useEffect(() => {
    if (!isFixedMode || !selectedFixedStayId) return;
    if (findSelectableFixedStayOption(fixedStayOptions, selectedFixedStayId)) {
      return;
    }
    // Letting go of a stay the server has withdrawn is exactly the "subscribe to an
    // external system" case an effect is for: the list arrives as new props after a
    // `router.refresh()`, and this is the state that has to follow it. Deriving it
    // instead would leave the withdrawn stay's dates in the summary row.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedFixedStayId(null);
    setStayRange({ checkIn: "", checkOut: "" });
  }, [isFixedMode, fixedStayOptions, selectedFixedStayId, setStayRange]);

  const resumeHandledRef = useRef(false);
  useEffect(() => {
    if (resumeHandledRef.current || sessionStatus === "loading") return;
    resumeHandledRef.current = true;
    if (sessionStatus !== "authenticated") return;

    const draft = takeBookingResumeDraft(listingId);
    if (!draft) return;

    // Browser storage is exactly the external system an effect is for, and it cannot be
    // read while rendering: the server has no `localStorage`, so seeding this from the
    // initial render would hydrate against markup that never had the note in it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (draft.note) setNote(draft.note);
    if (
      draft.paymentMethod &&
      (selectablePaymentMethods as string[]).includes(draft.paymentMethod)
    ) {
      setSelectedPaymentMethod(draft.paymentMethod as AcceptedPaymentMethodCode);
    }

    // The chosen stay, restored only if the host still offers it and nobody has taken it
    // in the meantime. Otherwise it is simply dropped: the guest comes back to a card
    // asking them to choose, never to a different stay chosen on their behalf.
    const restoredStay = isFixedMode
      ? findSelectableFixedStayOption(fixedStayOptions, draft.fixedStayPeriodId)
      : null;
    if (restoredStay) {
      setSelectedFixedStayId(restoredStay.id);
      setStayRange({
        checkIn: restoredStay.checkIn,
        checkOut: restoredStay.checkOut,
      });
    }

    // Only when the stay itself survived the trip. Dates that were dropped on the way
    // back — a stay that fell into the past while the guest read their email, or an
    // option someone else booked — leave the guest on the card, whose button already
    // says which step is missing.
    const stayReady = isFixedMode
      ? Boolean(restoredStay ?? selectedFixedStay)
      : selectionValidation.status === "valid";
    const partyReady =
      guestsConfirmed && guests >= 1 && guestDetails.adults >= 1;
    if (stayReady && partyReady) openPicker("review");
    // Arrival only: `reserveStep` and the selection it reads are a snapshot of the
    // render this draft was taken in, and the effect must not re-run as they settle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, listingId, selectablePaymentMethods, reserveStep]);
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
  const chooseStayCta = i18n.resolve(
    "booking.fixed_stay.choose_cta",
    "Choose a stay",
  );
  const viewStaysCta = i18n.resolve(
    "booking.fixed_stay.view_cta",
    "View stays",
  );
  const stayCategoryLabel = i18n.resolve(
    "booking.fixed_stay.trigger_label",
    "Stay",
  );
  const fixedStayFromLabel = i18n.resolve(
    "booking.fixed_stay.from",
    "From",
  );
  const fixedStayPerStayLabel = i18n.resolve(
    "booking.fixed_stay.per_stay",
    "per stay",
  );
  const fixedStayAvailableCountLabel = i18n.plural(
    "booking.fixed_stay.available_count",
    openFixedStayOptions.length,
    "{n} stay available",
    "{n} stays available",
  );
  const pickStayCta = isFixedMode
    ? chooseStayCta
    : i18n.resolve("booking.select_dates_cta", "Select dates");
  const guestStepActionLabel =
    selectionValidation.status === "valid" ? continueLabel : pickStayCta;
  const datesRowLabel = i18n.resolve("booking.dates", "Dates");
  const guestsRowLabel = i18n.resolve("booking.guests_label", "Guests");
  // Names the way back to a step, in place of a chevron that only pointed at one.
  const editRowLabel = i18n.resolve("booking.summary_edit", "Edit");
  const totalRowLabel = i18n.resolve("booking.review_total", "Total");
  const addDatesLabel = i18n.resolve("search.add_dates", "Add dates");
  const stayRangeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.locale, {
        month: "short",
        day: "numeric",
      }),
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
    isFixedMode && !anyFixedStayOpen
      ? fixedStayOptions.length > 0
        ? viewStaysCta
        : noStaysOpenMessage
      : reserveStep === "dates"
      ? pickStayCta
      : reserveStep === "guests"
        ? i18n.resolve("booking.select_guests_cta", "Select guests")
        : requestToBookLabel;
  // The page's inline availability calendar sits below this card, past the end of the
  // sticky column, so a guest who picks dates down there has no button in sight. It
  // borrows this one — same label, same total, same press — rather than growing a
  // second booking flow of its own.
  usePublishListingBooking(
    {
      label: primaryActionLabel.text,
      labelTranslated: primaryActionLabel.translated,
      nights: hasStayQuote ? nights : 0,
      total,
      currency,
      busy: isPending,
    },
    handlePrimaryAction,
  );
  const pickerMessage = isFixedMode
    ? stayPromptMessage
    : selectionValidation.status === "unavailable"
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

  /**
   * Takes one of the host's stays, and fills the shared range from it.
   *
   * The dates come from the option the server sent, never from anything this browser
   * worked out: the summary, the breakdown and the review all read the shared range, so
   * filling it here is what makes the rest of the card say the same thing it says for a
   * flexible stay. The request itself still sends only the id.
   */
  function selectFixedStay(id: string) {
    const option = findSelectableFixedStayOption(fixedStayOptions, id);
    if (!option) return;
    setSelectedFixedStayId(option.id);
    setStayRange({ checkIn: option.checkIn, checkOut: option.checkOut });
    setError(null);
  }

  /** Clears only the host-defined stay; the guest party and note remain intact. */
  function clearFixedStaySelection() {
    setSelectedFixedStayId(null);
    setStayRange({ checkIn: "", checkOut: "" });
    setError(null);
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
    // A fixed stay is not a date range, so it does not travel as one. Its id goes into
    // the draft below, where coming back can re-check it against what the host still
    // offers; dates on the URL would come back as a selection this listing cannot make.
    if (isFixedMode) {
      returnUrl.searchParams.delete("checkIn");
      returnUrl.searchParams.delete("checkOut");
    } else {
      returnUrl.searchParams.set("checkIn", checkInStr);
      returnUrl.searchParams.set("checkOut", checkOutStr);
    }
    returnUrl.searchParams.set("adults", String(guestDetails.adults));
    returnUrl.searchParams.set("children", String(guestDetails.children));
    returnUrl.searchParams.set("infants", String(guestDetails.infants));
    returnUrl.searchParams.set("pets", String(guestDetails.pets));
    // Everything the return URL cannot carry — see `booking-resume`. Written even when
    // both are empty: its presence is what tells the widget, on the way back, that this
    // page load is the far side of a sign-in and the review is where the guest left off.
    writeBookingResumeDraft({
      listingId,
      note,
      paymentMethod: selectedPaymentMethod,
      fixedStayPeriodId: isFixedMode ? selectedFixedStayId : null,
      savedAt: Date.now(),
    });
    // The login route is itself an intercepted modal. Unmount the booking dialog
    // before navigating so two modal focus traps and two scrims never compete.
    setDatePickerOpen(false);
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

    // The backstop for the same rule the button already applies: nothing may be sent for
    // a fixed listing without a stay that is still on offer at this moment.
    if (isFixedMode && !selectedFixedStay) {
      setError(stayPromptMessage.text);
      return;
    }

    if (selectablePaymentMethods.length > 0 && !selectedPaymentMethod) {
      setError(
        i18n.resolve(
          "booking.payment_method_choice.required",
          "Choose how you would like to pay before sending your request.",
        ).text,
      );
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
      // Exactly one of the two selections, never both — the server refuses a request
      // carrying a period id beside a date, and rightly: which one is authoritative
      // would be unanswerable. A fixed stay travels as an id alone, and the server reads
      // its dates out of its own row.
      const stayFields = bookingStayFormFields(
        isFixedMode
          ? { fixedStayPeriodId: selectedFixedStay!.id }
          : { checkIn: checkInStr, checkOut: checkOutStr },
      );
      for (const [field, value] of Object.entries(stayFields)) {
        formData.set(field, value);
      }
      // All four counters, not the sum of two of them. The server derives the capacity
      // from adults + children and stores infants and pets on their own, so the host
      // finally learns about the cot and the dog the guest picked here.
      formData.set("adults", String(guestDetails.adults));
      formData.set("children", String(guestDetails.children));
      formData.set("infants", String(guestDetails.infants));
      formData.set("pets", String(guestDetails.pets));
      formData.set("houseRulesAccepted", "true");
      formData.set("houseRulesVersion", houseRulesVersion);
      if (selectedPaymentMethod) {
        formData.set("selectedPaymentMethod", selectedPaymentMethod);
      }
      if (note) formData.set("guestNote", note);

      const result = await createBookingAction(formData);
      if (result?.error) {
        setError(result.error);
        toast.error(result.error);
        // The refusal a fixed stay is most likely to meet is "someone took it while you
        // were reading". Re-fetch the host's list; the effect above drops the selection
        // if this stay is no longer among the ones a guest may take.
        if (isFixedMode) router.refresh();
      }
    });
  }

  function clearSelection() {
    // Nothing left to come back to, so a draft written before an abandoned sign-in must
    // not outlive the selection it belonged to.
    clearBookingResumeDraft();
    setSelectedFixedStayId(null);
    setStayRange({ checkIn: "", checkOut: "" });
    // The one clearing the header follows, since the effect above leaves an empty
    // selection alone.
    updateActiveSearchState({ checkIn: "", checkOut: "" });
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
              showDateFlexibility={false}
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
              // Only on a fixed-stay listing: the calendar step becomes the host's list
              // of whole stays, and every other part of this overlay — the guest step,
              // the review, the payment terms, the rules, the breakdown — is untouched.
              renderDatesStep={
                isFixedMode
                  ? () => (
                      <FixedStayOptions
                        name={`fixed-stay-${listingId}-${isSmallScreen ? "sheet" : "card"}`}
                        options={fixedStayOptions}
                        selectedId={selectedFixedStayId}
                        onSelect={selectFixedStay}
                        quoteTotal={quoteFixedStayTotal}
                        currency={currency}
                      />
                    )
                  : undefined
              }
              dateDialogTitle={isFixedMode ? chooseStayCta : undefined}
              dateDialogDescription={isFixedMode ? chooseStayMessage : undefined}
              selectionCategoryLabel={
                isFixedMode ? stayCategoryLabel : undefined
              }
              emptySelectionLabel={isFixedMode ? chooseStayCta : undefined}
              onResetSelection={
                isFixedMode ? clearFixedStaySelection : undefined
              }
              onGuestCountsChange={(next) => {
                setGuestDetails(applyPetPolicy(next, petsAllowed));
                setGuestsConfirmed(true);
                setError(null);
              }}
              maxOccupancy={maxGuests}
              petsAllowed={petsAllowed}
              nextActionLabel={whosComingLabel}
              guestStepTitle={whosComingLabel}
              finalActionLabel={guestStepActionLabel}
              finalActionDisabled={
                isPending || guests < 1 || guestDetails.adults < 1
              }
              reviewStepEnabled={selectionValidation.status === "valid"}
              // Set the moment the guest reaches the party step, and already true for a
              // guest who arrived from a search carrying one. The calendar reads it so
              // stepping back to fix dates goes on to the review instead of asking for
              // the party a second time.
              guestsAnswered={guestsConfirmed}
              showFinalActionIcon={false}
              // The guest step is a step, not a checkout: it gets the title and the way
              // back to the dates that the search pill's own version does without.
              showGuestStepChrome
              reviewStepTitle={reviewTitle}
              renderReviewStep={renderReviewStep}
              pagedCalendarOnDesktop
              searchPresentation
              showPillGuestAction
              disabledDateRanges={disabledDayRanges}
              minimumStayNights={minNights}
              maximumStayNights={stayLengthCap(maxNights) ?? undefined}
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
        {/* One column of sections divided by hairlines, and no box anywhere in it.
            Every part of this step used to sit in a rounded border of its own — the
            summary, the rules, each block of the payment terms, and the terms around
            them — which put three frames between the guest and a sentence. The rule
            here is that a border is for something you can press; everything else is
            separated by the line above it and the space around it. */}
        <div className="min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto px-4 py-1 md:px-6">
          {/* What the request is made of: the two things a guest can go back and
              change, and under them what it comes to. The rows navigate, the price
              folds open in place — a press on the price should not cost the guest
              their place in the step. */}
          <div className="py-3">
            <BookingSummaryRow
              label={datesRowLabel}
              value={stayRangeSummary}
              editLabel={editRowLabel}
              onOpen={() => goToStep("dates")}
            />
            <BookingSummaryRow
              label={guestsRowLabel}
              value={guestSummary}
              detail={guestBreakdownSummary}
              editLabel={editRowLabel}
              onOpen={() => goToStep("guests")}
            />
          </div>

          {hasStayQuote ? (
            <div className="py-1">
              <button
                type="button"
                onClick={() => setReviewPriceOpen((open) => !open)}
                aria-expanded={reviewPriceOpen}
                className="-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0 truncate text-base font-semibold text-foreground">
                  <Txt value={totalRowLabel} />
                  <span className="font-normal text-muted-foreground">
                    {" · "}
                    <Txt value={nightLabel} />
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <LocalizedPrice
                    exact
                    amount={total}
                    currency={currency}
                    locale={i18n.locale}
                    className="text-base font-semibold text-foreground"
                  />
                  {reviewPriceOpen ? (
                    <ChevronUp
                      className="size-4 text-foreground"
                      aria-hidden="true"
                    />
                  ) : (
                    <ChevronDown
                      className="size-4 text-foreground"
                      aria-hidden="true"
                    />
                  )}
                </span>
              </button>
              {reviewPriceOpen ? (
                <div className="pb-3 pt-1">{renderPriceBreakdown()}</div>
              ) : null}
            </div>
          ) : null}

          {houseRules ? (
            <div className="py-4">
              <p className="mb-1 text-base font-semibold">
                <Txt value={houseRulesTitle} />
              </p>
              {houseRules}
            </div>
          ) : null}

          {noteOpen || note ? (
            <div className="py-4">
              <p className="mb-2 text-base font-semibold">
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
            // The listing page keeps the cards; in here they were the third frame
            // deep, so the terms are printed as the sections they are. Not a word of
            // them is dropped — a guest agrees to what this step showed them.
            appearance="plain"
            acceptedPaymentMethods={acceptedPaymentMethods}
            depositPolicies={depositPolicies}
            cancellationPolicy={cancellationPolicy}
            selectedPaymentMethod={selectedPaymentMethod}
            onSelectedPaymentMethodChange={(method) => {
              setSelectedPaymentMethod(method);
              setError(null);
            }}
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

          {/* One button, at full width. The note used to stand beside it as an
              outlined pill of the same height, which halved the weight of the only
              thing this step is for — and the note is an escape hatch a minority of
              guests want, not a second way out of the step. It is a link in the fine
              print now, where the rest of the optional reading is. */}
          <Button
            type="button"
            className="w-full rounded-lg py-6 text-base font-semibold"
            onClick={handleSubmit}
            disabled={isPending}
          >
            {isPending ? (
              <Tx k="booking.sending_request" source="Sending request…" />
            ) : (
              requestToBookLabel.text
            )}
          </Button>

          {noteOpen || note ? null : (
            <p className="text-center text-sm">
              <button
                type="button"
                onClick={() => {
                  setNoteOpen(true);
                  // The box is rendered by the state above, so the focus has to wait
                  // for the paint that creates it.
                  requestAnimationFrame(() => noteRef.current?.focus());
                }}
                disabled={isPending}
                className="font-medium text-foreground underline underline-offset-4 hover:no-underline disabled:opacity-60"
              >
                <Txt value={addNoteLabel} />
              </button>
            </p>
          )}

          <p className="text-center text-xs leading-relaxed text-muted-foreground">
            <Tx
              k="booking.host_review_notice"
              source="The host will review your request and share payment instructions if it is accepted."
            />
            {houseRules ? (
              <>
                {" "}
                <Txt value={rulesAgreementNotice} />
              </>
            ) : null}
          </p>
        </div>
      </>
    );
  }

  /**
   * Whether there is anything for the card's button to do.
   *
   * A sold-out season can still be opened so the guest sees its disabled options. Only
   * a listing with no guest-visible stays at all has nothing for this control to show.
   */
  const primaryActionDisabled =
    isPending || (isFixedMode && fixedStayOptions.length === 0);

  /** The card's one button. It opens the overlay on the step this stay is up to;
   *  the request itself is sent from in there and never from here. */
  function renderFooterButton() {
    return (
      <Button
        onClick={handlePrimaryAction}
        className="w-full rounded-lg py-6 text-base font-semibold disabled:bg-muted disabled:text-muted-foreground"
        size="lg"
        disabled={primaryActionDisabled}
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
        className="notranslate hidden overflow-hidden rounded-2xl border-0 shadow-[0_6px_16px_rgba(15,23,42,0.12)] lg:sticky lg:top-24 lg:flex dark:border dark:border-border/50 dark:shadow-none"
        translate="no"
      >
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-col gap-1 font-normal">
            {isFixedMode ? (
              hasStayQuote && stayPricing ? (
                <button
                  type="button"
                  onClick={() => (priceOpen ? closePrice() : openPrice())}
                  aria-expanded={priceOpen}
                  className="flex flex-col items-start gap-0.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex items-baseline gap-1">
                    <LocalizedPrice
                      exact
                      amount={total}
                      currency={currency}
                      locale={i18n.locale}
                      className="text-2xl font-semibold"
                    />
                    <span className="text-base font-normal text-muted-foreground">
                      / <Txt value={nightLabel} />
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground underline underline-offset-2">
                    <Txt value={priceDetailsLabel} />
                  </span>
                </button>
              ) : fixedStayStartingTotal !== null ? (
                <div className="flex flex-col gap-0.5">
                  <span className="flex flex-wrap items-baseline gap-1">
                    <span className="text-base font-normal text-muted-foreground">
                      <Txt value={fixedStayFromLabel} />
                    </span>
                    <LocalizedPrice
                      exact
                      amount={fixedStayStartingTotal}
                      currency={currency}
                      locale={i18n.locale}
                      className="text-2xl font-semibold"
                    />
                    <span className="text-base font-normal text-muted-foreground">
                      <Txt value={fixedStayPerStayLabel} />
                    </span>
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">
                    <Txt value={fixedStayAvailableCountLabel} />
                  </span>
                </div>
              ) : (
                <span className="text-lg font-semibold">
                  <Txt value={noStaysOpenMessage} />
                </span>
              )
            ) : hasStayQuote && stayPricing ? (
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
            {!isFixedMode && hasVariableRates && !hasStayQuote && (
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
            ) : isFixedMode ? (
              fixedStayStartingTotal !== null ? (
                <>
                  <span className="flex items-baseline gap-1 text-base font-semibold">
                    <span className="text-xs font-normal text-muted-foreground">
                      <Txt value={fixedStayFromLabel} />
                    </span>
                    <LocalizedPrice
                      exact
                      amount={fixedStayStartingTotal}
                      currency={currency}
                      locale={i18n.locale}
                    />
                  </span>
                  <span className="text-xs text-muted-foreground">
                    <Txt value={fixedStayAvailableCountLabel} />
                  </span>
                </>
              ) : (
                <span className="text-sm font-semibold">
                  <Txt value={noStaysOpenMessage} />
                </span>
              )
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
                    the one constraint worth knowing before opening the picker. On a
                    fixed-stay listing there is no such constraint: the host chose each
                    stay's length, and the booking transaction skips the minimum for the
                    same reason — so stating it here would be a rule about nothing. */}
                {!isFixedMode && minNights > 1 && (
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
            disabled={primaryActionDisabled}
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
