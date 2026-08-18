"use client";

import { ChevronRight, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { interpolate, useI18n } from "@/lib/i18n/client";
import type {
  PromotionBand,
  PromotionRow,
} from "@/lib/host/v2/calendar-promotion-action";
import { ConsequenceLine, Disclosure } from "./workbench-ui";

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
                      "all dates",
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
              "An offer applies to a whole stay, not to single nights. A guest books a stay and gets one discount on all of it.",
            ).text
          }
        </li>
        <li>
          {
            i18n.resolve(
              "host.v2.calendar.help.one_offer",
              "Offers never add up. A guest gets exactly one, even when several could apply.",
            ).text
          }
        </li>
        <li>
          {
            i18n.resolve(
              "host.v2.calendar.help.which_wins",
              "An offer on specific dates beats an all-dates one. After that the longer minimum stay wins, then the bigger discount.",
            ).text
          }
        </li>
        <li>
          {
            i18n.resolve(
              "host.v2.calendar.help.dated_fit",
              "An offer on specific dates only applies when the guest's whole stay fits inside those dates. A stay running one night past the end gets nothing from it.",
            ).text
          }
        </li>
        <li>
          {
            i18n.resolve(
              "host.v2.calendar.help.minimum_meaning",
              "The minimum stay here decides who earns the discount. It is not the shortest stay you accept — that is a listing setting.",
            ).text
          }
        </li>
        <li>
          {
            i18n.resolve(
              "host.v2.calendar.help.ladder",
              "Give each offer a different minimum stay to build a ladder: 10% from five nights, 20% from twenty. A guest gets the highest minimum they reach.",
            ).text
          }
        </li>
      </ul>
    </Disclosure>
  );
}
