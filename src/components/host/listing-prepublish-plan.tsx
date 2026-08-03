"use client";

import * as React from "react";
import type { DateRange } from "react-day-picker";
import {
  CalendarDays,
  Check,
  ChevronRight,
  Percent,
  Plus,
  Sparkles,
  Tags,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateRangeCalendarStep } from "@/components/marketplace/marketplace-stay-date-picker";
import { Tx, interpolate, useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import {
  MAX_OFFER_PERCENT,
  MIN_OFFER_PERCENT,
  planDateFromLocal,
  rangeNights,
  type PrePublishPlan,
} from "@/lib/types/listing-prepublish-plan";

export type PrePublishTask = "availability" | "pricing" | "offers";

/** Which screen of the pre-publish flow is showing. `menu` is the checklist the three
 *  tasks return to — see the note on returning rather than publishing directly. */
export type PrePublishScreen = "menu" | PrePublishTask;

export function prePublishTaskCount(
  plan: PrePublishPlan,
  task: PrePublishTask,
) {
  if (task === "availability") return plan.blocks.length;
  if (task === "pricing") return plan.datePrices.length;
  return plan.offers.length;
}

function formatRange(startDate: string, endDate: string, locale: string) {
  const format = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };
  return startDate === endDate
    ? format(startDate)
    : `${format(startDate)} – ${format(endDate)}`;
}

/**
 * The checklist the host lands on after the last numbered step. Deliberately not a
 * step: it is optional work, and numbering it would make the wizard longer for every
 * host including the ones who skip it.
 *
 * Publishing stays in the wizard footer as the primary action throughout — the moment
 * this screen feels like a gate rather than an offer, it costs listings.
 */
