"use client";

import { useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

/** Half the handle, in pixels. It is the inset at each end of the track. */
const THUMB = 12;

/**
 * The panel's one slider, in two arrangements.
 *
 * `origin: "center"` fills outwards from the middle. Nightly price uses it, because the
 * question there is not "how much" but "how far from my usual price", and a bar that
 * starts at the centre answers it before a single number is read. `origin: "start"`
 * fills from the left, which is what a discount wants — nought per cent is nothing, not
 * a midpoint.
 *
 * Both cover a deliberately narrow band, and anything past the ends is typed into the
 * field beside it. A slider wide enough for a New Year's rate would make a ten per cent
 * change a two-pixel gesture; the handle parks at the end and the numbers go on telling
 * the truth.
 */
export function PanelSlider({
  value,
  min,
  max,
  origin,
  presets,
  disabled,
  label,
  onChange,
  formatPreset,
}: {
  /** May sit outside the range; the handle parks at the end when it does. */
  value: number;
  min: number;
  max: number;
  origin: "center" | "start";
  presets: readonly number[];
  disabled?: boolean;
  label: string;
  onChange: (value: number) => void;
  formatPreset: (value: number) => string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const span = max - min;
  const clamped = Math.max(min, Math.min(max, value));
  const ratio = span === 0 ? 0 : ((clamped - min) / span) * 100;
  const anchor = origin === "center" ? 50 : 0;
  const low = Math.min(anchor, ratio);
  const high = Math.max(anchor, ratio);

  const valueAt = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return min;
      const box = track.getBoundingClientRect();
      // The same inset the handle is drawn with, so the value under the pointer is the
      // value under the handle rather than a few pixels off at each end.
      const usable = Math.max(1, box.width - THUMB * 2);
      const position = Math.min(
        1,
        Math.max(0, (clientX - box.left - THUMB) / usable),
      );
      const raw = Math.round(min + position * span);
      // A magnet on each preset. Landing exactly on −15% by hand is a pixel-perfect
      // gesture otherwise, and the presets are the values hosts actually want.
      const nearest = presets.find((preset) => Math.abs(raw - preset) <= 2);
      return nearest ?? raw;
    },
    [presets, min, span],
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div
        ref={trackRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Math.round(clamped)}
        aria-valuetext={formatPreset(Math.round(value))}
        aria-disabled={disabled || undefined}
        onPointerDown={(event) => {
          if (disabled) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          onChange(valueAt(event.clientX));
        }}
        onPointerMove={(event) => {
          // `setPointerCapture` routes every move here until release, so the host can
          // drag well outside the track — including off the panel — without losing it.
          if (disabled || !event.currentTarget.hasPointerCapture(event.pointerId)) {
            return;
          }
          onChange(valueAt(event.clientX));
        }}
        onKeyDown={(event) => {
          if (disabled) return;
          const step =
            event.key === "ArrowRight"
              ? 1
              : event.key === "ArrowLeft"
                ? -1
                : event.key === "Home"
                  ? min - clamped
                  : event.key === "End"
                    ? max - clamped
                    : 0;
          if (step === 0) return;
          event.preventDefault();
          onChange(
            Math.max(
              min,
              Math.min(max, clamped + step * (event.shiftKey ? 5 : 1)),
            ),
          );
        }}
        className={cn(
          "relative h-7 touch-none",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a]",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        )}
      >
        <span
          aria-hidden
          className="absolute inset-x-0 top-[0.6875rem] h-1.5 rounded-full bg-slate-100"
        />
        <span
          aria-hidden
          className="absolute top-[0.6875rem] h-1.5 rounded-full bg-[#0f172a]"
          style={{ left: `${low}%`, width: `${high - low}%` }}
        />
        {/* The anchor itself, marked on the track so the middle is a place rather than
            just where the fill happens to start. */}
        {origin === "center" ? (
          <span
            aria-hidden
            className="absolute left-1/2 top-2 -ml-px h-3 w-0.5 rounded-sm bg-slate-300"
          />
        ) : null}
        {/* Inset by its own radius at each end. A handle centred on a plain percentage
            hangs half its width past the track, and at the extremes that is half a
            handle outside the panel — which is exactly where a clamped value parks it. */}
        <span
          aria-hidden
          className="absolute top-0.5 size-6 -translate-x-1/2 rounded-full border-2 border-[#0f172a] bg-white shadow-sm"
          style={{
            left: `calc(${ratio}% + ${THUMB - (ratio / 100) * THUMB * 2}px)`,
          }}
        />
      </div>

      <div className="flex justify-between gap-1">
        {presets.map((preset) => {
          const active = Math.round(value) === preset;
          return (
            <button
              key={preset}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => onChange(preset)}
              className={cn(
                "min-h-8 rounded-lg px-2 text-[0.75rem] font-semibold tabular-nums",
                "transition-colors duration-150 motion-reduce:transition-none",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a]",
                "disabled:cursor-not-allowed disabled:opacity-50",
                active
                  ? "bg-[#f8fafc] text-[#0f172a]"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
              )}
            >
              {formatPreset(preset)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
