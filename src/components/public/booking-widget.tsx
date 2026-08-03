"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { LocalizedPrice } from "@/components/shared/localized-price";
import { createBookingAction } from "@/lib/actions/booking.actions";
import { toast } from "sonner";
import { ChevronDown, ChevronUp } from "lucide-react";
import { updateActiveSearchState } from "@/lib/marketplace-search-state";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Resolved } from "@/lib/i18n/t";
import { interpolate, Tx, useI18n } from "@/lib/i18n/client";

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
}

type GuestDetails = {
  adults: number;
  children: number;
  infants: number;
  pets: number;
};

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
}: BookingWidgetProps) {
  const i18n = useI18n();
  const { data: session } = useSession();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  // Which step the picker opens on — the dates row and the guests row lead into
  // the same sheet, they just start it in different places.
  const [pickerStep, setPickerStep] = useState<"dates" | "guests">("dates");
  const [dateFlexibility, setDateFlexibility] = useState(0);
  const [checkInStr, setCheckInStr] = useState(initialCheckIn);
  const [checkOutStr, setCheckOutStr] = useState(initialCheckOut);
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
  const [error, setError] = useState<string | null>(null);
  const [priceDetailsOpen, setPriceDetailsOpen] = useState(false);
  const [desktopPriceDetailsOpen, setDesktopPriceDetailsOpen] = useState(false);
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
  const reserveStep: "dates" | "guests" | "reserve" =
    selectionValidation.status !== "valid"
      ? "dates"
      : guestsConfirmed
        ? "reserve"
        : "guests";
  const reserveLabel = i18n.resolve("booking.reserve", "Reserve");
  // Reuses the search catalog's existing key so the copy stays translated.
  const whosComingLabel = i18n.resolve("search.whos_coming", "Who's coming");
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
  const bookingMessage = error
    ? { text: error, translated: false }
    : blockingProblem;
  const bookingMessageIsError = Boolean(bookingMessage);
  const appliedPromotion = stayPricing?.appliedPromotion ?? null;
  const promotionLabel = appliedPromotion
    ? (appliedPromotion.discountPercent ?? 0) > 0
      ? appliedPromotion.minimumNights
        ? interpolate(
            i18n.resolve(
              "promotion.percent_min_nights",
              "{percent}% off · {n}+ nights",
            ),
            {
              percent: appliedPromotion.discountPercent ?? 0,
              n: appliedPromotion.minimumNights,
            },
          )
        : interpolate(i18n.resolve("promotion.percent_off", "{percent}% off"), {
            percent: appliedPromotion.discountPercent ?? 0,
          })
      : appliedPromotion.minimumNights
        ? interpolate(
            i18n.resolve(
              "promotion.free_cleaning_min_nights",
              "Free cleaning · {n}+ nights",
            ),
            { n: appliedPromotion.minimumNights },
          )
        : i18n.resolve("promotion.free_cleaning", "Free cleaning")
    : null;

  function openPicker(step: "dates" | "guests") {
    setPickerStep(step);
    // Opening straight at guests counts as the confirmation the sticky button
    // was waiting for; the picker's own onStepChange covers the dates → guests path.
    if (step === "guests") setGuestsConfirmed(true);
    setDatePickerOpen(true);
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

    handleSubmit();
  }

  function handleSubmit() {
    setError(null);

    if (reserveProblem) {
      setError(reserveProblem.text);
      return;
    }

    if (!session) {
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
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("listingId", listingId);
      formData.set("checkIn", checkInStr);
      formData.set("checkOut", checkOutStr);
      formData.set("guestCount", String(guests));
      if (note) formData.set("guestNote", note);

      const result = await createBookingAction(formData);
      if (result?.error) {
        setError(result.error);
        toast.error(result.error);
      }
    });
  }

  function clearSelection() {
    setCheckInStr("");
    setCheckOutStr("");
    setDateFlexibility(0);
    setGuestDetails({ adults: 1, children: 0, infants: 0, pets: 0 });
    setGuestsConfirmed(false);
    setNote("");
    setError(null);
    setPriceDetailsOpen(false);
    setDesktopPriceDetailsOpen(false);
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
      </div>
    );
  }

  return (
    <>
      <Card
        className="notranslate rounded-2xl border-2 border-border shadow-xl overflow-hidden lg:sticky lg:top-24"
        translate="no"
      >
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-col gap-1 font-normal">
            <div className="flex items-baseline gap-1">
              <LocalizedPrice
                amount={nightlyRate}
                currency={currency}
                locale={i18n.locale}
                className="text-2xl font-semibold"
              />
              <span className="text-base font-normal text-muted-foreground">
                / <Tx k="property_card.per_night" source="night" />
              </span>
            </div>
            {hasVariableRates && (
              <span className="text-xs font-normal text-muted-foreground">
                <Tx
                  k="booking.variable_rate_notice"
                  source="Selected dates may use custom nightly rates shown in the breakdown below."
                />
              </span>
            )}
            {promotionLabel ? (
              <Badge variant="secondary" className="mt-1 w-fit rounded-md">
                <span
                  className={
                    promotionLabel.translated ? "notranslate" : undefined
                  }
                >
                  {promotionLabel.text}
                </span>
              </Badge>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="space-y-2">
            <Label className="text-base font-semibold">
              <Tx k="booking.dates" source="Dates" />
            </Label>
            <div className="overflow-hidden rounded-xl border border-foreground/50 bg-background">
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
                initialSegment={
                  checkInStr && !checkOutStr ? "checkout" : "checkin"
                }
                dateFlexibility={dateFlexibility}
                showDateFlexibility
                onDateFlexibilityChange={setDateFlexibility}
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
                finalActionLabel={reserveLabel}
                finalActionDisabled={
                  isPending || selectionValidation.status !== "valid" || guests < 1
                }
                showFinalActionIcon={false}
                onFinalAction={handleSubmit}
                pagedCalendarOnDesktop
                disabledDateRanges={disabledDateRanges}
                minimumStayNights={minNights}
                minimumStayMessage={minimumStayMessage}
                onRangeStringsChange={({ checkIn: ci, checkOut: co }) => {
                  setCheckInStr(ci);
                  setCheckOutStr(co);
                  setError(null);
                }}
                className="w-full [&_button]:!rounded-none [&_button]:!border-0"
              />
              <div className="border-t border-foreground/30">
                <BookingGuestRow
                  summary={guestSummary}
                  onOpen={() => openPicker("guests")}
                />
              </div>
            </div>
            {selectionValidation.status !== "valid" &&
              checkInStr &&
              checkOutStr && (
                <p aria-live="polite" className="text-sm text-destructive">
                  <span
                    className={
                      pickerMessage.translated ? "notranslate" : undefined
                    }
                  >
                    {pickerMessage.text}
                  </span>
                </p>
              )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label>
                <Tx
                  k="booking.message_optional"
                  source="Message to host (optional)"
                />
              </Label>
              {(checkInStr ||
                checkOutStr ||
                note ||
                guests !== 1 ||
                guestDetails.infants > 0 ||
                guestDetails.pets > 0) && (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  <Tx k="booking.clear_selection" source="Clear selection" />
                </button>
              )}
            </div>
            <Textarea
              placeholder={
                i18n.resolve(
                  "booking.message_placeholder",
                  "Introduce yourself and share your travel plans...",
                ).text
              }
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />
          </div>

          {nights > 0 && stayPricing && (
            <div className="hidden rounded-xl border border-border/70 bg-muted/20 px-4 py-3 lg:block">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">
                    <span
                      className={
                        nightLabel.translated ? "notranslate" : undefined
                      }
                    >
                      {nightLabel.text}
                    </span>{" "}
                    ·{" "}
                    <span className="text-muted-foreground">
                      <Tx k="booking.total" source="Total" />
                    </span>
                  </p>
                  <button
                    type="button"
                    className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    onClick={() => setDesktopPriceDetailsOpen((open) => !open)}
                    aria-expanded={desktopPriceDetailsOpen}
                  >
                    <Tx k="booking.price_details" source="Price details" />
                    {desktopPriceDetailsOpen ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
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
              </div>
              {desktopPriceDetailsOpen && (
                <div className="mt-3 border-t border-border/60 pt-3">
                  {renderPriceBreakdown()}
                </div>
              )}
            </div>
          )}

          {bookingMessage && (
            <p
              aria-live="polite"
              className={
                bookingMessageIsError
                  ? "hidden rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm lg:block"
                  : "hidden text-sm text-muted-foreground lg:block"
              }
            >
              <span
                className={
                  bookingMessage.translated ? "notranslate" : undefined
                }
              >
                {bookingMessage.text}
              </span>
            </p>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={handlePrimaryAction}
                className="hidden w-full rounded-lg text-base font-semibold py-6 disabled:bg-muted disabled:text-muted-foreground lg:flex"
                size="lg"
                disabled={isPending}
              >
                {isPending ? (
                  <Tx k="booking.sending_request" source="Sending request…" />
                ) : (
                  primaryActionLabel.text
                )}
              </Button>
            </TooltipTrigger>
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

          <p className="hidden text-xs text-muted-foreground text-center leading-relaxed lg:block">
            <Tx
              k="booking.no_charge_notice"
              source="You won't be charged yet. The host will approve or decline your request."
            />
          </p>
        </CardContent>
      </Card>

      <div
        className="notranslate fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 pt-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden"
        translate="no"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        {bookingMessage && (
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
            onClick={() => setPriceDetailsOpen(true)}
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
                  <span
                    className={
                      nightLabel.translated ? "notranslate" : undefined
                    }
                  >
                    {nightLabel.text}
                  </span>{" "}
                  · <Tx k="booking.price_details" source="Price details" />
                  <ChevronUp className="h-3 w-3" />
                </span>
              </>
            ) : (
              <>
                <span className="flex items-baseline gap-1 text-base font-semibold">
                  <LocalizedPrice
                    amount={nightlyRate}
                    currency={currency}
                    locale={i18n.locale}
                  />
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

      <Sheet open={priceDetailsOpen} onOpenChange={setPriceDetailsOpen}>
        <SheetContent
          side="bottom"
          className="notranslate max-h-[80vh] overflow-y-auto rounded-t-2xl"
          translate="no"
        >
          <SheetHeader>
            <SheetTitle>
              <Tx k="booking.price_details" source="Price details" />
            </SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-4">{renderPriceBreakdown()}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}
