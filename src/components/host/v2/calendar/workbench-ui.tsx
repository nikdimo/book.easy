"use client";

import { useId, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Minus, Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { StepperButton } from "@/components/host/v2/stepper-button";
import { cn } from "@/lib/utils";

/**
 * The small vocabulary the redesigned panel is built from.
 *
 * The old panel drew a border around everything: an outlined card inside an outlined
 * aside, each with its own accent edge when open, so nothing on screen looked more
 * important than anything else. These primitives use separators and weight instead, and
 * keep the one strong colour for the thing the host is actually about to do.
 *
 * What says "tap me" here is the chevron and the separator, never elevation: the panel
 * is itself a drawer on a phone, and raised cards inside it would be a third layer of
 * depth saying nothing. The rows carry a press state as well as a hover one, because
 * the surface where these are hardest to read as buttons is the one with no pointer.
 *
 * Touch targets are at least 44px throughout. That is not a style choice — the panel
 * becomes a full-height drawer on a phone, where every row here is thumb-operated.
 */

/** A row in the summary menu: what it is, where it stands, and a way in. */
export function SummaryRow({
  label,
  value,
  attention,
  reveal,
  revealIndex = 0,
  onClick,
  anchor,
}: {
  label: string;
  /** The truthful current state, in a word or a short phrase. */
  value: string;
  /** Amber value text. Reserved for a state the host has to deal with. */
  attention?: boolean;
  /**
   * Play the arrival: the row settles in from the right as the dates become live.
   *
   * The three rows together are the answer to "I picked dates, now what?", and the
   * eye follows the stagger down the list — which is the path the host has to take.
   * The panel used to say this with a one-pixel rail down its outer edge, which was
   * both outside the thing it pointed at and too thin to see.
   */
  reveal?: boolean;
  /** Position in the list. Each row starts a beat after the one above it. */
  revealIndex?: number;
  onClick: () => void;
  anchor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...(anchor ? { id: anchor, "data-linger-anchor": anchor } : {})}
      style={reveal ? { animationDelay: `${revealIndex * 70}ms` } : undefined}
      className={cn(
        "flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-2 text-left",
        "transition-colors duration-150 hover:bg-slate-50 active:bg-slate-100 motion-reduce:transition-none",
        "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0f172a]",
        reveal && "calendar-menu-row-reveal",
      )}
    >
      {/* Both sides truncate. `shrink-0` on the value looked right for the short ones
          it was designed around — a price, a word — and then a long value refused to
          shrink, pushed past its own box and printed itself over the wrapped label. A
          row is one line each way, and `title` keeps the full text reachable. */}
      <span className="min-w-0 flex-1 truncate text-[0.875rem] font-medium text-slate-900">
        {label}
      </span>
      <span
        title={value}
        className={cn(
          "min-w-0 max-w-[60%] truncate text-right text-[0.8125rem]",
          attention ? "font-medium text-amber-700" : "text-slate-500",
        )}
      >
        {value}
      </span>
      <ChevronRight className="size-4 shrink-0 text-slate-400" aria-hidden />
    </button>
  );
}

/** A quiet secondary destination — scheduled changes, connected calendars. */
export function QuietRow({
  icon: Icon,
  label,
  hint,
  onClick,
  href,
  anchor,
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  onClick?: () => void;
  /** Given instead of `onClick` when the destination is another page. */
  href?: string;
  anchor?: string;
}) {
  const content = (
    <>
      <Icon className="size-4 shrink-0 text-slate-400" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-[0.8125rem] font-medium text-slate-700">
          {label}
        </span>
        {hint ? (
          <span className="mt-0.5 block text-[0.75rem] leading-4 text-slate-400">
            {hint}
          </span>
        ) : null}
      </span>
      <ChevronRight className="size-4 shrink-0 text-slate-400" aria-hidden />
    </>
  );
  const className = cn(
    "flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-2 text-left",
    "transition-colors duration-150 hover:bg-slate-50 active:bg-slate-100 motion-reduce:transition-none",
    "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0f172a]",
  );
  const anchorProps = anchor
    ? { id: anchor, "data-linger-anchor": anchor }
    : {};

  if (href) {
    return (
      <a href={href} className={className} {...anchorProps}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className} {...anchorProps}>
      {content}
    </button>
  );
}

/**
 * Two mutually exclusive answers to one question.
 *
 * Coral marks the chosen one and nothing else on the row, so "which of these two am I
 * about to do" is answerable at a glance without reading either label twice.
 */
