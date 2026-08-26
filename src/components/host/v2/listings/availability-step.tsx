"use client";

import { useState } from "react";
import {
  CalendarCheck,
  CalendarClock,
  CalendarRange,
  type LucideIcon,
} from "lucide-react";
import { Tx, useI18n } from "@/lib/i18n/client";
import {
  MIN_STAY_MIN,
  availabilityStepIssue,
  clampMinStay,
  type AvailabilityMode,
  type AvailabilityStepIssue,
} from "@/lib/host/v2/listing-availability-step";
import type { ListingSpaceTypeValue } from "@/lib/types/listing-space-type";
import type { PropertyTypeOption } from "@/lib/types/property-type";
import { cn } from "@/lib/utils";
import { DatePickerField } from "@/components/shared/date-picker-field";
import { StepperColumn } from "@/components/host/v2/calendar/workbench-ui";
import { ListingFlowFooter } from "./listing-flow-footer";
import { useHostStartDraft } from "./host-start-draft-provider";
import { EMPTY_PRE_PUBLISH_PLAN } from "@/lib/types/listing-prepublish-plan";

/**
 * Phase two: when the place starts taking bookings.
 *
 * The smallest version of a question the host will meet again in full. The calendar
 * editor is where dates are opened, blocked, priced and given their own minimums; this
 * screen asks only for the answer that decides whether a freshly published listing is
 * bookable at all, plus the one stay rule that applies to every date. Everything else
 * stays where it already works — the hint under the heading says so.
 *
 * The three answers and their validity come from `listing-availability-step`, a thin
 * form layer over the canonical `listing-availability-start` module the pre-publish
 * gate uses. The vocabulary is deliberately identical: "now", "from" with a first
 * bookable night, and "selected", meaning every date stays closed until the host opens
 * one. So is most of the copy — the same catalog keys the pre-publish screen resolves,
 * so a host cannot be told two different things about the same choice.
 *
 * UI-only, like every screen in this flow: nothing is saved, no draft is created, and
 * the flow's state still travels in the URL.
 */
