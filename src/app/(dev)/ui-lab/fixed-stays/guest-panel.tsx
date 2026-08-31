"use client";

import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { CalendarCheck2, Info, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EmptyState } from "@/components/shared/empty-state";
import { DateRangeCalendarStep } from "@/components/marketplace/marketplace-stay-date-picker";
import { cn } from "@/lib/utils";
import {
  CARD,
  CARD_PRESSABLE,
  CARD_SELECTED,
  MonthHeading,
  StateBadge,
} from "./surfaces";
import { LAB_TODAY, LISTING, NIGHTLY_PRICING } from "./fixtures";
import { dayMonthYear, money, monthYear, weekdayDayMonth } from "./display";
import {
  groupByMonth,
  isSelectable,
  quoteForPeriod,
  resolvePeriodsForGuest,
  type CalendarBlock,
  type FixedStayPeriod,
  type ResolvedFixedStayPeriod,
} from "./periods";

export type GuestListingKind = "fixed" | "flexible";

/**
 * The guest half of the mockup.
 *
 * The frame is the one the booking widget already uses: a sticky card on the right at
 * `lg` and up, and below that a fixed bottom bar over a sheet — so a fixed-stay listing
 * is the same object a guest already knows, with the calendar swapped for the host's
 * list of whole stays. There is no free date range to pick, in either view.
 *
 * Every total on screen comes from the product's own `computeStayQuote`, run over the
 * period's two dates against the listing's ordinary nightly rate, date overrides,
 * cleaning fee and promotions. A fixed stay is not priced by a rule of its own.
 */