export function SegmentedChoice<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T | null;
  options: Array<{ value: T; label: string; icon?: LucideIcon; disabled?: boolean }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-2">
      {options.map((option) => {
        const Icon = option.icon;
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-[0.875rem] font-semibold",
              "transition-colors duration-150 motion-reduce:transition-none",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a]",
              "disabled:cursor-not-allowed disabled:opacity-40",
              selected
                ? "bg-[#f8fafc] text-[#0f172a] ring-1 ring-inset ring-[#0f172a]"
                : "bg-slate-50 text-slate-700 hover:bg-slate-100",
            )}
          >
            {Icon ? <Icon className="size-4" aria-hidden /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * An explanation the host can ask for.
 *
 * Everything that used to sit permanently under the controls — availability counts,
 * why a date is not bookable, the full price arithmetic — lives behind one of these.
 * Closed by default, because the panel's job is to let the host act, and an answer to
 * a question nobody asked is the thing that made it feel crowded.
 */
export function Disclosure({
  label,
  children,
  defaultOpen,
}: {
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const id = useId();
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={id}
        className={cn(
          "flex min-h-11 w-full items-center gap-1.5 text-left text-[0.8125rem] font-medium",
          "text-[#0f172a] transition-colors duration-150 hover:text-[#0f172a] motion-reduce:transition-none",
          "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0f172a]",
        )}
      >
        <ChevronDown
          className={cn(
            "size-4 shrink-0 transition-transform duration-150 motion-reduce:transition-none",
            !open && "-rotate-90",
          )}
          aria-hidden
        />
        {label}
      </button>
      {/* Indented to clear the chevron, so the answer reads as belonging to the
          question rather than as a new section. */}
      {open ? (
        <div
          id={id}
          className="pb-1 pl-[1.375rem] text-[0.8125rem] leading-5 text-slate-600"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** The one sentence under a control that says what saving would do. */
export function ConsequenceLine({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "warning" | "good";
}) {
  return (
    <p
      className={cn(
        "text-[0.8125rem] leading-5",
        tone === "warning"
          ? "text-amber-700"
          : tone === "good"
            ? "text-teal-700"
            : "text-slate-600",
      )}
    >
      {children}
    </p>
  );
}

/** A read-only fact the editor has to state but does not own. */
export function InfoRow({
  label,
  action,
  onAction,
}: {
  label: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-slate-100 pt-3 text-[0.75rem] leading-4 text-slate-500">
      <span>{label}</span>
      {action && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="min-h-11 font-semibold text-[#0f172a] underline underline-offset-2 transition-colors duration-150 hover:text-[#0f172a] motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a]"
        >
          {action}
        </button>
      ) : null}
    </p>
  );
}

/**
 * One number, as a column: what it is, the number itself, and what it means.
 *
 * Every editor here ended up asking for two numbers at once — a price and its
 * percentage, a discount and a minimum stay — and each grew its own arrangement of
 * labels and dividers. This is the one arrangement: label above, the value on a single
 * underline that hugs it, a caption beneath. Two of them side by side under
 * `justify-evenly` is the whole layout.
 *
 * The field is sized to its own contents rather than stretched, so the unit stays next
 * to the digits instead of drifting to the far side of a column.
 */
export function NumberColumn({
  id,
  label,
  caption,
  value,
  prefix,
  suffix,
  ariaLabel,
  accent,
  disabled,
  onChange,
  onBlur,
}: {
  id?: string;
  label: string;
  /** The line underneath — the unit, or what the number is relative to. */
  caption: string;
  value: string;
  prefix?: string;
  suffix?: string;
  ariaLabel?: string;
  /** Coral, for a value that differs from the thing it is measured against. */
  accent?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
  onBlur?: () => void;
}) {
  /**
   * Whether this click is the one that focused the field.
   *
   * Focusing selects the whole amount, so a host who wants €150 instead of €138 types
   * three characters rather than clearing two first — these fields hold a number to
   * replace, never a sentence to edit. The browser's own mouseup would collapse that
   * selection to a caret again, so it is suppressed for the click that arrived from
   * outside the field. A second click inside still places the caret, which is the one
   * case where a host does want to keep most of what is there.
   */
  const focusedByThisClick = useRef(false);
  const unitClass = cn(
    "text-[1.125rem] font-semibold",
    accent ? "text-[#0f172a]" : "text-slate-500",
  );
  return (
    <div className="text-center">
      <label
        htmlFor={id}
        className="block text-[0.75rem] text-slate-500"
      >
        {label}
      </label>
      <span className="mt-0.5 inline-flex items-baseline gap-0.5 border-b-2 border-slate-200 px-0.5 pb-0.5 focus-within:border-[#0f172a]">
        {prefix ? <span className={unitClass}>{prefix}</span> : null}
        <input
          id={id}
          type="text"
          inputMode="numeric"
          value={value}
          aria-label={ariaLabel ?? label}
          disabled={disabled}
          style={{ width: `${Math.max(1, value.length)}ch` }}
          onChange={(event) => onChange(event.target.value)}
          onMouseDown={(event) => {
            focusedByThisClick.current =
              document.activeElement !== event.currentTarget;
          }}
          onFocus={(event) => event.currentTarget.select()}
          onMouseUp={(event) => {
            if (focusedByThisClick.current) event.preventDefault();
            focusedByThisClick.current = false;
          }}
          onBlur={onBlur}
          className={cn(
            "border-0 bg-transparent p-0 text-center text-[1.5rem] font-semibold tabular-nums outline-none disabled:opacity-50",
            accent ? "text-[#0f172a]" : "text-slate-900",
          )}
        />
        {suffix ? <span className={unitClass}>{suffix}</span> : null}
      </span>
      <span className="mt-1 block text-[0.75rem] text-slate-400">{caption}</span>
    </div>
  );
}

/**
 * A whole number, stepped rather than typed.
 *
 * Minimum stay is two to seven nights in almost every case. Dragging a slider to land
 * exactly on five is a pixel-perfect gesture; − and + is one tap and cannot miss.
 */
export function StepperColumn({
  label,
  caption,
  value,
  min = 1,
  disabled,
  decrementLabel,
  incrementLabel,
  onChange,
}: {
  label: string;
  caption: string;
  value: number;
  min?: number;
  disabled?: boolean;
  decrementLabel: string;
  incrementLabel: string;
  onChange: (value: number) => void;
}) {
  const step = (delta: number) => onChange(Math.max(min, value + delta));
  return (
    <div className="text-center">
      <span className="block text-[0.75rem] text-slate-500">{label}</span>
      <div className="mt-0.5 flex items-center justify-center gap-2">
        <StepperButton
          label={decrementLabel}
          disabled={disabled || value <= min}
          onClick={() => step(-1)}
        >
          <Minus className="size-4" aria-hidden />
        </StepperButton>
        <span
          aria-live="polite"
          className="min-w-8 text-center text-[1.5rem] font-semibold tabular-nums text-slate-900"
        >
          {value}
        </span>
        <StepperButton
          label={incrementLabel}
          disabled={disabled}
          onClick={() => step(1)}
        >
          <Plus className="size-4" aria-hidden />
        </StepperButton>
      </div>
      <span className="mt-1 block text-[0.75rem] text-slate-400">{caption}</span>
    </div>
  );
}

/** The row the two columns sit in: equal space at both edges and between them. */
export function ColumnPair({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-end justify-evenly gap-3">{children}</div>
  );
}

/** A labelled field group inside a focused editor. No border, just rhythm. */
export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-[0.8125rem] font-semibold text-slate-700"
      >
        {label}
      </label>
      {children}
      {hint ? (
        <p className="text-[0.75rem] leading-4 text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * A yes/no that belongs beside the decision rather than behind a disclosure.
 *
 * Waiving the cleaning fee is not a preference — it changes what a guest pays, by an
 * amount comparable to the discount slider directly above it. Filed under "More
 * options" it was a second offer the host could not see while choosing the first, so
 * this sits in the flow and states its own consequence, the way the old calendar's
 * option toggles did.
 */
export function ToggleRow({
  checked,
  label,
  description,
  disabled = false,
  onChange,
}: {
  checked: boolean;
  label: string;
  /** What turning it on does, in the guest's terms. */
  description?: string;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  // The knob is the shared Switch — the same control the listings list uses — so a host
  // never has to learn two on/off shapes. The row around it stays clickable, which on a
  // phone is most of the target, and hands the click to the switch rather than drawing
  // a second one.
  return (
    <div
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
      className={cn(
        "flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left",
        "transition-colors duration-150 motion-reduce:transition-none",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        checked ? "bg-[#f8fafc]" : "bg-slate-50",
        !disabled && !checked && "hover:bg-slate-100",
      )}
    >
      <span className="min-w-0">
        <span
          className={cn(
            "block text-[0.8125rem] font-semibold",
            checked ? "text-[#0f172a]" : "text-slate-900",
          )}
        >
          {label}
        </span>
        {description ? (
          <span
            className={cn(
              "mt-0.5 block text-[0.75rem] leading-4",
              checked ? "text-[#0f172a]" : "text-slate-500",
            )}
          >
            {description}
          </span>
        ) : null}
      </span>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-label={label}
        onClick={(event) => event.stopPropagation()}
        className="shrink-0"
      />
    </div>
  );
}
