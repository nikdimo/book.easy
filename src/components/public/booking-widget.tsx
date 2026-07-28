"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { computeStayPricing, parseLocalYmd } from "@/lib/utils/stay-pricing";
import { validateBookingSelection } from "@/lib/utils/booking-selection";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { MarketplaceStayDatePicker } from "@/components/marketplace/marketplace-stay-date-picker";
import { GuestCountsStep } from "@/components/marketplace/marketplace-stay-date-picker";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Resolved } from "@/lib/i18n/t";
import { Tx, useI18n } from "@/lib/i18n/client";

interface BookingWidgetProps {
  listingId: string;
  maxGuests: number;
  nightlyRate: number;
  cleaningFee: number;
  currency: string;
  minNights: number;
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

type BookingDraft = {
  checkIn: string;
  checkOut: string;
  guestDetails: GuestDetails;
  note: string;
};

const BOOKING_DRAFT_VERSION = 1;
const BOOKINGS_UNAVAILABLE_KEY = "mobile.bookings.unavailable";
const BOOKINGS_UNAVAILABLE_SOURCE = "Bookings unavailable";

function BookingGuestEditor({
  value,
  summary,
  maxGuests,
  onChange,
}: {
  value: GuestDetails;
  summary: Resolved;
  maxGuests: number;
  onChange: (next: GuestDetails) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  function openEditor() {
    setDraft(value);
    setOpen(true);
  }

  function commitAndClose() {
    onChange(draft);
    setOpen(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      openEditor();
      return;
    }
    commitAndClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-input bg-background px-3.5 py-3 text-left transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={openEditor}
      >
        <span className="min-w-0 truncate text-sm text-foreground">
          <span className={summary.translated ? "notranslate" : undefined}>
            {summary.text}
          </span>
        </span>
        <span className="shrink-0 text-sm font-medium text-primary">
          <Tx k="common.edit" source="Edit" />
        </span>
      </button>

      <DialogContent
        className="notranslate max-w-[calc(100%-2rem)] gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-md"
        translate="no"
      >
        <div className="border-b px-5 py-4 pr-12">
          <DialogTitle className="text-lg">
            <Tx k="booking.guests_label" source="Guests" />
          </DialogTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            <Tx
              k="booking.choose_guests"
              source="Choose who is coming with you."
            />
          </p>
        </div>
        <GuestCountsStep
          guestCounts={draft}
          onGuestCountsChange={setDraft}
          maxOccupancy={maxGuests}
          className="rounded-none border-0 px-5"
        />
        <div className="border-t p-4">
          <Button
            type="button"
            className="w-full rounded-xl"
            onClick={commitAndClose}
          >
            <Tx k="common.done" source="Done" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function BookingWidget({
  listingId,
  maxGuests,
  nightlyRate,
  cleaningFee,
  currency,
  minNights,
  disabledDateRanges,
  priceOverrides = [],
  initialCheckIn = "",
  initialCheckOut = "",
  initialGuests,
  initialGuestDetails = { adults: 0, children: 0, infants: 0, pets: 0 },
  hasExplicitSearchSelection = false,
  reserveTooltip,
}: BookingWidgetProps) {
  const i18n = useI18n();
  const { data: session } = useSession();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [checkInStr, setCheckInStr] = useState(initialCheckIn);
  const [checkOutStr, setCheckOutStr] = useState(initialCheckOut);
  const [guestDetails, setGuestDetails] = useState(() => {
    const occupancy = initialGuestDetails.adults + initialGuestDetails.children;
    if (occupancy > 0) return initialGuestDetails;
    return {
      ...initialGuestDetails,
      adults: initialGuests ? Math.min(Math.max(initialGuests, 1), maxGuests) : 1,
    };
  });
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [priceDetailsOpen, setPriceDetailsOpen] = useState(false);
  const [desktopPriceDetailsOpen, setDesktopPriceDetailsOpen] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const draftStorageKey = `bookeasy:booking-draft:v${BOOKING_DRAFT_VERSION}:${listingId}`;

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;

      if (!hasExplicitSearchSelection) {
        try {
          const rawDraft = window.localStorage.getItem(draftStorageKey);
          if (rawDraft) {
            const draft = JSON.parse(rawDraft) as Partial<BookingDraft>;
            if (typeof draft.checkIn === "string") setCheckInStr(draft.checkIn);
            if (typeof draft.checkOut === "string") setCheckOutStr(draft.checkOut);
            if (typeof draft.note === "string") setNote(draft.note);
            if (
              draft.guestDetails &&
              ["adults", "children", "infants", "pets"].every(
                (key) =>
                  Number.isInteger(draft.guestDetails?.[key as keyof GuestDetails]) &&
                  Number(draft.guestDetails?.[key as keyof GuestDetails]) >= 0
              )
            ) {
              const restored = draft.guestDetails as GuestDetails;
              const restoredOccupancy = restored.adults + restored.children;
              if (restoredOccupancy > 0 && restoredOccupancy <= maxGuests) {
                setGuestDetails(restored);
              }
            }
          }
        } catch {
          // A malformed or unavailable browser cache should never block booking.
        }
      }

      setDraftReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [draftStorageKey, hasExplicitSearchSelection, maxGuests]);

  useEffect(() => {
    if (!draftReady) return;
    const draft: BookingDraft = {
      checkIn: checkInStr,
      checkOut: checkOutStr,
      guestDetails,
      note,
    };
    try {
      window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
    } catch {
      // Booking remains usable when storage is disabled or full.
    }
  }, [checkInStr, checkOutStr, draftReady, draftStorageKey, guestDetails, note]);

  const checkIn = checkInStr ? parseLocalYmd(checkInStr) : undefined;
  const checkOut = checkOutStr ? parseLocalYmd(checkOutStr) : undefined;
  const selectionValidation = validateBookingSelection(
    checkIn,
    checkOut,
    minNights,
    disabledDateRanges
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
      ? computeStayPricing(nightlyRate, checkIn, checkOut, overrideMap)
      : null;
  const subtotal = stayPricing?.subtotal ?? 0;
  const total = subtotal + cleaningFee;
  const hasVariableRates = priceOverrides.length > 0;

  const guests = guestDetails.adults + guestDetails.children;
  const guestParts = [
    guestDetails.adults > 0 && i18n.plural("booking.adults", guestDetails.adults, "{n} adult", "{n} adults"),
    guestDetails.children > 0 && i18n.plural("booking.children", guestDetails.children, "{n} child", "{n} children"),
    guestDetails.infants > 0 && i18n.plural("booking.infants", guestDetails.infants, "{n} infant", "{n} infants"),
    guestDetails.pets > 0 && i18n.plural("booking.pets", guestDetails.pets, "{n} pet", "{n} pets"),
  ].filter((part): part is Resolved => Boolean(part));
  const guestSummary: Resolved = guestParts.length
    ? { text: guestParts.map((part) => part.text).join(", "), translated: guestParts.every((part) => part.translated) }
    : i18n.resolve("booking.add_guests", "Add guests");
  const nightLabel = i18n.plural("booking.nights", nights, "{n} night", "{n} nights");
  const minimumStayMessage = i18n.plural(
    "booking.minimum_stay",
    minNights,
    "Minimum stay is {n} night",
    "Minimum stay is {n} nights"
  );
  const selectDatesMessage = i18n.resolve(
    "booking.select_dates_error",
    "Please select check-in and check-out dates"
  );
  const bookingsUnavailableMessage = i18n.resolve(
    BOOKINGS_UNAVAILABLE_KEY,
    BOOKINGS_UNAVAILABLE_SOURCE
  );
  const unavailableDatesMessage: Resolved = {
    text: `${bookingsUnavailableMessage.text}. ${selectDatesMessage.text}`,
    translated:
      bookingsUnavailableMessage.translated && selectDatesMessage.translated,
  };
  const reserveProblem: Resolved | null =
    selectionValidation.status === "unavailable"
      ? unavailableDatesMessage
      : selectionValidation.status === "minimum-stay"
        ? minimumStayMessage
        : selectionValidation.status === "valid"
          ? null
          : selectDatesMessage;
  const pickerMessage =
    selectionValidation.status === "unavailable"
      ? unavailableDatesMessage
      : minimumStayMessage;
  const bookingMessage = error
    ? { text: error, translated: false }
    : reserveProblem;
  const bookingMessageIsError =
    Boolean(error) ||
    selectionValidation.status === "minimum-stay" ||
    selectionValidation.status === "unavailable" ||
    selectionValidation.status === "invalid";

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
        `/login?callbackUrl=${encodeURIComponent(`${returnUrl.pathname}${returnUrl.search}`)}`
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
    setGuestDetails({ adults: 1, children: 0, infants: 0, pets: 0 });
    setNote("");
    setError(null);
    setPriceDetailsOpen(false);
    setDesktopPriceDetailsOpen(false);
    try {
      window.localStorage.removeItem(draftStorageKey);
    } catch {
      // The visible selection is still cleared if browser storage is unavailable.
    }

    const cleanUrl = new URL(window.location.href);
    ["checkIn", "checkOut", "guests", "adults", "children", "infants", "pets"].forEach(
      (key) => cleanUrl.searchParams.delete(key)
    );
    window.history.replaceState(
      window.history.state,
      "",
      `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`
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
          <LocalizedPrice amount={n.rate} currency={currency} locale={i18n.locale} />
        </div>
      ));
    } else if (uniqueRates > 1) {
      subtotalLine = (
        <div className="flex justify-between">
          <span>
            {(() => { const value = i18n.plural("booking.variable_rates", nights, "{n} night (variable nightly rates)", "{n} nights (variable nightly rates)"); return <span className={value.translated ? "notranslate" : undefined}>{value.text}</span>; })()}
          </span>
          <LocalizedPrice amount={subtotal} currency={currency} locale={i18n.locale} />
        </div>
      );
    } else {
      subtotalLine = (
        <div className="flex justify-between">
          <span>
            <LocalizedPrice amount={breakdown[0]?.rate ?? nightlyRate} currency={currency} locale={i18n.locale} /> × <span className={nightLabel.translated ? "notranslate" : undefined}>{nightLabel.text}</span>
          </span>
          <LocalizedPrice amount={subtotal} currency={currency} locale={i18n.locale} />
        </div>
      );
    }

    return (
      <div className="space-y-2 text-sm">
        {subtotalLine}
        <div className="flex justify-between font-medium pt-1 border-t border-border/60">
          <span><Tx k="booking.subtotal" source="Subtotal (stay)" /></span>
          <LocalizedPrice amount={subtotal} currency={currency} locale={i18n.locale} />
        </div>
        {cleaningFee > 0 && (
          <div className="flex justify-between">
            <span><Tx k="booking.cleaning_fee" source="Cleaning fee" /></span>
            <LocalizedPrice amount={cleaningFee} currency={currency} locale={i18n.locale} />
          </div>
        )}
        <Separator />
        <div className="flex justify-between font-semibold">
          <span><Tx k="booking.total" source="Total" /></span>
          <LocalizedPrice amount={total} currency={currency} locale={i18n.locale} />
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
            <span className="text-base font-normal text-muted-foreground">/ <Tx k="property_card.per_night" source="night" /></span>
          </div>
          {hasVariableRates && (
            <span className="text-xs font-normal text-muted-foreground">
              <Tx k="booking.variable_rate_notice" source="Selected dates may use custom nightly rates shown in the breakdown below." />
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="space-y-2">
          <Label><Tx k="booking.dates" source="Dates" /></Label>
          <MarketplaceStayDatePicker
            layout="field"
            checkIn={checkInStr}
            checkOut={checkOutStr}
            showDateFlexibility={false}
            showGuestStep={false}
            disabledDateRanges={disabledDateRanges}
            onRangeStringsChange={({ checkIn: ci, checkOut: co }) => {
              setCheckInStr(ci);
              setCheckOutStr(co);
              setError(null);
            }}
            renderDateFooter={({ canGoNext, closePicker, resetDates }) => (
              <div className="space-y-3">
                <p
                  aria-live="polite"
                  className={
                    selectionValidation.status === "minimum-stay" ||
                    selectionValidation.status === "unavailable"
                      ? "text-sm font-medium text-destructive"
                      : "text-sm text-muted-foreground"
                  }
                >
                  <span className={pickerMessage.translated ? "notranslate" : undefined}>
                    {pickerMessage.text}
                  </span>
                </p>
                <div className="flex items-center justify-between gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full sm:min-w-[7rem]"
                    onClick={resetDates}
                  >
                    <Tx k="search.reset" source="Reset" />
                  </Button>
                  <Button
                    type="button"
                    className="min-w-[7rem] rounded-full"
                    disabled={
                      !canGoNext || selectionValidation.status !== "valid"
                    }
                    onClick={closePicker}
                  >
                    <Tx k="common.done" source="Done" />
                  </Button>
                </div>
              </div>
            )}
            className="w-full"
          />
        </div>

        <div className="space-y-2">
          <Label><Tx k="booking.guests_label" source="Guests" /></Label>
          <BookingGuestEditor
            value={guestDetails}
            summary={guestSummary}
            maxGuests={maxGuests}
            onChange={(next) => {
              setGuestDetails(next);
              setError(null);
            }}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label><Tx k="booking.message_optional" source="Message to host (optional)" /></Label>
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
            placeholder={i18n.resolve("booking.message_placeholder", "Introduce yourself and share your travel plans...").text}
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
                  <span className={nightLabel.translated ? "notranslate" : undefined}>{nightLabel.text}</span>{" "}
                  · <span className="text-muted-foreground"><Tx k="booking.total" source="Total" /></span>
                </p>
                <button
                  type="button"
                  className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  onClick={() => setDesktopPriceDetailsOpen((open) => !open)}
                  aria-expanded={desktopPriceDetailsOpen}
                >
                  <Tx k="booking.price_details" source="Price details" />
                  {desktopPriceDetailsOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
              </div>
              <LocalizedPrice
                amount={total}
                currency={currency}
                locale={i18n.locale}
                className="text-xl font-semibold"
              />
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
                ? "hidden text-sm font-medium text-destructive lg:block"
                : "hidden text-sm text-muted-foreground lg:block"
            }
          >
            <span className={bookingMessage.translated ? "notranslate" : undefined}>
              {bookingMessage.text}
            </span>
          </p>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={handleSubmit}
              className="hidden w-full rounded-lg text-base font-semibold py-6 disabled:bg-muted disabled:text-muted-foreground lg:flex"
              size="lg"
              disabled={isPending || Boolean(reserveProblem)}
            >
              {isPending ? <Tx k="booking.sending_request" source="Sending request…" /> : <Tx k="booking.reserve" source="Reserve" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent
            className={(reserveProblem ?? reserveTooltip).translated ? "notranslate" : undefined}
          >
            {(reserveProblem ?? reserveTooltip).text}
          </TooltipContent>
        </Tooltip>

        <p className="hidden text-xs text-muted-foreground text-center leading-relaxed lg:block">
          <Tx k="booking.no_charge_notice" source="You won't be charged yet. The host will approve or decline your request." />
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
                ? "mb-2 text-sm font-medium text-destructive"
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
                  <span className={nightLabel.translated ? "notranslate" : undefined}>{nightLabel.text}</span> · <Tx k="booking.price_details" source="Price details" />
                  <ChevronUp className="h-3 w-3" />
                </span>
              </>
            ) : (
              <>
                <span className="flex items-baseline gap-1 text-base font-semibold">
                  <LocalizedPrice amount={nightlyRate} currency={currency} locale={i18n.locale} />
                  <span className="text-xs font-normal text-muted-foreground">/ <Tx k="property_card.per_night" source="night" /></span>
                </span>
                <span className="text-xs text-muted-foreground"><Tx k="booking.add_dates_total" source="Add dates for total" /></span>
              </>
            )}
          </button>
          <Button
            onClick={handleSubmit}
            className="shrink-0 rounded-xl px-8 font-semibold disabled:bg-muted disabled:text-muted-foreground"
            size="lg"
            disabled={isPending || Boolean(reserveProblem)}
          >
            {isPending ? <Tx k="booking.sending" source="Sending…" /> : <Tx k="booking.reserve" source="Reserve" />}
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
            <SheetTitle><Tx k="booking.price_details" source="Price details" /></SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-4">{renderPriceBreakdown()}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}
