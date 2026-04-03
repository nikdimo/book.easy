"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, startOfToday } from "date-fns";
import { Calendar as CalendarIcon, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import {
  blockDates,
  unblockDates,
  upsertListingDatePrice,
  removeListingDatePrice,
} from "@/lib/actions/availability.actions";
import { dateKey } from "@/lib/utils/stay-pricing";
import { formatPrice } from "@/lib/utils/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Block {
  id: string;
  startDate: Date;
  endDate: Date;
  blockType: string;
  reason?: string | null;
  booking?: { id: string; guest: { name: string }; status: string } | null;
}

interface DatePriceRow {
  id: string;
  date: Date;
  nightlyRate: unknown;
}

interface PropertyAvailabilityCalendarProps {
  listingId: string;
  baseNightlyRate: number;
  currency: string;
  datePrices: DatePriceRow[];
  existingBlocks: Block[];
}

function dayKeyInBlockRange(key: string, start: Date, end: Date): boolean {
  const s = dateKey(start);
  const e = dateKey(end);
  return key >= s && key < e;
}

function findBlockForDay(blocks: Block[], dayKey: string): Block | undefined {
  return blocks.find((b) => dayKeyInBlockRange(dayKey, new Date(b.startDate), new Date(b.endDate)));
}

function findPriceForDay(rows: DatePriceRow[], dayKey: string): DatePriceRow | undefined {
  return rows.find((r) => dateKey(new Date(r.date)) === dayKey);
}

