"use client";

import * as React from "react";
import type { DateRange } from "react-day-picker";
import {
  ArrowRight,
  BadgePercent,
  CalendarCheck,
  CalendarClock,
  CalendarOff,
  CalendarRange,
  ChevronRight,
  CircleAlert,
  CircleDollarSign,
  LockKeyhole,
  Pencil,
  Percent,
  ShieldCheck,
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
import { Label } from "@/components/ui/label";
import { PercentAmountField } from "@/components/host/percent-amount-field";
import {
  OFFER_PREVIEW_NOTE,
  OfferPreview,
  OptionToggle,
  STICKY_FOOTER,
  roundToCleanPrice,
} from "@/components/host/calendar-editor-ui";
import { DateRangeCalendarStep } from "@/components/marketplace/marketplace-stay-date-picker";
import { Tx, interpolate, useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import {
  blockedNightsCount,
  type AvailabilityStartChoice,
} from "@/lib/types/listing-availability-start";
import { compareYmd, todayYmd } from "@/lib/utils/date-only";
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

/** Which screen of the pre-publish flow is showing. `menu` is the checklist the optional
 *  tasks return to — see the note on returning rather than publishing directly.
 *  `availability-start` is the required question the host passes through on the way to
 *  the checklist, and is not one of the optional tasks. */
export type PrePublishScreen = "menu" | "availability-start" | PrePublishTask;

/** Stable so the wizard's footer buttons — which live in another component — can point
 *  their `aria-describedby` at the "you haven't answered yet" message. Only one
 *  availability screen is ever mounted, so a fixed id is safe here where the radio and
 *  date-field ids still come from `useId`. */
export const AVAILABILITY_START_ERROR_ID = "availability-start-error";

/** The handle `PrePublishTaskScreen` hands the wizard so its bottom bar can open the
 *  same editor the in-card button opens. */
export type PrePublishTaskActions = {
  commitSelection: () => void;
  clearSelection: () => void;
};

export function prePublishTaskCount(
  plan: PrePublishPlan,
  task: PrePublishTask,
) {
  if (task === "availability") {
    return plan.availabilityStart?.mode === "selected"
      ? plan.openDates.length
      : plan.blocks.length;
  }
  if (task === "pricing") return plan.datePrices.length;
  return plan.offers.length;
}

const MS_PER_DAY = 86_400_000;
/** The discounts hosts reach for, as labels under the promotion track. Everything
 *  between them is a drag away, and the field takes anything in range. */
const OFFER_PERCENT_STOPS = [
  { label: "5%", percent: 5 },
  { label: "10%", percent: 10 },
  { label: "15%", percent: 15 },
  { label: "20%", percent: 20 },
  { label: "30%", percent: 30 },
  { label: "50%", percent: 50 },
] as const;

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

/** One wording for a dated offer wherever it is listed back to the host. A percentage
 *  and free cleaning can both sit on the same range, so neither reading may drop the
 *  other. */
function offerSummary(
  offer: PrePublishOffer,
  // The whole translator rather than its `resolve`: the string extractor only sees
  // keys behind a property access, so a bare `resolve(...)` here would silently drop
  // these three strings from the catalog.
  i18n: Pick<ReturnType<typeof useI18n>, "resolve">,
): string {
  const percent =
    offer.discountPercent > 0
      ? interpolate(
          i18n.resolve("host.prepublish.offer_percent_summary", "{percent}% off"),
          { percent: offer.discountPercent },
        ).text
      : "";
  const cleaning = offer.freeCleaning
    ? i18n.resolve("host.prepublish.offer_cleaning", "Free cleaning").text
    : "";
  // Joined rather than a sentence of its own: a phrase with both benefits baked in
  // would need its own catalog key in every reviewed language for no extra meaning.
  if (percent && cleaning) return `${percent} · ${cleaning}`;
  return percent || cleaning;
}

/** A cell has room for one badge, so the biggest benefit on that day wins — the same
 *  rule the live calendar uses. */
function offerLabelByDate(offers: PrePublishOffer[]) {
  const best = new Map<PlanDate, { rank: number; label: string }>();
  for (const offer of offers) {
    const rank = offer.discountPercent > 0 ? offer.discountPercent : 0.5;
    const label =
      offer.discountPercent > 0 ? `-${offer.discountPercent}%` : "free";
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
  onEditAvailability,
  onEditPricing,
  onEditPromotion,
  baseNightlyRate,
  cleaningFee,
  minimumNights,
  promotionType,
  promotionPercent,
  promotionMinimumNights,
  currency,
}: {
  plan: PrePublishPlan;
  onOpenTask: (task: PrePublishTask) => void;
  /** Back to the availability question. The checklist reports that answer but never
   *  edits it — there is one screen that owns it, and this returns the host to it. */
  onEditAvailability: () => void;
  onEditPricing: () => void;
  onEditPromotion: () => void;
  baseNightlyRate: string;
  cleaningFee: string;
  minimumNights: string;
  promotionType: string;
  promotionPercent: string;
  promotionMinimumNights: string;
  currency: string;
}) {
  const i18n = useI18n();
  const { locale } = i18n;
  const summary = useAvailabilitySummary();
  const availabilitySummary = summary(plan);
  const money = (value: string | number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(Number(value) || 0);

  const tasks: {
    task: PrePublishTask;
    icon: LucideIcon;
    title: string;
    details: React.ReactNode;
    onEdit: () => void;
  }[] = [
    {
      task: "pricing",
      icon: Tags,
      title: i18n.resolve("host.prepublish.review_pricing", "Pricing").text,
      onEdit: onEditPricing,
      details: (
        <>
          <span className="block font-medium text-foreground">
            {interpolate(
              i18n.resolve("host.prepublish.review_base_rate", "{rate} per night"),
              { rate: money(baseNightlyRate) },
            ).text}
          </span>
          <span className="block">
            {interpolate(
              i18n.resolve(
                "host.prepublish.review_fees",
                "Cleaning fee: {cleaning} · Minimum stay: {nights} nights",
              ),
              { cleaning: money(cleaningFee), nights: minimumNights },
            ).text}
          </span>
          {plan.datePrices.map((price, index) => (
            <span
              key={`${price.startDate}-${price.endDate}-${index}`}
              className="block"
            >
              {interpolate(
                i18n.resolve(
                  "host.prepublish.review_custom_price",
                  "{dates}: {rate} per night",
                ),
                {
                  dates: formatRange(price.startDate, price.endDate, locale),
                  rate: money(price.nightlyRate),
                },
              ).text}
            </span>
          ))}
        </>
      ),
    },
    {
      task: "offers",
      icon: Percent,
      title: i18n.resolve("host.prepublish.review_promotions", "Promotions").text,
      onEdit: onEditPromotion,
      details: (
        <>
          <span className="block font-medium text-foreground">
            {promotionType === "PERCENT_DISCOUNT"
              ? interpolate(
                  i18n.resolve(
                    "host.prepublish.review_launch_offer",
                    "Launch offer: {percent}% off · {nights}+ nights",
                  ),
                  {
                    percent: promotionPercent,
                    nights: promotionMinimumNights,
                  },
                ).text
              : i18n.resolve(
                  "host.prepublish.review_no_promotion",
                  "No launch offer",
                ).text}
          </span>
          {plan.offers.length === 0 ? (
            <span className="block">
              {i18n.resolve(
                "host.prepublish.review_no_dated_offers",
                "No offers for specific dates",
              ).text}
            </span>
          ) : (
            plan.offers.map((offer, index) => (
              <span
                key={`${offer.startDate}-${offer.endDate}-${index}`}
                className="block"
              >
                {formatRange(offer.startDate, offer.endDate, locale)}:{" "}
                {offerSummary(offer, i18n)}
              </span>
            ))
          )}
        </>
      ),
    },
  ];

  return (
    <div className="space-y-3 md:space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight md:text-2xl">
          <Tx
            k="host.prepublish.review_heading"
            source="Review before publishing"
          />
        </h2>
        <p className="mt-1 text-xs text-muted-foreground md:text-sm">
          <Tx
            k="host.prepublish.review_subheading"
            source="Check what guests can book, what they will pay, and which offers they will receive."
          />
        </p>
      </div>

      {/* Availability is answered by now, so it reports rather than asks. It sits above
          the optional tasks and outside their list: presenting a settled decision as one
          more unticked card is what made hosts skip it in the first place. */}
      <div
        className={cn(
          "rounded-xl border p-3 md:p-4",
          availabilitySummary
            ? "border-primary/40 bg-primary/[0.04]"
            : "border-destructive/50 bg-destructive/[0.04]",
        )}
      >
        <div className="flex items-start gap-3 md:gap-4">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg md:size-10",
              availabilitySummary
                ? "bg-primary text-primary-foreground"
                : "bg-destructive/10 text-destructive",
            )}
          >
            {availabilitySummary ? (
              <CalendarCheck className="size-5" aria-hidden="true" />
            ) : (
              <CircleAlert className="size-5" aria-hidden="true" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold md:text-base">
              <Tx
                k="host.prepublish.availability_confirmed_title"
                source="When guests can book"
              />
            </p>
            <p
              className={cn(
                "mt-1 text-xs leading-snug md:text-sm",
                availabilitySummary
                  ? "text-muted-foreground"
                  : "font-medium text-destructive",
              )}
            >
              {availabilitySummary ? (
                <span className="notranslate">{availabilitySummary}</span>
              ) : (
                <Tx
                  k="host.prepublish.availability_required"
                  source="Choose when guests can start booking."
                />
              )}
            </p>
            {(plan.availabilityStart?.mode === "selected"
              ? plan.openDates
              : plan.blocks
            ).map((block, index) => (
              <p
                key={`${block.startDate}-${block.endDate}-${index}`}
                className="mt-1 text-xs text-muted-foreground md:text-sm"
              >
                {interpolate(
                  plan.availabilityStart?.mode === "selected"
                    ? i18n.resolve(
                        "host.prepublish.review_open",
                        "Open: {dates}",
                      )
                    : i18n.resolve(
                        "host.prepublish.review_blocked",
                        "Blocked: {dates}",
                      ),
                  { dates: formatRange(block.startDate, block.endDate, locale) },
                ).text}
              </p>
            ))}
            {plan.availabilityStart?.mode === "selected" &&
            plan.openDates.length === 0 ? (
              <p className="mt-2 text-xs font-medium text-amber-700 md:text-sm">
                <Tx
                  k="host.prepublish.no_open_dates_warning"
                  source="Your listing will be live but hidden from search until you open dates."
                />
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={onEditAvailability}
          >
            <Pencil className="size-3.5" />
            {availabilitySummary
              ? i18n.resolve("host.prepublish.availability_edit", "Edit").text
              : i18n.resolve("host.prepublish.availability_confirm", "Confirm").text}
          </Button>
        </div>
      </div>

      <div className="space-y-2.5">
        {tasks.map(({ task, icon: Icon, title, details, onEdit }) => {
          const count = prePublishTaskCount(plan, task);
          return (
            <div
              key={task}
              className={cn(
                "flex w-full items-start gap-3 rounded-xl border p-3 text-left md:gap-4 md:p-4",
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
                    : "bg-muted text-muted-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-sm font-semibold md:text-base">
                  {title}
                </span>
                <span className="mt-1 block text-xs leading-snug text-muted-foreground md:text-sm">
                  {details}
                </span>
                {task === "offers" && plan.offers.length > 0 ? (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="mt-2 h-auto px-0 text-xs"
                    onClick={() => onOpenTask("offers")}
                  >
                    <Tx
                      k="host.prepublish.review_edit_dated_offers"
                      source="Edit dated offers"
                    />
                    <ChevronRight className="size-3.5" />
                  </Button>
                ) : null}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={onEdit}
              >
                <Pencil className="size-3.5" />
                {i18n.resolve("host.prepublish.availability_edit", "Edit").text}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The date-pricing entrance on the wizard's Pricing step, directly under the base
 * nightly rate.
 *
 * The checklist after the last step is easy to skim past, and a host who has just typed
 * a nightly rate is the one host who is actually thinking about price. So the same task
 * screen is offered here too — this only opens it; the calendar, the plan and the draft
 * save are all the existing ones.
 */
export function DatePricingCta({
  plan,
  onOpen,
}: {
  plan: PrePublishPlan;
  onOpen: () => void;
}) {
  // `i18n.resolve` rather than a destructured `resolve`: only the property-access form
  // is picked up by the UI-string extractor, so this copy lands in the catalog.
  const i18n = useI18n();
  const count = plan.datePrices.length;
  const hasPrices = count > 0;

  return (
    // Sits inside the pricing card as one more row, so it reads as part of the price
    // the host is setting rather than as an advert bolted under it.
    <div className="flex min-h-14 flex-col gap-2.5 border-b border-border/60 px-3 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-2.5 md:min-h-[88px] md:gap-4 md:px-4 md:py-4 md:sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2.5 md:gap-4">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg md:size-10 md:rounded-xl",
            hasPrices
              ? "bg-primary text-primary-foreground"
              : "bg-primary/10 text-primary",
          )}
        >
          <CalendarRange className="size-4 md:size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold md:text-base">
            {hasPrices
              ? // Spelled out as date *ranges* on purpose: "3 prices set" reads as three
                // nights, and a host who set a two-week holiday rate would think we had
                // lost most of it.
                i18n.plural(
                  "host.form.pricing.date_prices_summary",
                  count,
                  "Custom prices set for {n} date range",
                  "Custom prices set for {n} date ranges",
                ).text
              : i18n.resolve(
                  "host.form.pricing.date_prices_title",
                  "Charge different prices on certain dates?",
                ).text}
          </p>
          <p className="text-[0.7rem] text-muted-foreground md:text-sm">
            <Tx
              k="host.form.pricing.date_prices_hint"
              source="For example, charge more during holidays or less in quieter periods."
            />
          </p>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full shrink-0 sm:w-36 md:w-44"
        onClick={onOpen}
      >
        <CalendarRange className="size-4" />
        {hasPrices
          ? i18n.resolve("host.form.pricing.date_prices_edit", "Edit date prices")
              .text
          : i18n.resolve("host.form.pricing.date_prices_action", "Set date prices")
              .text}
      </Button>
    </div>
  );
}

/** "1 September" — the day and month the host picked, in their language. Built from the
 *  parts rather than parsed, so the label cannot land a day out from the stored date. */
function formatStartDate(value: PlanDate, locale: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
  });
}

/**
 * The one-line answer to "when can guests book?", used both on the availability screen
 * and on the checklist so the two can never disagree: "Available now · no blocked
 * dates", "Available from 1 September · 8 blocked nights".
 */
export function useAvailabilitySummary() {
  const i18n = useI18n();
  const { locale } = i18n;

  return React.useCallback(
    (plan: PrePublishPlan): string | null => {
      if (!plan.availabilityStart) return null;
      const selectedDates = plan.availabilityStart.mode === "selected";
      const start =
        selectedDates
          ? i18n.resolve(
              "host.prepublish.availability_selected_summary",
              "Only available on dates you open",
            ).text
          : plan.availabilityStart.mode === "now"
          ? i18n.resolve("host.prepublish.availability_now_summary", "Available now")
              .text
          : interpolate(
              i18n.resolve(
                "host.prepublish.availability_from_summary",
                "Available from {date}",
              ),
              {
                date: formatStartDate(
                  plan.availabilityStart.mode === "from"
                    ? plan.availabilityStart.startDate
                    : "",
                  locale,
                ),
              },
            ).text;

      // Nights, not ranges — see blockedNightsCount. A host who blocked one long
      // holiday and one weekend should read the total they took off the calendar.
      const nights = blockedNightsCount(
        selectedDates ? plan.openDates : plan.blocks,
      );
      const blocked =
        nights === 0
          ? selectedDates
            ? i18n.resolve(
                "host.prepublish.availability_no_open",
                "no dates opened yet",
              ).text
            : i18n.resolve(
                "host.prepublish.availability_no_blocked",
                "no blocked dates",
              ).text
          : selectedDates
            ? i18n.plural(
                "host.prepublish.availability_open_nights",
                nights,
                "{n} open night",
                "{n} open nights",
              ).text
          : i18n.plural(
              "host.prepublish.availability_blocked_nights",
              nights,
              "{n} blocked night",
              "{n} blocked nights",
            ).text;

      return `${start} · ${blocked}`;
    },
    [i18n, locale],
  );
}

/**
 * "When can guests book?" — the required screen between the last numbered step and the
 * checklist.
 *
 * This exists because availability used to be skippable, and skipping it published a
 * listing that took requests for every date from that moment on. The two choices are
 * therefore a gate, not a suggestion: there is no way past this screen without picking
 * one, and the publish action re-checks the answer rather than trusting the button.
 *
 * Blocking specific dates stays optional and separate, and the two compose — a host can
 * open on 1 September and still block a week later that month. It reuses the existing
 * pre-publish availability calendar rather than owning one, so there is exactly one
 * blocking tool in the wizard.
 */
export function AvailabilityStartScreen({
  plan,
  onChange,
  onOpenBlockingCalendar,
  showError,
  stayTimes,
}: {
  plan: PrePublishPlan;
  onChange: (plan: PrePublishPlan) => void;
  onOpenBlockingCalendar: () => void;
  /** Set once the host has tried to continue without answering, so the screen is quiet
   *  on arrival and explicit afterwards rather than scolding them up front. */
  showError: boolean;
  /** Check-in / check-out times, passed in rather than owned: they are listing form
   *  state, and this screen deals in the pre-publish plan. Rendered last and visually
   *  secondary so the radio group above stays the only thing that blocks Continue. */
  stayTimes?: React.ReactNode;
}) {
  const i18n = useI18n();
  const { locale } = i18n;
  // Unique per instance so the radio ids, the date field and its error message can be
  // associated without colliding with anything else on the page.
  const fieldId = React.useId();
  const dateFieldId = `${fieldId}-date`;
  const dateErrorId = `${fieldId}-date-error`;
  // Fixed for the life of the screen: the min on the date input and the "has it passed"
  // check have to agree, and recomputing across a midnight would leave them disagreeing.
  // Read in the marketplace's time zone, the same rule the publish action validates
  // against — see todayYmd.
  const [today] = React.useState(() => todayYmd());

  /**
   * The radio selection is local because it can be ahead of the answer: picking
   * "a specific date" selects that radio while the plan still holds `null`, which is
   * what keeps Continue disabled until a date is actually chosen.
   */
  const [mode, setMode] = React.useState<"now" | "from" | "selected" | null>(
    plan.availabilityStart?.mode ?? null,
  );
  const [startDate, setStartDate] = React.useState(
    plan.availabilityStart?.mode === "from" ? plan.availabilityStart.startDate : "",
  );
  const [datePickerOpen, setDatePickerOpen] = React.useState(false);

  function commit(availabilityStart: AvailabilityStartChoice) {
    onChange({ ...plan, availabilityStart });
  }

  function chooseNow() {
    setMode("now");
    commit({ mode: "now" });
  }

  /** Selecting the second radio keeps whatever date was already typed, so a host who
   *  taps away to "now" and back does not lose it. */
  function selectMode(value: "now" | "from" | "selected") {
    if (value === "now") {
      chooseNow();
      return;
    }
    if (value === "selected") {
      setMode("selected");
      commit({ mode: "selected" });
      setDatePickerOpen(false);
      return;
    }
    setMode("from");
    chooseFrom(startDate);
    setDatePickerOpen(true);
  }

  function localDate(value: string) {
    const parsed = parsePlanDate(value);
    return parsed
      ? new Date(
          parsed.getUTCFullYear(),
          parsed.getUTCMonth(),
          parsed.getUTCDate(),
        )
      : undefined;
  }

  function chooseCalendarDate(range: DateRange | undefined) {
    if (!range?.from) return;

    const current = localDate(startDate);
    const chosen =
      range.to && current
        ? planDateFromLocal(range.from) === planDateFromLocal(current)
          ? range.to
          : range.from
        : range.from;
    chooseFrom(planDateFromLocal(chosen));
    setDatePickerOpen(false);
  }

  function chooseFrom(value: string) {
    setStartDate(value);
    // Anything not yet a usable date leaves the plan unanswered rather than storing a
    // half-answer the host would then be able to publish on.
    const usable =
      value !== "" && parsePlanDate(value) !== null && compareYmd(value, today) >= 0;
    commit(usable ? { mode: "from", startDate: value } : null);
  }

  const dateError =
    mode !== "from"
      ? ""
      : startDate === ""
        ? showError
          ? i18n.resolve(
              "host.prepublish.availability_date_required",
              "Choose the first date guests can check in.",
            ).text
          : ""
        : parsePlanDate(startDate) === null
          ? i18n.resolve(
              "host.prepublish.availability_date_invalid",
              "That isn't a valid date.",
            ).text
          : compareYmd(startDate, today) < 0
            ? i18n.resolve(
                "host.prepublish.availability_date_past",
                "That date has already passed. Choose today or a later date.",
              ).text
            : "";

  const unanswered = showError && mode === null;
  const blockedNights = blockedNightsCount(plan.blocks);
  const openNights = blockedNightsCount(plan.openDates);

  const choices: {
    value: "now" | "from" | "selected";
    icon: LucideIcon;
    label: string;
    description: string;
  }[] = [
    {
      value: "now",
      icon: CalendarCheck,
      label: i18n.resolve("host.prepublish.availability_now", "Available now").text,
      description: i18n.resolve(
        "host.prepublish.availability_now_hint",
        "Guests can request stays starting today.",
      ).text,
    },
    {
      value: "from",
      icon: CalendarClock,
      label: i18n.resolve(
        "host.prepublish.availability_from",
        "Available from a specific date",
      ).text,
      description: i18n.resolve(
        "host.prepublish.availability_from_hint",
        "Choose the first date guests can check in.",
      ).text,
    },
    {
      value: "selected",
      icon: CalendarRange,
      label: i18n.resolve(
        "host.prepublish.availability_selected",
        "Only on dates I open",
      ).text,
      description: i18n.resolve(
        "host.prepublish.availability_selected_hint",
        "All dates stay closed until you open a bookable range.",
      ).text,
    },
  ];

  return (
    <div className="space-y-3.5 md:space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight md:text-2xl">
          <Tx
            k="host.prepublish.availability_start_title"
            source="When can guests book?"
          />
        </h2>
        {/* Scoped to "the dates" on purpose: the check-in times below are on this
            screen too, and the calendar is not where those are changed. */}
        <p className="mt-1 text-xs text-muted-foreground md:text-sm">
          <Tx
            k="host.prepublish.availability_start_hint"
            source="This decides when your listing starts taking booking requests. You can change the dates any time from your calendar."
          />
        </p>
      </div>

      {/* Native radios: arrow-key navigation, the group label and the checked state all
          come free and correct, where a custom widget would have to re-earn each one. */}
      <fieldset
        className="space-y-2.5"
        aria-describedby={unanswered ? AVAILABILITY_START_ERROR_ID : undefined}
      >
        <legend className="sr-only">
          {
            i18n.resolve(
              "host.prepublish.availability_start_title",
              "When can guests book?",
            ).text
          }
        </legend>

        {choices.map(({ value, icon: Icon, label, description }) => {
          const checked = mode === value;
          return (
            // A div, not a label: the date field lives inside this card, and a label
            // may not contain another label or a second form control. The label below
            // covers the whole non-interactive area instead, so clicking the card still
            // selects the radio while the date field stays independently operable.
            <div
              key={value}
              className={cn(
                "rounded-xl border transition-all",
                "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
                checked
                  ? "border-primary bg-primary/[0.06] shadow-sm"
                  : "border-border/70 bg-card hover:border-primary/40 hover:bg-muted/30",
                unanswered && "border-destructive/60",
              )}
            >
              <input
                type="radio"
                id={`${fieldId}-${value}`}
                name="availabilityStartMode"
                value={value}
                checked={checked}
                onChange={() => selectMode(value)}
                className="sr-only"
              />
              <label
                htmlFor={`${fieldId}-${value}`}
                className="flex min-h-14 cursor-pointer items-start gap-3 p-3 md:gap-3"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    checked ? "border-primary" : "border-muted-foreground/40",
                  )}
                >
                  {checked && <span className="size-2.5 rounded-full bg-primary" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <Icon
                      className={cn(
                        "size-4 shrink-0",
                        checked ? "text-primary" : "text-muted-foreground",
                      )}
                      aria-hidden="true"
                    />
                    <span className="text-sm font-semibold md:text-base">{label}</span>
                  </span>
                  <span className="mt-1 block text-xs leading-snug text-muted-foreground md:text-sm">
                    {description}
                  </span>
                </span>
              </label>

              {/* Revealed under its own choice so the date belongs to the option that
                  asked for it, rather than floating below both. Indented to line up with
                  the text above it, past the radio dot. */}
              {value === "from" && checked && (
                <div className="px-3 pb-3 pl-11">
                  <Label
                    htmlFor={dateFieldId}
                    className="text-xs font-medium"
                  >
                    <Tx
                      k="host.prepublish.availability_date_label"
                      source="First date guests can check in"
                    />
                  </Label>
                  <button
                    id={dateFieldId}
                    type="button"
                    onClick={() => setDatePickerOpen(true)}
                    aria-describedby={dateError ? dateErrorId : undefined}
                    className={cn(
                      "mt-1.5 flex h-11 w-full max-w-64 items-center gap-2 rounded-md border bg-card px-3 text-left text-sm shadow-xs transition-colors hover:border-primary/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      dateError && "border-destructive",
                    )}
                  >
                    <CalendarRange className="size-4 shrink-0 text-primary" />
                    <span className={cn(!startDate && "text-muted-foreground")}>
                      {startDate
                        ? formatStartDate(startDate, locale)
                        : i18n.resolve(
                            "host.prepublish.availability_date_required",
                            "Choose the first date guests can check in.",
                          ).text}
                    </span>
                  </button>
                  {dateError && (
                    <p
                      id={dateErrorId}
                      role="alert"
                      className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-destructive"
                    >
                      <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                      {dateError}
                    </p>
                  )}
                  {!dateError && startDate !== "" && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {
                        interpolate(
                          i18n.resolve(
                            "host.prepublish.availability_date_explainer",
                            "{date} is the first night guests can book. Earlier nights stay blocked.",
                          ),
                          { date: formatStartDate(startDate, locale) },
                        ).text
                      }
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {unanswered && (
          <p
            id={AVAILABILITY_START_ERROR_ID}
            role="alert"
            className="flex items-center gap-1.5 text-xs font-medium text-destructive"
          >
            <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
            <Tx
              k="host.prepublish.availability_required"
              source="Choose when guests can start booking."
            />
          </p>
        )}
      </fieldset>

      {/* Separate and optional on purpose: a start date and blocked dates are not
          alternatives. Opening on 1 September and taking a week off later that month is
          one host doing two things, so this never disables or replaces the choice above. */}
      {mode !== null ? <button
        type="button"
        onClick={onOpenBlockingCalendar}
        className={cn(
          "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all",
          mode === "selected" && openNights === 0
            ? "border-primary/50 bg-primary/[0.05] shadow-sm hover:bg-primary/[0.08]"
            : "border-border/70 bg-card hover:border-primary/40 hover:bg-muted/30",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
            (mode === "selected" ? openNights : blockedNights) > 0
              ? "bg-primary text-primary-foreground"
              : "bg-primary/10 text-primary",
          )}
        >
          {mode === "selected" ? (
            <CalendarRange className="size-4" />
          ) : (
            <CalendarOff className="size-4" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-sm font-semibold md:text-base">
              {mode === "selected" ? (
                openNights > 0 ? (
                  <Tx
                    k="host.prepublish.edit_open_dates"
                    source="Edit open dates"
                  />
                ) : (
                  <Tx
                    k="host.prepublish.open_dates_now"
                    source="Open dates now"
                  />
                )
              ) : (
                <Tx
                  k="host.prepublish.block_dates_title"
                  source="Block specific dates"
                />
              )}
            </span>
          </span>
          <span className="mt-1 block text-xs leading-snug text-muted-foreground md:text-sm">
            {mode === "selected"
              ? openNights > 0
                ? `${openNights} ${openNights === 1 ? "night" : "nights"} open`
                : i18n.resolve(
                    "host.prepublish.open_dates_later_warning",
                    "No dates are open. Your listing will be live but hidden from search until you open some.",
                  ).text
              : blockedNights > 0
              ? `${blockedNights} ${blockedNights === 1 ? "night" : "nights"} blocked`
              : i18n.resolve(
                  "host.prepublish.block_dates_hint",
                  "Block dates when you will use the property yourself, perform maintenance, or cannot host.",
                ).text}
          </span>
        </span>
      </button> : null}

      {stayTimes}

      <Dialog open={datePickerOpen} onOpenChange={setDatePickerOpen}>
        <DialogContent
          variant="sheet"
          className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 md:max-w-[48rem]"
        >
          <DialogHeader className="shrink-0 border-b px-6 py-4 pr-14">
            <DialogTitle>
              <Tx
                k="host.prepublish.availability_date_label"
                source="First date guests can check in"
              />
            </DialogTitle>
            <DialogDescription>
              <Tx
                k="host.prepublish.availability_from_hint"
                source="Choose the first date guests can check in."
              />
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-hidden">
            <DateRangeCalendarStep
              active={datePickerOpen}
              fitViewport
              pagedDesktopMonthCount={2}
              selected={
                localDate(startDate)
                  ? { from: localDate(startDate), to: undefined }
                  : undefined
              }
              onRangeChange={chooseCalendarDate}
              dayVariant="availability"
              locale={locale}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type PlanEditor =
  | { kind: "price"; range: PrePublishRange; initialRate?: number }
  | { kind: "offer"; range: PrePublishRange; index?: number };

type PlanRow = {
  key: string;
  kind: "block" | "open" | "price" | "offer";
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
  onSelectionChange,
  actionRef,
}: {
  task: PrePublishTask;
  plan: PrePublishPlan;
  onChange: (plan: PrePublishPlan) => void;
  currency: string;
  baseNightlyRate: string;
  /** Free cleaning is not offerable when there's no cleaning fee to waive — the same
   *  rule the launch offer on the previous step follows. */
  hasCleaningFee: boolean;
  /** The wizard's bottom bar turns into the editor's opener while dates are
   *  selected, so it has to hear about the selection the calendar owns. */
  onSelectionChange?: (selection: PrePublishRange | null) => void;
  /** …and needs a way to open that editor, which is state in here. */
  actionRef?: React.RefObject<PrePublishTaskActions | null>;
}) {
  const i18n = useI18n();
  const { locale, resolve } = i18n;
  const nightsLabel = useNightsLabel();
  const [range, setRange] = React.useState<DateRange | undefined>();
  const [editor, setEditor] = React.useState<PlanEditor | null>(null);
  const opensSelectedDates = plan.availabilityStart?.mode === "selected";

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
  const openedDates = React.useMemo(() => {
    const days = new Set<PlanDate>();
    for (const window of plan.openDates) {
      for (const day of eachPlanDate(window.startDate, window.endDate)) {
        days.add(day);
      }
    }
    return days;
  }, [plan.openDates]);

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
  const selectionAlreadyOpen =
    opensSelectedDates &&
    selectionNights > 0 &&
    selectionDays.every((day) => openedDates.has(day));
  function openEditor() {
    if (!selection) return;
    setEditor(
      task === "pricing"
        ? { kind: "price", range: selection }
        : { kind: "offer", range: selection },
    );
  }

  const selectionStart = selection?.startDate ?? null;
  const selectionEnd = selection?.endDate ?? null;
  React.useEffect(() => {
    onSelectionChange?.(
      selectionStart && selectionEnd
        ? { startDate: selectionStart, endDate: selectionEnd }
        : null,
    );
  }, [onSelectionChange, selectionStart, selectionEnd]);

  // The screen unmounts with the wizard's Back; the bar it was feeding does not.
  React.useEffect(() => () => onSelectionChange?.(null), [onSelectionChange]);

  function commit(next: Partial<PrePublishPlan>) {
    onChange({ ...plan, ...next });
    setRange(undefined);
  }

  function commitAvailabilitySelection() {
    if (!selection) return;
    if (opensSelectedDates) {
      // A selection sitting entirely inside what is already open means the host is
      // taking those nights back, not opening them twice — the footer says so too.
      if (selectionAlreadyOpen) {
        closeDates(selectionDays);
        return;
      }
      commit({ openDates: groupDates([...openedDates, ...selectionDays]) });
    } else {
      commit({ blocks: groupDates([...blockedDates, ...selectionDays]) });
    }
  }

  // Refreshed after every render rather than through a dependency list: both actions
  // close over the current selection, and a stale handle would change the wrong dates.
  React.useEffect(() => {
    if (!actionRef) return;
    actionRef.current = {
      commitSelection:
        task === "availability" ? commitAvailabilitySelection : openEditor,
      clearSelection: () => setRange(undefined),
    };
    return () => {
      actionRef.current = null;
    };
  });

  function makeDatesAvailable(days: PlanDate[]) {
    const remaining = new Set(blockedDates);
    for (const day of days) remaining.delete(day);
    commit({ blocks: groupDates(remaining) });
  }

  function closeDates(days: PlanDate[]) {
    const remaining = new Set(openedDates);
    for (const day of days) remaining.delete(day);
    commit({ openDates: groupDates(remaining) });
  }

  function savePrice(target: PrePublishRange, nightlyRate: number) {
    // Confirming the base rate is not a custom price. Writing it anyway would ring
    // those dates as overridden while the number stayed the same, and would pin them
    // to today's rate if the host later edits the base price.
    if (nightlyRate === baseRate) {
      clearPrice(target);
      return;
    }
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
          hint: opensSelectedDates
            ? resolve(
                "host.prepublish.open_availability_hint",
                "Pick the dates guests should be able to book. Every other date stays closed.",
              ).text
            : resolve(
                "host.prepublish.availability_hint",
                "Pick the dates you want to keep for yourself. Guests won't be able to book them.",
              ).text,
          emptyHint: opensSelectedDates
            ? resolve(
                "host.calendar.empty_hint_open",
                "Tap or drag across dates to open them.",
              ).text
            : resolve(
                "host.calendar.empty_hint_availability",
                "Tap or drag across dates to block them.",
              ).text,
          changesTitle: opensSelectedDates
            ? resolve("host.prepublish.changes_open", "Open dates").text
            : resolve("host.prepublish.changes_blocked", "Blocked dates").text,
          changesDescription: opensSelectedDates
            ? resolve(
                "host.prepublish.changes_open_hint",
                "The only dates guests will be able to book.",
              ).text
            : resolve(
                "host.prepublish.changes_blocked_hint",
                "Dates guests will not be able to book.",
              ).text,
          emptyLabel: opensSelectedDates
            ? resolve(
                "host.prepublish.open_empty",
                "No dates are open yet. Your listing will be live but hidden from search.",
              ).text
            : resolve(
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
      const ranges = opensSelectedDates ? plan.openDates : plan.blocks;
      return ranges.map((range, index) => ({
        key: `${opensSelectedDates ? "open" : "block"}-${range.startDate}-${range.endDate}-${index}`,
        kind: opensSelectedDates ? ("open" as const) : ("block" as const),
        startDate: range.startDate,
        endDate: range.endDate,
        label: opensSelectedDates
          ? resolve("host.calendar.legend_open", "Open").text
          : resolve("host.calendar.legend_blocked", "Blocked").text,
        detail: nightsLabel(rangeNights(range.startDate, range.endDate)),
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
      label: offerSummary(offer, i18n),
      detail: nightsLabel(rangeNights(offer.startDate, offer.endDate)),
    }));
  }, [baseRate, i18n, money, nightsLabel, opensSelectedDates, plan, resolve, task]);

  const primaryDetail =
    task === "availability"
      ? opensSelectedDates
        ? resolve(
            "host.prepublish.open_detail",
            "Only opened dates accept booking requests. You can close them again at any time.",
          ).text
        : resolve(
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
          toggleSelectedRange={task === "pricing"}
          locale={locale}
          dayMeta={(day) => {
            const key = planDateFromLocal(day);
            if (task === "availability") {
              return {
                // Closed dates use the hatch and say so; opened dates return to white
                // and get a quiet guest-facing label instead of a green-status look.
                sublabel: opensSelectedDates
                  ? openedDates.has(key)
                    ? resolve("host.calendar.day_available", "Available").text
                    : resolve("host.calendar.legend_blocked", "Blocked").text
                  : blockedDates.has(key)
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
                  ...(opensSelectedDates
                    ? {
                        openWindow: (day: Date) =>
                          openedDates.has(planDateFromLocal(day)),
                        closedDefault: (day: Date) =>
                          !openedDates.has(planDateFromLocal(day)),
                      }
                    : {
                        manualBlock: (day: Date) =>
                          blockedDates.has(planDateFromLocal(day)),
                      }),
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
            closedDefault:
              "bg-muted after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:bg-[repeating-linear-gradient(-45deg,rgba(15,23,42,0.09)_0,rgba(15,23,42,0.09)_4px,transparent_4px,transparent_8px)]",
            openWindow: "bg-card text-foreground",
            customPrice: "ring-2 ring-primary/40 ring-inset",
            promotion: "bg-amber-500/15",
          }}
        />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-5 py-2 text-xs text-muted-foreground md:text-[0.68rem]">
          {task === "availability" ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-[2px] bg-[repeating-linear-gradient(-45deg,rgba(15,23,42,0.18)_0,rgba(15,23,42,0.18)_2px,transparent_2px,transparent_4px)]" />
                <Tx k="host.calendar.legend_blocked" source="Blocked" />
              </span>
              {opensSelectedDates ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-[2px] border bg-card" />
                  <Tx k="host.calendar.legend_open" source="Open" />
                </span>
              ) : null}
              <span className="ml-auto font-medium">
                {selection
                  ? `${formatRange(selection.startDate, selection.endDate, locale)} · ${nightsLabel(selectionNights)}`
                  : meta.emptyHint}
              </span>
            </>
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

        {/* All three tools commit from the wizard footer. Pricing alone keeps this
            short explanation row because its next action opens a value editor. */}
        {task === "pricing" ? (
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
            <p className="text-center text-xs text-muted-foreground md:text-[0.65rem]">
              {primaryDetail}
            </p>
          </div>
          </div>
        ) : null}
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
                    : row.kind === "open"
                      ? UnlockKeyhole
                      : LockKeyhole;
              const typeLabel =
                row.kind === "price"
                  ? resolve("host.prepublish.type_price", "Price override").text
                  : row.kind === "offer"
                    ? resolve("host.prepublish.type_promotion", "Promotion").text
                    : resolve("host.prepublish.type_availability", "Availability")
                        .text;
              // Keep the row itself as the edit affordance. This leaves the mobile
              // row enough room for the date, price and the single destructive action.
              const openRow = () =>
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
                );
              const rowBody = (
                <>
                  <span className="shrink-0 text-sm font-medium whitespace-nowrap">
                    {compactRange(row.startDate, row.endDate, locale)}
                  </span>
                  <span className="hidden w-fit shrink-0 items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium sm:inline-flex md:text-[0.68rem]">
                    <Icon className="size-3.5" /> {typeLabel}
                  </span>
                  <span className="min-w-0 flex-1 truncate whitespace-nowrap text-sm">
                    <span className="font-medium">{row.label}</span>
                    <span className="hidden text-muted-foreground sm:inline">
                      {" · "}
                      {row.detail}
                    </span>
                  </span>
                </>
              );
              return (
                <div
                  key={row.key}
                  className="flex items-center gap-2 px-4 py-2.5 sm:gap-3 sm:px-5 sm:py-3.5"
                >
                  {row.kind === "block" || row.kind === "open" ? (
                    <span className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                      {rowBody}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={openRow}
                      aria-label={`${resolve("host.workspace.edit", "Edit").text} ${compactRange(row.startDate, row.endDate, locale)}`}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left transition-colors hover:text-primary sm:gap-3"
                    >
                      {rowBody}
                    </button>
                  )}
                  <span className="flex shrink-0 justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0"
                      title={
                        row.kind === "block"
                          ? resolve(
                              "host.calendar.make_available",
                              "Make available",
                            ).text
                          : row.kind === "open"
                            ? resolve("host.calendar.close_dates", "Close dates").text
                          : resolve("host.prepublish.remove", "Remove").text
                      }
                      aria-label={
                        row.kind === "block"
                          ? resolve(
                              "host.calendar.make_available",
                              "Make available",
                            ).text
                          : row.kind === "open"
                            ? resolve("host.calendar.close_dates", "Close dates").text
                          : resolve("host.prepublish.remove", "Remove").text
                      }
                      onClick={() => {
                        if (row.kind === "block") {
                          makeDatesAvailable(eachPlanDate(row.startDate, row.endDate));
                          return;
                        }
                        if (row.kind === "open") {
                          closeDates(eachPlanDate(row.startDate, row.endDate));
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
                      ) : row.kind === "open" ? (
                        <LockKeyhole className="size-3.5" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
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
  const i18n = useI18n();
  const { resolve } = i18n;
  const nightsLabel = useNightsLabel();
  const existingOffer =
    editor.kind === "offer" && editor.index !== undefined
      ? plan.offers[editor.index]
      : undefined;

  const [price, setPrice] = React.useState(
    String(editor.kind === "price" ? (editor.initialRate ?? baseRate) : baseRate),
  );
  const [roundPrice, setRoundPrice] = React.useState(true);
  /** The multiplier behind the chosen quick adjustment, or `null` once the host types
   *  their own figure. Kept so the rounding toggle can recompute from the exact
   *  percentage instead of re-rounding an already-rounded number — turning it off has
   *  to give back the €76.80, which is unrecoverable from the €77 in the field. */
  const [priceFactor, setPriceFactor] = React.useState<number | null>(null);
  /** A percentage and free cleaning are independent benefits here, exactly as they are
   *  on the launch offer and in the live calendar's promotion editor — an empty
   *  percentage with the switch on is a cleaning-only offer. */
  const [discount, setDiscount] = React.useState(
    existingOffer
      ? existingOffer.discountPercent > 0
        ? String(existingOffer.discountPercent)
        : ""
      : "15",
  );
  const [freeCleaning, setFreeCleaning] = React.useState(
    existingOffer?.freeCleaning ?? false,
  );

  const nights = rangeNights(editor.range.startDate, editor.range.endDate);
  const rangeText = `${formatRange(
    editor.range.startDate,
    editor.range.endDate,
    locale,
  )} · ${nightsLabel(nights)}`;

  const priceNumber = Number(price);
  const priceValid = Number.isFinite(priceNumber) && priceNumber > 0;
  const discountEmpty = discount.trim() === "";
  const discountNumber = discountEmpty ? 0 : Number(discount);
  const discountValid =
    Number.isInteger(discountNumber) &&
    discountNumber >= MIN_OFFER_PERCENT &&
    discountNumber <= MAX_OFFER_PERCENT;
  /** Free cleaning alone is a complete offer, so an empty percentage is allowed — but a
   *  typed one still has to be a real percentage. */
  const offerValid = discountValid || (discountEmpty && freeCleaning);

  /** The shared `money` drops cents, which is right everywhere it reads back a price
   *  but wrong on the chips: with rounding off they claimed "€77" for the €76.80 they
   *  put in the field. Chips show the figure they actually apply. */
  const chipMoney = React.useCallback(
    (value: number) =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
      }).format(value),
    [currency, locale],
  );

  /** One place decides what a price looks like in the field, so the chips, the toggle
   *  and the typed value can never disagree about it. */
  const applyRounding = React.useCallback(
    (value: number, round: boolean) =>
      round ? roundToCleanPrice(value) : Number(value.toFixed(2)),
    [],
  );

  const setPriceFromPercent = (percent: number) => {
    const factor = 1 + percent / 100;
    setPriceFactor(factor);
    setPrice(String(applyRounding(baseRate * factor, roundPrice)));
  };

  /** The handful of adjustments hosts actually reach for, as labels under the track —
   *  the slider covers everything between them, and typing covers everything past. */
  const priceStops = React.useMemo(
    () => [
      { label: "−50%", percent: -50 },
      { label: "−20%", percent: -20 },
      { label: resolve("host.prepublish.rate_base", "Base").text, percent: 0 },
      { label: "+20%", percent: 20 },
      { label: "+50%", percent: 50 },
      { label: "+100%", percent: 100 },
    ],
    [resolve],
  );

  /** What the percentage side of the field shows. A chosen adjustment answers for
   *  itself — rounding €88 up to €90 must not report itself back as +13% — while a
   *  typed amount is measured against the normal price. */
  const pricePercent =
    baseRate > 0
      ? priceFactor !== null
        ? Math.round((priceFactor - 1) * 100)
        : Number.isFinite(priceNumber)
          ? Math.round((priceNumber / baseRate - 1) * 100)
          : 0
      : null;

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
    if (!offerValid) return;
    onSaveOffer(
      {
        ...editor.range,
        discountPercent: discountValid ? discountNumber : 0,
        // The switch is disabled without a cleaning fee, but a host who turned it on
        // and then cleared the fee should not carry a benefit that cannot apply.
        freeCleaning: freeCleaning && hasCleaningFee,
      },
      editor.kind === "offer" ? editor.index : undefined,
    );
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        variant="sheet"
        // The sheet hugs its content now that the price fits in one card — nothing
        // here needs a tall panel or a scroll to reach. Focus stays off the amount
        // field: it is one of two ways in, and autofocusing it threw the keyboard up
        // over the very buttons the host came for.
        className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 md:h-auto md:max-h-[90dvh] md:max-w-[34rem]"
        onOpenAutoFocus={
          isPrice
            ? (event) => {
                event.preventDefault();
                // Focus still has to land inside the sheet, or the focus trap has
                // nothing to hold and a keyboard user is stranded on the page
                // behind it — the panel itself takes it instead of the input.
                const panel = event.currentTarget;
                if (panel instanceof HTMLElement) {
                  panel.tabIndex = -1;
                  panel.focus();
                }
              }
            : undefined
        }
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
            <div className="flex min-h-full flex-col space-y-4 p-6">
              {/* The percentage and the money it comes to, side by side on one line:
                  either one can be typed, the slider moves both, and nothing has to
                  scroll sideways to be reached. */}
              <div className="rounded-2xl border-2 border-primary/30 bg-primary/[0.035] p-4 shadow-sm">
                <Label
                  htmlFor={
                    baseRate > 0
                      ? "prepublish-nightly-rate-percent"
                      : "prepublish-nightly-rate-amount"
                  }
                  className="text-sm font-semibold"
                >
                  {baseRate > 0 ? (
                    <Tx
                      k="host.prepublish.rate_quick_label"
                      source="Adjust your normal price"
                    />
                  ) : (
                    <Tx
                      k="host.prepublish.rate_label"
                      source="Price per night for these dates"
                    />
                  )}
                </Label>
                <PercentAmountField
                  className="mt-2"
                  id="prepublish-nightly-rate"
                  percent={pricePercent}
                  amount={priceValid ? priceNumber : null}
                  onPercentChange={setPriceFromPercent}
                  onAmountChange={(value) => {
                    // A typed figure is nobody's percentage of the base rate any
                    // more, so the toggle stops recomputing and just rounds it.
                    setPriceFactor(null);
                    setPrice(String(value));
                  }}
                  min={-50}
                  max={100}
                  grow={50}
                  limitMin={-95}
                  limitMax={900}
                  stops={priceStops}
                  currency={currency}
                  hidePercent={baseRate <= 0}
                  percentLabel={
                    resolve(
                      "host.prepublish.rate_percent_label",
                      "Percentage of your normal price",
                    ).text
                  }
                  amountLabel={
                    resolve(
                      "host.prepublish.rate_label",
                      "Price per night for these dates",
                    ).text
                  }
                />
                <p className="mt-3 text-sm text-muted-foreground md:text-xs">
                  <Tx
                    k="host.prepublish.rate_pair_hint"
                    source="Type a percentage or an exact amount — the other one follows."
                  />
                </p>
              </div>

              <OptionToggle
                checked={roundPrice}
                label={
                  resolve(
                    "host.prepublish.round_clean_label",
                    "Round to the closest round number",
                  ).text
                }
                description={
                  resolve(
                    "host.prepublish.round_hint",
                    "Keeps guest-facing prices clean and easy to scan.",
                  ).text
                }
                onChange={() => {
                  const next = !roundPrice;
                  setRoundPrice(next);
                  // Both ways, and straight away: a switch that leaves the number
                  // above it stale is a switch nobody can tell they have flipped.
                  const source =
                    priceFactor !== null && baseRate > 0
                      ? baseRate * priceFactor
                      : priceNumber;
                  if (Number.isFinite(source) && source > 0) {
                    setPrice(String(applyRounding(source, next)));
                  }
                }}
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

              <div className={cn(STICKY_FOOTER, "mt-auto")}>
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
                        {chipMoney(priceValid ? priceNumber : 0)}
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
              {/* One decision, one card: the percentage, what a night comes to with
                  it, and a track between the offers hosts pick most. */}
              <div className="rounded-2xl border-2 border-primary/30 bg-primary/[0.035] p-4 shadow-sm">
                <Label
                  htmlFor="prepublish-offer-discount-percent"
                  className="text-sm font-semibold"
                >
                  <Tx
                    k="host.prepublish.offer_type_label"
                    source="What do guests get?"
                  />
                </Label>
                <PercentAmountField
                  className="mt-2"
                  id="prepublish-offer-discount"
                  percent={discountEmpty ? null : discountNumber}
                  amount={
                    baseRate > 0 && discountValid
                      ? baseRate * (1 - discountNumber / 100)
                      : null
                  }
                  onPercentChange={(percent) =>
                    setDiscount(String(Math.round(percent)))
                  }
                  onPercentClear={() => setDiscount("")}
                  onAmountChange={(value) => {
                    if (baseRate <= 0) return;
                    const percent = Math.round((1 - value / baseRate) * 100);
                    setDiscount(
                      String(
                        Math.min(
                          MAX_OFFER_PERCENT,
                          Math.max(MIN_OFFER_PERCENT, percent),
                        ),
                      ),
                    );
                  }}
                  min={MIN_OFFER_PERCENT}
                  max={MAX_OFFER_PERCENT}
                  stops={OFFER_PERCENT_STOPS}
                  currency={currency}
                  hideAmount={baseRate <= 0}
                  percentLabel={
                    resolve("host.prepublish.discount_label", "Discount").text
                  }
                  amountLabel={
                    resolve(
                      "host.prepublish.offer_night_label",
                      "Price a guest pays per night",
                    ).text
                  }
                />
                <p className="mt-3 text-sm text-muted-foreground md:text-xs">
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
              </div>

              {/* The same pair of controls the launch offer on the previous step shows:
                  a percentage and a switch, either or both. */}
              <OptionToggle
                checked={freeCleaning && hasCleaningFee}
                label={
                  i18n.resolve("host.prepublish.offer_cleaning", "Free cleaning")
                    .text
                }
                description={
                  hasCleaningFee
                    ? resolve(
                        "host.prepublish.offer_cleaning_short",
                        "The cleaning fee is waived.",
                      ).text
                    : i18n.resolve(
                        "host.prepublish.offer_cleaning_hint",
                        "Free cleaning needs a cleaning fee to waive — add one on the Pricing step.",
                      ).text
                }
                disabled={!hasCleaningFee}
                onChange={() => setFreeCleaning((current) => !current)}
              />

              <OfferPreview
                headline={offerSummary(
                  {
                    ...editor.range,
                    discountPercent: discountValid ? discountNumber : 0,
                    freeCleaning: freeCleaning && hasCleaningFee,
                  },
                  i18n,
                )}
              >
                {discountValid && baseRate > 0 ? (
                  <p className={OFFER_PREVIEW_NOTE}>
                    {
                      interpolate(
                        resolve(
                          "host.prepublish.offer_estimated",
                          "About {rate} a night on these dates.",
                        ),
                        {
                          rate: money(baseRate * (1 - discountNumber / 100)),
                        },
                      ).text
                    }
                  </p>
                ) : null}
                {/* Guidance for the percentage field, so it goes quiet on an offer that
                    is free cleaning alone. */}
                {discountEmpty && freeCleaning ? null : (
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
                )}
              </OfferPreview>

              <div className={cn(STICKY_FOOTER, "flex flex-wrap justify-end gap-2")}>
                <Button type="button" variant="outline" onClick={onClose}>
                  <Tx k="host.calendar.cancel" source="Cancel" />
                </Button>
                <Button type="button" disabled={!offerValid} onClick={submit}>
                  <Tx k="host.prepublish.add_promotion" source="Add promotion" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
