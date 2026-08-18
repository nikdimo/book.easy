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
  upsertListingDatePriceRange,
  removeListingDatePriceRange,
} from "@/lib/actions/availability.actions";
import {
  blockCalendarFuture,
  blockCalendarRange,
  openCalendarFuture,
  openCalendarRange,
} from "@/lib/actions/calendar.actions";
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

interface AvailabilityWindow {
  id: string;
  startDate: Date | string;
  endDate: Date | string;
}

interface PropertyAvailabilityCalendarProps {
  mode?: "availability" | "pricing";
  listingId: string;
  availabilityMode: "OPEN" | "CLOSED";
  availabilityWindows: AvailabilityWindow[];
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

type ActivityFilter =
  | "ALL"
  | "MANUAL_BLOCK"
  | "BOOKING_HOLD"
  | "EXTERNAL_SYNC"
  | "CUSTOM_PRICE";

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
  mode = "availability",
  listingId,
  availabilityMode,
  availabilityWindows,
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

  const { manualKeys, bookingKeys, importedKeys, openedKeys, priceByKey } = useMemo(() => {
    const manual = new Set<string>();
    const booking = new Set<string>();
    const imported = new Set<string>();
    const opened = new Set<string>();

    for (const block of existingBlocks) {
      const keys = eachYmdExclusive(
        dbDateToYmd(block.startDate),
        dbDateToYmd(block.endDate)
      );

      for (const key of keys) {
        if (block.blockType === "MANUAL_BLOCK") manual.add(key);
        else if (block.blockType === "EXTERNAL_SYNC") imported.add(key);
        else booking.add(key);
      }
    }

    for (const window of availabilityWindows) {
      for (const key of eachYmdExclusive(
        dbDateToYmd(window.startDate),
        dbDateToYmd(window.endDate)
      )) {
        opened.add(key);
      }
    }

    const prices = new Map<string, number>();
    for (const row of datePrices) {
      prices.set(dbDateToYmd(row.date), Number(row.nightlyRate));
    }

    return {
      manualKeys: manual,
      bookingKeys: booking,
      importedKeys: imported,
      openedKeys: opened,
      priceByKey: prices,
    };
  }, [availabilityWindows, datePrices, existingBlocks]);

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
    const importedDays = selectedRangeKeys.filter((key) => importedKeys.has(key)).length;
    const openDays = selectedRangeKeys.filter((key) => openedKeys.has(key)).length;
    const customPriceDays = selectedRangeKeys.filter((key) => priceByKey.has(key)).length;

