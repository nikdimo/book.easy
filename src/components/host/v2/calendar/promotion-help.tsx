"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { interpolate, useI18n } from "@/lib/i18n/client";
import type {
  PromotionBand,
  PromotionRow,
} from "@/lib/host/v2/calendar-promotion-action";
import type { SelectionPromotionSummary } from "@/lib/host/v2/calendar-quote";
import type { HostCalendarPromotion } from "@/lib/host/v2/calendar-types";
import {
  formatShortDate,
  type CalendarFormats,
} from "@/lib/host/v2/calendar-format";
import { addDaysToYmd, compareYmd } from "@/lib/utils/date-only";
import { ConsequenceLine, Disclosure } from "./workbench-ui";

/** Compact by default so reviewing existing offers never crowds out creation. */
export function SelectedPromotionsDisclosure({
  summaries,
  selectedNights,
  formats,
  defaultOpen = false,
  highlightedPromotionId = null,
  onSelect,
}: {
  summaries: SelectionPromotionSummary[];
  selectedNights: number;
  formats: CalendarFormats;
  defaultOpen?: boolean;
  highlightedPromotionId?: string | null;
  onSelect?: (promotion: HostCalendarPromotion) => void;
}) {
  const i18n = useI18n();
  const [open, setOpen] = useState(defaultOpen);
  if (summaries.length === 0) return null;

  const count = summaries.length;
  return (
    <section className="rounded-xl bg-slate-50 px-3 py-2.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-8 w-full items-center justify-between gap-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#a94b28]"
      >
        <span className="text-[0.8125rem] font-semibold text-slate-900">
          {
            interpolate(
              i18n.plural(
                "host.v2.calendar.editor.existing_promotions_count",
                count,
                "{n} promotion overlaps the selected dates",
                "{n} promotions overlap the selected dates",
              ),
              {},
            ).text
          }
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[0.75rem] font-semibold text-[#a94b28]">
          {open
            ? i18n.resolve("host.v2.calendar.editor.hide_promotions", "Hide").text
            : i18n.resolve("host.v2.calendar.editor.see_all_promotions", "See all")
                .text}
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform duration-150 motion-reduce:transition-none",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </span>
      </button>

      {open ? (
        <ul className="mt-2 flex flex-col gap-1 border-t border-slate-200 pt-2">
          {summaries.map(({ promotion, coveredNights, winningNights }) => {
            const minimum = promotion.minimumNights ?? 1;
            const ongoing = !promotion.startDate && !promotion.endDate;
            const dateLabel = ongoing
              ? i18n.resolve(
                  "host.v2.calendar.editor.scope_all_dates",
                  "All dates",
                ).text
              : `${formatShortDate(promotion.startDate!, formats)} – ${formatShortDate(
                  addDaysToYmd(promotion.endDate!, -1),
                  formats,
                )}`;
            const status =
              winningNights > 0
                ? interpolate(
                    i18n.plural(
                      "host.v2.calendar.editor.promotion_wins_nights",
                      winningNights,
                      "Best on {n} night",
                      "Best on {n} nights",
                    ),
                    {},
                  ).text
                : minimum > selectedNights
                  ? i18n.resolve(
                      "host.v2.calendar.editor.promotion_not_eligible",
                      "Not eligible",
                    ).text
                  : i18n.resolve(
                      "host.v2.calendar.editor.promotion_overlapped",
                      "Another promotion saves more",
                    ).text;
            return (
              <li
                key={promotion.id}
                className={cn(
                  "rounded-lg text-[0.8125rem]",
                  winningNights > 0 || promotion.id === highlightedPromotionId
                    ? "bg-[#fff1e8]"
                    : "bg-white",
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect?.(promotion)}
                  disabled={!onSelect}
                  className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-slate-50 disabled:cursor-default disabled:hover:bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#a94b28]"
                >
                  <span className="min-w-0">
                  <span className="block font-semibold text-slate-900">
                    {promotion.discountPercent > 0
                      ? `${promotion.discountPercent}% off`
                      : i18n.resolve(
                          "host.v2.calendar.value.promotion_cleaning",
                          "Free cleaning",
                        ).text}
                  </span>
                  <span className="mt-0.5 block text-[0.6875rem] text-slate-500">
                    {dateLabel}
                    {minimum > 1
                      ? ` · ${interpolate(
                          i18n.resolve(
                            "host.v2.calendar.editor.minimum_nights_term",
                            "{n}-night minimum",
                          ),
                          { n: minimum },
                        ).text}`
                      : ""}
                    {coveredNights < selectedNights
                      ? ` · ${interpolate(
                          i18n.resolve(
                            "host.v2.calendar.editor.selected_nights_covered",
                            "Covers {covered} of {selected} nights",
                          ),
                          { covered: coveredNights, selected: selectedNights },
                        ).text}`
                      : ""}
                  </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-[0.6875rem] font-semibold",
                      winningNights > 0 || promotion.id === highlightedPromotionId
                        ? "text-[#a94b28]"
                        : "text-slate-500",
                    )}
                  >
                    {promotion.id === highlightedPromotionId
                      ? i18n.resolve(
                          "host.v2.calendar.editor.new_promotion",
                          "New promotion",
                        ).text
                      : status}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

/** All enabled current and future promotions when the host has selected no dates. */
export function AllPromotionsOverview({
  promotions,
  today,
  formats,
  onSelect,
}: {
  promotions: HostCalendarPromotion[];
  today: string;
  formats: CalendarFormats;
  onSelect: (promotion: HostCalendarPromotion) => void;
}) {
  const i18n = useI18n();
  const visible = promotions
    .filter(
      (promotion) =>
        !promotion.endDate || compareYmd(promotion.endDate, today) > 0,
    )
    .sort((left, right) => {
      const leftStart = left.startDate ?? "";
      const rightStart = right.startDate ?? "";
      return leftStart.localeCompare(rightStart) || left.id.localeCompare(right.id);
    });

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[0.9375rem] font-semibold text-slate-900">
        {
          interpolate(
            i18n.plural(
              "host.v2.calendar.listing.all_promotions_count",
              visible.length,
              "{n} active or upcoming promotion",
              "{n} active or upcoming promotions",
            ),
            {},
          ).text
        }
      </h3>
      {visible.length === 0 ? (
        <ConsequenceLine>
          {
            i18n.resolve(
              "host.v2.calendar.listing.no_active_promotions",
              "No active or upcoming promotions",
            ).text
          }
        </ConsequenceLine>
      ) : (
        <ul className="flex flex-col gap-1">
          {visible.map((promotion) => {
            const ongoing = !promotion.startDate && !promotion.endDate;
            const dateLabel = ongoing
              ? i18n.resolve(
                  "host.v2.calendar.editor.scope_all_dates",
                  "All dates",
                ).text
              : `${formatShortDate(promotion.startDate!, formats)} – ${formatShortDate(
                  addDaysToYmd(promotion.endDate!, -1),
                  formats,
                )}`;
            const minimum = promotion.minimumNights ?? 1;
            return (
              <li key={promotion.id}>
                <button
                  type="button"
                  onClick={() => onSelect(promotion)}
                  className="grid min-h-11 w-full grid-cols-[5rem_minmax(0,1fr)_5.5rem_1rem] items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2 text-left text-[0.8125rem] transition-colors duration-150 hover:bg-slate-100 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#a94b28]"
                >
                  <span className="truncate font-semibold tabular-nums text-slate-900">
                    {promotion.discountPercent > 0
                      ? `${promotion.discountPercent}% off`
                      : i18n.resolve(
                          "host.v2.calendar.value.promotion_cleaning",
                          "Free cleaning",
                        ).text}
                  </span>
                  <span className="min-w-0 truncate text-slate-600">
                    {dateLabel}
                  </span>
                  <span className="truncate text-left tabular-nums text-slate-600">
                    {minimum > 1
                      ? `${minimum}+ nights`
                      : i18n.resolve(
                          "host.v2.calendar.promotion_every_stay",
                          "every stay",
                        ).text}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-slate-300" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * What both promotion screens have to say, said once.
 *
 * Offers stack, and exactly one of them reaches any given guest. Which one is decided by
 * rules no host can see, so the list states the outcome — the stay lengths each offer
 * wins — rather than the inputs the host typed. Both are computed from the same function
 * the booking transaction prices with, so neither screen can drift from what is charged.
 */

/** How long a stay has to be for this offer to win. */
export function bandLabel(
  i18n: ReturnType<typeof useI18n>,
  band: PromotionBand,
): string {
  if (band.openEnded) {
    return interpolate(
      i18n.resolve("host.v2.calendar.editor.band_open", "{from}+ nights"),
      { from: band.fromNights },
    ).text;
  }
  if (band.fromNights === band.toNights) {
    return interpolate(
      i18n.plural(
        "host.v2.calendar.editor.band_one",
        band.fromNights,
        "{n} night",
        "{n} nights",
      ),
      {},
    ).text;
  }
  return interpolate(
    i18n.resolve("host.v2.calendar.editor.band_range", "{from}–{to} nights"),
    { from: band.fromNights, to: band.toNights },
  ).text;
}

/**
 * The offers in force, one row each, with the stay lengths they actually win.
 *
 * A row names an outcome rather than a setting: "10% off · 5–19 nights", not "10% off ·
 * 5 nights or more". The second is what the host typed and the first is what a guest
 * gets, and when a longer-minimum offer sits above it those are different sentences.
 */
export function PromotionBandList({
  rows,
  onSelect,
  showScope,
}: {
  rows: PromotionRow[];
  /** Given when a row opens that offer for editing. Omit for a read-only list. */
  onSelect?: (promotionId: string) => void;
  /** Label each row "all dates" or "these dates". Off where every row is the same. */
  showScope?: boolean;
}) {
  const i18n = useI18n();
  if (rows.length === 0) {
    return (
      <ConsequenceLine>
        {
          i18n.resolve(
            "host.v2.calendar.section.promotion_none",
            "No promotion on these dates",
          ).text
        }
      </ConsequenceLine>
    );
  }

  return (
    <ul className="flex flex-col gap-1">
      {rows.map((row) => {
        const selectable = Boolean(onSelect) && !row.draft;
        const body = (
          <>
            <span
              className={cn(
                "min-w-14 shrink-0 font-semibold tabular-nums",
                row.draft ? "text-[#8f3d21]" : "text-slate-900",
              )}
            >
              {
                interpolate(
                  i18n.resolve(
                    "host.v2.calendar.editor.percent_off",
                    "{percent}% off",
                  ),
                  { percent: row.discountPercent },
                ).text
              }
            </span>
            {/* What this offer actually does. An offer another one beats everywhere
                says so rather than showing a stay length it never reaches, and one
                whose minimum is past the horizon reports its own minimum instead of
                a range nobody measured. */}
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-left",
                row.bands.length === 0 && !row.beyondHorizon
                  ? "text-amber-700"
                  : "text-slate-600",
              )}
            >
              {row.bands.length > 0
                ? row.bands.map((band) => bandLabel(i18n, band)).join(", ")
                : row.beyondHorizon
                  ? interpolate(
                      i18n.resolve(
                        "host.v2.calendar.editor.band_from",
                        "{from}+ nights",
                      ),
                      { from: row.minimumNights },
                    ).text
                  : i18n.resolve(
                      "host.v2.calendar.editor.band_never",
                      "never applies",
                    ).text}
            </span>
            {showScope ? (
              <span
                className={cn(
                  "shrink-0 text-[0.6875rem]",
                  row.draft ? "text-[#8f3d21]" : "text-slate-400",
                )}
              >
                {row.evergreen
                  ? i18n.resolve(
                      "host.v2.calendar.editor.scope_all_dates",
                      "All dates",
                    ).text
                  : i18n.resolve(
                      "host.v2.calendar.editor.scope_these_dates",
                      "these dates",
                    ).text}
              </span>
            ) : null}
            {row.draft ? (
              <Pencil className="size-3.5 shrink-0 text-[#8f3d21]" aria-hidden />
            ) : selectable ? (
              <ChevronRight className="size-4 shrink-0 text-slate-300" aria-hidden />
            ) : null}
          </>
        );
        const className = cn(
          "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[0.8125rem]",
          row.draft ? "bg-[#fff1e8]" : "bg-slate-50",
          selectable &&
            "min-h-11 transition-colors duration-150 hover:bg-slate-100 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#a94b28]",
        );

        return (
          <li key={row.promotionId}>
            {selectable ? (
              <button
                type="button"
                onClick={() => onSelect?.(row.promotionId)}
                className={className}
              >
                {body}
              </button>
            ) : (
              <span className={className}>{body}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The rules, written down.
 *
 * Every fact here is about the booking engine rather than about this screen, and each is
 * one a host discovers the hard way otherwise — most of all the first, which is the
 * difference between a price and a discount and the source of nearly every wrong guess
 * about what these screens do.
 */
export function HowOffersWork() {
  const i18n = useI18n();
  return (
    <Disclosure
      label={
        i18n.resolve(
          "host.v2.calendar.editor.how_offers_work",
          "How offers work",
        ).text
      }
    >
      <ul className="flex list-disc flex-col gap-1.5 pl-4 pt-1">
        <li>
          {
            i18n.resolve(
              "host.v2.calendar.help.per_stay",
              "Promotions apply night by night. Different nights in one booking can use different promotions.",
            ).text
          }
        </li>
        <li>
          {
            i18n.resolve(
              "host.v2.calendar.help.one_offer",
              "Promotions never add together on one night. The promotion that saves the guest the most wins that night.",
            ).text
          }
        </li>
        <li>
          {
            i18n.resolve(
              "host.v2.calendar.help.which_wins",
              "A date-specific promotion does not automatically beat an all-dates promotion. The better eligible saving wins.",
            ).text
          }
        </li>
        <li>
          {
            i18n.resolve(
              "host.v2.calendar.help.dated_fit",
              "A date-specific promotion discounts only the nights inside its date range. Nights outside it use their own best promotion or the normal price.",
            ).text
          }
        </li>
        <li>
          {
            i18n.resolve(
              "host.v2.calendar.help.minimum_meaning",
              "The promotion minimum checks the guest's whole booking length. It is separate from the listing's normal minimum stay.",
            ).text
          }
        </li>
        <li>
          {
            i18n.resolve(
              "host.v2.calendar.help.ladder",
              "You can overlap promotions or use the same minimum stay. On each night, the promotion producing the biggest saving wins.",
            ).text
          }
        </li>
      </ul>
    </Disclosure>
  );
}
