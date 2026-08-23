"use client";

import * as React from "react";
import { CalendarDays } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tx, useI18n } from "@/lib/i18n/client";
import { dateKey } from "@/lib/utils/stay-pricing";
import { compareYmd, ymdToLocalDate } from "@/lib/utils/date-only";
import { cn } from "@/lib/utils";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** A stored value is only turned into a Date when it is one — a hand-edited draft or an
 *  empty field must leave the calendar unselected rather than throw on parse. */
function toDate(ymd: string): Date | undefined {
  return YMD.test(ymd) ? ymdToLocalDate(ymd) : undefined;
}

/**
 * One civil date, picked from the same calendar the rest of the app uses.
 *
 * Replaces `<input type="date">`, which renders whatever the browser feels like — a
 * dd/mm/yyyy mask and the OS mini-calendar on Chrome, a plain text box elsewhere — and
 * so is the one control on a screen that never matches anything around it. The grid
 * inside is `ui/calendar`, the same `react-day-picker` surface the marketplace stay
 * picker is built on, so a host meets one calendar in this product and not two.
 *
 * Values in and out are `YYYY-MM-DD` strings, not `Date`s, because that is what every
 * caller here stores and what the publish gate validates. The conversion is local-date
 * on both sides (`ymdToLocalDate` / `dateKey`), so a date can't shift by a day across
 * the boundary.
 */
export function DatePickerField({
  id,
  value,
  onChange,
  min,
  invalid = false,
  describedBy,
  placeholder,
  className,
}: {
  id: string;
  /** `YYYY-MM-DD`, or "" for nothing chosen yet. */
  value: string;
  onChange: (value: string) => void;
  /** Earliest selectable date as `YYYY-MM-DD`. Earlier days are disabled rather than
   *  only refused after the fact, matching what the caller's validation will say. */
  min?: string;
  invalid?: boolean;
  describedBy?: string;
  placeholder?: string;
  className?: string;
}) {
  const i18n = useI18n();
  const [open, setOpen] = React.useState(false);
  const selected = toDate(value);
  const minDate = min ? toDate(min) : undefined;

  const emptyLabel =
    placeholder ?? i18n.resolve("common.date_picker.empty", "Select a date").text;

  // The catalog locale, not the visitor's raw choice: this sits inside fixed copy that
  // resolved to `locale`, and a month name in a third language would read as a bug.
  const label = selected
    ? new Intl.DateTimeFormat(i18n.locale, {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(selected)
    : emptyLabel;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        type="button"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        // The floor, kept in the markup. `<input type="date">` published it as `min=`,
        // and dropping it would leave "the field agrees with the publish gate" as
        // something only an interactive test could see.
        data-min={min || undefined}
        className={cn(
          "mt-1.5 flex h-11 w-full max-w-64 items-center gap-2.5 rounded-xl border bg-white px-3 text-left text-sm text-slate-950 transition-colors",
          "hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20",
          invalid ? "border-rose-500" : "border-slate-300",
          className,
        )}
      >
        <CalendarDays className="size-4 shrink-0 text-slate-400" aria-hidden />
        <span
          className={cn("notranslate truncate", !selected && "text-slate-500")}
          translate="no"
          suppressHydrationWarning
        >
          {label}
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? minDate}
          startMonth={minDate}
          disabled={minDate ? { before: minDate } : undefined}
          onSelect={(date) => {
            if (!date) return;
            const next = dateKey(date);
            // The disabled matcher already refuses these, but a keyboard selection on a
            // stale month is cheap to guard and expensive to debug.
            if (min && compareYmd(next, min) < 0) return;
            onChange(next);
            setOpen(false);
          }}
        />
        {value ? (
          <div className="border-t border-slate-200 p-1.5">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="h-9 w-full rounded-md text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <Tx k="common.date_picker.clear" source="Clear" />
            </button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
