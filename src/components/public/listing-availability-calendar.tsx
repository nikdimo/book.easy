"use client";

import * as React from "react";
import type { DateRange } from "react-day-picker";
import { DateRangeCalendarStep } from "@/components/marketplace/marketplace-stay-date-picker";
import {
  dateKey,
  parseLocalYmd,
  type StayPromotion,
} from "@/lib/utils/stay-pricing";
import {
  useCellCurrencyNote,
  useListingDayPrices,
} from "./use-listing-day-prices";
import {
  listablePromotions,
  resolvePromotionLabel,
} from "./promotion-label";
import { Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LocalizedPrice } from "@/components/shared/localized-price";
import { interpolate, useI18n } from "@/lib/i18n/client";
import type { Resolved } from "@/lib/i18n/t";
import {
  useListingBooking,
  useListingStayRange,
} from "./listing-stay-context";

interface ListingAvailabilityCalendarProps {
  /** City the listing is in — the heading names it, the way a search result would. */
  placeName: string;
  minNights: number;
  /** Blocked runs as calendar dates — see `BlockedDateRange`. */
  disabledDateRanges: { from: string; to: string }[];
  /** Nightly pricing, so each open day can show what it costs. */
  baseNightlyRate: number;
  currency: string;
  priceOverrides: { date: string; rate: number }[];
  promotions?: StayPromotion[];
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
  baseNightlyRate,
  currency,
  priceOverrides,
  promotions,
}: ListingAvailabilityCalendarProps) {
  const i18n = useI18n();
  const dayPrice = useListingDayPrices({
    baseNightlyRate,
    currency,
    priceOverrides,
    promotions,
    boundedPromotionsOnly: true,
    showCurrencySymbol: true,
  });
  const priceNote = useCellCurrencyNote(currency);
  // The calendar compares against the days it renders, so the blocked runs become this
  // browser's own midnights here rather than staying the server's instants.
  const disabledDayRanges = React.useMemo(
    () =>
      disabledDateRanges.map((range) => ({
        from: parseLocalYmd(range.from),
        to: parseLocalYmd(range.to),
      })),
    [disabledDateRanges],
  );
  const [{ checkIn, checkOut }, setStayRange] = useListingStayRange({
    checkIn: "",
    checkOut: "",
  });
  // The booking widget's own primary action, lent to this section. On desktop the
  // widget is a sticky card in a column that has already ended by the time this
  // calendar scrolls into view, so the dates picked here would otherwise have
  // nothing to press.
  const { booking, startBooking } = useListingBooking();

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
      new Intl.DateTimeFormat(i18n.requestedLocale, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    [i18n.requestedLocale],
  );

  /** An offer window is read at a glance next to its label, so it drops the year the
   * stay dates above spell out. */
  const windowFormatter = React.useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.requestedLocale, {
        month: "short",
        day: "numeric",
      }),
    [i18n.requestedLocale],
  );

  const minimumStayMessage = i18n.plural(
    "booking.minimum_stay",
    minNights,
    "Minimum stay is {n} night",
    "Minimum stay is {n} nights",
  );

  const offers = React.useMemo(
    () => listablePromotions(promotions ?? []),
    [promotions],
  );
  const offersHeading = i18n.plural(
    "promotion.special_offers",
    offers.length,
    "Special offer",
    "Special offers",
  );
  /** Dated offers state their window, or the chip promises something the calendar
   * refuses in every other month. */
  const offerWindow = (promotion: StayPromotion) => {
    if (!promotion.startDate || !promotion.endDate) return null;
    const start = new Date(promotion.startDate);
    const end = new Date(promotion.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return null;
    }
    return `${windowFormatter.format(start)} – ${windowFormatter.format(end)}`;
  };

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

  /** The same two strings the widget prints over its own total, from the same keys. */
  const stayLabel = i18n.plural(
    "booking.nights",
    booking?.nights ?? 0,
    "{n} night",
    "{n} nights",
  );
  const totalLabel = i18n.resolve("booking.total", "Total");

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
          here would shrink the grid below the width the roomy cells need. */}
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
          disabledDateRanges={disabledDayRanges}
          dayMeta={dayPrice}
          priceNote={priceNote}
          minimumStayNights={minNights}
          minimumStayMessage={minimumStayMessage}
          fitViewport
          pagedOnDesktop
          // The listing page gives this calendar the full content width. That keeps
          // two months scannable while leaving each bordered day card roughly square.
          pagedDesktopMonthCount={2}
          dayVariant="listing"
        />
      </div>

      {/* Length-of-stay offers are conditions on the calendar above, not prices —
          they are listed here rather than painted on the cells, where they would
          quote a discount most selections never qualify for. */}
      {offers.length > 0 && (
        <div className="mt-4 rounded-xl border border-border/70 bg-muted/20 px-4 py-3">
          <h3
            className={`text-sm font-semibold ${
              offersHeading.translated ? "notranslate" : ""
            }`}
          >
            {offersHeading.text}
          </h3>
          <ul className="mt-2 space-y-1.5">
            {offers.map((offer) => {
              const label = resolvePromotionLabel(i18n, offer);
              const window = offerWindow(offer);
              return (
                <li
                  key={offer.id ?? label.text}
                  className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm"
                >
                  <Tag
                    className="size-4 shrink-0 self-center text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span
                    className={label.translated ? "notranslate" : undefined}
                  >
                    {label.text}
                  </span>
                  {window ? (
                    <span className="notranslate text-xs text-muted-foreground">
                      {window}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Desktop only. Below `lg` the widget is a sticky bar already on screen, and
          a second button saying the same thing would be the louder of two. */}
      {booking && booking.nights > 0 ? (
        <div className="mt-6 hidden flex-wrap items-center justify-between gap-4 rounded-xl border border-border/70 bg-muted/20 px-4 py-3 lg:flex">
          <div className="min-w-0">
            <p className="text-sm font-medium">
              <span
                className={stayLabel.translated ? "notranslate" : undefined}
              >
                {stayLabel.text}
              </span>{" "}
              <span
                className={`text-muted-foreground ${
                  totalLabel.translated ? "notranslate" : ""
                }`}
              >
                {totalLabel.text}
              </span>
            </p>
            <LocalizedPrice
              exact
              amount={booking.total}
              currency={booking.currency}
              locale={i18n.locale}
              className="text-lg font-semibold"
            />
          </div>
          <Button
            onClick={startBooking}
            disabled={booking.busy}
            size="lg"
            className={`rounded-lg font-semibold ${
              booking.labelTranslated ? "notranslate" : ""
            }`}
          >
            {booking.label}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
