"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { interpolate, useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/shared/select-field";
import {
  setListingBookingMode,
  setListingChangeoverWeekday,
  setListingStayLimits,
} from "@/lib/actions/fixed-stay.actions";
import type {
  HostCalendarListing,
  HostCalendarListingContext,
} from "@/lib/host/v2/calendar-types";
import {
  CHANGEOVER_WEEKDAY_CHOICES,
  statedStayCap,
  weeklyStayWeekRange,
  type ChangeoverWeekdayName,
} from "@/lib/utils/weekly-stay";
import { StepperColumn } from "@/components/host/v2/calendar/workbench-ui";
import { FixedStaySyncWarning } from "@/components/host/v2/calendar/booking-method-editor";
import { useUnsavedNavigationGuard } from "@/lib/host/use-unsaved-navigation-guard";

/**
 * Booking rules: when and how a guest may book, in one editable place.
 *
 * This is the second half of the split the Availability page is built around. The
 * section above it owns how a future date *starts out*; this one owns what a guest may
 * do with the dates that are open — which way the listing sells, how short a stay it
 * will take, how long a one, and (for a weekly listing) the day the weeks turn over.
 *
 * They are together because they are one decision. A host setting a four-week maximum
 * on a Saturday-changeover listing is answering a single question about how their
 * property is let, and answering it across three screens is how the answers end up
 * disagreeing. They are *here* rather than on Pricing because none of them is an
 * amount: Pricing is only about money, and a rule about stay length is not a price.
 *
 * Everything below writes through the same three server actions the Calendar used to
 * call, which re-check ownership and re-validate inside their own transaction. The
 * Calendar now shows these values and links here; nothing else edits them.
 *
 * There is deliberately no stay-length menu. A host who wants only fortnights sets a
 * 14-night minimum; one who wants at most four weeks sets a 28-night maximum. The weeks
 * a guest can then pick fall out of those two numbers and the changeover day, so no
 * list of offered lengths is stored, configured, or shown.
 */

/** The two ways a listing can sell, as `Listing.bookingMode` stores them. */
type BookingMode = "FLEXIBLE" | "FIXED_STAYS";

/** English source strings for the seven days; the catalog carries the translations. */
const WEEKDAY_SOURCE: Record<ChangeoverWeekdayName, string> = {
  MONDAY: "Monday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday",
  FRIDAY: "Friday",
  SATURDAY: "Saturday",
  SUNDAY: "Sunday",
};

/**
 * One of the two ways to sell, as a real radio.
 *
 * Native input behind a full-size label: arrow-key navigation between the two, the
 * checked state announced, and the whole card a hit target — all from the platform
 * rather than from ARIA this file would have to keep correct.
 */
function MethodChoice({
  id,
  name,
  checked,
  disabled,
  title,
  description,
  onSelect,
}: {
  id: string;
  name: string;
  checked: boolean;
  disabled: boolean;
  title: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <label
      htmlFor={id}
      data-booking-method-choice={id}
      data-selected={checked ? "true" : "false"}
      className={cn(
        "flex min-w-0 items-start gap-3 rounded-xl border p-4 transition-colors",
        // The card is the thing a sighted keyboard user is aiming at, so the ring goes
        // round the card rather than leaving the native radio's much smaller outline to
        // carry the focus on its own.
        "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-slate-900",
        disabled
          ? "cursor-not-allowed border-slate-200 opacity-60"
          : checked
            ? "cursor-pointer border-slate-900 bg-slate-50"
            : "cursor-pointer border-slate-200 hover:bg-slate-50",
      )}
    >
      <input
        id={id}
        type="radio"
        name={name}
        value={id}
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
        className="mt-0.5 size-4 shrink-0 accent-slate-900"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-900">{title}</span>
        <span className="mt-0.5 block text-sm leading-6 text-slate-600">
          {description}
        </span>
      </span>
    </label>
  );
}

