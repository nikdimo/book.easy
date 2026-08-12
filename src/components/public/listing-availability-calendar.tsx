"use client";

import * as React from "react";
import type { DateRange } from "react-day-picker";
import { DateRangeCalendarStep } from "@/components/marketplace/marketplace-stay-date-picker";
import { dateKey, parseLocalYmd } from "@/lib/utils/stay-pricing";
import { interpolate, useI18n } from "@/lib/i18n/client";
import type { Resolved } from "@/lib/i18n/t";
import { useListingStayRange } from "./listing-stay-context";

interface ListingAvailabilityCalendarProps {
  /** City the listing is in — the heading names it, the way a search result would. */
  placeName: string;
  minNights: number;
  disabledDateRanges: { from: Date; to: Date }[];
}

/**
 * The availability calendar that sits in the page itself, below the amenities.
 * A guest who arrived without dates can see which nights are open — and pick
 * them — without first opening the booking widget's picker; the selection is
 * shared, so whatever is chosen here is what the widget prices.
 */
export function ListingAvailabilityCalendar({
  placeName,
  minNights,
  disabledDateRanges,
}: ListingAvailabilityCalendarProps) {
  const i18n = useI18n();
  const [{ checkIn, checkOut }, setStayRange] = useListingStayRange({
    checkIn: "",
    checkOut: "",
  });

  const selected = React.useMemo<DateRange | undefined>(() => {
    if (!checkIn) return undefined;
    return {
      from: parseLocalYmd(checkIn),
      to: checkOut ? parseLocalYmd(checkOut) : undefined,
    };
  }, [checkIn, checkOut]);

  const nights =
    checkIn && checkOut
      ? Math.max(
          0,
          Math.round(
            (parseLocalYmd(checkOut).getTime() -
              parseLocalYmd(checkIn).getTime()) /
              86_400_000,
          ),
        )
      : 0;

  const dayFormatter = React.useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.locale, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    [i18n.locale],
  );

  const minimumStayMessage = i18n.plural(
    "booking.minimum_stay",
    minNights,
    "Minimum stay is {n} night",
    "Minimum stay is {n} nights",
  );

  const heading: Resolved =
    nights > 0
      ? interpolate(
          i18n.plural(
            "listing.calendar_nights_in",
            nights,
            "{n} night in {place}",
            "{n} nights in {place}",
          ),
          { place: placeName },
        )
      : checkIn
        ? i18n.resolve(
            "listing.calendar_select_checkout",
            "Select a check-out date",
          )
        : i18n.resolve(
            "listing.calendar_select_checkin",
            "Select a check-in date",
          );

  const subheading: Resolved =
    checkIn && checkOut
      ? {
          text: `${dayFormatter.format(parseLocalYmd(checkIn))} – ${dayFormatter.format(
            parseLocalYmd(checkOut),
          )}`,
          translated: true,
        }
      : i18n.resolve(
          "listing.calendar_add_dates",
          "Add your travel dates for exact pricing",
        );

  return (
    <section aria-labelledby="listing-availability-heading">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="listing-availability-heading"
            className={`text-xl font-semibold ${heading.translated ? "notranslate" : ""}`}
          >
            {heading.text}
          </h2>
          <p
            className={`mt-1 text-sm text-muted-foreground ${
              subheading.translated ? "notranslate" : ""
            }`}
          >
            {subheading.text}
          </p>
        </div>
        {checkIn ? (
          <button
            type="button"
            onClick={() => setStayRange({ checkIn: "", checkOut: "" })}
            className={`shrink-0 text-sm font-medium underline underline-offset-4 hover:text-foreground text-muted-foreground ${
              i18n.resolve("listing.calendar_clear_dates", "Clear dates")
                .translated
                ? "notranslate"
                : ""
            }`}
          >
            {i18n.resolve("listing.calendar_clear_dates", "Clear dates").text}
          </button>
        ) : null}
      </div>

      {/* The shared calendar surface ships with the dialog's own padding, which
          here would shrink the grid below the width that fits two months. */}
      <div className="[&>div]:!overflow-visible [&>div]:!px-0 [&>div]:!py-0">
        <DateRangeCalendarStep
          active
          selected={selected}
          onRangeChange={(range) =>
            setStayRange({
              checkIn: range?.from ? dateKey(range.from) : "",
              checkOut: range?.to ? dateKey(range.to) : "",
            })
          }
          disabledDateRanges={disabledDateRanges}
          minimumStayNights={minNights}
          minimumStayMessage={minimumStayMessage}
          fitViewport
          pagedOnDesktop
          pagedDesktopMonthCount={2}
        />
      </div>
    </section>
  );
}