    return {
      totalDays: selectedRangeKeys.length,
      manualDays,
      bookingDays,
      importedDays,
      openDays,
      customPriceDays,
      hasCustomPrice: customPriceDays > 0,
    };
  }, [bookingKeys, importedKeys, manualKeys, openedKeys, priceByKey, selectedRangeKeys]);

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
      const isImported = block.blockType === "EXTERNAL_SYNC";

      return {
        id: block.id,
        start,
        end,
        kind: isManualBlock
          ? "MANUAL_BLOCK"
          : isImported
            ? "EXTERNAL_SYNC"
            : "BOOKING_HOLD",
        title: isManualBlock
          ? "Manual block"
          : isImported
            ? "Connected calendar"
            : "Booking hold",
        detail: isManualBlock
          ? block.reason?.trim() || "No reason added"
          : isImported
            ? block.reason?.trim() || "Blocked by a connected calendar"
          : block.booking
            ? `${block.booking.guest.name} | ${block.booking.status}`
            : "Reserved dates",
        badge: isManualBlock ? "Blocked" : isImported ? "Imported" : "Booked",
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

  const visibleUpcomingExceptions = useMemo(
    () =>
      upcomingExceptions.filter((item) =>
        mode === "pricing"
          ? item.kind === "CUSTOM_PRICE"
          : item.kind !== "CUSTOM_PRICE"
      ),
    [mode, upcomingExceptions]
  );

  const filteredUpcomingExceptions = useMemo(() => {
    if (activityFilter === "ALL") return visibleUpcomingExceptions;
    return visibleUpcomingExceptions.filter((item) => item.kind === activityFilter);
  }, [activityFilter, visibleUpcomingExceptions]);

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
    if (res && "success" in res && res.success) {
      toast.success("Custom price cleared");
      setPriceDialogOpen(false);
    } else if (res && "error" in res && res.error) {
      toast.error(res.error);
    }
  }

  async function runBlockRange() {
    if (!rangeParts) return;

    const res = await blockCalendarRange(listingId, {
      startDate: rangeParts.startDate,
      endDate: rangeParts.endDate,
      reason: reasonInput.trim() || undefined,
    });
    if (res?.success) {
      toast.success(
        typeof res.success === "string"
          ? res.success
          : availabilityMode === "CLOSED"
            ? "Dates closed"
            : "Range blocked"
      );
    } else if (res?.error) {
      toast.error(res.error);
    }
  }

  async function runMakeRangeAvailable() {
    if (!rangeParts) return;

    const res = await openCalendarRange(listingId, {
      startDate: rangeParts.startDate,
      endDate: rangeParts.endDate,
    });
    if (res?.success) {
      toast.success(
        typeof res.success === "string"
          ? res.success
          : availabilityMode === "CLOSED"
            ? "Dates opened"
            : "Range marked available"
      );
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
    if (res && "success" in res && res.success) {
      toast.success("Custom price applied");
      setPriceDialogOpen(false);
    } else if (res && "error" in res && res.error) {
      toast.error(res.error);
    }
  }

  async function runRemovePriceOverride(start: string, end: string) {
    const fd = new FormData();
    fd.set("listingId", listingId);
    fd.set("startDate", start);
    fd.set("endDate", end);

    const res = await removeListingDatePriceRange(fd);
    if (res && "success" in res && res.success) {
      toast.success("Custom price removed");
    } else if (res && "error" in res && res.error) {
      toast.error(res.error);
    }
  }

  async function runFutureBlockAll() {
    const res = await blockCalendarFuture(listingId);
    if (res?.success) {
      toast.success(res.success);
    } else if (res?.error) {
      toast.error(res.error);
    }
  }

  async function runFutureMakeAvailableAll() {
    const res = await openCalendarFuture(listingId);
    if (res?.success) {
      toast.success(res.success);
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
            {mode === "pricing"
              ? "Select a date range to set or remove a custom nightly price."
              : availabilityMode === "CLOSED"
                ? "Dates stay closed until you open them. Select a range to open or close it."
                : "Dates start available. Select a range to block it or remove manual blocks."}
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            {mode === "availability" ? (
              <>
                {availabilityMode === "CLOSED" ? (
                  <>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-3 rounded-sm bg-emerald-500/20 ring-1 ring-emerald-600/40" /> Open
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-3 rounded-sm bg-muted border" /> Closed
                    </span>
                  </>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-3 rounded-sm bg-muted border" /> Manual block
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-3 rounded-sm bg-destructive/25 border border-destructive/30" />{" "}
                  Booking
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-3 rounded-sm bg-violet-500/20 border border-violet-500/30" />{" "}
                  Connected calendar
                </span>
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <span className="size-3 rounded-sm ring-2 ring-primary ring-inset" /> Custom price
              </span>
            )}
          </div>

          <div className="rounded-xl border bg-card p-3">
            <MarketplaceStayDatePicker
              layout="compact"
              checkIn={checkIn}
              checkOut={checkOut}
              showDateFlexibility={false}
              showGuestStep={false}
              finalActionLabel={{ text: "Done", translated: false }}
              dateDialogTitle={{
                text: mode === "pricing" ? "Custom pricing" : "Availability",
                translated: false,
              }}
              dateDialogDescription={{
                text:
                  mode === "pricing"
                    ? "Select dates to adjust their nightly price."
                    : availabilityMode === "CLOSED"
                      ? "Select dates to open or close."
                      : "Select dates to block or make available.",
                translated: false,
              }}
              hideDateSegmentCards
              dayVariant="availability"
              dayMeta={(day) => {
                const key = dateKey(day);
                return mode === "pricing"
                  ? {
                      sublabel: compactPriceFormatter.format(
                        priceByKey.get(key) ?? baseNightlyRate
                      ),
                      isCustomPrice:
                        priceByKey.has(key) &&
                        !manualKeys.has(key) &&
                        !bookingKeys.has(key) &&
                        !importedKeys.has(key),
                    }
                  : {
                      sublabel: bookingKeys.has(key)
                        ? "Booked"
                        : importedKeys.has(key)
                          ? "Imported"
                          : manualKeys.has(key)
                            ? "Blocked"
                            : availabilityMode === "CLOSED"
                              ? openedKeys.has(key)
                                ? "Open"
                                : "Closed"
                              : "Available",
                    };
              }}
              dateModifiers={{
                closedDefault: (day) =>
                  mode === "availability" &&
                  availabilityMode === "CLOSED" &&
                  !openedKeys.has(dateKey(day)),
                openWindow: (day) =>
                  mode === "availability" &&
                  availabilityMode === "CLOSED" &&
                  openedKeys.has(dateKey(day)),
                manualBlock: (day) => manualKeys.has(dateKey(day)),
                importedBlock: (day) => importedKeys.has(dateKey(day)),
                bookingHold: (day) => bookingKeys.has(dateKey(day)),
                customPrice: (day) => {
                  const key = dateKey(day);
                  return (
                    mode === "pricing" &&
                    priceByKey.has(key) &&
                    !manualKeys.has(key) &&
                    !bookingKeys.has(key) &&
                    !importedKeys.has(key)
                  );
                },
              }}
              dateModifiersClassNames={{
                closedDefault: cn("bg-muted/60 text-muted-foreground"),
                openWindow: cn(
                  "bg-emerald-500/15 ring-2 ring-emerald-600/35 ring-inset"
                ),
                manualBlock: cn(
                  "bg-muted text-foreground hover:bg-muted",
                  "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:bg-[repeating-linear-gradient(-45deg,rgba(15,23,42,0.09)_0,rgba(15,23,42,0.09)_4px,transparent_4px,transparent_8px)]"
                ),
                importedBlock: cn(
                  "bg-violet-500/20 text-foreground hover:bg-violet-500/25"
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
                            {mode === "pricing" ? (
                              <Badge variant="outline">
                                {selectedUniformRate != null
                                  ? `${compactPriceFormatter.format(selectedUniformRate)} / night`
                                  : "Mixed prices"}
                              </Badge>
                            ) : null}
                            {mode === "pricing" && selectedStats.customPriceDays > 0 ? (
                              <Badge variant="outline">
                                {selectedStats.customPriceDays} custom price day
                                {selectedStats.customPriceDays === 1 ? "" : "s"}
                              </Badge>
                            ) : null}
                            {mode === "availability" && selectedStats.manualDays > 0 ? (
                              <Badge variant="outline">
                                {selectedStats.manualDays} blocked day
                                {selectedStats.manualDays === 1 ? "" : "s"}
                              </Badge>
                            ) : null}
                            {mode === "availability" && selectedStats.bookingDays > 0 ? (
                              <Badge variant="outline">
                                {selectedStats.bookingDays} booked day
                                {selectedStats.bookingDays === 1 ? "" : "s"}
                              </Badge>
                            ) : null}
                            {mode === "availability" && selectedStats.importedDays > 0 ? (
                              <Badge variant="outline">
                                {selectedStats.importedDays} imported blocked day
                                {selectedStats.importedDays === 1 ? "" : "s"}
                              </Badge>
                            ) : null}
                            {mode === "availability" && availabilityMode === "CLOSED" ? (
                              <Badge variant="outline">
                                {selectedStats.openDays} open day
                                {selectedStats.openDays === 1 ? "" : "s"}
                              </Badge>
                            ) : null}
                          </div>
                        ) : null}
                      </div>

                      {mode === "availability" && availabilityMode === "OPEN" ? (
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
                      ) : null}
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
                      {mode === "pricing" ? (
                        <>
                          <Button
                            type="button"
                            className="min-w-[7rem] rounded-full"
                            disabled={!rangeParts || pending}
                            onClick={openPriceDialog}
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
                        </>
                      ) : (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            className="min-w-[8rem] rounded-full"
                            disabled={!rangeParts || pending}
                            onClick={() =>
                              requestConfirm(
                                availabilityMode === "CLOSED"
                                  ? "Open selected dates"
                                  : "Make selected range available",
                                availabilityMode === "CLOSED"
                                  ? `This opens ${selectedLabel}. Bookings and connected-calendar restrictions stay blocked.`
                                  : `This removes manual blocks in ${selectedLabel}, including any before-launch protection. Bookings and connected-calendar restrictions stay blocked.`,
                                runMakeRangeAvailable
                              )
                            }
                          >
                            {availabilityMode === "CLOSED" ? "Open dates" : "Make available"}
                          </Button>
                          <Button
                            type="button"
                            className="min-w-[7rem] rounded-full"
                            disabled={!rangeParts || pending}
                            onClick={() =>
                              requestConfirm(
                                availabilityMode === "CLOSED"
                                  ? "Close selected dates"
                                  : "Block selected range",
                                availabilityMode === "CLOSED"
                                  ? `This removes ${selectedLabel} from the open-date windows. Existing bookings stay protected.`
                                  : `This will block ${selectedLabel} for booking requests.`,
                                runBlockRange
                              )
                            }
                          >
                            {availabilityMode === "CLOSED" ? "Close dates" : "Block"}
                          </Button>
                        </>
                      )}
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

      {mode === "availability" ? (
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
                  availabilityMode === "CLOSED"
                    ? "Close all future dates"
                    : "Block all future dates",
                  availabilityMode === "CLOSED"
                    ? "This closes every future open window. Existing bookings and connected-calendar restrictions stay protected."
                    : "This blocks every currently available future date. Existing bookings and connected-calendar restrictions remain as-is.",
                  runFutureBlockAll
                )
              }
            >
              {availabilityMode === "CLOSED" ? "Close all future" : "Block all future"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={pending}
              onClick={() =>
                requestConfirm(
                  availabilityMode === "CLOSED"
                    ? "Open all future dates"
                    : "Make all future dates available",
                  availabilityMode === "CLOSED"
                    ? "This creates an open window for future dates. Existing bookings, manual blocks, and connected-calendar restrictions stay blocked."
                    : "This removes all manual future blocks, including before-launch protection. Bookings and connected-calendar restrictions stay blocked.",
                  runFutureMakeAvailableAll
                )
              }
            >
              {availabilityMode === "CLOSED" ? "Open all future" : "Make all future available"}
            </Button>
          </div>
        </CardContent>
      </Card>
      ) : null}

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Upcoming Exceptions</CardTitle>
          <p className="text-sm text-muted-foreground">
            {mode === "pricing"
              ? "Review and remove upcoming custom price periods."
              : "Review upcoming blocked dates and bookings."}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {[
              { value: "ALL", label: `All (${visibleUpcomingExceptions.length})` },
              ...(mode === "pricing"
                ? [
                    {
                      value: "CUSTOM_PRICE",
                      label: `Prices (${visibleUpcomingExceptions.length})`,
                    },
                  ]
                : [
                    {
                      value: "MANUAL_BLOCK",
                      label: `Blocks (${visibleUpcomingExceptions.filter((item) => item.kind === "MANUAL_BLOCK").length})`,
                    },
                    {
                      value: "BOOKING_HOLD",
                      label: `Bookings (${visibleUpcomingExceptions.filter((item) => item.kind === "BOOKING_HOLD").length})`,
                    },
                    {
                      value: "EXTERNAL_SYNC",
                      label: `Imported (${visibleUpcomingExceptions.filter((item) => item.kind === "EXTERNAL_SYNC").length})`,
                    },
                  ]),
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
                          : item.kind === "EXTERNAL_SYNC"
                            ? "Connected-calendar protection"
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

      {mode === "pricing" ? (
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
      ) : null}

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