export function BookingRulesEditor({
  context,
}: {
  context: HostCalendarListingContext;
}) {
  const i18n = useI18n();
  const router = useRouter();
  const listing = context.listing;
  const [switching, startSwitch] = useTransition();
  const [switchError, setSwitchError] = useState<string | null>(null);
  const mode: BookingMode = listing.bookingMode;
  const [previewWeekly, setPreviewWeekly] = useState(false);

  // The limits live here rather than inside the stepper card because the sentence under
  // the changeover day is built from the maximum. Held one level lower, the sentence
  // would read the *saved* number while the stepper above it showed the one the host
  // had just dialled in — two different maximums on one screen, and no way to tell
  // which one the listing is actually going to enforce.
  const savedMin = listing.pricing?.minNights ?? 1;
  const savedMax = listing.pricing?.maxNights ?? 0;
  const [minNights, setMinNights] = useState(savedMin);
  const [maxNights, setMaxNights] = useState(savedMax);
  const limitsDirty = minNights !== savedMin || maxNights !== savedMax;
  const visibleMode: BookingMode = previewWeekly ? "FIXED_STAYS" : mode;
  const weeklyLimitsInvalid =
    visibleMode === "FIXED_STAYS" &&
    weeklyStayWeekRange({ minNights, maxNights }) === null;

  useUnsavedNavigationGuard(
    limitsDirty,
    i18n.resolve(
      "host.editor.availability.rules_unsaved",
      "You have unsaved booking-rule changes. Leave without saving them?",
    ).text,
  );

  function chooseMode(next: BookingMode) {
    if (switching || next === visibleMode) return;
    setSwitchError(null);

    // Do not make a live listing unbookable between two clicks. A first switch to
    // weekly mode is previewed locally until the host chooses the required day below;
    // that choice is stored first, and only then is weekly mode activated.
    if (next === "FIXED_STAYS" && mode === "FLEXIBLE" && !listing.changeoverWeekday) {
      setPreviewWeekly(true);
      return;
    }
    if (next === "FLEXIBLE" && previewWeekly && mode === "FLEXIBLE") {
      setPreviewWeekly(false);
      return;
    }

    startSwitch(async () => {
      const result = await setListingBookingMode(listing.id, next);
      if ("error" in result && result.error) {
        setSwitchError(result.error);
        toast.error(result.error);
        return;
      }
      setPreviewWeekly(false);
      // The server is the only thing that knows what the listing now is; re-read rather
      // than mirroring the change locally, so the summary in the Calendar and the rules
      // here move together.
      router.refresh();
    });
  }

  return (
    <section
      aria-labelledby="booking-rules-heading"
      data-booking-rules
      className="mt-6 rounded-2xl border border-slate-200 p-5"
    >
      <h3
        id="booking-rules-heading"
        className="text-sm font-semibold text-slate-900"
      >
        {i18n.resolve("host.editor.availability.rules_title", "Booking rules").text}
      </h3>
      <p className="mt-1 text-sm leading-6 text-slate-600">
        {
          i18n.resolve(
            "host.editor.availability.rules_lead",
            "How guests may book the dates you have open, and how long they may stay.",
          ).text
        }
      </p>

      <fieldset className="mt-4 min-w-0">
        <legend className="sr-only">
          {
            i18n.resolve(
              "host.editor.availability.rules_style",
              "Booking style",
            ).text
          }
        </legend>
        <div className="flex flex-col gap-2">
          <MethodChoice
            id="FLEXIBLE"
            name="host-v2-booking-method"
            checked={visibleMode === "FLEXIBLE"}
            disabled={switching}
            title={
              i18n.resolve(
                "host.v2.calendar.booking_method.flexible",
                "Flexible dates",
              ).text
            }
            description={
              i18n.resolve(
                "host.v2.calendar.booking_method.flexible_body",
                "Guests choose their own check-in and checkout, within your minimum stay.",
              ).text
            }
            onSelect={() => chooseMode("FLEXIBLE")}
          />
          <MethodChoice
            id="FIXED_STAYS"
            name="host-v2-booking-method"
            checked={visibleMode === "FIXED_STAYS"}
            disabled={switching}
            title={
              i18n.resolve(
                "host.v2.calendar.booking_method.weekly",
                "Weekly stays",
              ).text
            }
            description={
              i18n.resolve(
                "host.v2.calendar.booking_method.weekly_body",
                "Guests arrive and leave on your changeover day and book whole weeks within your minimum and maximum stay.",
              ).text
            }
            onSelect={() => chooseMode("FIXED_STAYS")}
          />
        </div>
      </fieldset>

      {switching ? (
        <p
          aria-live="polite"
          className="mt-3 flex items-center gap-2 text-sm text-slate-600"
        >
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          {
            i18n.resolve(
              "host.v2.calendar.booking_method.switching",
              "Updating how this listing sells…",
            ).text
          }
        </p>
      ) : null}
      {switchError ? (
        <p
          role="alert"
          className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-800"
        >
          {switchError}
        </p>
      ) : null}

      {previewWeekly ? (
        <p role="status" className="mt-3 text-sm leading-6 text-slate-600">
          {
            i18n.resolve(
              "host.editor.availability.weekly_preview",
              "Choose a changeover day below to finish switching. Flexible dates remain active until then.",
            ).text
          }
        </p>
      ) : null}

      <p className="mt-3 text-sm leading-6 text-slate-500">
        {
          i18n.resolve(
            "host.v2.calendar.booking_method.switch_safe",
            "Switching keeps everything you have set. Your minimum and maximum stay, open dates, prices and offers are all still here if you switch back.",
          ).text
        }
      </p>

      {/* One pair of limits, in one place, whichever way the listing sells. A flexible
          listing measures any range a guest drags against them; a weekly one measures
          its whole weeks against them — which is how a host says "fortnights only"
          without a stay-length menu existing anywhere. */}
      <StayLimitsFields
        listing={listing}
        minNights={minNights}
        maxNights={maxNights}
        weekly={visibleMode === "FIXED_STAYS"}
        onMinNights={setMinNights}
        onMaxNights={setMaxNights}
      />

      {visibleMode === "FIXED_STAYS" ? (
        <>
          {/* The working maximum, not the saved one: the sentence is a preview of the
              rule the host is composing, and the Save button beside the steppers is
              what says it is not live yet. */}
          <ChangeoverDayField
            listing={listing}
            maxNights={maxNights}
            activateWeekly={previewWeekly && mode === "FLEXIBLE"}
            limitsValid={!weeklyLimitsInvalid}
            onActivated={() => setPreviewWeekly(false)}
          />
          <FixedStaySyncWarning className="mt-3" />
        </>
      ) : null}
    </section>
  );
}

