"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

export type PercentStop = { label: string; percent: number };

/**
 * One decision, said two ways on one line: a percentage of a reference price, and the
 * money that percentage comes out to. Hosts think in both — "a fifth more than usual"
 * and "ninety-six euros" — so either field can be typed into and the other follows,
 * with a slider underneath for the hosts who would rather not type at all.
 *
 * The parent owns the number. This only knows how to show it and how to hand back the
 * edits, which is what keeps the percentage and the amount from ever disagreeing: they
 * are the same value seen from two sides, not two pieces of state chasing each other.
 */
export function PercentAmountField({
  percent,
  amount,
  onPercentChange,
  onAmountChange,
  onPercentClear,
  min,
  max,
  step = 1,
  grow = 0,
  limitMin,
  limitMax,
  stops,
  currency,
  percentLabel,
  amountLabel,
  percentSuffix = "%",
  hidePercent = false,
  hideAmount = false,
  id,
  className,
}: {
  /** The percentage as the parent understands it, or `null` for "not set yet". */
  percent: number | null;
  /** The money the percentage works out to, or `null` when there is no price to show. */
  amount: number | null;
  onPercentChange: (percent: number) => void;
  onAmountChange: (amount: number) => void;
  /** Given when an empty percentage is a real answer — a promotion can be free
   *  cleaning and nothing else — so clearing the field means it, instead of springing
   *  back to the last number on blur. */
  onPercentClear?: () => void;
  min: number;
  max: number;
  step?: number;
  /** How far the track stretches each time the host runs it to an end. 0 keeps it fixed. */
  grow?: number;
  limitMin?: number;
  limitMax?: number;
  stops?: readonly PercentStop[];
  currency: string;
  percentLabel: string;
  amountLabel: string;
  percentSuffix?: string;
  hidePercent?: boolean;
  hideAmount?: boolean;
  id?: string;
  className?: string;
}) {
  const hardMin = limitMin ?? (grow > 0 ? min - grow * 20 : min);
  const hardMax = limitMax ?? (grow > 0 ? max + grow * 20 : max);

  /** The track the host currently sees. It only ever grows by running into an end. */
  const [track, setTrack] = React.useState(() => ({ min, max }));
  /** In-flight text, so a half-typed "-" or "1." is not swallowed by the parser. */
  const [percentText, setPercentText] = React.useState<string | null>(null);
  const [amountText, setAmountText] = React.useState<string | null>(null);

  const clamp = (value: number) => Math.min(hardMax, Math.max(hardMin, value));

  /** Widen the track until the value fits inside it — never during a drag, where the
   *  value is clamped to the track anyway, so a held thumb cannot run away. */
  const roomFor = (value: number, base: { min: number; max: number }) => {
    if (grow <= 0) return base;
    let low = base.min;
    let high = base.max;
    while (value > high && high < hardMax) high = Math.min(hardMax, high + grow);
    while (value < low && low > hardMin) low = Math.max(hardMin, low - grow);
    return { min: low, max: high };
  };

  const shown = percent ?? min;
  const view = roomFor(shown, track);
  const sliderValue = Math.min(view.max, Math.max(view.min, Math.round(shown)));

  const percentDisplay =
    percentText ?? (percent === null ? "" : String(Math.round(percent)));
  const amountDisplay =
    amountText ??
    (amount === null || !Number.isFinite(amount)
      ? ""
      : String(Number(amount.toFixed(2))));

  function commitPercent(next: number) {
    const value = clamp(next);
    setTrack((current) => roomFor(value, current));
    setPercentText(null);
    setAmountText(null);
    onPercentChange(value);
  }

  /** Running the thumb into an end asks for more room rather than stopping there — the
   *  next drag starts from where this one ran out. */
  function stretchAtEdge(value: number) {
    if (grow <= 0) return;
    if (value >= view.max && view.max < hardMax) {
      setTrack({ min: view.min, max: Math.min(hardMax, view.max + grow) });
    } else if (value <= view.min && view.min > hardMin) {
      setTrack({ min: Math.max(hardMin, view.min - grow), max: view.max });
    }
  }

  return (
    <div className={cn("min-w-0", className)}>
      <div
        className={cn(
          "grid min-w-0 items-center gap-2",
          hidePercent || hideAmount
            ? "grid-cols-1"
            : "grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]",
        )}
      >
        {hidePercent ? null : (
          <div className="relative min-w-0">
            <Input
              id={id ? `${id}-percent` : undefined}
              aria-label={percentLabel}
              type="text"
              inputMode="decimal"
              value={percentDisplay}
              onChange={(event) => {
                const raw = event.target.value;
                setPercentText(raw);
                if (raw.trim() === "" && onPercentClear) {
                  setAmountText(null);
                  onPercentClear();
                  return;
                }
                const parsed = parseNumeric(raw);
                if (parsed === null) return;
                setAmountText(null);
                const value = clamp(parsed);
                setTrack((current) => roomFor(value, current));
                onPercentChange(value);
              }}
              onBlur={() => setPercentText(null)}
              className="h-12 pr-8 text-right text-lg font-semibold tabular-nums"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-semibold text-muted-foreground"
            >
              {percentSuffix}
            </span>
          </div>
        )}

        {hidePercent || hideAmount ? null : (
          <span
            aria-hidden="true"
            className="px-0.5 text-sm font-semibold text-muted-foreground"
          >
            =
          </span>
        )}

        {hideAmount ? null : (
          <div className="relative min-w-0">
            <Input
              id={id ? `${id}-amount` : undefined}
              aria-label={amountLabel}
              type="text"
              inputMode="decimal"
              value={amountDisplay}
              onChange={(event) => {
                const raw = event.target.value;
                setAmountText(raw);
                const parsed = parseNumeric(raw);
                if (parsed === null || parsed < 0) return;
                setPercentText(null);
                onAmountChange(parsed);
              }}
              onBlur={() => setAmountText(null)}
              className="h-12 pr-14 text-right text-lg font-semibold tabular-nums"
            />
            <span
              aria-hidden="true"
              translate="no"
              className="notranslate pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-muted-foreground"
            >
              {currency}
            </span>
          </div>
        )}
      </div>

      {hidePercent ? null : (
        <>
          <Slider
            className="mt-4 [&_[data-slot=slider-thumb]]:size-6 [&_[data-slot=slider-track]]:h-2.5"
            min={view.min}
            max={view.max}
            step={step}
            value={[sliderValue]}
            onValueChange={([next]) => {
              setPercentText(null);
              setAmountText(null);
              onPercentChange(clamp(next));
            }}
            onValueCommit={([next]) => stretchAtEdge(next)}
            aria-label={percentLabel}
          />
          {stops?.length ? (
            <div className="mt-1.5 flex min-w-0 items-center justify-between gap-0.5">
              {stops.map((stop) => {
                const selected =
                  percent !== null && Math.round(percent) === stop.percent;
                return (
                  <button
                    key={stop.percent}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => commitPercent(stop.percent)}
                    className={cn(
                      "rounded-md px-1.5 py-1 text-xs font-semibold whitespace-nowrap tabular-nums transition-colors md:text-[0.65rem]",
                      selected
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {stop.label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Accepts what people actually type: a comma decimal, and the minus sign a phone
 *  keyboard inserts. Returns `null` while the text is not yet a number, so the field
 *  keeps the keystroke instead of snapping back. */
function parseNumeric(raw: string): number | null {
  const text = raw.replace(/−/g, "-").replace(",", ".").trim();
  if (text === "" || text === "-" || text === "." || text === "-.") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}