export function GuestPanel({
  kind,
  periods,
  blocks,
}: {
  kind: GuestListingKind;
  periods: FixedStayPeriod[];
  blocks: CalendarBlock[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  /** Only used by the flexible comparison view. */
  const [range, setRange] = useState<DateRange | undefined>();

  // The server's projection, not a filter this screen applies: a stay the host switched
  // off, and one whose check-in has gone by, never reach the browser at all.
  const options = resolvePeriodsForGuest(periods, blocks, LAB_TODAY);
  const selectedOption = options.find((period) => period.id === selectedId) ?? null;
  const selected =
    selectedOption && isSelectable(selectedOption) ? selectedOption : null;
  const bookable = options.filter(isSelectable);

  const select = (id: string) => {
    setSelectedId(id);
    setSheetOpen(false);
  };

  return (
    // The bottom padding is the mobile bar's height: nothing at the end of the page
    // should sit under it.
    <div className="grid gap-8 pb-32 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10 lg:pb-0">
      <div className="min-w-0">
        <h2 className="font-heading text-[1.5rem] font-semibold tracking-[-0.02em] text-slate-950">
          {LISTING.title}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {LISTING.city}, {LISTING.country} · {LISTING.maxGuests} guests
        </p>

        {kind === "fixed" ? (
          <>
            {/* The one thing a guest must understand before they look for dates. */}
            <div className={cn(CARD, "mt-5 flex items-start gap-3 p-5")}>
              <CalendarCheck2
                className="mt-0.5 size-5 shrink-0 text-slate-950"
                strokeWidth={1.8}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="font-heading text-base font-semibold text-slate-950">
                  This place is booked as whole stays
                </p>
                <p className="mt-1 text-[0.8125rem] leading-5 text-slate-600">
                  The host offers set arrival and departure dates rather than a free
                  calendar. Pick one of the stays below — you can&apos;t shorten, extend
                  or join them.
                </p>
              </div>
            </div>

            <div className="mt-7 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className="font-heading text-base font-semibold text-slate-950">
                Available stays
              </h3>
              {/* The one number a guest scanning a long season wants first: how many of
                  these can I actually have? */}
              <p className="text-[0.8125rem] text-slate-500">
                {bookable.length === 0
                  ? "None open right now"
                  : `${bookable.length} of ${options.length} still open`}
              </p>
            </div>
            <div className="mt-2 hidden lg:block">
              <StayOptionList
                name="fixed-stay-option-desktop"
                options={options}
                selectedId={selectedId}
                onSelect={select}
              />
            </div>
            {/* Below `lg` the list lives in the sheet the bottom bar opens, the same way
                the booking widget moves its picker into a drawer. */}
            <div className="mt-2 lg:hidden">
              {options.length === 0 ? (
                <EmptyList />
              ) : (
                <p className={cn(CARD, "p-5 text-[0.875rem] leading-6 text-slate-600")}>
                  {bookable.length} of {options.length} stays are still open. Tap{" "}
                  <span className="font-medium text-slate-950">Choose a stay</span> to
                  see them.
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <div className={cn(CARD, "mt-5 flex items-start gap-3 p-5")}>
              <Info className="mt-0.5 size-5 shrink-0 text-slate-400" aria-hidden />
              <div className="min-w-0">
                <p className="font-heading text-base font-semibold text-slate-950">
                  Flexible dates — unchanged
                </p>
                <p className="mt-1 text-[0.8125rem] leading-5 text-slate-600">
                  For comparison: this is today&apos;s behaviour, untouched. Any range
                  the calendar allows is bookable.
                </p>
              </div>
            </div>
            <div className={cn(CARD, "mt-5 overflow-hidden")}>
              <DateRangeCalendarStep
                active
                selected={range}
                onRangeChange={setRange}
                minimumStayNights={5}
                locale={LISTING.locale}
              />
            </div>
          </>
        )}
      </div>

      {/* Desktop: the sticky summary card, same frame as the booking widget's. */}
      <div className="hidden lg:block">
        <Card
          className="notranslate sticky top-6 gap-0 overflow-hidden rounded-2xl border-0 py-0 shadow-[0_6px_16px_rgba(15,23,42,0.12)]"
          translate="no"
        >
          <CardHeader className="px-5 pt-5 pb-2">
            <CardTitle className="flex flex-col gap-1 font-normal">
              <PriceHeadline kind={kind} selected={selected} options={options} />
            </CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-[16rem] flex-col px-5 pt-0 pb-5">
            {kind === "fixed" ? (
              <FixedSummary selected={selected} />
            ) : (
              <FlexibleSummary range={range} />
            )}
            <div className="mt-auto pt-4">
              <Button
                type="button"
                className="w-full rounded-xl py-6 text-base font-semibold"
                disabled={kind === "fixed" ? !selected : !range?.from || !range?.to}
              >
                Request to book
              </Button>
              <p className="mt-2 text-center text-xs text-slate-500">
                You won&apos;t be charged yet.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Mobile: the fixed bar the booking widget already pins to the bottom. */}
      <div
        className="notranslate fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 pt-3 backdrop-blur lg:hidden"
        translate="no"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {kind === "fixed" && selected ? (
              <>
                <p className="text-base font-semibold text-slate-950">
                  {money(quoteForPeriod(selected, NIGHTLY_PRICING).total)}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {weekdayDayMonth(selected.checkIn)} –{" "}
                  {weekdayDayMonth(selected.checkOut)}
                </p>
              </>
            ) : (
              <>
                <p className="text-base font-semibold text-slate-950">
                  {money(NIGHTLY_PRICING.baseNightlyRate)}
                  <span className="text-sm font-normal text-slate-500"> / night</span>
                </p>
                <p className="truncate text-xs text-slate-500">
                  {kind === "fixed" ? "No stay chosen yet" : "Add dates"}
                </p>
              </>
            )}
          </div>
          <Button
            type="button"
            className="shrink-0 rounded-full px-5 font-semibold"
            onClick={() => setSheetOpen(true)}
            disabled={kind === "flexible"}
          >
            {kind === "flexible"
              ? "Add dates"
              : selected
                ? "Change stay"
                : "Choose a stay"}
          </Button>
        </div>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          className="notranslate flex max-h-[85vh] flex-col rounded-t-2xl px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="px-0">
            <SheetTitle className="font-heading">Choose a stay</SheetTitle>
          </SheetHeader>
          <p className="text-[0.8125rem] leading-5 text-slate-600">
            This host offers set stays only. Pick one to fill in your dates.
          </p>
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto pb-2">
            <StayOptionList
              name="fixed-stay-option-mobile"
              options={options}
              selectedId={selectedId}
              onSelect={select}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function EmptyList() {
  return (
    <div className={CARD}>
      <EmptyState
        icon={CalendarCheck2}
        title="No stays available"
        description="The host hasn't opened any stay periods for this place yet."
      />
    </div>
  );
}

/**
 * The host's options as one radio group.
 *
 * Native radios, so arrow keys move between the stays and the group reads as one
 * choice. An unavailable stay is a disabled radio: still announced, still visible in the
 * run of dates, never selectable. There is no free-date control anywhere on this
 * screen — picking a stay is the only way to fill in dates.
 */
function StayOptionList({
  name,
  options,
  selectedId,
  onSelect,
}: {
  name: string;
  options: ResolvedFixedStayPeriod[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (options.length === 0) return <EmptyList />;

  return (
    <fieldset>
      <legend className="sr-only">Available stays</legend>
      {groupByMonth(options).map((group) => (
        <div key={group.month}>
          <MonthHeading>{monthYear(group.month)}</MonthHeading>
          <div className="flex flex-col gap-2.5">
      {group.items.map((period) => {
        const id = `${name}-${period.id}`;
        const quote = quoteForPeriod(period, NIGHTLY_PRICING);
        const selectable = isSelectable(period);
        const checked = selectedId === period.id;

        return (
          <div
            key={period.id}
            className={cn(
              selectable ? CARD_PRESSABLE : CARD,
              "focus-within:ring-2 focus-within:ring-slate-900/30",
              checked && CARD_SELECTED,
              !selectable && "shadow-none ring-1 ring-slate-100",
            )}
          >
            <input
              type="radio"
              id={id}
              name={name}
              className="sr-only"
              checked={checked}
              disabled={!selectable}
              onChange={() => onSelect(period.id)}
            />
            <label
              htmlFor={id}
              className={cn(
                "flex items-start gap-3 p-4",
                selectable ? "cursor-pointer" : "cursor-not-allowed",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors",
                  checked
                    ? "border-slate-950"
                    : selectable
                      ? "border-slate-300"
                      : "border-slate-200",
                )}
              >
                {checked ? <span className="size-2.5 rounded-full bg-slate-950" /> : null}
                {!selectable ? (
                  <Lock className="size-3 text-slate-400" strokeWidth={2} />
                ) : null}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "notranslate font-heading text-base font-semibold",
                      selectable ? "text-slate-950" : "text-slate-500",
                    )}
                    translate="no"
                  >
                    {weekdayDayMonth(period.checkIn)} →{" "}
                    {weekdayDayMonth(period.checkOut)}
                  </span>
                  <StateBadge state={period.state} audience="guest" />
                </span>
                <span
                  className={cn(
                    "mt-1 block text-[0.8125rem] leading-5",
                    selectable ? "text-slate-500" : "text-slate-400",
                  )}
                >
                  {/* The *effective* average — net of any offer — because it sits
                      beside a total that is also net. The gross one would advertise a
                      higher nightly figure than the price next to it. */}
                  {period.nights} nights · avg.{" "}
                  {money(quote.effectiveAverageNightly)} a night
                  {quote.discountAmount > 0 ? (
                    <span className={selectable ? "font-medium text-slate-950" : undefined}>
                      {" "}
                      · offer applied
                    </span>
                  ) : null}
                </span>
              </span>

              <span
                className={cn(
                  "notranslate shrink-0 text-right font-heading text-base font-semibold",
                  selectable ? "text-slate-950" : "text-slate-400 line-through",
                )}
                translate="no"
              >
                {money(quote.total)}
              </span>
            </label>
          </div>
        );
      })}
          </div>
        </div>
      ))}
    </fieldset>
  );
}

function PriceHeadline({
  kind,
  selected,
  options,
}: {
  kind: GuestListingKind;
  selected: ResolvedFixedStayPeriod | null;
  options: ResolvedFixedStayPeriod[];
}) {
  if (kind === "fixed" && selected) {
    const quote = quoteForPeriod(selected, NIGHTLY_PRICING);
    return (
      <span className="flex items-baseline gap-1">
        <span className="text-2xl font-semibold text-slate-950">
          {money(quote.total)}
        </span>
        <span className="text-base font-normal text-slate-500">
          / {selected.nights} nights
        </span>
      </span>
    );
  }

  if (kind === "fixed") {
    const bookable = options.filter(isSelectable);
    const cheapest = bookable.length
      ? Math.min(
          ...bookable.map((period) => quoteForPeriod(period, NIGHTLY_PRICING).total),
        )
      : null;
    return (
      <span className="flex flex-col gap-0.5">
        <span className="flex items-baseline gap-1">
          <span className="text-base font-normal text-slate-500">
            {cheapest === null ? "No stays open" : "From"}
          </span>
          {cheapest === null ? null : (
            <span className="text-2xl font-semibold text-slate-950">
              {money(cheapest)}
            </span>
          )}
          {cheapest === null ? null : (
            <span className="text-base font-normal text-slate-500">per stay</span>
          )}
        </span>
        <span className="text-xs font-normal text-slate-500">
          Fixed stays only · {bookable.length} available
        </span>
      </span>
    );
  }

  return (
    <span className="flex items-baseline gap-1">
      <span className="text-2xl font-semibold text-slate-950">
        {money(NIGHTLY_PRICING.baseNightlyRate)}
      </span>
      <span className="text-base font-normal text-slate-500">/ night</span>
    </span>
  );
}

/**
 * Check-in and checkout are never typed here — choosing a stay fills them in.
 *
 * The lines are gross-plus-discount rather than net-plus-discount, because a receipt
 * that prints the discounted figures *and* a savings row subtracts the offer twice.
 */
function FixedSummary({ selected }: { selected: ResolvedFixedStayPeriod | null }) {
  if (!selected) {
    return (
      <p className="rounded-2xl bg-slate-50 px-4 py-7 text-center text-sm text-slate-500">
        Choose one of the stays to see your dates and total.
      </p>
    );
  }

  const quote = quoteForPeriod(selected, NIGHTLY_PRICING);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 overflow-hidden rounded-2xl bg-slate-50">
        <div className="px-4 py-3">
          <span className="block text-[0.68rem] font-semibold tracking-wide text-slate-500 uppercase">
            Check-in
          </span>
          <span className="mt-0.5 block text-sm text-slate-950">
            {dayMonthYear(selected.checkIn)}
          </span>
        </div>
        <div className="px-4 py-3">
          <span className="block text-[0.68rem] font-semibold tracking-wide text-slate-500 uppercase">
            Checkout
          </span>
          <span className="mt-0.5 block text-sm text-slate-950">
            {dayMonthYear(selected.checkOut)}
          </span>
        </div>
      </div>

      <dl className="space-y-2 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          {/* Deliberately not "€x × n nights": the average is a rounded display
              figure, and multiplying it back out misses the real subtotal by a cent
              on an uneven stay. The nights are the label; the quote is the amount. */}
          <dt className="text-slate-600">{selected.nights} nights</dt>
          <dd className="text-slate-950">
            {money(quote.originalAccommodationSubtotal)}
          </dd>
        </div>
        {quote.accommodationDiscount > 0 ? (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-slate-600">
              Offer
              {quote.appliedPromotion?.discountPercent
                ? ` (${quote.appliedPromotion.discountPercent}% off)`
                : ""}
            </dt>
            <dd className="text-slate-950">
              −{money(quote.accommodationDiscount)}
            </dd>
          </div>
        ) : null}
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-slate-600">Cleaning fee</dt>
          <dd className="text-slate-950">{money(quote.originalCleaningFee)}</dd>
        </div>
        {quote.cleaningDiscount > 0 ? (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-slate-600">Free cleaning</dt>
            <dd className="text-slate-950">−{money(quote.cleaningDiscount)}</dd>
          </div>
        ) : null}
      </dl>

      <Separator />

      <div className="flex items-baseline justify-between gap-3">
        <span className="font-heading text-base font-semibold text-slate-950">
          Total
        </span>
        <span className="font-heading text-base font-semibold text-slate-950">
          {money(quote.total)}
        </span>
      </div>
    </div>
  );
}

function FlexibleSummary({ range }: { range: DateRange | undefined }) {
  if (!range?.from || !range?.to) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
        Pick your own check-in and checkout on the calendar.
      </p>
    );
  }
  return (
    <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-950">
      {range.from.toLocaleDateString(LISTING.locale)} –{" "}
      {range.to.toLocaleDateString(LISTING.locale)}
    </p>
  );
}
