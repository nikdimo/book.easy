"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { LocalizedPrice } from "@/components/shared/localized-price";
import { parseLocalYmd } from "@/lib/utils/stay-pricing";
import { Tx, useI18n } from "@/lib/i18n/client";
import {
  groupFixedStayOptionsByMonth,
  selectableFixedStayOptions,
  type GuestFixedStayOption,
} from "@/lib/fixed-stay-options";

/**
 * The host's whole stays, as one single-choice list.
 *
 * This is what replaces the free calendar on a fixed-stay listing, inside the same
 * booking overlay a guest already knows — the card, the sheet, the guest step and the
 * review are all unchanged around it. A guest picks one of these or books nothing;
 * there is no range to drag and no night to add or drop.
 *
 * Native radios, one group, `sr-only` inputs behind full-size labels: keyboard
 * navigation, screen-reader announcement and the disabled state all come from the
 * platform rather than from ARIA this file would have to keep correct. An unavailable
 * stay stays on screen and stays out of the tab order — it is the shape of the season,
 * and a list that closed up around taken dates would tell a guest the host has less to
 * offer than they do.
 *
 * It never says *why* a stay is unavailable. Whether the nights are held by another
 * guest's booking, by the host's own block or by an imported calendar is not the guest's
 * business, and the projection this renders does not carry it.
 */

export interface FixedStayOptionsProps {
  options: readonly GuestFixedStayOption[];
  /** The radio group's name — unique per mount, since the widget mounts twice. */
  name: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** The stay's total, from the listing's ordinary pricing. No fixed-stay price exists. */
  quoteTotal: (option: GuestFixedStayOption) => number;
  currency: string;
  className?: string;
}

export function FixedStayOptions({
  options,
  name,
  selectedId,
  onSelect,
  quoteTotal,
  currency,
  className,
}: FixedStayOptionsProps) {
  const i18n = useI18n();
  const dayFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.locale, {
        weekday: "short",
        day: "numeric",
        month: "short",
      }),
    [i18n.locale],
  );
  const monthFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.locale, {
        month: "long",
        year: "numeric",
      }),
    [i18n.locale],
  );

  const groups = useMemo(
    () => groupFixedStayOptionsByMonth(options),
    [options],
  );
  const openCount = selectableFixedStayOptions(options).length;
  const legend = i18n.resolve("booking.fixed_stay.legend", "Available stays");

  if (options.length === 0) {
    return (
      <div
        data-fixed-stay-options="empty"
        className={cn(
          "rounded-xl border border-border/60 bg-muted/20 px-4 py-6 text-center",
          className,
        )}
      >
        <p className="text-sm font-medium text-foreground">
          <Tx
            k="booking.fixed_stay.none_open_title"
            source="No stays are open right now"
          />
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          <Tx
            k="booking.fixed_stay.none_open_body"
            source="This host offers set arrival and departure dates, and none are available at the moment. Message the host to ask about other dates."
          />
        </p>
      </div>
    );
  }

  return (
    <div
      data-fixed-stay-options="list"
      className={cn("flex flex-col gap-4", className)}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-semibold text-foreground">
          {openCount > 0 ? (
            <Tx
              k="booking.fixed_stay.pick_heading"
              source="Choose one of the host's stays"
            />
          ) : (
            <Tx
              k="booking.fixed_stay.none_open_title"
              source="No stays are open right now"
            />
          )}
        </p>
        <p
          className="text-xs text-muted-foreground notranslate"
          translate="no"
        >
          {
            i18n.plural(
              "booking.fixed_stay.open_count",
              openCount,
              "{n} stay open",
              "{n} stays open",
            ).text
          }
        </p>
      </div>

      <fieldset className="min-w-0">
        <legend className={cn("sr-only", legend.translated && "notranslate")}>
          {legend.text}
        </legend>
        {groups.map((group) => (
          <div key={group.month} className="min-w-0">
            <p
              className="mt-3 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground first:mt-0 notranslate"
              translate="no"
            >
              {monthFormatter.format(parseLocalYmd(`${group.month}-01`))}
            </p>
            <div className="flex flex-col gap-2">
              {group.items.map((option) => {
                const id = `${name}-${option.id}`;
                const checked = selectedId === option.id;
                return (
                  <label
                    key={option.id}
                    htmlFor={id}
                    data-fixed-stay-option={option.id}
                    data-selectable={option.selectable ? "true" : "false"}
                    className={cn(
                      "flex min-w-0 items-start gap-3 rounded-xl border px-3 py-3 text-sm transition-colors",
                      "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1",
                      option.selectable
                        ? checked
                          ? "cursor-pointer border-primary bg-primary/5 ring-1 ring-primary"
                          : "cursor-pointer border-border hover:bg-muted/40"
                        : "cursor-not-allowed border-border/50 bg-muted/20 opacity-70",
                    )}
                  >
                    <input
                      id={id}
                      type="radio"
                      name={name}
                      value={option.id}
                      checked={checked}
                      disabled={!option.selectable}
                      onChange={() => onSelect(option.id)}
                      className="mt-0.5 size-4 shrink-0 accent-primary"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span
                          className={cn(
                            "notranslate font-medium",
                            option.selectable
                              ? "text-foreground"
                              : "text-muted-foreground",
                          )}
                          translate="no"
                        >
                          {dayFormatter.format(parseLocalYmd(option.checkIn))}
                          {" → "}
                          {dayFormatter.format(parseLocalYmd(option.checkOut))}
                        </span>
                        {option.selectable ? null : (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[0.6875rem] font-medium text-muted-foreground">
                            <Tx
                              k="booking.fixed_stay.unavailable"
                              source="Unavailable"
                            />
                          </span>
                        )}
                      </span>
                      <span className="mt-1 flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                        <span className="notranslate" translate="no">
                          {
                            i18n.plural(
                              "booking.nights",
                              option.nights,
                              "{n} night",
                              "{n} nights",
                            ).text
                          }
                        </span>
                        <span aria-hidden>·</span>
                        <span
                          className={cn(
                            "notranslate font-medium",
                            option.selectable
                              ? "text-foreground"
                              : "text-muted-foreground",
                          )}
                          translate="no"
                        >
                          <LocalizedPrice
                            exact
                            amount={quoteTotal(option)}
                            currency={currency}
                            locale={i18n.locale}
                          />
                        </span>
                        <span>
                          <Tx k="booking.fixed_stay.total" source="total" />
                        </span>
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </fieldset>
    </div>
  );
}
