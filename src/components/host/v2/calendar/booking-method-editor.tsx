"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CalendarCheck2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { setListingBookingMode } from "@/lib/actions/fixed-stay.actions";
import { saveListingPricing } from "@/lib/actions/pricing.actions";
import type { HostCalendarListing } from "@/lib/host/v2/calendar-types";
import { StepperColumn } from "./workbench-ui";
import { FixedStaysEditor } from "./fixed-stays-editor";

/**
 * How this listing sells its dates — the one listing-wide setting the calendar owns.
 *
 * It lives here rather than in the listing editor because it is the question every cell
 * of the grid beside it answers to: a listing selling whole stays has no arbitrary night
 * to open, no minimum to measure a selection against, and nothing bookable outside the
 * stays the host added. Putting the switch anywhere else would mean a host changing what
 * the calendar means from a screen that does not show it.
 *
 * The minimum stay comes with it, and only in flexible mode. That is a deliberate move
 * rather than a duplication: it is the rule that says how short a stay a guest may
 * choose, it is meaningless once the host is choosing the stays themselves, and it now
 * has exactly one live editing home. Default pricing states it and links here.
 */

/** The two ways a listing can sell, as `Listing.bookingMode` stores them. */
type BookingMode = "FLEXIBLE" | "FIXED_STAYS";

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
        "flex min-w-0 items-start gap-3 rounded-xl border px-3 py-3 transition-colors duration-150 motion-reduce:transition-none",
        "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#0f172a]",
        disabled
          ? "cursor-not-allowed border-slate-200 opacity-60"
          : checked
            ? "cursor-pointer border-[#0f172a] bg-[#f8fafc] ring-1 ring-[#0f172a]"
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
        className="mt-0.5 size-4 shrink-0 accent-[#0f172a]"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[0.875rem] font-semibold text-slate-900">
          {title}
        </span>
        <span className="mt-1 block text-[0.8125rem] leading-5 text-slate-600">
          {description}
        </span>
      </span>
    </label>
  );
}

/**
 * What a connected channel cannot be told.
 *
 * The export publishes which nights are open and which are held, and that is the whole
 * of what iCalendar can say. It has no vocabulary for "Saturdays only" or "exactly 7 or
 * 14 nights", so a channel reading the feed will sell nights 3 to 6 of an offered week
 * unless the host sets the same rules there. Stated, never enforced: refusing fixed mode
 * because a calendar is connected would be this product deciding a host's channel
 * strategy for them.
 */
export function FixedStaySyncWarning({ className }: { className?: string }) {
  const i18n = useI18n();
  return (
    <div
      role="note"
      data-fixed-stay-sync-warning
      className={cn(
        "flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2.5",
        className,
      )}
    >
      <AlertTriangle
        className="mt-0.5 size-4 shrink-0 text-amber-700"
        aria-hidden
      />
      <p className="min-w-0 text-[0.8125rem] leading-5 text-amber-900">
        {
          i18n.resolve(
            "host.v2.calendar.booking_method.sync_warning",
            "Calendar sync shares open and blocked nights, but it cannot enforce Saturday arrivals or exact 7/14-night stays. Set the same arrival-day and stay-length rules on every connected channel.",
          ).text
        }
      </p>
    </div>
  );
}

