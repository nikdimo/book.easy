"use client";

import { useMemo, useState, useTransition } from "react";
import { format } from "date-fns";
import { ShieldAlert, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  blockDates,
  blockAllFutureDates,
  makeAllFutureDatesAvailable,
  unblockDateRange,
  upsertListingDatePriceRange,
  removeListingDatePriceRange,
} from "@/lib/actions/availability.actions";
import { dateKey, parseLocalYmd } from "@/lib/utils/stay-pricing";
import {
  addDaysToYmd,
  dbDateToYmd,
  eachYmdExclusive,
  eachYmdInclusive,
} from "@/lib/utils/date-only";
import { formatPrice } from "@/lib/utils/format";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MarketplaceStayDatePicker } from "@/components/marketplace/marketplace-stay-date-picker";
import { cn } from "@/lib/utils";

interface Block {
  id: string;
  startDate: Date | string;
  endDate: Date | string;
  blockType: string;
  reason?: string | null;
  booking?: { id: string; guest: { name: string }; status: string } | null;
}

interface DatePriceRow {
  id: string;
  date: Date | string;
  nightlyRate: number;
}

interface PropertyAvailabilityCalendarProps {
  listingId: string;
  baseNightlyRate: number;
  currency: string;
  datePrices: DatePriceRow[];
  existingBlocks: Block[];
}

interface GroupedPriceRange {
  start: string;
  end: string;
  nightlyRate: number;
  days: number;
}

type ActivityFilter = "ALL" | "MANUAL_BLOCK" | "BOOKING_HOLD" | "CUSTOM_PRICE";

interface UpcomingException {
  id: string;
  start: string;
  end: string;
  kind: Exclude<ActivityFilter, "ALL">;
  title: string;
  detail: string;
  badge: string;
}

interface PendingAction {
  title: string;
  description: string;
  run: () => Promise<void>;
}

