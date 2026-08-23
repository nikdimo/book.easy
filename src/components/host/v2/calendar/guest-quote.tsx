"use client";

import { cn } from "@/lib/utils";
import { interpolate, useI18n } from "@/lib/i18n/client";
import { CALENDAR_ANCHOR, anchorProps } from "@/lib/host/v2/calendar-anchors";
import type { CalendarFormats } from "@/lib/host/v2/calendar-format";
import type { SelectionQuote } from "@/lib/host/v2/calendar-quote";
import {
  isSelectionStayBookable,
  type SelectionStayBookability,
} from "@/lib/host/v2/calendar-model";
import { moneyExact, stayBookabilityReason } from "./calendar-labels";

function Row({
  label,
  value,
  strong,
  muted,
  strike,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
  strike?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span
        className={cn(
          "text-[0.8125rem]",
          strong ? "font-semibold text-slate-900" : "text-slate-600",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "shrink-0 text-[0.8125rem] tabular-nums",
          strong ? "font-bold text-slate-900" : "text-slate-700",
          muted && "text-slate-400",
          strike && "line-through decoration-slate-300",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * What a guest booking exactly these dates would pay.
 *
 * Every figure comes from the canonical stay quote, and nothing is added to it: there
 * is no platform fee or host payout in this product, so inventing either here would be
 * telling the host a number that does not exist.
 */
export function GuestQuotePanel({
  quote,
  currency,
  formats,
  nights,
  stay,
}: {
  quote: SelectionQuote;
  currency: string;
  formats: CalendarFormats;
  nights: number;
  stay: SelectionStayBookability;
}) {
  const i18n = useI18n();
  // The breakdown is the receipt: every line to the cent, however the summary above
  // rounded it for scanning.
  const format = (amount: number) => moneyExact(amount, currency, formats);
  const discounted = quote.discountAmount > 0;
  // The arithmetic is the same either way — the canonical quote engine. What changes
  // is the claim being made about it: a real guest total, or a worked example for a
  // stay no guest can actually book.
  const bookable = isSelectionStayBookable(stay);
  const reason = stayBookabilityReason(i18n, stay);

  return (
    <section
      {...anchorProps(CALENDAR_ANCHOR.guestQuote)}
      className="rounded-xl border border-slate-200 bg-white p-3"
    >
      <h4 className="text-[0.6875rem] font-bold uppercase tracking-wider text-slate-400">
        {bookable
          ? i18n.resolve(
              "host.v2.calendar.quote.title",
              "What a guest would pay",
            ).text
          : i18n.resolve(
              "host.v2.calendar.quote.title_example",
              "Example price · these dates cannot be booked",
            ).text}
      </h4>

      <div className="mt-1.5 divide-y divide-slate-100">
        <Row
          label={
            interpolate(
              i18n.plural(
                "host.v2.calendar.quote.accommodation",
                nights,
                "Accommodation, {n} night",
                "Accommodation, {n} nights",
              ),
              {},
            ).text
          }
          value={format(quote.originalAccommodationSubtotal)}
          muted={discounted}
          strike={quote.accommodationDiscount > 0}
        />
        {quote.accommodationDiscount > 0 ? (
          <Row
            label={
              i18n.resolve(
                "host.v2.calendar.quote.accommodation_after",
                "Accommodation after discount",
              ).text
            }
            value={format(quote.accommodationSubtotal)}
          />
        ) : null}
        {quote.originalCleaningFee > 0 ? (
          <Row
            label={
              quote.cleaningDiscount > 0
                ? i18n.resolve(
                    "host.v2.calendar.quote.cleaning_waived",
                    "Cleaning fee (waived)",
                  ).text
                : i18n.resolve("host.v2.calendar.quote.cleaning", "Cleaning fee")
                    .text
            }
            value={format(
              quote.cleaningDiscount > 0 ? 0 : quote.originalCleaningFee,
            )}
          />
        ) : null}
        <Row
          label={i18n.resolve("host.v2.calendar.quote.total", "Guest total").text}
          value={format(quote.total)}
          strong
        />
        {discounted ? (
          <Row
            label={
              i18n.resolve("host.v2.calendar.quote.savings", "Guest saves").text
            }
            value={format(quote.discountAmount)}
          />
        ) : null}
        <Row
          label={
            i18n.resolve(
              "host.v2.calendar.quote.average",
              "Average per night (after discount)",
            ).text
          }
          value={format(quote.effectiveAverageNightly)}
        />
      </div>

      {reason ? (
        <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-[0.75rem] leading-4 text-amber-900">
          {`${reason.text} ${
            i18n.resolve(
              "host.v2.calendar.quote.example_note",
              "The figures above are an example only.",
            ).text
          }`}
        </p>
      ) : null}
    </section>
  );
}