export function BookingMethodEditor({
  listing,
  today,
}: {
  listing: HostCalendarListing;
  today: string;
}) {
  const i18n = useI18n();
  const router = useRouter();
  const [switching, startSwitch] = useTransition();
  const [switchError, setSwitchError] = useState<string | null>(null);
  const mode: BookingMode = listing.bookingMode;

  function chooseMode(next: BookingMode) {
    if (next === mode || switching) return;
    setSwitchError(null);
    startSwitch(async () => {
      const result = await setListingBookingMode(listing.id, next);
      if ("error" in result && result.error) {
        setSwitchError(result.error);
        toast.error(result.error);
        return;
      }
      // The server is the only thing that knows what the listing now is; re-read rather
      // than mirroring the change locally, so the grid, the counts and the rail all move
      // together with this panel.
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="min-w-0">
        <legend className="sr-only">
          {
            i18n.resolve(
              "host.v2.calendar.menu.booking_method",
              "Booking method",
            ).text
          }
        </legend>
        <div className="flex flex-col gap-2">
          <MethodChoice
            id="FLEXIBLE"
            name="host-v2-booking-method"
            checked={mode === "FLEXIBLE"}
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
            checked={mode === "FIXED_STAYS"}
            disabled={switching}
            title={
              i18n.resolve(
                "host.v2.calendar.booking_method.fixed",
                "Fixed stays",
              ).text
            }
            description={
              i18n.resolve(
                "host.v2.calendar.booking_method.fixed_body",
                "Guests can only book the exact stays you add. Nothing else on the calendar is bookable.",
              ).text
            }
            onSelect={() => chooseMode("FIXED_STAYS")}
          />
        </div>
      </fieldset>

      {switching ? (
        <p
          aria-live="polite"
          className="flex items-center gap-2 text-[0.8125rem] text-slate-600"
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
          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[0.8125rem] leading-5 text-red-800"
        >
          {switchError}
        </p>
      ) : null}

      <p className="text-[0.75rem] leading-5 text-slate-500">
        {
          i18n.resolve(
            "host.v2.calendar.booking_method.switch_safe",
            "Switching keeps everything you have set. Your minimum stay, open dates, prices, offers and any stays you have added are all still here if you switch back.",
          ).text
        }
      </p>

      {mode === "FLEXIBLE" ? (
        <MinimumStayField listing={listing} />
      ) : (
        <>
          <FixedStaySyncWarning />
          <FixedStaysEditor listing={listing} today={today} />
        </>
      )}
    </div>
  );
}

/**
 * The listing's minimum stay, in its one live editing home.
 *
 * Saved on its own rather than through the pricing review: the review exists to weigh a
 * price change against what it does to every future night, and a minimum stay changes no
 * amount. The base price and the cleaning fee stay where they are, in Default pricing —
 * this is the one number that moved, and it moved because it is a rule about *which
 * stays a guest may choose*, which is exactly what this editor is about.
 */
function MinimumStayField({ listing }: { listing: HostCalendarListing }) {
  const i18n = useI18n();
  const router = useRouter();
  const [pending, startSaving] = useTransition();
  const saved = listing.pricing?.minNights ?? 1;
  const [minNights, setMinNights] = useState(saved);
  const [error, setError] = useState<string | null>(null);
  const dirty = minNights !== saved;

  const maxNights = listing.pricing?.maxNights ?? 0;
  const tooLong = maxNights >= 1 && minNights > maxNights;

  function save() {
    if (!dirty || tooLong || !listing.pricing) return;
    setError(null);
    startSaving(async () => {
      const form = new FormData();
      form.set("baseNightlyRate", String(listing.pricing!.baseNightlyRate));
      form.set("cleaningFee", String(listing.pricing!.cleaningFee));
      form.set("minNights", String(minNights));
      const result = await saveListingPricing(listing.id, {}, form);
      if (result?.error) {
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
      <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-[0.8125rem] leading-5 text-slate-600">
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
    <div className="rounded-xl border border-slate-200 px-3 py-3">
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
        decrementLabel={
          i18n.resolve("host.v2.calendar.promotion_fewer_nights", "Fewer nights")
            .text
        }
        incrementLabel={
          i18n.resolve("host.v2.calendar.promotion_more_nights", "More nights").text
        }
        onChange={(next) => {
          setMinNights(next);
          setError(null);
        }}
      />
      {tooLong ? (
        <p role="alert" className="mt-2 text-[0.8125rem] leading-5 text-red-700">
          {
            i18n.resolve(
              "host.v2.calendar.booking_method.min_above_max",
              "Your minimum stay cannot be longer than your maximum stay.",
            ).text
          }
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-[0.8125rem] leading-5 text-red-700">
          {error}
        </p>
      ) : null}
      {dirty ? (
        <Button
          type="button"
          size="sm"
          disabled={pending || tooLong}
          onClick={save}
          className="mt-3 rounded-full"
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : null}
          {
            i18n.resolve(
              "host.v2.calendar.booking_method.save_minimum",
              "Save minimum stay",
            ).text
          }
        </Button>
      ) : null}
    </div>
  );
}

/**
 * What a host sees where the stays would be, before there are any.
 *
 * Exported so the fixed-stay editor and its tests share one empty state rather than two
 * that drift.
 */
export function NoFixedStaysYet() {
  const i18n = useI18n();
  const title = useMemo(
    () =>
      i18n.resolve(
        "host.v2.calendar.fixed_stays.empty_title",
        "No stays yet",
      ).text,
    [i18n],
  );
  return (
    <div className="rounded-xl bg-slate-50">
      <EmptyState
        icon={CalendarCheck2}
        title={title}
        description={
          i18n.resolve(
            "host.v2.calendar.fixed_stays.empty_body",
            "Until you add one, this listing has nothing a guest can book.",
          ).text
        }
      />
    </div>
  );
}
