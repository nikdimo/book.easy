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
import { GuestCounter } from "@/components/shared/guest-counter";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { formatPrice } from "@/lib/utils/format";
import { createBookingAction } from "@/lib/actions/booking.actions";
import { toast } from "sonner";

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
}: BookingWidgetProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [checkInStr, setCheckInStr] = useState(initialCheckIn);
  const [checkOutStr, setCheckOutStr] = useState(initialCheckOut);
  const [guests, setGuests] = useState(() =>
    initialGuests ? Math.min(Math.max(initialGuests, 1), maxGuests) : 1
  );
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

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

  function handleSubmit() {
    setError(null);

    if (!session) {
      router.push(`/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
      return;
    }

    if (!checkIn || !checkOut) {
      setError("Please select check-in and check-out dates");
      return;
    }

    if (nights < minNights) {
      setError(`Minimum stay is ${minNights} night${minNights > 1 ? "s" : ""}`);
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

  return (
    <Card className="sticky top-24 rounded-2xl border-2 border-border shadow-xl overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-col gap-1 font-normal">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-semibold">{formatPrice(nightlyRate, currency)}</span>
            <span className="text-base font-normal text-muted-foreground">/ night</span>
          </div>
          {hasVariableRates && (
            <span className="text-xs font-normal text-muted-foreground">
              Selected dates may use custom nightly rates shown in the breakdown below.
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="space-y-2">
          <Label>Dates</Label>
          <MarketplaceStayDatePicker
            layout="field"
            checkIn={checkInStr}
            checkOut={checkOutStr}
            showDateFlexibility={false}
            showGuestStep={false}
            dateDialogTitle="Choose dates"
            dateDialogDescription="Choose your check-in and check-out dates."
            disabledDateRanges={disabledDateRanges}
            onRangeStringsChange={({ checkIn: ci, checkOut: co }) => {
              setCheckInStr(ci);
              setCheckOutStr(co);
            }}
            className="w-full"
          />
        </div>

        <GuestCounter value={guests} onChange={setGuests} max={maxGuests} />

        <div className="space-y-2">
          <Label>Message to host (optional)</Label>
          <Textarea
            placeholder="Introduce yourself and share your travel plans..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <Button
          onClick={handleSubmit}
          className="w-full rounded-lg text-base font-semibold py-6"
          size="lg"
          disabled={isPending || !checkIn || !checkOut}
        >
          {isPending ? "Sending request…" : "Reserve"}
        </Button>

        {nights > 0 && stayPricing && (
          <>
            <Separator />
            <div className="space-y-2 text-sm">
              {(() => {
                const breakdown = stayPricing.nightlyBreakdown;
                const uniqueRates = new Set(breakdown.map((n) => n.rate)).size;
                const showEachNight =
                  breakdown.length <= 7 ||
                  (hasVariableRates && uniqueRates > 1 && breakdown.length <= 14);
                if (showEachNight) {
                  return breakdown.map((n) => (
                    <div key={n.date} className="flex justify-between gap-2">
                      <span className="text-muted-foreground truncate">{n.date}</span>
                      <span>{formatPrice(n.rate, currency)}</span>
                    </div>
                  ));
                }
                if (uniqueRates > 1) {
                  return (
                    <div className="flex justify-between">
                      <span>
                        {nights} night{nights > 1 ? "s" : ""} (variable nightly rates)
                      </span>
                      <span>{formatPrice(subtotal, currency)}</span>
                    </div>
                  );
                }
                const firstRate = breakdown[0]?.rate ?? nightlyRate;
                return (
                  <div className="flex justify-between">
                    <span>
                      {formatPrice(firstRate, currency)} × {nights} night{nights > 1 ? "s" : ""}
                    </span>
                    <span>{formatPrice(subtotal, currency)}</span>
                  </div>
                );
              })()}
              <div className="flex justify-between font-medium pt-1 border-t border-border/60">
                <span>Subtotal (stay)</span>
                <span>{formatPrice(subtotal, currency)}</span>
              </div>
              {cleaningFee > 0 && (
                <div className="flex justify-between">
                  <span>Cleaning fee</span>
                  <span>{formatPrice(cleaningFee, currency)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between font-semibold">
                <span>Total</span>
                <span>{formatPrice(total, currency)}</span>
              </div>
            </div>
          </>
        )}

        <p className="text-xs text-muted-foreground text-center leading-relaxed">
          You won&apos;t be charged yet. The host will approve or decline your request.
        </p>
      </CardContent>
    </Card>
  );
}
