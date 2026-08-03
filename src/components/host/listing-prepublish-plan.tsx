"use client";

import * as React from "react";
import type { DateRange } from "react-day-picker";
import {
  ArrowRight,
  BadgePercent,
  BedDouble,
  CalendarDays,
  CalendarRange,
  Check,
  ChevronRight,
  CircleDollarSign,
  LockKeyhole,
  Pencil,
  Percent,
  ShieldCheck,
  Sparkles,
  Tags,
  Trash2,
  UnlockKeyhole,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  OFFER_PREVIEW_NOTE,
  OfferPreview,
  OptionToggle,
  STICKY_FOOTER,
} from "@/components/host/calendar-editor-ui";
import { DateRangeCalendarStep } from "@/components/marketplace/marketplace-stay-date-picker";
import { Tx, interpolate, useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import {
  MAX_OFFER_PERCENT,
  MIN_OFFER_PERCENT,
  eachPlanDate,
  flattenPlanDatePrices,
  formatPlanDate,
  parsePlanDate,
  planDateFromLocal,
  rangeNights,
  type PlanDate,
  type PrePublishDatePrice,
  type PrePublishOffer,
  type PrePublishPlan,
  type PrePublishRange,
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

const MS_PER_DAY = 86_400_000;

/** "1 night", not "1 nights" — this string sits in the action bar under every
 *  single-day selection, which is the most common one. */
function useNightsLabel() {
  const { resolve } = useI18n();
  return React.useCallback(
    (count: number) =>
      interpolate(
        count === 1
          ? resolve("host.prepublish.night_count_one", "{count} night")
          : resolve("host.prepublish.nights_count", "{count} nights"),
        { count },
      ).text,
    [resolve],
  );
}

function nextPlanDate(date: PlanDate): PlanDate {
  const parsed = parsePlanDate(date);
  if (!parsed) return date;
  return formatPlanDate(new Date(parsed.getTime() + MS_PER_DAY));
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

/** The compact form the calendar's change rows use: "Aug 3–7", "Aug 30 – Sep 2". */
function compactRange(startDate: string, endDate: string, locale: string) {
  const toDate = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  };
  const start = toDate(startDate);
  const end = toDate(endDate);
  const monthDay = (date: Date) =>
    date.toLocaleDateString(locale, { day: "numeric", month: "short" });
  if (startDate === endDate) return monthDay(start);
  if (start.getMonth() === end.getMonth()) {
    return `${monthDay(start)}–${end.toLocaleDateString(locale, { day: "numeric" })}`;
  }
  return `${monthDay(start)} – ${monthDay(end)}`;
}

/** Consecutive days collapse into one range, so the list below the calendar reads
 *  the way the host thinks ("that week"), not as one row per tap. */
function groupDates(dates: Iterable<PlanDate>): PrePublishRange[] {
  const sorted = [...new Set(dates)].sort();
  const ranges: PrePublishRange[] = [];
  for (const date of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && nextPlanDate(last.endDate) === date) last.endDate = date;
    else ranges.push({ startDate: date, endDate: date });
  }
  return ranges;
}

/** Same idea for prices, except a day only joins the previous range when it also
 *  costs the same. */
function groupPrices(byDate: Map<PlanDate, number>): PrePublishDatePrice[] {
  const sorted = [...byDate.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const ranges: PrePublishDatePrice[] = [];
  for (const [date, nightlyRate] of sorted) {
    const last = ranges[ranges.length - 1];
    if (
      last &&
      last.nightlyRate === nightlyRate &&
      nextPlanDate(last.endDate) === date
    ) {
      last.endDate = date;
    } else {
      ranges.push({ startDate: date, endDate: date, nightlyRate });
    }
  }
  return ranges;
}

/** A cell has room for one badge, so the biggest benefit on that day wins — the same
 *  rule the live calendar uses. */
function offerLabelByDate(offers: PrePublishOffer[]) {
  const best = new Map<PlanDate, { rank: number; label: string }>();
  for (const offer of offers) {
    const rank =
      offer.type === "PERCENT_DISCOUNT" ? offer.discountPercent : 0.5;
    const label =
      offer.type === "PERCENT_DISCOUNT" ? `-${offer.discountPercent}%` : "free";
    for (const day of eachPlanDate(offer.startDate, offer.endDate)) {
      const existing = best.get(day);
      if (!existing || rank > existing.rank) best.set(day, { rank, label });
    }
  }
  return new Map([...best].map(([day, value]) => [day, value.label]));
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

type PlanEditor =
  | { kind: "price"; range: PrePublishRange; initialRate?: number }
  | { kind: "offer"; range: PrePublishRange; index?: number };

type PlanRow = {
  key: string;
  kind: "block" | "price" | "offer";
  startDate: PlanDate;
  endDate: PlanDate;
  label: string;
  detail: string;
  /** Offers are edited in place; blocks and prices are addressed by their dates. */
  index?: number;
};

/**
 * The pre-publish tasks and the live listing calendar are the same three jobs, so
 * this screen is deliberately the calendar workspace's layout: one painted date grid,
 * a legend, an action bar for the current selection, and the list of what the host has
 * set so far. Only the plumbing differs — there is no listing row yet, so every change
 * edits the local plan instead of calling a server action.
 */
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
  const { locale, resolve } = i18n;
  const nightsLabel = useNightsLabel();
  const [range, setRange] = React.useState<DateRange | undefined>();
  const [editor, setEditor] = React.useState<PlanEditor | null>(null);

  const baseRate = Number(baseNightlyRate) || 0;
  const money = React.useCallback(
    (value: number) =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(value),
    [currency, locale],
  );

  const blockedDates = React.useMemo(() => {
    const days = new Set<PlanDate>();
    for (const block of plan.blocks) {
      for (const day of eachPlanDate(block.startDate, block.endDate)) {
        days.add(day);
      }
    }
    return days;
  }, [plan.blocks]);

  // Flattened the same way the publish action flattens it, so what the calendar
  // paints is exactly what gets written: overlapping ranges, later one wins.
  const priceByDate = React.useMemo(
    () =>
      new Map(
        flattenPlanDatePrices(plan.datePrices).map((row) => [
          row.date,
          row.nightlyRate,
        ]),
      ),
    [plan.datePrices],
  );

  const offerByDate = React.useMemo(
    () => offerLabelByDate(plan.offers),
    [plan.offers],
  );

  const selection = range?.from
    ? {
        startDate: planDateFromLocal(range.from),
        endDate: planDateFromLocal(range.to ?? range.from),
      }
    : null;
  const selectionDays = selection
    ? eachPlanDate(selection.startDate, selection.endDate)
    : [];
  const selectionNights = selectionDays.length;
  const selectionBlocked = selectionDays.filter((day) =>
    blockedDates.has(day),
  ).length;
  const selectionOpen = selectionNights - selectionBlocked;

  function commit(next: Partial<PrePublishPlan>) {
    onChange({ ...plan, ...next });
    setRange(undefined);
  }

  function blockSelection() {
    if (!selection) return;
    commit({
      blocks: groupDates([...blockedDates, ...selectionDays]),
    });
  }

  function openDates(days: PlanDate[]) {
    const remaining = new Set(blockedDates);
    for (const day of days) remaining.delete(day);
    commit({ blocks: groupDates(remaining) });
  }

  function savePrice(target: PrePublishRange, nightlyRate: number) {
    const next = new Map(priceByDate);
    for (const day of eachPlanDate(target.startDate, target.endDate)) {
      next.set(day, nightlyRate);
    }
    commit({ datePrices: groupPrices(next) });
  }

  function clearPrice(target: PrePublishRange) {
    const next = new Map(priceByDate);
    for (const day of eachPlanDate(target.startDate, target.endDate)) {
      next.delete(day);
    }
    commit({ datePrices: groupPrices(next) });
  }

  function saveOffer(offer: PrePublishOffer, index?: number) {
    const offers =
      index === undefined
        ? [...plan.offers, offer]
        : plan.offers.map((current, position) =>
            position === index ? offer : current,
          );
    commit({ offers });
  }

  function removeOffer(index: number) {
    commit({ offers: plan.offers.filter((_, position) => position !== index) });
  }

  const meta =
    task === "availability"
      ? {
          title: resolve(
            "host.prepublish.availability_title",
            "Set availability",
          ).text,
          hint: resolve(
            "host.prepublish.availability_hint",
            "Pick the dates you want to keep for yourself. Guests won't be able to book them.",
          ).text,
          emptyHint: resolve(
            "host.calendar.empty_hint_availability",
            "Tap or drag across dates to block them.",
          ).text,
          changesTitle: resolve(
            "host.prepublish.changes_blocked",
            "Blocked dates",
          ).text,
          changesDescription: resolve(
            "host.prepublish.changes_blocked_hint",
            "Dates guests will not be able to book.",
          ).text,
          emptyLabel: resolve(
            "host.prepublish.availability_empty",
            "No blocked dates yet. Your listing will be bookable on every date.",
          ).text,
        }
      : task === "pricing"
        ? {
            title: resolve("host.prepublish.pricing_title", "Customize pricing")
              .text,
            hint: resolve(
              "host.prepublish.pricing_hint",
              "Pick the dates, then set what a night costs then. Every other date keeps your normal price.",
            ).text,
            emptyHint: resolve(
              "host.calendar.empty_hint_pricing",
              "Tap or drag across dates to price them.",
            ).text,
            changesTitle: resolve(
              "host.prepublish.changes_prices",
              "Custom prices",
            ).text,
            changesDescription: resolve(
              "host.prepublish.changes_prices_hint",
              "Dates priced differently from your normal price.",
            ).text,
            emptyLabel: resolve(
              "host.prepublish.pricing_empty",
              "No custom prices yet. Every date uses your normal nightly price.",
            ).text,
          }
        : {
            title: resolve(
              "host.prepublish.offers_title",
              "Customize promotions",
            ).text,
            hint: resolve(
              "host.prepublish.offers_hint",
              "Pick the dates you want to fill, then choose what guests get. This is separate from the launch offer on the previous step, which applies to longer stays on any date.",
            ).text,
            emptyHint: resolve(
              "host.calendar.empty_hint_promotions",
              "Tap or drag across dates to discount them.",
            ).text,
            changesTitle: resolve(
              "host.prepublish.changes_offers",
              "Dated promotions",
            ).text,
            changesDescription: resolve(
              "host.prepublish.changes_offers_hint",
              "Discounts running on specific dates.",
            ).text,
            emptyLabel: resolve("host.prepublish.offers_empty", "No dated offers yet.")
              .text,
          };

  const rows: PlanRow[] = React.useMemo(() => {
    if (task === "availability") {
      return plan.blocks.map((block, index) => ({
        key: `block-${block.startDate}-${block.endDate}-${index}`,
        kind: "block" as const,
        startDate: block.startDate,
        endDate: block.endDate,
        label: resolve("host.calendar.legend_blocked", "Blocked").text,
        detail: nightsLabel(rangeNights(block.startDate, block.endDate)),
      }));
    }
    if (task === "pricing") {
      return plan.datePrices.map((entry, index) => ({
        key: `price-${entry.startDate}-${entry.endDate}-${index}`,
        kind: "price" as const,
        startDate: entry.startDate,
        endDate: entry.endDate,
        label: interpolate(
          resolve("host.prepublish.rate_per_night", "{rate} / night"),
          { rate: money(entry.nightlyRate) },
        ).text,
        detail: interpolate(
          resolve("host.prepublish.rate_base_summary", "Normally {rate}"),
          { rate: money(baseRate) },
        ).text,
      }));
    }
    return plan.offers.map((offer, index) => ({
      key: `offer-${offer.startDate}-${offer.endDate}-${index}`,
      kind: "offer" as const,
      startDate: offer.startDate,
      endDate: offer.endDate,
      index,
      label:
        offer.type === "FREE_CLEANING"
          ? resolve("host.prepublish.offer_cleaning", "Free cleaning").text
          : interpolate(
              resolve("host.prepublish.offer_percent_summary", "{percent}% off"),
              { percent: offer.discountPercent },
            ).text,
      detail: nightsLabel(rangeNights(offer.startDate, offer.endDate)),
    }));
  }, [baseRate, money, nightsLabel, plan, resolve, task]);

  const primaryLabel =
    task === "availability"
      ? resolve("host.calendar.block_dates", "Block dates").text
      : task === "pricing"
        ? resolve("host.prepublish.set_price", "Set this price").text
        : resolve("host.prepublish.add_offer", "Add this offer").text;
  const PrimaryIcon =
    task === "availability"
      ? LockKeyhole
      : task === "pricing"
        ? CircleDollarSign
        : BadgePercent;
  const primaryDetail =
    task === "availability"
      ? resolve(
          "host.prepublish.block_detail",
          "Blocked dates stop booking requests. You can open them again at any time.",
        ).text
      : task === "pricing"
        ? resolve(
            "host.prepublish.price_detail",
            "This custom price applies only to the dates you selected.",
          ).text
        : resolve(
            "host.prepublish.offer_detail",
            "Dated promotions apply only to the dates you selected.",
          ).text;

  return (
    <div className="space-y-4 md:space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight md:text-2xl">
          {meta.title}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground md:text-sm">
          {meta.hint}
        </p>
      </div>

      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <DateRangeCalendarStep
          active
          fitViewport
          pagedDesktopMonthCount={2}
          selected={range}
          onRangeChange={setRange}
          dayVariant="availability"
          dragToSelect
          locale={locale}
          dayMeta={(day) => {
            const key = planDateFromLocal(day);
            if (task === "availability") {
              return {
                sublabel: blockedDates.has(key)
                  ? resolve("host.calendar.legend_blocked", "Blocked").text
                  : "",
              };
            }
            if (task === "pricing") {
              return {
                sublabel: baseRate ? money(priceByDate.get(key) ?? baseRate) : "",
                isCustomPrice: priceByDate.has(key),
              };
            }
            return {
              sublabel: offerByDate.get(key) ?? "",
              sublabelTone: "amber" as const,
            };
          }}
          dateModifiers={{
            ...(task === "availability"
              ? {
                  manualBlock: (day: Date) =>
                    blockedDates.has(planDateFromLocal(day)),
                }
              : {}),
            ...(task === "pricing"
              ? {
                  customPrice: (day: Date) =>
                    priceByDate.has(planDateFromLocal(day)),
                }
              : {}),
            ...(task === "offers"
              ? {
                  promotion: (day: Date) =>
                    offerByDate.has(planDateFromLocal(day)),
                }
              : {}),
          }}
          dateModifiersClassNames={{
            manualBlock:
              "bg-muted after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:bg-[repeating-linear-gradient(-45deg,rgba(15,23,42,0.09)_0,rgba(15,23,42,0.09)_4px,transparent_4px,transparent_8px)]",
            customPrice: "ring-2 ring-primary/40 ring-inset",
            promotion: "bg-amber-500/15",
          }}
        />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-5 py-2 text-xs text-muted-foreground md:text-[0.68rem]">
          {task === "availability" ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-[2px] bg-[repeating-linear-gradient(-45deg,rgba(15,23,42,0.18)_0,rgba(15,23,42,0.18)_2px,transparent_2px,transparent_4px)]" />
              <Tx k="host.calendar.legend_blocked" source="Blocked" />
            </span>
          ) : null}
          {task === "pricing" ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-[2px] border-2 border-primary/50" />
                <Tx
                  k="host.calendar.legend_custom_price"
                  source="Custom price"
                />
              </span>
              {baseRate ? (
                <span>
                  {
                    interpolate(
                      resolve(
                        "host.calendar.legend_base_rate",
                        "Dates without a custom price use the base rate of {rate}.",
                      ),
                      { rate: money(baseRate) },
                    ).text
                  }
                </span>
              ) : null}
            </>
          ) : null}
          {task === "offers" ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-[2px] bg-amber-500/30" />
              <Tx k="host.calendar.legend_promotion" source="Promotion" />
            </span>
          ) : null}
        </div>

        {/* The live calendar portals this row into the phone's fixed bar; here the
            wizard already owns the bottom of the screen, so it stays in the card. */}
        <div className="border-t bg-stone-50 px-5 py-3">
          {selection ? (
            <p className="mb-2 text-center text-sm font-medium text-muted-foreground md:text-xs">
              {formatRange(selection.startDate, selection.endDate, locale)} ·{" "}
              {nightsLabel(selectionNights)}
            </p>
          ) : (
            <p className="mb-2 text-center text-xs font-medium text-muted-foreground md:text-[0.68rem]">
              {meta.emptyHint}
            </p>
          )}
          <div className="mx-auto w-full max-w-3xl space-y-2">
            {task === "availability" ? (
              // Blocking and opening are opposite commits, not one "manage" step, so
              // each gets its own button and goes dim when it would be a no-op. The
              // live calendar opens a sheet to block because it can carry a reason;
              // the plan has no reason to carry, so this commits straight away.
              <div className="flex items-stretch gap-2">
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  className="flex-1"
                  disabled={!selection || selectionBlocked === 0}
                  onClick={() => openDates(selectionDays)}
                >
                  <BedDouble className="size-4" />
                  <Tx k="host.calendar.make_available" source="Make available" />
                </Button>
                <Button
                  type="button"
                  size="lg"
                  className="flex-1"
                  disabled={!selection || selectionOpen === 0}
                  onClick={blockSelection}
                >
                  <LockKeyhole className="size-4" />
                  <Tx k="host.calendar.block_dates" source="Block dates" />
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                size="lg"
                className="w-full"
                disabled={!selection}
                onClick={() => {
                  if (!selection) return;
                  setEditor(
                    task === "pricing"
                      ? { kind: "price", range: selection }
                      : { kind: "offer", range: selection },
                  );
                }}
              >
                <PrimaryIcon className="size-4" />
                {primaryLabel}
              </Button>
            )}
            <p className="text-center text-xs text-muted-foreground md:text-[0.65rem]">
              {primaryDetail}
            </p>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h3 className="font-semibold">{meta.changesTitle}</h3>
            <p className="text-sm text-muted-foreground md:text-xs">
              {meta.changesDescription}
            </p>
          </div>
          <span className="shrink-0 text-sm text-muted-foreground md:text-xs">
            {
              interpolate(resolve("host.calendar.shown_count", "{count} shown"), {
                count: rows.length,
              }).text
            }
          </span>
        </div>
        {rows.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            {meta.emptyLabel}
          </div>
        ) : (
          <div className="divide-y">
            {rows.map((row) => {
              const Icon =
                row.kind === "price"
                  ? CircleDollarSign
                  : row.kind === "offer"
                    ? BadgePercent
                    : LockKeyhole;
              const typeLabel =
                row.kind === "price"
                  ? resolve("host.prepublish.type_price", "Price override").text
                  : row.kind === "offer"
                    ? resolve("host.prepublish.type_promotion", "Promotion").text
                    : resolve("host.prepublish.type_availability", "Availability")
                        .text;
              return (
                <div
                  key={row.key}
                  className="grid gap-3 px-5 py-3.5 sm:grid-cols-[8rem_8rem_minmax(0,1fr)_13rem] sm:items-center"
                >
                  <span className="text-sm font-medium">
                    {compactRange(row.startDate, row.endDate, locale)}
                  </span>
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium md:text-[0.68rem]">
                    <Icon className="size-3.5" /> {typeLabel}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">
                      {row.label}
                    </span>
                    <span className="block truncate text-sm text-muted-foreground md:text-xs">
                      {row.detail}
                    </span>
                  </span>
                  <span className="flex justify-end gap-1">
                    {row.kind !== "block" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setEditor(
                            row.kind === "price"
                              ? {
                                  kind: "price",
                                  range: {
                                    startDate: row.startDate,
                                    endDate: row.endDate,
                                  },
                                  initialRate: priceByDate.get(row.startDate),
                                }
                              : {
                                  kind: "offer",
                                  range: {
                                    startDate: row.startDate,
                                    endDate: row.endDate,
                                  },
                                  index: row.index,
                                },
                          )
                        }
                      >
                        <Pencil className="size-3.5" />
                        <Tx k="host.workspace.edit" source="Edit" />
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (row.kind === "block") {
                          openDates(eachPlanDate(row.startDate, row.endDate));
                          return;
                        }
                        if (row.kind === "price") {
                          clearPrice({
                            startDate: row.startDate,
                            endDate: row.endDate,
                          });
                          return;
                        }
                        if (row.index !== undefined) removeOffer(row.index);
                      }}
                    >
                      {row.kind === "block" ? (
                        <UnlockKeyhole className="size-3.5" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                      {row.kind === "block"
                        ? resolve("host.calendar.make_available", "Make available")
                            .text
                        : resolve("host.prepublish.remove", "Remove").text}
                    </Button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {editor ? (
        <PlanEditorDialog
          key={`${editor.kind}-${editor.range.startDate}-${editor.range.endDate}-${
            editor.kind === "offer" ? (editor.index ?? "new") : "price"
          }`}
          editor={editor}
          plan={plan}
          locale={locale}
          currency={currency}
          baseRate={baseRate}
          hasCleaningFee={hasCleaningFee}
          money={money}
          onClose={() => setEditor(null)}
          onSavePrice={(nightlyRate) => {
            savePrice(editor.range, nightlyRate);
            setEditor(null);
          }}
          onSaveOffer={(offer, index) => {
            saveOffer(offer, index);
            setEditor(null);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * The same sheet the live calendar opens for a price or a promotion, minus the parts
 * that need a saved listing (default pricing, always-active promotions, minimum-stay
 * thresholds — the wizard already collects those on its own steps).
 */
function PlanEditorDialog({
  editor,
  plan,
  locale,
  currency,
  baseRate,
  hasCleaningFee,
  money,
  onClose,
  onSavePrice,
  onSaveOffer,
}: {
  editor: PlanEditor;
  plan: PrePublishPlan;
  locale: string;
  currency: string;
  baseRate: number;
  hasCleaningFee: boolean;
  money: (value: number) => string;
  onClose: () => void;
  onSavePrice: (nightlyRate: number) => void;
  onSaveOffer: (offer: PrePublishOffer, index?: number) => void;
}) {
  const { resolve } = useI18n();
  const nightsLabel = useNightsLabel();
  const existingOffer =
    editor.kind === "offer" && editor.index !== undefined
      ? plan.offers[editor.index]
      : undefined;

  const [price, setPrice] = React.useState(
    String(editor.kind === "price" ? (editor.initialRate ?? baseRate) : baseRate),
  );
  const [roundPrice, setRoundPrice] = React.useState(true);
  const [offerType, setOfferType] = React.useState<
    "PERCENT_DISCOUNT" | "FREE_CLEANING"
  >(existingOffer?.type ?? "PERCENT_DISCOUNT");
  const [discount, setDiscount] = React.useState(
    String(existingOffer?.discountPercent || 15),
  );

  const nights = rangeNights(editor.range.startDate, editor.range.endDate);
  const rangeText = `${formatRange(
    editor.range.startDate,
    editor.range.endDate,
    locale,
  )} · ${nightsLabel(nights)}`;

  const priceNumber = Number(price);
  const priceValid = Number.isFinite(priceNumber) && priceNumber > 0;
  const discountNumber = Number(discount);
  const discountValid =
    Number.isInteger(discountNumber) &&
    discountNumber >= MIN_OFFER_PERCENT &&
    discountNumber <= MAX_OFFER_PERCENT;

  const isPrice = editor.kind === "price";
  const HeaderIcon = isPrice ? CircleDollarSign : BadgePercent;
  const title = isPrice
    ? resolve("host.prepublish.price_editor_title", "Price these dates").text
    : existingOffer
      ? resolve("host.prepublish.offer_editor_edit_title", "Edit promotion").text
      : resolve("host.prepublish.offer_editor_title", "Discount these dates")
          .text;

  function submit() {
    if (isPrice) {
      if (!priceValid) return;
      onSavePrice(Math.round(priceNumber * 100) / 100);
      return;
    }
    if (offerType === "PERCENT_DISCOUNT" && !discountValid) return;
    onSaveOffer(
      {
        ...editor.range,
        type: offerType,
        discountPercent:
          offerType === "PERCENT_DISCOUNT" ? discountNumber : 0,
      },
      editor.kind === "offer" ? editor.index : undefined,
    );
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        variant="sheet"
        className="flex flex-col gap-0 overflow-hidden p-0 md:h-auto md:max-h-[90dvh] md:max-w-[34rem]"
      >
        <DialogHeader className="shrink-0">
          <div className="flex min-w-0 items-center gap-2.5 border-b px-6 py-3.5 pr-12 text-left">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <HeaderIcon className="size-4" />
            </span>
            <DialogTitle className="min-w-0 truncate text-base leading-snug">
              {title}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {rangeText}
            </DialogDescription>
          </div>
        </DialogHeader>
        <div className="flex shrink-0 items-center gap-2 border-b bg-muted/25 px-6 py-2.5 text-sm font-medium md:text-xs">
          <CalendarRange className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate">{rangeText}</span>
        </div>

        <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
          {isPrice ? (
            <div className="space-y-4 p-6">
              <div className="rounded-2xl border-2 border-primary/30 bg-primary/[0.035] p-4 shadow-sm">
                <Label
                  htmlFor="prepublish-nightly-rate"
                  className="text-sm font-semibold"
                >
                  <Tx
                    k="host.prepublish.rate_label"
                    source="Price per night for these dates"
                  />
                </Label>
                <div className="relative mt-2">
                  <Input
                    id="prepublish-nightly-rate"
                    className="h-14 rounded-xl border-primary/25 bg-background pr-24 text-2xl font-semibold shadow-xs"
                    type="number"
                    min={1}
                    step="0.01"
                    inputMode="decimal"
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-muted-foreground md:text-xs">
                    {currency}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground md:text-xs">
                  <Tx
                    k="host.calendar.price_hint"
                    source="Enter an exact amount or choose a quick adjustment below."
                  />
                </p>
              </div>

              {baseRate > 0 ? (
                <div className="grid grid-cols-4 gap-2">
                  {(
                    [
                      ["−10%", baseRate * 0.9],
                      [resolve("host.prepublish.rate_base", "Base").text, baseRate],
                      ["+20%", baseRate * 1.2],
                      ["+50%", baseRate * 1.5],
                    ] as const
                  ).map(([label, value]) => {
                    const adjusted = roundPrice
                      ? Math.ceil(Number(value) / 5) * 5
                      : Number(Number(value).toFixed(2));
                    const selected = Number(price) === adjusted;
                    return (
                      <button
                        key={String(label)}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setPrice(String(adjusted))}
                        className={cn(
                          "relative flex min-h-14 flex-col items-center justify-center rounded-xl border px-2 py-2 transition-colors",
                          selected
                            ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                            : "bg-background hover:border-primary/35 hover:bg-muted/30",
                        )}
                      >
                        <span className="text-sm font-semibold md:text-xs">
                          {label}
                        </span>
                        <span
                          translate="no"
                          className={cn(
                            "notranslate mt-0.5 text-xs md:text-[0.65rem]",
                            selected ? "text-primary" : "text-muted-foreground",
                          )}
                        >
                          {money(adjusted)}
                        </span>
                        {selected ? (
                          <span className="absolute top-1.5 right-1.5 grid size-4 place-items-center rounded-full bg-primary text-primary-foreground">
                            <Check className="size-2.5" />
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              <OptionToggle
                checked={roundPrice}
                label={
                  resolve("host.prepublish.round_label", "Round up to the nearest 5")
                    .text
                }
                description={
                  resolve(
                    "host.prepublish.round_hint",
                    "Keeps guest-facing prices clean and easy to scan.",
                  ).text
                }
                onChange={() =>
                  setRoundPrice((current) => {
                    const next = !current;
                    if (next && priceValid) {
                      setPrice(String(Math.ceil(priceNumber / 5) * 5));
                    }
                    return next;
                  })
                }
              />

              <div className="flex gap-3 px-1">
                <ShieldCheck className="mt-0.5 size-4 shrink-0" />
                <p className="text-sm text-muted-foreground md:text-xs">
                  <Tx
                    k="host.prepublish.price_scope_note"
                    source="This custom price applies only to the selected dates. Every other date keeps your normal price."
                  />
                </p>
              </div>

              <div className={STICKY_FOOTER}>
                {baseRate > 0 ? (
                  <div className="mb-3 grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm md:text-xs">
                    <span className="min-w-0 break-words text-muted-foreground">
                      <Tx k="host.prepublish.rate_normal" source="Normally" />{" "}
                      <strong
                        className="notranslate whitespace-nowrap text-foreground"
                        translate="no"
                      >
                        {money(baseRate)}
                      </strong>
                    </span>
                    <ArrowRight className="size-3.5 text-muted-foreground" />
                    <span className="min-w-0 break-words text-primary">
                      <Tx
                        k="host.calendar.legend_custom_price"
                        source="Custom price"
                      />{" "}
                      <strong
                        className="notranslate whitespace-nowrap"
                        translate="no"
                      >
                        {money(priceValid ? priceNumber : 0)}
                      </strong>
                    </span>
                  </div>
                ) : null}
                <div className="flex flex-wrap justify-end gap-2">
                  <Button type="button" variant="outline" onClick={onClose}>
                    <Tx k="host.calendar.cancel" source="Cancel" />
                  </Button>
                  <Button type="button" disabled={!priceValid} onClick={submit}>
                    <Tx k="host.prepublish.set_price" source="Set this price" />
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 p-6">
              <fieldset>
                <legend className="text-sm font-semibold">
                  <Tx
                    k="host.prepublish.offer_type_label"
                    source="What do guests get?"
                  />
                </legend>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {(
                    [
                      {
                        value: "PERCENT_DISCOUNT",
                        label: resolve("host.prepublish.offer_percent", "Discount")
                          .text,
                        description: resolve(
                          "host.prepublish.offer_percent_hint",
                          "A percentage off the nightly price.",
                        ).text,
                        icon: Percent,
                        disabled: false,
                      },
                      {
                        value: "FREE_CLEANING",
                        label: resolve(
                          "host.prepublish.offer_cleaning",
                          "Free cleaning",
                        ).text,
                        description: resolve(
                          "host.prepublish.offer_cleaning_short",
                          "The cleaning fee is waived.",
                        ).text,
                        icon: Sparkles,
                        disabled: !hasCleaningFee,
                      },
                    ] as const
                  ).map((option) => {
                    const selected = offerType === option.value;
                    const Icon = option.icon;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={selected}
                        disabled={option.disabled}
                        onClick={() => setOfferType(option.value)}
                        className={cn(
                          "relative rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                          selected
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "hover:border-primary/35",
                        )}
                      >
                        <Icon className="size-5 text-primary" />
                        <span className="mt-4 block text-sm font-semibold">
                          {option.label}
                        </span>
                        <span className="mt-1 block text-sm text-muted-foreground md:text-xs">
                          {option.description}
                        </span>
                        {selected ? (
                          <span className="absolute top-3 right-3 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                            <Check className="size-3" />
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {!hasCleaningFee ? (
                <p className="text-sm text-muted-foreground md:text-xs">
                  <Tx
                    k="host.prepublish.offer_cleaning_hint"
                    source="Free cleaning needs a cleaning fee to waive — add one on the Pricing step."
                  />
                </p>
              ) : null}

              {offerType === "PERCENT_DISCOUNT" ? (
                <div className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-xl border bg-primary/5 p-3">
                  <Input
                    aria-label={
                      resolve("host.prepublish.discount_label", "Discount").text
                    }
                    type="number"
                    min={MIN_OFFER_PERCENT}
                    max={MAX_OFFER_PERCENT}
                    step="1"
                    inputMode="numeric"
                    value={discount}
                    onChange={(event) => setDiscount(event.target.value)}
                    className="text-right font-semibold tabular-nums"
                  />
                  <span className="text-sm text-muted-foreground md:text-xs">
                    <Tx k="host.calendar.percent_off" source="% off" />
                  </span>
                </div>
              ) : null}

              <OfferPreview
                headline={
                  offerType === "FREE_CLEANING"
                    ? resolve("host.prepublish.offer_cleaning", "Free cleaning")
                        .text
                    : interpolate(
                        resolve(
                          "host.prepublish.offer_percent_summary",
                          "{percent}% off",
                        ),
                        { percent: discountValid ? discountNumber : 0 },
                      ).text
                }
              >
                {offerType === "PERCENT_DISCOUNT" && baseRate > 0 ? (
                  <p className={OFFER_PREVIEW_NOTE}>
                    {
                      interpolate(
                        resolve(
                          "host.prepublish.offer_estimated",
                          "About {rate} a night on these dates.",
                        ),
                        {
                          rate: money(
                            baseRate *
                              (1 - (discountValid ? discountNumber : 0) / 100),
                          ),
                        },
                      ).text
                    }
                  </p>
                ) : null}
                <p className={cn(OFFER_PREVIEW_NOTE, "mt-1")}>
                  {
                    interpolate(
                      resolve(
                        "host.prepublish.discount_hint",
                        "Between {min}% and {max}%.",
                      ),
                      { min: MIN_OFFER_PERCENT, max: MAX_OFFER_PERCENT },
                    ).text
                  }
                </p>
              </OfferPreview>

              <div className={cn(STICKY_FOOTER, "flex flex-wrap justify-end gap-2")}>
                <Button type="button" variant="outline" onClick={onClose}>
                  <Tx k="host.calendar.cancel" source="Cancel" />
                </Button>
                <Button
                  type="button"
                  disabled={offerType === "PERCENT_DISCOUNT" && !discountValid}
                  onClick={submit}
                >
                  <Tx k="host.prepublish.add_offer" source="Add this offer" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