export function PropertyAvailabilityCalendar({
  listingId,
  baseNightlyRate,
  currency,
  datePrices,
  existingBlocks,
}: PropertyAvailabilityCalendarProps) {
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [reasonInput, setReasonInput] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [priceDialogOpen, setPriceDialogOpen] = useState(false);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("ALL");
  const [pending, startTransition] = useTransition();

  const compactPriceFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        currencyDisplay: "narrowSymbol",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }),
    [currency]
  );

  const rangeParts =
    checkIn
      ? {
          startDate: checkIn,
          endDate: addDaysToYmd(checkOut || checkIn, 1),
          displayEndDate: checkOut || checkIn,
        }
      : null;
  const selectedLabel = rangeParts
    ? rangeParts.startDate === rangeParts.displayEndDate
      ? rangeParts.startDate
      : `${rangeParts.startDate} to ${rangeParts.displayEndDate}`
    : "Select a date range";

  const { manualKeys, bookingKeys, priceByKey } = useMemo(() => {
    const manual = new Set<string>();
    const booking = new Set<string>();

    for (const block of existingBlocks) {
      const keys = eachYmdExclusive(
        dbDateToYmd(block.startDate),
        dbDateToYmd(block.endDate)
      );

      for (const key of keys) {
        if (block.blockType === "MANUAL_BLOCK") {
          manual.add(key);
        } else {
          booking.add(key);
        }
      }
    }

    const prices = new Map<string, number>();
    for (const row of datePrices) {
      prices.set(dbDateToYmd(row.date), Number(row.nightlyRate));
    }

    return { manualKeys: manual, bookingKeys: booking, priceByKey: prices };
  }, [datePrices, existingBlocks]);

  const selectedRangeKeys = useMemo(() => {
    if (!checkIn) return [];
    if (!checkOut) return [checkIn];
    if (checkOut < checkIn) return [];
    return eachYmdInclusive(checkIn, checkOut);
  }, [checkIn, checkOut]);

  const selectedUniformRate = useMemo(() => {
    if (selectedRangeKeys.length === 0) return null;

    const uniqueRates = new Set(
      selectedRangeKeys.map((key) => priceByKey.get(key) ?? baseNightlyRate)
    );

    return uniqueRates.size === 1 ? [...uniqueRates][0] : null;
  }, [baseNightlyRate, priceByKey, selectedRangeKeys]);

  const selectedStats = useMemo(() => {
    const manualDays = selectedRangeKeys.filter((key) => manualKeys.has(key)).length;
    const bookingDays = selectedRangeKeys.filter((key) => bookingKeys.has(key)).length;
    const customPriceDays = selectedRangeKeys.filter((key) => priceByKey.has(key)).length;

    return {
      totalDays: selectedRangeKeys.length,
      manualDays,
      bookingDays,
      customPriceDays,
      hasCustomPrice: customPriceDays > 0,
    };
  }, [bookingKeys, manualKeys, priceByKey, selectedRangeKeys]);

  const groupedPriceRanges = useMemo(() => {
    const rows = [...datePrices]
      .map((row) => ({
        key: dbDateToYmd(row.date),
        nightlyRate: Number(row.nightlyRate),
      }))
      .sort((a, b) => a.key.localeCompare(b.key));
    const grouped: GroupedPriceRange[] = [];

    for (const row of rows) {
      const previous = grouped[grouped.length - 1];

      if (!previous) {
        grouped.push({
          start: row.key,
          end: row.key,
          nightlyRate: row.nightlyRate,
          days: 1,
        });
        continue;
      }

      if (
        previous.nightlyRate === row.nightlyRate &&
        addDaysToYmd(previous.end, 1) === row.key
      ) {
        previous.end = row.key;
        previous.days += 1;
      } else {
        grouped.push({
          start: row.key,
          end: row.key,
          nightlyRate: row.nightlyRate,
          days: 1,
        });
      }
    }

    return grouped;
  }, [datePrices]);

  const upcomingExceptions = useMemo<UpcomingException[]>(() => {
    const blockEvents = existingBlocks.map((block) => {
      const start = dbDateToYmd(block.startDate);
      const end = addDaysToYmd(dbDateToYmd(block.endDate), -1);
      const isManualBlock = block.blockType === "MANUAL_BLOCK";

      return {
        id: block.id,
        start,
        end,
        kind: isManualBlock ? "MANUAL_BLOCK" : "BOOKING_HOLD",
        title: isManualBlock ? "Manual block" : "Booking hold",
        detail: isManualBlock
          ? block.reason?.trim() || "No reason added"
          : block.booking
            ? `${block.booking.guest.name} | ${block.booking.status}`
            : "Reserved dates",
        badge: isManualBlock ? "Blocked" : "Booked",
      } satisfies UpcomingException;
    });

    const priceEvents: UpcomingException[] = groupedPriceRanges.map((range, index) => ({
      id: `price-${range.start}-${range.end}-${index}`,
      start: range.start,
      end: range.end,
      kind: "CUSTOM_PRICE",
      title: "Custom price",
      detail: `${formatPrice(range.nightlyRate, currency)} / night | ${range.days} day${
        range.days === 1 ? "" : "s"
      }`,
      badge: "Price override",
    }));

    return [...blockEvents, ...priceEvents].sort((left, right) => {
      if (left.start !== right.start) return left.start.localeCompare(right.start);
      return left.kind.localeCompare(right.kind);
    });
  }, [currency, existingBlocks, groupedPriceRanges]);

  const filteredUpcomingExceptions = useMemo(() => {
    if (activityFilter === "ALL") return upcomingExceptions;
    return upcomingExceptions.filter((item) => item.kind === activityFilter);
  }, [activityFilter, upcomingExceptions]);

  function requestConfirm(title: string, description: string, run: () => Promise<void>) {
    setPendingAction({ title, description, run });
  }

  function runConfirmed(action: PendingAction) {
    startTransition(async () => {
      await action.run();
      setPendingAction(null);
    });
  }

  function openPriceDialog() {
    if (!rangeParts) return;
    setPriceInput(selectedUniformRate != null ? String(selectedUniformRate) : "");
    setPriceDialogOpen(true);
  }

  async function runResetCustomPrice() {
    if (!rangeParts) return;

    const fd = new FormData();
    fd.set("listingId", listingId);
    fd.set("startDate", rangeParts.startDate);
    fd.set("endDate", rangeParts.endDate);
    fd.set("nightlyRate", String(baseNightlyRate));

    const res = await upsertListingDatePriceRange(fd);
    if (res?.success) {
      toast.success("Custom price cleared");
      setPriceDialogOpen(false);
    } else if (res?.error) {
      toast.error(res.error);
    }
  }

  async function runBlockRange() {
    if (!rangeParts) return;

    const fd = new FormData();
    fd.set("listingId", listingId);
    fd.set("startDate", rangeParts.startDate);
    fd.set("endDate", rangeParts.endDate);
    if (reasonInput.trim()) {
      fd.set("reason", reasonInput.trim());
    }

    const res = await blockDates(fd);
    if (res?.success) {
      toast.success("Range blocked");
    } else if (res?.error) {
      toast.error(res.error);
    }
  }

  async function runMakeRangeAvailable() {
    if (!rangeParts) return;

    const fd = new FormData();
    fd.set("listingId", listingId);
    fd.set("startDate", rangeParts.startDate);
    fd.set("endDate", rangeParts.endDate);

    const res = await unblockDateRange(fd);
    if (res?.success) {
      toast.success("Range marked available");
    } else if (res?.error) {
      toast.error(res.error);
    }
  }

  async function runSetCustomPrice() {
    if (!rangeParts) return;

    const value = parseFloat(priceInput.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter a valid custom price");
      return;
    }

    const fd = new FormData();
    fd.set("listingId", listingId);
    fd.set("startDate", rangeParts.startDate);
    fd.set("endDate", rangeParts.endDate);
    fd.set("nightlyRate", String(value));

    const res = await upsertListingDatePriceRange(fd);
    if (res?.success) {
      toast.success("Custom price applied");
      setPriceDialogOpen(false);
    } else if (res?.error) {
      toast.error(res.error);
    }
  }

  async function runRemovePriceOverride(start: string, end: string) {
    const fd = new FormData();
    fd.set("listingId", listingId);
    fd.set("startDate", start);
    fd.set("endDate", end);

    const res = await removeListingDatePriceRange(fd);
    if (res?.success) {
      toast.success("Custom price removed");
    } else if (res?.error) {
      toast.error(res.error);
    }
  }

  async function runFutureBlockAll() {
    const res = await blockAllFutureDates(listingId);
    if (res?.success) {
      toast.success("All future dates blocked");
    } else if (res?.error) {
      toast.error(res.error);
    }
  }

  async function runFutureMakeAvailableAll() {
    const res = await makeAllFutureDatesAvailable(listingId);
    if (res?.success) {
      toast.success("All future manual blocks removed");
    } else if (res?.error) {
      toast.error(res.error);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Calendar</CardTitle>
          <p className="text-sm text-muted-foreground">
            Select a date range, then apply availability or pricing actions.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
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

          <div className="rounded-xl border bg-card p-3">
            <MarketplaceStayDatePicker
              layout="compact"
              checkIn={checkIn}
              checkOut={checkOut}
              showDateFlexibility={false}
              showGuestStep={false}
              finalActionLabel="Done"
              dateDialogTitle="Availability"
              dateDialogDescription="Select dates to block, reopen, or adjust nightly price."
              hideDateSegmentCards
              dayVariant="availability"
              dayMeta={(day) => {
                const key = dateKey(day);
                return {
                  sublabel: compactPriceFormatter.format(
                    priceByKey.get(key) ?? baseNightlyRate
                  ),
                  isCustomPrice:
                    priceByKey.has(key) &&
                    !manualKeys.has(key) &&
                    !bookingKeys.has(key),
                };
              }}
              dateModifiers={{
                manualBlock: (day) => manualKeys.has(dateKey(day)),
                bookingHold: (day) => bookingKeys.has(dateKey(day)),
                customPrice: (day) => {
                  const key = dateKey(day);
                  return (
                    priceByKey.has(key) &&
                    !manualKeys.has(key) &&
                    !bookingKeys.has(key)
                  );
                },
              }}
              dateModifiersClassNames={{
                manualBlock: cn(
                  "bg-muted text-foreground hover:bg-muted",
                  "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:bg-[repeating-linear-gradient(-45deg,rgba(15,23,42,0.09)_0,rgba(15,23,42,0.09)_4px,transparent_4px,transparent_8px)]"
                ),
                bookingHold: cn(
                  "bg-destructive/25 text-foreground hover:bg-destructive/30"
                ),
                customPrice: cn("ring-2 ring-primary/40 ring-inset font-medium"),
              }}
              renderDateFooter={({ closePicker }) => (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="flex-1 space-y-3">
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">{selectedLabel}</p>
                        {rangeParts ? (
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="secondary">
                              {selectedStats.totalDays} day{selectedStats.totalDays === 1 ? "" : "s"}
                            </Badge>
                            <Badge variant="outline">
                              {selectedUniformRate != null
                                ? `${compactPriceFormatter.format(selectedUniformRate)} / night`
                                : "Mixed prices"}
                            </Badge>
                            {selectedStats.customPriceDays > 0 ? (
                              <Badge variant="outline">
                                {selectedStats.customPriceDays} custom price day
                                {selectedStats.customPriceDays === 1 ? "" : "s"}
                              </Badge>
                            ) : null}
                            {selectedStats.manualDays > 0 ? (
                              <Badge variant="outline">
                                {selectedStats.manualDays} blocked day
                                {selectedStats.manualDays === 1 ? "" : "s"}
                              </Badge>
                            ) : null}
                            {selectedStats.bookingDays > 0 ? (
                              <Badge variant="outline">
                                {selectedStats.bookingDays} booked day
                                {selectedStats.bookingDays === 1 ? "" : "s"}
                              </Badge>
                            ) : null}
                          </div>
                        ) : null}
                      </div>

                      <div className="max-w-sm space-y-2">
                        <Label htmlFor="availability-reason" className="text-xs text-muted-foreground">
                          Block reason (optional)
                        </Label>
                        <Input
                          id="availability-reason"
                          value={reasonInput}
                          onChange={(e) => setReasonInput(e.target.value)}
                          placeholder="e.g. Maintenance, private stay"
                        />
                      </div>
                    </div>

                    <div className="flex w-full flex-wrap items-center justify-end gap-3 lg:w-auto">
                      <Button
                        type="button"
                        variant="outline"
                        className="min-w-[7rem] rounded-full"
                        onClick={closePicker}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="min-w-[7rem] rounded-full"
                        disabled={!rangeParts || pending}
                        onClick={() => {
                          openPriceDialog();
                        }}
                      >
                        Edit price
                      </Button>
                      {selectedStats.hasCustomPrice ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="min-w-[7rem] rounded-full"
                          disabled={!rangeParts || pending}
                          onClick={() => startTransition(runResetCustomPrice)}
                        >
                          Reset price
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        className="min-w-[8rem] rounded-full"
                        disabled={!rangeParts || pending}
                        onClick={() =>
                          requestConfirm(
                            "Make selected range available",
                            `This removes manual blocks in ${selectedLabel}. Booking holds stay untouched.`,
                            runMakeRangeAvailable
                          )
                        }
                      >
                        Make available
                      </Button>
                      <Button
                        type="button"
                        className="min-w-[7rem] rounded-full"
                        disabled={!rangeParts || pending}
                        onClick={() =>
                          requestConfirm(
                            "Block selected range",
                            `This will block ${selectedLabel} for booking requests.`,
                            runBlockRange
                          )
                        }
                      >
                        Block
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              onRangeStringsChange={({ checkIn: nextIn, checkOut: nextOut }) => {
                setCheckIn(nextIn);
                setCheckOut(nextOut);
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Bulk Future Actions</CardTitle>
          <p className="text-sm text-muted-foreground">
            These actions affect all future dates and stay separate from the date-by-date calendar workflow.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            <Button
              type="button"
              variant="default"
              className="w-full"
              disabled={pending}
              onClick={() =>
                requestConfirm(
                  "Block all future dates",
                  "This will block every currently available future date. Existing booking holds remain as-is.",
                  runFutureBlockAll
                )
              }
            >
              Block all future
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={pending}
              onClick={() =>
                requestConfirm(
                  "Make all future dates available",
                  "This will remove all manual future blocks. Confirmed/pending booking holds are kept.",
                  runFutureMakeAvailableAll
                )
              }
            >
              Make all future available
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Upcoming Exceptions</CardTitle>
          <p className="text-sm text-muted-foreground">
            Review the upcoming blocked dates, bookings, and custom price periods in one timeline.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {[
              { value: "ALL", label: `All (${upcomingExceptions.length})` },
              {
                value: "MANUAL_BLOCK",
                label: `Blocks (${upcomingExceptions.filter((item) => item.kind === "MANUAL_BLOCK").length})`,
              },
              {
                value: "BOOKING_HOLD",
                label: `Bookings (${upcomingExceptions.filter((item) => item.kind === "BOOKING_HOLD").length})`,
              },
              {
                value: "CUSTOM_PRICE",
                label: `Prices (${upcomingExceptions.filter((item) => item.kind === "CUSTOM_PRICE").length})`,
              },
            ].map((filterOption) => (
              <Button
                key={filterOption.value}
                type="button"
                variant={activityFilter === filterOption.value ? "default" : "outline"}
                className="rounded-full"
                onClick={() => setActivityFilter(filterOption.value as ActivityFilter)}
              >
                {filterOption.label}
              </Button>
            ))}
          </div>

          {filteredUpcomingExceptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No upcoming exceptions for the selected filter.
            </p>
          ) : (
            <div className="space-y-2">
              {filteredUpcomingExceptions.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 rounded-xl border px-4 py-3 md:flex-row md:items-center md:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{item.title}</p>
                      <Badge
                        variant={
                          item.kind === "BOOKING_HOLD"
                            ? "default"
                            : item.kind === "MANUAL_BLOCK"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {item.badge}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {format(parseLocalYmd(item.start)!, "MMM d, yyyy")} -{" "}
                      {format(parseLocalYmd(item.end)!, "MMM d, yyyy")}
                    </p>
                    <p className="text-xs text-muted-foreground">{item.detail}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-muted-foreground">
                      {item.kind === "CUSTOM_PRICE"
                        ? "Price override"
                        : item.kind === "BOOKING_HOLD"
                          ? "Booking protection"
                          : "Manual availability block"}
                    </div>
                    {item.kind === "CUSTOM_PRICE" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-destructive"
                        disabled={pending}
                        onClick={() =>
                          requestConfirm(
                            "Remove custom price",
                            `This removes the price override for ${format(
                              parseLocalYmd(item.start)!,
                              "MMM d, yyyy"
                            )} - ${format(
                              parseLocalYmd(item.end)!,
                              "MMM d, yyyy"
                            )}. Nights will revert to the base price.`,
                            () => runRemovePriceOverride(item.start, item.end)
                          )
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={priceDialogOpen} onOpenChange={setPriceDialogOpen}>
        <DialogContent showCloseButton={false} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit price</DialogTitle>
            <DialogDescription>
              {rangeParts
                ? `Set a nightly rate for ${selectedLabel}.`
                : "Select a date range first."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="range-price">Nightly price</Label>
              <Input
                id="range-price"
                inputMode="decimal"
                placeholder={String(selectedUniformRate ?? baseNightlyRate)}
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Base rate: {formatPrice(baseNightlyRate, currency)}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPriceDialogOpen(false)}>
              Cancel
            </Button>
            {selectedStats.hasCustomPrice ? (
              <Button
                variant="outline"
                disabled={!rangeParts || pending}
                onClick={() => startTransition(runResetCustomPrice)}
              >
                Use base price
              </Button>
            ) : null}
            <Button disabled={!rangeParts || pending} onClick={() => startTransition(runSetCustomPrice)}>
              Save price
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingAction)} onOpenChange={(open) => !open && setPendingAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" />
              {pendingAction?.title}
            </DialogTitle>
            <DialogDescription>{pendingAction?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingAction(null)}>
              Cancel
            </Button>
            <Button disabled={pending || !pendingAction} onClick={() => pendingAction && runConfirmed(pendingAction)}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