export function PropertyAvailabilityCalendar({
  listingId,
  baseNightlyRate,
  currency,
  datePrices,
  existingBlocks,
}: PropertyAvailabilityCalendarProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Date | undefined>();
  const [priceInput, setPriceInput] = useState("");
  const [pending, startTransition] = useTransition();

  const today = startOfToday();

  const { manualKeys, bookingKeys, priceByKey } = useMemo(() => {
    const manual = new Set<string>();
    const booking = new Set<string>();
    for (const b of existingBlocks) {
      const cur = new Date(b.startDate);
      const end = new Date(b.endDate);
      while (cur < end) {
        const k = dateKey(cur);
        if (b.blockType === "MANUAL_BLOCK") manual.add(k);
        else booking.add(k);
        cur.setDate(cur.getDate() + 1);
      }
    }
    const prices = new Map<string, number>();
    for (const r of datePrices) {
      prices.set(dateKey(new Date(r.date)), Number(r.nightlyRate));
    }
    return { manualKeys: manual, bookingKeys: booking, priceByKey: prices };
  }, [existingBlocks, datePrices]);

  const selectedKey = selected ? dateKey(selected) : null;
  const blockForDay = selectedKey ? findBlockForDay(existingBlocks, selectedKey) : undefined;
  const priceRow = selectedKey ? findPriceForDay(datePrices, selectedKey) : undefined;

  const isPast = selected ? selected < today : false;
  const isManualBlock = selectedKey ? manualKeys.has(selectedKey) : false;
  const isBooking = selectedKey ? bookingKeys.has(selectedKey) : false;

  function refresh() {
    router.refresh();
  }

  function handleApplyPrice() {
    if (!selectedKey) return;
    const v = parseFloat(priceInput.replace(",", "."));
    if (!Number.isFinite(v) || v <= 0) {
      toast.error("Enter a valid nightly price");
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("listingId", listingId);
      fd.set("date", selectedKey);
      fd.set("nightlyRate", String(v));
      const res = await upsertListingDatePrice(fd);
      if (res?.success) {
        toast.success("Price updated for this date");
        setPriceInput("");
        refresh();
      } else if (res?.error) toast.error(res.error);
    });
  }

  function handleRemovePrice() {
    if (!priceRow) return;
    startTransition(async () => {
      const res = await removeListingDatePrice(priceRow.id);
      if (res?.success) {
        toast.success("Custom price removed");
        refresh();
      } else if (res?.error) toast.error(res.error);
    });
  }

  function handleUnblock() {
    if (!blockForDay || blockForDay.blockType !== "MANUAL_BLOCK") return;
    startTransition(async () => {
      const res = await unblockDates(blockForDay.id);
      if (res?.success) {
        toast.success("Block removed");
        refresh();
      } else if (res?.error) toast.error(res.error);
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Calendar</CardTitle>
            <p className="text-sm text-muted-foreground font-normal">
              Click a date to set a custom nightly rate or manage blocks. Past dates are disabled.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col items-center sm:items-start">
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mb-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-3 rounded-sm bg-muted border" /> Manual block
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-3 rounded-sm bg-destructive/25 border border-destructive/30" />{" "}
                Booking
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-3 rounded-sm ring-2 ring-primary ring-inset" /> Custom price
              </span>
            </div>
            <Calendar
              mode="single"
              selected={selected}
              onSelect={setSelected}
              numberOfMonths={2}
              disabled={{ before: today }}
              defaultMonth={today}
              modifiers={{
                manualBlock: (d) => manualKeys.has(dateKey(d)),
                bookingHold: (d) => bookingKeys.has(dateKey(d)),
                customPrice: (d) =>
                  priceByKey.has(dateKey(d)) &&
                  !manualKeys.has(dateKey(d)) &&
                  !bookingKeys.has(dateKey(d)),
              }}
              modifiersClassNames={{
                manualBlock: cn("bg-muted text-foreground hover:bg-muted"),
                bookingHold: cn("bg-destructive/25 text-foreground hover:bg-destructive/30"),
                customPrice: cn("ring-2 ring-primary ring-inset font-medium"),
              }}
              className="rounded-lg border p-2"
            />
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-lg">Selected date</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selected && (
              <p className="text-sm text-muted-foreground">Choose a day on the calendar.</p>
            )}
            {selected && isPast && (
              <p className="text-sm text-muted-foreground">Past dates cannot be edited.</p>
            )}
            {selected && !isPast && (
              <>
                <p className="font-medium">{format(selected, "EEEE, MMM d, yyyy")}</p>
                <div className="flex flex-wrap gap-2">
                  {isBooking && <Badge>Booked</Badge>}
                  {isManualBlock && !isBooking && <Badge variant="secondary">Blocked</Badge>}
                  {!isManualBlock && !isBooking && <Badge variant="outline">Available</Badge>}
                </div>

                {isBooking && blockForDay?.booking && (
                  <p className="text-sm text-muted-foreground">
                    Guest: {blockForDay.booking.guest.name} ({blockForDay.booking.status})
                  </p>
                )}

                {isManualBlock && !isBooking && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={handleUnblock}
                  >
                    <Trash2 className="h-4 w-4 mr-2 text-destructive" />
                    Remove block
                  </Button>
                )}

                {!isManualBlock && !isBooking && (
                  <div className="space-y-3">
                    <div className="text-sm text-muted-foreground">
                      Base rate: {formatPrice(baseNightlyRate, currency)} / night
                    </div>
                    {priceRow && (
                      <div className="flex items-center justify-between gap-2 rounded-md border p-3">
                        <div>
                          <p className="text-xs text-muted-foreground">Custom rate</p>
                          <p className="font-semibold">
                            {formatPrice(Number(priceRow.nightlyRate), currency)} / night
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={handleRemovePrice}
                        >
                          Clear
                        </Button>
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="dayPrice">Custom nightly price ({currency})</Label>
                      <div className="flex gap-2">
                        <Input
                          id="dayPrice"
                          inputMode="decimal"
                          placeholder={String(baseNightlyRate)}
                          value={priceInput}
                          onChange={(e) => setPriceInput(e.target.value)}
                        />
                        <Button type="button" disabled={pending} onClick={handleApplyPrice}>
                          Save
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Set the same value as the base rate to clear a custom price.
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Block a date range</CardTitle>
        </CardHeader>
        <CardContent>
          <BlockRangeForm listingId={listingId} minDate={format(today, "yyyy-MM-dd")} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Blocked & booked ranges</CardTitle>
        </CardHeader>
        <CardContent>
          {existingBlocks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming blocks or bookings.</p>
          ) : (
            <div className="space-y-3">
              {existingBlocks.map((block) => (
                <div key={block.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="text-sm font-medium">
                      {format(new Date(block.startDate), "MMM d, yyyy")} –{" "}
                      {format(new Date(block.endDate), "MMM d, yyyy")}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant={block.blockType === "MANUAL_BLOCK" ? "secondary" : "default"}>
                        {block.blockType === "MANUAL_BLOCK" ? "Manual block" : "Booking hold"}
                      </Badge>
                      {block.reason && (
                        <span className="text-xs text-muted-foreground">{block.reason}</span>
                      )}
                      {block.booking && (
                        <span className="text-xs text-muted-foreground">
                          Guest: {block.booking.guest.name}
                        </span>
                      )}
                    </div>
                  </div>
                  {block.blockType === "MANUAL_BLOCK" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={pending}
                      onClick={() => {
                        startTransition(async () => {
                          const result = await unblockDates(block.id);
                          if (result?.success) {
                            toast.success("Block removed");
                            refresh();
                          }
                          if (result?.error) toast.error(result.error);
                        });
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Custom nightly prices</CardTitle>
        </CardHeader>
        <CardContent>
          {datePrices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No date-specific prices. Use the calendar to add them.
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {datePrices.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <span>{format(new Date(row.date), "MMM d, yyyy")}</span>
                  <span className="font-medium">{formatPrice(Number(row.nightlyRate), currency)}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    disabled={pending}
                    onClick={() => {
                      startTransition(async () => {
                        const res = await removeListingDatePrice(row.id);
                        if (res?.success) {
                          toast.success("Removed");
                          refresh();
                        } else if (res?.error) toast.error(res.error);
                      });
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BlockRangeForm({ listingId, minDate }: { listingId: string; minDate: string }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    async (_prev: { error?: string; success?: boolean } | undefined, formData: FormData) => {
      formData.set("listingId", listingId);
      const result = await blockDates(formData);
      if (result?.success) {
        toast.success("Dates blocked");
        router.refresh();
      }
      if (result?.error) toast.error(result.error);
      return result;
    },
    undefined
  );

  return (
    <form className="space-y-4" action={formAction}>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="startDate">Start date</Label>
          <Input id="startDate" name="startDate" type="date" required min={minDate} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endDate">End date</Label>
          <Input
            id="endDate"
            name="endDate"
            type="date"
            required
            min={minDate}
            title="Last night blocked is the day before this checkout-style end date"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="reason">Reason (optional)</Label>
        <Input id="reason" name="reason" placeholder="e.g., Personal use, Maintenance" />
      </div>
      <p className="text-xs text-muted-foreground">
        End date is exclusive (same as guest checkout day): nights blocked are from start up to — but
        not including — the end date.
      </p>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={isPending}>
        <CalendarIcon className="h-4 w-4 mr-2" />
        {isPending ? "Blocking..." : "Block dates"}
      </Button>
    </form>
  );
}
