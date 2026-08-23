"use client";

import * as React from "react";
import { Check, ChevronDown, Clock3 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tx, useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/**
 * The four times a host actually means when they say "afternoon check-in", and the four
 * they mean for the morning after. Offered above the full grid, not instead of it: they
 * cover the ordinary answer in one tap while an early ferry or a late flight still has
 * all forty-eight slots underneath.
 */
export const CHECK_IN_QUICK_TIMES = ["14:00", "15:00", "16:00", "18:00"] as const;
export const CHECK_OUT_QUICK_TIMES = ["09:00", "10:00", "11:00", "12:00"] as const;

type Group = "morning" | "afternoon" | "evening" | "night";

const GROUP_ORDER: Group[] = ["morning", "afternoon", "evening", "night"];

function groupOf(time: string): Group {
  if (time < "06:00") return "night";
  if (time < "12:00") return "morning";
  if (time < "18:00") return "afternoon";
  return "evening";
}

function useGroupLabels(): Record<Group, string> {
  const { resolve } = useI18n();
  return {
    morning: resolve("common.time_picker.morning", "Morning").text,
    afternoon: resolve("common.time_picker.afternoon", "Afternoon").text,
    evening: resolve("common.time_picker.evening", "Evening").text,
    night: resolve("common.time_picker.night", "Night").text,
  };
}

/**
 * One time of day, in 24-hour form and half-hour steps.
 *
 * Replaces the native `<select>`, which on a desktop browser is a forty-nine row scroll
 * list drawn by the OS — no styling, no grouping, and no way to say that 15:00 is the
 * answer nearly every host wants. Here the common answers are chips at the top and the
 * rest is a labelled grid, so the usual case is one tap and the unusual one is still
 * reachable without scrolling past thirty rows to find it.
 *
 * The options come from the caller rather than being generated here, because the
 * canonical list already exists (`STAY_TIME_OPTIONS`) and `stayTimeChoices` widens it to
 * keep an imported off-grid time like "14:15" selectable. A picker that regenerated its
 * own grid would silently drop that value.
 *
 * `variant` decides the shape, not the behaviour: "popover" for a field sitting in a
 * form, "inline" for a bottom sheet, where a popover nested inside a modal is both
 * fiddly and unnecessary — the sheet is already the overlay.
 */
export function TimePickerField({
  id,
  value,
  onChange,
  options,
  quickTimes,
  flexibleLabel,
  ariaLabel,
  variant = "popover",
  className,
}: {
  id?: string;
  /** "HH:MM", or "" when the caller allows a flexible answer and that is the choice. */
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  /** The chips above the grid. Omit for a picker with no obvious common answer. */
  quickTimes?: readonly string[];
  /** Passing this adds a "no committed time" choice above the chips, labelled with the
   *  caller's own copy — the wording differs between arrival and quiet hours, and the
   *  data model behind it is the caller's (`FLEXIBLE_STAY_TIME`), not this one's. */
  flexibleLabel?: string;
  ariaLabel?: string;
  variant?: "popover" | "inline";
  className?: string;
}) {
  const groupLabels = useGroupLabels();
  const [open, setOpen] = React.useState(false);

  const grouped = React.useMemo(() => {
    const buckets: Record<Group, string[]> = {
      morning: [],
      afternoon: [],
      evening: [],
      night: [],
    };
    for (const time of options) buckets[groupOf(time)].push(time);
    return buckets;
  }, [options]);

  const select = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  const body = (
    <div className="space-y-3">
      {flexibleLabel ? (
        <button
          type="button"
          onClick={() => select("")}
          className={cn(
            "flex h-11 w-full items-center justify-between rounded-lg border px-3 text-left text-sm transition-colors",
            value === ""
              ? "border-slate-900 bg-slate-50 font-medium text-slate-900"
              : "border-slate-200 text-slate-700 hover:border-slate-300",
          )}
        >
          {flexibleLabel}
          {value === "" ? <Check className="size-4 shrink-0" aria-hidden /> : null}
        </button>
      ) : null}

      {quickTimes?.length ? (
        <div>
          <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">
            <Tx k="common.time_picker.quick" source="Common times" />
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {quickTimes.map((time) => (
              <TimeCell
                key={time}
                time={time}
                selected={value === time}
                onSelect={select}
                prominent
              />
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">
          <Tx k="common.time_picker.all_times" source="All times" />
        </p>
        {/* Capped and scrollable: forty-eight slots would push the sheet's Save button
            off a phone viewport, and the chips above already cover the usual answer. */}
        <div className="max-h-56 space-y-2.5 overflow-y-auto pr-1">
          {GROUP_ORDER.map((group) =>
            grouped[group].length ? (
              <div key={group}>
                <p className="mb-1 text-[0.7rem] font-medium text-slate-500">
                  {groupLabels[group]}
                </p>
                <div className="grid grid-cols-4 gap-1.5">
                  {grouped[group].map((time) => (
                    <TimeCell
                      key={time}
                      time={time}
                      selected={value === time}
                      onSelect={select}
                    />
                  ))}
                </div>
              </div>
            ) : null,
          )}
        </div>
      </div>
    </div>
  );

  if (variant === "inline") {
    return (
      <div role="group" aria-label={ariaLabel} className={className} id={id}>
        {body}
      </div>
    );
  }

  const triggerLabel = value === "" ? (flexibleLabel ?? "—") : value;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        type="button"
        aria-label={ariaLabel}
        className={cn(
          "flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 text-left text-sm text-slate-900 transition-colors",
          "hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20",
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Clock3 className="size-4 shrink-0 text-slate-400" aria-hidden />
          <span className={cn("truncate tabular-nums", value === "" && "text-slate-500")}>
            {triggerLabel}
          </span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-slate-400" aria-hidden />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(20rem,calc(100vw-2rem))] border-slate-200 p-3"
      >
        {body}
      </PopoverContent>
    </Popover>
  );
}

function TimeCell({
  time,
  selected,
  onSelect,
  prominent = false,
}: {
  time: string;
  selected: boolean;
  onSelect: (time: string) => void;
  prominent?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(time)}
      className={cn(
        "h-9 rounded-lg border text-sm tabular-nums transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400",
        selected
          ? "border-slate-900 bg-slate-900 font-medium text-white"
          : prominent
            ? "border-slate-300 text-slate-900 hover:border-slate-900"
            : "border-transparent text-slate-700 hover:bg-slate-100",
      )}
    >
      {time}
    </button>
  );
}