/**
 * The listing's minimum and maximum stay, in their one live editing home.
 *
 * Saved here rather than through the pricing review: a review exists to weigh a *price*
 * change against every future night, and neither of these changes an amount. The base
 * price and the cleaning fee stay in Default pricing; these two live here because they
 * are rules about which stays a guest may choose — and because a weekly listing needs
 * the same two numbers, a second copy of them would be a second answer to "how long may
 * someone stay".
 */
function StayLimitsFields({
  listing,
  minNights,
  maxNights,
  weekly,
  onMinNights,
  onMaxNights,
}: {
  listing: HostCalendarListing;
  minNights: number;
  maxNights: number;
  weekly: boolean;
  onMinNights: (value: number) => void;
  onMaxNights: (value: number) => void;
}) {
  const i18n = useI18n();
  const router = useRouter();
  const [pending, startSaving] = useTransition();
  const savedMin = listing.pricing?.minNights ?? 1;
  const savedMax = listing.pricing?.maxNights ?? 0;
  const [error, setError] = useState<string | null>(null);

  const dirty = minNights !== savedMin || maxNights !== savedMax;
  // Zero is the stored spelling of "no maximum", exactly as the rest of the product
  // reads this column — so it is never "shorter than" anything.
  const tooShort = maxNights >= 1 && maxNights < minNights;
  const noWholeWeek =
    weekly && !tooShort && weeklyStayWeekRange({ minNights, maxNights }) === null;

  function save() {
    if (!dirty || tooShort || noWholeWeek || !listing.pricing) return;
    setError(null);
    startSaving(async () => {
      const result = await setListingStayLimits(listing.id, {
        minNights,
        maxNights,
      });
      if ("error" in result && result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      router.refresh();
      toast.success(
        i18n.resolve("host.v2.calendar.saved", "Your change is live.").text,
      );
    });
  }

  if (!listing.pricing) {
    return (
      <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5 text-sm leading-6 text-slate-600">
        {
          i18n.resolve(
            "host.v2.calendar.booking_method.no_pricing",
            "Set this listing's nightly price before choosing a minimum stay.",
          ).text
        }
      </p>
    );
  }

  return (
    <div
      data-stay-limits
      className="mt-3 rounded-xl border border-slate-200 px-3 py-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <StepperColumn
          label={
            i18n.resolve("host.v2.calendar.promotion_minimum", "Minimum stay").text
          }
          caption={
            minNights <= 1
              ? i18n.resolve("host.v2.calendar.listing.any_length", "any length").text
              : i18n.resolve(
                  "host.v2.calendar.listing.nights_minimum",
                  "nights minimum",
                ).text
          }
          value={minNights}
          max={365}
          editable
          decrementLabel={
            i18n.resolve(
              "host.editor.availability.minimum_decrease",
              "Decrease minimum stay",
            ).text
          }
          incrementLabel={
            i18n.resolve(
              "host.editor.availability.minimum_increase",
              "Increase minimum stay",
            ).text
          }
          onChange={(next) => {
            onMinNights(next);
            setError(null);
          }}
        />
        <StepperColumn
          label={
            i18n.resolve("host.v2.calendar.stay_limits.maximum", "Maximum stay").text
          }
          caption={
            maxNights < 1
              ? i18n.resolve("host.v2.calendar.stay_limits.no_maximum", "no maximum")
                  .text
              : i18n.resolve(
                  "host.v2.calendar.stay_limits.nights_maximum",
                  "nights maximum",
                ).text
          }
          value={maxNights}
          min={0}
          max={365}
          editable
          decrementLabel={
            i18n.resolve(
              "host.editor.availability.maximum_decrease",
              "Decrease maximum stay",
            ).text
          }
          incrementLabel={
            i18n.resolve(
              "host.editor.availability.maximum_increase",
              "Increase maximum stay",
            ).text
          }
          onChange={(next) => {
            onMaxNights(next);
            setError(null);
          }}
        />
      </div>

      {tooShort ? (
        <p role="alert" className="mt-2 text-sm leading-6 text-red-700">
          {
            i18n.resolve(
              "host.v2.calendar.stay_limits.too_short",
              "The maximum stay cannot be shorter than the minimum stay.",
            ).text
          }
        </p>
      ) : null}
      {noWholeWeek ? (
        <p role="alert" className="mt-2 text-sm leading-6 text-red-700">
          {
            i18n.resolve(
              "host.v2.calendar.stay_limits.no_whole_week",
              "Adjust the minimum and maximum so at least one whole week can be booked.",
            ).text
          }
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm leading-6 text-red-700">
          {error}
        </p>
      ) : null}

      {dirty ? (
        <div className="mt-3 flex items-center gap-2">
          <Button
            size="sm"
            onClick={save}
            disabled={pending || tooShort || noWholeWeek}
          >
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : null}
            {i18n.resolve("host.v2.calendar.save", "Save").text}
          </Button>
          <button
            type="button"
            onClick={() => {
              onMinNights(savedMin);
              onMaxNights(savedMax);
              setError(null);
            }}
            className="text-sm text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline"
          >
            {i18n.resolve("common.cancel", "Cancel").text}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The one day of the week a weekly listing changes over on.
 *
 * A native select: seven fixed options, one choice, and the platform's own keyboard
 * handling and screen-reader announcement rather than a listbox this file would have to
 * keep correct.
 *
 * Saved on choosing, because the value is a single choice with nothing to weigh against
 * it — and because leaving it unset is the state the listing fails closed in, so getting
 * out of that state should take one action rather than two.
 *
 * Under it, the rule the host has actually built, as one sentence. It names the day and
 * the cap and stops there: the week lengths those two permit are a consequence, not a
 * setting, and listing them ("7, 14, 21 or 28 nights") would read as four things the
 * host had configured and could configure differently.
 */
function ChangeoverDayField({
  listing,
  maxNights,
  activateWeekly = false,
  limitsValid = true,
  onActivated,
}: {
  listing: HostCalendarListing;
  maxNights: number;
  activateWeekly?: boolean;
  limitsValid?: boolean;
  onActivated?: () => void;
}) {
  const i18n = useI18n();
  const router = useRouter();
  const [pending, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const chosen = listing.changeoverWeekday;
  const cap = statedStayCap(maxNights);

  const dayLabels = useMemo(
    () =>
      Object.fromEntries(
        CHANGEOVER_WEEKDAY_CHOICES.map((day) => [
          day,
          i18n.resolve(
            "host.v2.calendar.weekday." + day.toLowerCase(),
            WEEKDAY_SOURCE[day],
          ).text,
        ]),
      ) as Record<ChangeoverWeekdayName, string>,
    [i18n],
  );

  function choose(next: string) {
    if (!next || !limitsValid) return;
    setError(null);
    startSaving(async () => {
      const result = await setListingChangeoverWeekday(listing.id, next);
      if ("error" in result && result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      if (activateWeekly) {
        const modeResult = await setListingBookingMode(listing.id, "FIXED_STAYS");
        if ("error" in modeResult && modeResult.error) {
          setError(modeResult.error);
          toast.error(modeResult.error);
          return;
        }
        onActivated?.();
      }
      router.refresh();
    });
  }

  return (
    <div
      data-changeover-day
      className="mt-3 rounded-xl border border-slate-200 px-3 py-3"
    >
      <label
        htmlFor="host-v2-changeover-day"
        className="block text-sm font-medium text-slate-900"
      >
        {i18n.resolve("host.v2.calendar.changeover.label", "Changeover day").text}
      </label>
      <p className="mt-0.5 text-sm leading-6 text-slate-500">
        {
          i18n.resolve(
            "host.v2.calendar.changeover.hint",
            "Guests arrive and leave on your changeover day and book whole weeks within your minimum and maximum stay.",
          ).text
        }
      </p>
      {/* The application Select rather than a native one, so the seven days are drawn
          by us on every platform instead of by the operating system. The empty value
          stays out of the options: it is "not chosen yet", which is what the placeholder
          says, and it was never a day a host could pick. */}
      <SelectField
        id="host-v2-changeover-day"
        value={chosen ?? ""}
        disabled={pending || !limitsValid}
        invalid={!chosen}
        ariaDescribedBy={chosen ? undefined : "host-v2-changeover-missing"}
        onValueChange={choose}
        placeholder={i18n.resolve("host.v2.calendar.changeover.none", "Choose a day…").text}
        options={CHANGEOVER_WEEKDAY_CHOICES.map((day) => ({
          value: day,
          label: dayLabels[day],
        }))}
        className="mt-2 min-h-11 border-slate-300 text-sm text-slate-900 shadow-none data-[size=default]:h-auto md:data-[size=default]:h-auto disabled:bg-slate-50"
      />

      {chosen ? (
        <p
          data-changeover-rule
          className="mt-2 text-sm leading-6 text-slate-600"
        >
          {cap === null
            ? interpolate(
                i18n.resolve(
                  "host.editor.availability.rules_weekly_sentence",
                  "Guests check in and check out on {day}.",
                ),
                { day: dayLabels[chosen] },
              ).text
            : interpolate(
                i18n.plural(
                  "host.editor.availability.rules_weekly_sentence_max",
                  cap,
                  "Guests check in and check out on {day}. Stays cannot exceed {n} night.",
                  "Guests check in and check out on {day}. Stays cannot exceed {n} nights.",
                ),
                { day: dayLabels[chosen] },
              ).text}
        </p>
      ) : (
        <p
          id="host-v2-changeover-missing"
          role="alert"
          className="mt-2 flex items-start gap-2 text-sm leading-6 text-amber-800"
        >
          <AlertTriangle className="mt-1 size-3.5 shrink-0" aria-hidden />
          {activateWeekly
            ? i18n.resolve(
                "host.editor.availability.weekly_choose_day",
                "Choose a changeover day to turn on weekly stays. Flexible dates remain active until then.",
              ).text
            : i18n.resolve(
                "host.v2.calendar.changeover.required",
                "Choose a changeover day. Until you do, guests cannot book any dates.",
              ).text}
        </p>
      )}
      {error ? (
        <p role="alert" className="mt-2 text-sm leading-6 text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
