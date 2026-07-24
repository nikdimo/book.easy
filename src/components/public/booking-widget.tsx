"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { differenceInDays } from "date-fns";
import { computeStayPricing, parseLocalYmd } from "@/lib/utils/stay-pricing";
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
import { ChevronUp } from "lucide-react";
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
  reserveTooltip: Resolved;
}

type GuestDetails = {
  adults: number;
  children: number;
  infants: number;
  pets: number;
};

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
  const [guestEditorOpen, setGuestEditorOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [priceDetailsOpen, setPriceDetailsOpen] = useState(false);

  const checkIn = checkInStr ? parseLocalYmd(checkInStr) : undefined;
  const checkOut = checkOutStr ? parseLocalYmd(checkOutStr) : undefined;
  const nights = checkIn && checkOut ? differenceInDays(checkOut, checkIn) : 0;

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

  function handleSubmit() {
    setError(null);

    if (!session) {
      router.push(`/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
      return;
    }

    if (!checkIn || !checkOut) {
      const message = i18n.resolve("booking.select_dates_error", "Please select check-in and check-out dates").text;
      setError(message);
      toast.error(message);
      return;
    }

    if (nights < minNights) {
      const message = i18n.plural("booking.minimum_stay", minNights, "Minimum stay is {n} night", "Minimum stay is {n} nights").text;
      setError(message);
      toast.error(message);
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
      <Card className="rounded-2xl border-2 border-border shadow-xl overflow-hidden lg:sticky lg:top-24">
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
            }}
            className="w-full"
          />
        </div>

        <div className="space-y-2">
          <Label><Tx k="booking.guests_label" source="Guests" /></Label>
          <Dialog open={guestEditorOpen} onOpenChange={setGuestEditorOpen}>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-input bg-background px-3.5 py-3 text-left transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              onClick={() => setGuestEditorOpen(true)}
            >
              <span className="min-w-0 truncate text-sm text-foreground">
                <span className={guestSummary.translated ? "notranslate" : undefined}>{guestSummary.text}</span>
              </span>
              <span className="shrink-0 text-sm font-medium text-primary"><Tx k="common.edit" source="Edit" /></span>
            </button>

            <DialogContent className="max-w-[calc(100%-2rem)] gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-md">
              <div className="border-b px-5 py-4 pr-12">
                <DialogTitle className="text-lg"><Tx k="booking.guests_label" source="Guests" /></DialogTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  <Tx k="booking.choose_guests" source="Choose who is coming with you." />
                </p>
              </div>
              <GuestCountsStep
                guestCounts={guestDetails}
                onGuestCountsChange={setGuestDetails}
                maxOccupancy={maxGuests}
                className="rounded-none border-0 px-5"
              />
              <div className="border-t p-4">
                <Button
                  type="button"
                  className="w-full rounded-xl"
                  onClick={() => setGuestEditorOpen(false)}
                >
                  <Tx k="common.done" source="Done" />
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="space-y-2">
          <Label><Tx k="booking.message_optional" source="Message to host (optional)" /></Label>
          <Textarea
            placeholder={i18n.resolve("booking.message_placeholder", "Introduce yourself and share your travel plans...").text}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
        </div>

        {error && (
          <p className="hidden text-sm text-destructive lg:block">{error}</p>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={handleSubmit}
              className="hidden w-full rounded-lg text-base font-semibold py-6 lg:flex"
              size="lg"
              disabled={isPending || !checkIn || !checkOut}
            >
              {isPending ? <Tx k="booking.sending_request" source="Sending request…" /> : <Tx k="booking.reserve" source="Reserve" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent
            className={reserveTooltip.translated ? "notranslate" : undefined}
          >
            {reserveTooltip.text}
          </TooltipContent>
        </Tooltip>

        {nights > 0 && stayPricing && (
          <div className="hidden lg:block">
            <Separator className="mb-4" />
            {renderPriceBreakdown()}
          </div>
        )}

        <p className="hidden text-xs text-muted-foreground text-center leading-relaxed lg:block">
          <Tx k="booking.no_charge_notice" source="You won't be charged yet. The host will approve or decline your request." />
        </p>
      </CardContent>
    </Card>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 pt-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
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
            className="shrink-0 rounded-xl px-8 font-semibold"
            size="lg"
            disabled={isPending || !checkIn || !checkOut}
          >
            {isPending ? <Tx k="booking.sending" source="Sending…" /> : <Tx k="booking.reserve" source="Reserve" />}
          </Button>
        </div>
      </div>

      <Sheet open={priceDetailsOpen} onOpenChange={setPriceDetailsOpen}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle><Tx k="booking.price_details" source="Price details" /></SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-4">{renderPriceBreakdown()}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}