export function AvailabilityStep({
  propertyType,
  spaceType,
  today,
  initialMode = null,
  initialStartDate = "",
  initialMinNights = MIN_STAY_MIN,
}: {
  propertyType: PropertyTypeOption;
  spaceType: ListingSpaceTypeValue;
  /** Today as a civil date in the marketplace's zone, from the server — so the field's
   *  floor and the "that date has passed" rule agree with the publish gate. */
  today: string;
  /** Test seams, and what lets every state of this screen render statically. */
  initialMode?: AvailabilityMode | null;
  initialStartDate?: string;
  initialMinNights?: number;
}) {
  const i18n = useI18n();
  const { data, save } = useHostStartDraft();
  const query = `propertyType=${encodeURIComponent(propertyType.value)}&spaceType=${encodeURIComponent(spaceType)}`;

  const storedAvailability = data.prePublishPlan?.availabilityStart;
  const [mode, setMode] = useState<AvailabilityMode | null>(storedAvailability?.mode ?? initialMode);
  const [startDate, setStartDate] = useState(storedAvailability?.mode === "from" ? storedAvailability.startDate : initialStartDate);
  const [minNights, setMinNights] = useState(clampMinStay(Number(data.minNights ?? initialMinNights)));
  /** The error appears once the host has tried to move on, not while they are still
   *  reading the three options. */
  const [showError, setShowError] = useState(false);

  const issue = availabilityStepIssue({ mode, startDate }, today);
  const dateIssue = issue === "UNANSWERED" ? undefined : issue;
  const errorId = "listing-flow-availability-error";
  const dateErrorId = "listing-flow-availability-date-error";
  const message = showError && issue ? issueText(i18n, issue) : null;

  const choices: {
    value: AvailabilityMode;
    icon: LucideIcon;
    label: string;
    hint: string;
  }[] = [
    {
      value: "now",
      icon: CalendarCheck,
      label: i18n.resolve("host.prepublish.availability_now", "Available now").text,
      hint: i18n.resolve(
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
      hint: i18n.resolve(
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
      // The one new sentence on this screen: the pre-publish wording assumes a calendar
      // the host is already looking at, where here the point is that this can wait
      // until after publishing.
      hint: i18n.resolve(
        "host.v2.availability.selected_hint",
        "Everything stays closed until you open dates in your calendar later.",
      ).text,
    },
  ];

  return (
    <>
      <main className="flex min-h-0 flex-1 px-5 pb-28 pt-6 md:items-center md:px-8 md:pb-24 md:pt-2">
        <div className="mx-auto w-full max-w-[39rem]">
          <h1 className="font-heading text-[1.75rem] font-semibold tracking-[-0.03em] text-slate-950 sm:text-[2rem]">
            <Tx
              k="host.prepublish.availability_start_title"
              source="When can guests book?"
            />
          </h1>
          <p className="mt-1.5 text-sm leading-6 text-slate-500">
            <Tx
              k="host.prepublish.availability_start_hint"
              source="This decides when your listing starts taking booking requests. You can change the dates any time from your calendar."
            />
          </p>

          {/* Native radios: arrow-key navigation, the group label and the checked state
              all come free and correct, where a custom widget re-earns each one. */}
          <fieldset
            className="mt-[clamp(1rem,3vh,1.75rem)] space-y-2.5"
            aria-describedby={message && issue === "UNANSWERED" ? errorId : undefined}
          >
            <legend className="sr-only">
              {
                i18n.resolve(
                  "host.prepublish.availability_start_title",
                  "When can guests book?",
                ).text
              }
            </legend>

            {choices.map(({ value, icon: Icon, label, hint }) => {
              const checked = mode === value;
              return (
                // A div, not a label: the date field lives inside this card, and a
                // label may not contain a second form control.
                <div
                  key={value}
                  className={cn(
                    "rounded-2xl border bg-white transition-colors focus-within:ring-2 focus-within:ring-slate-400 focus-within:ring-offset-2",
                    checked
                      ? "border-slate-950 bg-slate-50"
                      : "border-slate-200 hover:border-slate-400",
                  )}
                >
                  <input
                    type="radio"
                    id={`listing-flow-availability-${value}`}
                    name="availabilityStartMode"
                    value={value}
                    checked={checked}
                    onChange={() => setMode(value)}
                    className="sr-only"
                  />
                  <label
                    htmlFor={`listing-flow-availability-${value}`}
                    className="flex min-h-14 cursor-pointer items-start gap-3 p-4"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors",
                        checked ? "border-slate-950" : "border-slate-300",
                      )}
                    >
                      {checked ? (
                        <span className="size-2.5 rounded-full bg-slate-950" />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <Icon
                          className={cn(
                            "size-4 shrink-0",
                            checked ? "text-slate-950" : "text-slate-400",
                          )}
                          strokeWidth={1.8}
                          aria-hidden
                        />
                        <span className="font-heading text-base font-semibold text-slate-950">
                          {label}
                        </span>
                      </span>
                      <span className="mt-1 block text-[0.8125rem] leading-5 text-slate-500">
                        {hint}
                      </span>
                    </span>
                  </label>

                  {/* Revealed under its own choice, indented past the radio dot, so the
                      date belongs to the option that asked for it. */}
                  {value === "from" && checked ? (
                    <div className="px-4 pb-4 pl-12">
                      <label
                        htmlFor="listing-flow-availability-date"
                        className="block text-xs font-medium text-slate-600"
                      >
                        <Tx
                          k="host.prepublish.availability_date_label"
                          source="First date guests can check in"
                        />
                      </label>
                      <DatePickerField
                        id="listing-flow-availability-date"
                        // The floor the publish gate applies, applied in the field too,
                        // so a past date is awkward to pick rather than only refused.
                        min={today}
                        value={startDate}
                        onChange={setStartDate}
                        invalid={Boolean(showError && dateIssue)}
                        describedBy={
                          showError && dateIssue ? dateErrorId : undefined
                        }
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </fieldset>

          {/* One live region for the unanswered case and the date cases alike: only one
              of them can be true at a time. Always in the tree, so it is there to
              announce into rather than being created with something to say. */}
          <p
            id={issue === "UNANSWERED" ? errorId : dateErrorId}
            role="alert"
            className="mt-2 text-sm text-rose-600 empty:hidden"
          >
            {message}
          </p>

          {/* The one stay rule that is not a date. Same control, bounds and words as the
              calendar editor's minimum stay, so the number a host sets here is the
              number they meet there. */}
          <div className="mt-[clamp(0.75rem,2.5vh,1.5rem)] flex items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4">
            <div className="min-w-0">
              <p className="font-heading text-base font-semibold text-slate-950">
                <Tx k="host.v2.calendar.promotion_minimum" source="Minimum stay" />
              </p>
              <p className="mt-1 text-[0.8125rem] leading-5 text-slate-500">
                <Tx
                  k="host.v2.availability.min_nights_hint"
                  source="Applies to every date. You can set different minimums per date later."
                />
              </p>
            </div>
            <StepperColumn
              label={
                i18n.resolve("host.v2.calendar.promotion_minimum", "Minimum stay").text
              }
              caption={
                minNights <= MIN_STAY_MIN
                  ? i18n.resolve("host.v2.calendar.listing.any_length", "any length").text
                  : i18n.resolve(
                      "host.v2.calendar.listing.nights_minimum",
                      "nights minimum",
                    ).text
              }
              value={minNights}
              min={MIN_STAY_MIN}
              // The ceiling is `clampMinStay`'s, not a disabled button's: the control
              // disables both arrows at once, and a host at the cap still needs the
              // way back down.
              decrementLabel={
                i18n.resolve("host.v2.calendar.promotion_fewer_nights", "Fewer nights")
                  .text
              }
              incrementLabel={
                i18n.resolve("host.v2.calendar.promotion_more_nights", "More nights").text
              }
              onChange={(next) => setMinNights(clampMinStay(next))}
            />
          </div>
        </div>
      </main>

      <ListingFlowFooter
        backHref={`/host/start/payment-arrangements?${query}`}
        // Next is a link only once the answer holds; until then it is a button that
        // reveals what is missing, so the host is never navigated away from an
        // unanswered question and never meets a dead disabled control either.
        {...(issue
          ? { onNext: () => {
              setShowError(true);
              // The unanswered question first, then the date box it opens — whichever
              // the host still has to deal with.
              const target =
                issue === "UNANSWERED"
                  ? "listing-flow-availability-now"
                  : "listing-flow-availability-date";
              document.getElementById(target)?.focus();
            } }
          : { nextHref: `/host/start/house-rules?${query}`, onNext: async () => {
              const availabilityStart = mode === "from" ? { mode, startDate } : { mode: mode! };
              const prePublishPlan = { ...(data.prePublishPlan ?? EMPTY_PRE_PUBLISH_PLAN), availabilityStart };
              if (await save({ prePublishPlan, minNights: String(minNights), currentStepId: "specialOffer" })) {
                window.location.assign(`/host/start/house-rules?${query}`);
              }
            } })}
        phaseOneProgress={100}
        phaseTwoProgress={100}
        phaseThreeProgress={40}
        nextLabel="Next"
      />
    </>
  );
}

function issueText(
  i18n: ReturnType<typeof useI18n>,
  issue: AvailabilityStepIssue,
): string {
  switch (issue) {
    case "UNANSWERED":
      return i18n.resolve(
        "host.prepublish.availability_required",
        "Choose when guests can start booking.",
      ).text;
    case "MISSING_DATE":
      return i18n.resolve(
        "host.prepublish.availability_date_required",
        "Choose the first date guests can check in.",
      ).text;
    case "INVALID_DATE":
      return i18n.resolve(
        "host.prepublish.availability_date_invalid",
        "That isn't a valid date.",
      ).text;
    case "PAST_DATE":
      return i18n.resolve(
        "host.prepublish.availability_date_past",
        "That date has already passed. Choose today or a later date.",
      ).text;
  }
}