export function PrePublishMenu({
  plan,
  onOpenTask,
}: {
  plan: PrePublishPlan;
  onOpenTask: (task: PrePublishTask) => void;
}) {
  const i18n = useI18n();

  const tasks: {
    task: PrePublishTask;
    icon: LucideIcon;
    title: string;
    example: string;
    done: (count: number) => string;
  }[] = [
    {
      task: "availability",
      icon: CalendarDays,
      title: i18n.resolve(
        "host.prepublish.availability_title",
        "Set availability",
      ).text,
      example: i18n.resolve(
        "host.prepublish.availability_example",
        "For example: block the weeks you'll be using the property yourself, so nobody can book them.",
      ).text,
      done: (count: number) =>
        interpolate(
          i18n.resolve("host.prepublish.availability_done", "{count} blocked"),
          { count },
        ).text,
    },
    {
      task: "pricing",
      icon: Tags,
      title: i18n.resolve("host.prepublish.pricing_title", "Customize pricing")
        .text,
      example: i18n.resolve(
        "host.prepublish.pricing_example",
        "For example: charge more over a holiday weekend, or less in the quiet months.",
      ).text,
      done: (count: number) =>
        interpolate(
          i18n.resolve("host.prepublish.pricing_done", "{count} set"),
          { count },
        ).text,
    },
    {
      task: "offers",
      icon: Percent,
      title: i18n.resolve(
        "host.prepublish.offers_title",
        "Customize promotions",
      ).text,
      example: i18n.resolve(
        "host.prepublish.offers_example",
        "For example: a discount or free cleaning on specific dates you want to fill.",
      ).text,
      done: (count: number) =>
        interpolate(
          i18n.resolve("host.prepublish.offers_done", "{count} added"),
          { count },
        ).text,
    },
  ];

  return (
    <div className="space-y-3 md:space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight md:text-2xl">
          <Tx
            k="host.prepublish.heading"
            source="Anything to set up before you publish?"
          />
        </h2>
        <p className="mt-1 text-xs text-muted-foreground md:text-sm">
          <Tx
            k="host.prepublish.subheading"
            source="All optional — you can publish now and change any of this later from your listing calendar."
          />
        </p>
      </div>

      <div className="space-y-2.5">
        {tasks.map(({ task, icon: Icon, title, example, done }) => {
          const count = prePublishTaskCount(plan, task);
          return (
            <button
              key={task}
              type="button"
              onClick={() => onOpenTask(task)}
              className={cn(
                "group flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all md:gap-4 md:p-4",
                count > 0
                  ? "border-primary/40 bg-primary/[0.04]"
                  : "border-border/70 bg-card hover:border-primary/40 hover:bg-muted/30 hover:shadow-sm",
              )}
            >
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors md:size-10",
                  count > 0
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary",
                )}
              >
                {count > 0 ? (
                  <Check
                    className="size-5"
                    strokeWidth={3}
                    aria-hidden="true"
                  />
                ) : (
                  <Icon className="size-5" aria-hidden="true" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold md:text-base">
                    {title}
                  </span>
                  {count > 0 && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[0.7rem] font-medium text-primary">
                      {done(count)}
                    </span>
                  )}
                </span>
                <span className="mt-1 block text-xs leading-snug text-muted-foreground md:text-sm">
                  {example}
                </span>
              </span>
              <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Shared shell for the three task screens: a range picker, whatever that task needs
 *  alongside it, and the list of what the host has added so far. */
function TaskScreen({
  title,
  hint,
  range,
  onRangeChange,
  controls,
  addLabel,
  addDisabled,
  onAdd,
  entries,
  onRemove,
  emptyLabel,
}: {
  title: string;
  hint: string;
  range: DateRange | undefined;
  onRangeChange: (range: DateRange | undefined) => void;
  controls?: React.ReactNode;
  addLabel: string;
  addDisabled: boolean;
  onAdd: () => void;
  entries: { key: string; primary: string; secondary: string }[];
  onRemove: (index: number) => void;
  emptyLabel: string;
}) {
  const i18n = useI18n();

  return (
    <div className="space-y-3 md:space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight md:text-2xl">
          {title}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground md:text-sm">{hint}</p>
      </div>

      <div className="overflow-hidden rounded-xl border">
        <DateRangeCalendarStep
          active
          selected={range}
          onRangeChange={onRangeChange}
          dayVariant="availability"
          dragToSelect
        />
      </div>

      {controls}

      <Button
        type="button"
        variant="secondary"
        className="w-full"
        disabled={addDisabled}
        onClick={onAdd}
      >
        <Plus className="size-4" />
        {addLabel}
      </Button>

      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground md:text-sm">{emptyLabel}</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry, index) => (
            <li
              key={entry.key}
              className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {entry.primary}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {entry.secondary}
                </span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={
                  i18n.resolve("host.prepublish.remove", "Remove").text
                }
                onClick={() => onRemove(index)}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Mounted with a `key` of the task it shows, so switching tasks resets the selection
 *  and inputs below rather than carrying over dates from the last thing added. */
export function PrePublishTaskScreen({
  task,
  plan,
  onChange,
  currency,
  baseNightlyRate,
  hasCleaningFee,
}: {
  task: PrePublishTask;
  plan: PrePublishPlan;
  onChange: (plan: PrePublishPlan) => void;
  currency: string;
  baseNightlyRate: string;
  /** Free cleaning is not offerable when there's no cleaning fee to waive — the same
   *  rule the launch offer on the previous step follows. */
  hasCleaningFee: boolean;
}) {
  const i18n = useI18n();
  const { locale } = i18n;
  const [range, setRange] = React.useState<DateRange | undefined>();
  const [nightlyRate, setNightlyRate] = React.useState("");
  const [offerType, setOfferType] = React.useState<
    "PERCENT_DISCOUNT" | "FREE_CLEANING"
  >("PERCENT_DISCOUNT");
  const [discountPercent, setDiscountPercent] = React.useState("15");

  const selection = range?.from
    ? {
        startDate: planDateFromLocal(range.from),
        endDate: planDateFromLocal(range.to ?? range.from),
      }
    : null;

  const rateNumber = Number(nightlyRate);
  const percentNumber = Number(discountPercent);

  function commit(next: Partial<PrePublishPlan>) {
    onChange({ ...plan, ...next });
    setRange(undefined);
  }

  const nightsLabel = (startDate: string, endDate: string) => {
    const nights = rangeNights(startDate, endDate);
    return interpolate(
      i18n.resolve("host.prepublish.nights_count", "{count} nights"),
      {
        count: nights,
      },
    ).text;
  };

  if (task === "availability") {
    return (
      <TaskScreen
        title={
          i18n.resolve("host.prepublish.availability_title", "Set availability")
            .text
        }
        hint={
          i18n.resolve(
            "host.prepublish.availability_hint",
            "Pick the dates you want to keep for yourself. Guests won't be able to book them.",
          ).text
        }
        range={range}
        onRangeChange={setRange}
        addLabel={
          i18n.resolve("host.prepublish.block_dates", "Block these dates").text
        }
        addDisabled={!selection}
        onAdd={() => {
          if (!selection) return;
          commit({ blocks: [...plan.blocks, selection] });
        }}
        entries={plan.blocks.map((block, index) => ({
          key: `${block.startDate}-${block.endDate}-${index}`,
          primary: formatRange(block.startDate, block.endDate, locale),
          secondary: nightsLabel(block.startDate, block.endDate),
        }))}
        onRemove={(index) =>
          onChange({
            ...plan,
            blocks: plan.blocks.filter((_, i) => i !== index),
          })
        }
        emptyLabel={
          i18n.resolve(
            "host.prepublish.availability_empty",
            "No blocked dates yet. Your listing will be bookable on every date.",
          ).text
        }
      />
    );
  }

  if (task === "pricing") {
    const rateValid = Number.isFinite(rateNumber) && rateNumber > 0;
    return (
      <TaskScreen
        title={
          i18n.resolve("host.prepublish.pricing_title", "Customize pricing")
            .text
        }
        hint={
          i18n.resolve(
            "host.prepublish.pricing_hint",
            "Pick the dates, then set what a night costs then. Every other date keeps your normal price.",
          ).text
        }
        range={range}
        onRangeChange={setRange}
        controls={
          <div className="space-y-1.5">
            <Label htmlFor="prepublish-nightly-rate">
              <Tx
                k="host.prepublish.rate_label"
                source="Price per night for these dates"
              />
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="prepublish-nightly-rate"
                type="number"
                min={1}
                step="0.01"
                inputMode="decimal"
                value={nightlyRate}
                placeholder={baseNightlyRate}
                onChange={(event) => setNightlyRate(event.target.value)}
                className="text-right font-semibold tabular-nums"
              />
              <span className="w-24 shrink-0 text-xs text-muted-foreground">
                {currency}
              </span>
            </div>
            {baseNightlyRate && (
              <p className="text-xs text-muted-foreground">
                {
                  interpolate(
                    i18n.resolve(
                      "host.prepublish.rate_base_hint",
                      "Your normal price is {rate}.",
                    ),
                    { rate: `${baseNightlyRate} ${currency}` },
                  ).text
                }
              </p>
            )}
          </div>
        }
        addLabel={
          i18n.resolve("host.prepublish.set_price", "Set this price").text
        }
        addDisabled={!selection || !rateValid}
        onAdd={() => {
          if (!selection || !rateValid) return;
          commit({
            datePrices: [
              ...plan.datePrices,
              { ...selection, nightlyRate: Math.round(rateNumber * 100) / 100 },
            ],
          });
          setNightlyRate("");
        }}
        entries={plan.datePrices.map((entry, index) => ({
          key: `${entry.startDate}-${entry.endDate}-${index}`,
          primary: formatRange(entry.startDate, entry.endDate, locale),
          secondary: `${entry.nightlyRate} ${currency} · ${nightsLabel(entry.startDate, entry.endDate)}`,
        }))}
        onRemove={(index) =>
          onChange({
            ...plan,
            datePrices: plan.datePrices.filter((_, i) => i !== index),
          })
        }
        emptyLabel={
          i18n.resolve(
            "host.prepublish.pricing_empty",
            "No custom prices yet. Every date uses your normal nightly price.",
          ).text
        }
      />
    );
  }

  const percentValid =
    Number.isInteger(percentNumber) &&
    percentNumber >= MIN_OFFER_PERCENT &&
    percentNumber <= MAX_OFFER_PERCENT;

  return (
    <TaskScreen
      title={
        i18n.resolve("host.prepublish.offers_title", "Customize promotions")
          .text
      }
      hint={
        i18n.resolve(
          "host.prepublish.offers_hint",
          "Pick the dates you want to fill, then choose what guests get. This is separate from the launch offer on the previous step, which applies to longer stays on any date.",
        ).text
      }
      range={range}
      onRangeChange={setRange}
      controls={
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={offerType === "PERCENT_DISCOUNT"}
              onClick={() => setOfferType("PERCENT_DISCOUNT")}
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-medium",
                offerType === "PERCENT_DISCOUNT"
                  ? "border-primary bg-primary/[0.08] ring-1 ring-primary/20"
                  : "border-border/70 bg-card hover:bg-muted/30",
              )}
            >
              <Percent className="size-4 shrink-0 text-primary" />
              <span className="min-w-0 break-words">
                <Tx k="host.prepublish.offer_percent" source="Discount" />
              </span>
            </button>
            <button
              type="button"
              aria-pressed={offerType === "FREE_CLEANING"}
              disabled={!hasCleaningFee}
              onClick={() => setOfferType("FREE_CLEANING")}
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50",
                offerType === "FREE_CLEANING"
                  ? "border-primary bg-primary/[0.08] ring-1 ring-primary/20"
                  : "border-border/70 bg-card hover:bg-muted/30",
              )}
            >
              <Sparkles className="size-4 shrink-0 text-primary" />
              <span className="min-w-0 break-words">
                <Tx k="host.prepublish.offer_cleaning" source="Free cleaning" />
              </span>
            </button>
          </div>
          {!hasCleaningFee && (
            <p className="text-xs text-muted-foreground">
              <Tx
                k="host.prepublish.offer_cleaning_hint"
                source="Free cleaning needs a cleaning fee to waive — add one on the Pricing step."
              />
            </p>
          )}
          {offerType === "PERCENT_DISCOUNT" && (
            <div className="space-y-1.5">
              <Label htmlFor="prepublish-discount">
                <Tx k="host.prepublish.discount_label" source="Discount" />
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="prepublish-discount"
                  type="number"
                  min={MIN_OFFER_PERCENT}
                  max={MAX_OFFER_PERCENT}
                  step="1"
                  inputMode="numeric"
                  value={discountPercent}
                  onChange={(event) => setDiscountPercent(event.target.value)}
                  className="text-right font-semibold tabular-nums"
                />
                <span className="w-24 shrink-0 text-xs text-muted-foreground">
                  %
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {
                  interpolate(
                    i18n.resolve(
                      "host.prepublish.discount_hint",
                      "Between {min}% and {max}%.",
                    ),
                    { min: MIN_OFFER_PERCENT, max: MAX_OFFER_PERCENT },
                  ).text
                }
              </p>
            </div>
          )}
        </div>
      }
      addLabel={
        i18n.resolve("host.prepublish.add_offer", "Add this offer").text
      }
      addDisabled={
        !selection || (offerType === "PERCENT_DISCOUNT" && !percentValid)
      }
      onAdd={() => {
        if (!selection) return;
        if (offerType === "PERCENT_DISCOUNT" && !percentValid) return;
        commit({
          offers: [
            ...plan.offers,
            {
              ...selection,
              type: offerType,
              discountPercent:
                offerType === "PERCENT_DISCOUNT" ? percentNumber : 0,
            },
          ],
        });
      }}
      entries={plan.offers.map((offer, index) => ({
        key: `${offer.startDate}-${offer.endDate}-${index}`,
        primary: formatRange(offer.startDate, offer.endDate, locale),
        secondary:
          offer.type === "FREE_CLEANING"
            ? i18n.resolve("host.prepublish.offer_cleaning", "Free cleaning")
                .text
            : interpolate(
                i18n.resolve(
                  "host.prepublish.offer_percent_summary",
                  "{percent}% off",
                ),
                { percent: offer.discountPercent },
              ).text,
      }))}
      onRemove={(index) =>
        onChange({
          ...plan,
          offers: plan.offers.filter((_, i) => i !== index),
        })
      }
      emptyLabel={
        i18n.resolve("host.prepublish.offers_empty", "No dated offers yet.")
          .text
      }
    />
  );
}
