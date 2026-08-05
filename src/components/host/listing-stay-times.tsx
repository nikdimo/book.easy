"use client";

import { LogIn, LogOut } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tx, useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/** What a host gets if they never touch the fields. Deliberately the industry-standard
 *  pair rather than empty: a listing that says nothing about arrival leaves the guest to
 *  ask, and this screen is the one place every host passes through. */
export const DEFAULT_CHECK_IN_TIME = "15:00";
export const DEFAULT_CHECK_OUT_TIME = "11:00";

/** Radix rejects an empty SelectItem value, so "no fixed time" travels as a sentinel
 *  and is mapped back to "" at the edges. */
const FLEXIBLE = "flexible";

/** Every half hour of the day. Hosts outside the usual afternoon/morning window are
 *  common enough (early ferries, late flights) that trimming the list would just be a
 *  guess about which of them matter. */
const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2);
  const minute = index % 2 === 0 ? "00" : "30";
  return `${String(hour).padStart(2, "0")}:${minute}`;
});

/** A stored value is only offered back if it is one we recognise — a hand-edited draft
 *  or an older row should not put the select into a state the host cannot leave. */
export function normalizeStayTime(value: string | null | undefined) {
  if (!value) return "";
  return TIME_OPTIONS.includes(value) ? value : "";
}

function TimeSelect({
  id,
  label,
  hint,
  icon: Icon,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  icon: typeof LogIn;
  value: string;
  onChange: (value: string) => void;
}) {
  const i18n = useI18n();
  const flexibleLabel = i18n.resolve(
    "host.form.stay_times.flexible",
    "Flexible — agree with the guest",
  ).text;

  return (
    <div className="min-w-0 flex-1">
      <Label htmlFor={id} className="flex items-center gap-2 text-sm font-medium">
        <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
        {label}
      </Label>
      <Select
        value={value === "" ? FLEXIBLE : value}
        onValueChange={(next) => onChange(next === FLEXIBLE ? "" : next)}
      >
        <SelectTrigger id={id} className="mt-1.5 w-full bg-background">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={FLEXIBLE}>{flexibleLabel}</SelectItem>
          {TIME_OPTIONS.map((time) => (
            <SelectItem key={time} value={time}>
              {time}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

/**
 * Check-in / check-out times, shown in two places and deliberately identical in both:
 * under the availability question in the create wizard, and as its own section when
 * editing a listing. A host who set them while publishing has to recognise the same
 * control later, which is also why the copy lives here rather than at each call site.
 *
 * Never a gate. Both fields arrive pre-filled with the standard pair, so a host who
 * ignores this still publishes a listing that tells guests something — which is the
 * whole point of collecting it — and the availability radio above stays the only
 * thing on that screen that can block Continue.
 */
export function StayTimesFields({
  checkInTime,
  checkOutTime,
  onChange,
  className,
}: {
  checkInTime: string;
  checkOutTime: string;
  onChange: (field: "checkInTime" | "checkOutTime", value: string) => void;
  className?: string;
}) {
  const i18n = useI18n();

  return (
    <section
      className={cn("rounded-xl border border-border/70 bg-muted/20 p-3 md:p-4", className)}
    >
      <p className="text-sm font-semibold md:text-base">
        <Tx k="host.form.stay_times.title" source="Check-in and check-out times" />
      </p>
      <p className="mt-1 text-xs leading-snug text-muted-foreground md:text-sm">
        <Tx
          k="host.form.stay_times.hint"
          source="Guests see these on your listing before they book."
        />
      </p>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:gap-4">
        <TimeSelect
          id="checkInTime"
          label={i18n.resolve("host.form.stay_times.check_in", "Check-in from").text}
          hint={
            i18n.resolve(
              "host.form.stay_times.check_in_hint",
              "Earliest guests can arrive",
            ).text
          }
          icon={LogIn}
          value={checkInTime}
          onChange={(value) => onChange("checkInTime", value)}
        />
        <TimeSelect
          id="checkOutTime"
          label={i18n.resolve("host.form.stay_times.check_out", "Check-out by").text}
          hint={
            i18n.resolve(
              "host.form.stay_times.check_out_hint",
              "Latest guests can leave",
            ).text
          }
          icon={LogOut}
          value={checkOutTime}
          onChange={(value) => onChange("checkOutTime", value)}
        />
      </div>
    </section>
  );
}
