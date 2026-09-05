"use client";

import { Info, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { arrivalVisibilityNote } from "@/lib/i18n/arrival-guide-labels";
import { useI18n } from "@/lib/i18n/client";
import type { ArrivalFieldVisibility } from "@/lib/host/v2/listing-arrival-guide";

/**
 * The right-hand pane: one card's editor.
 *
 * Airbnb's shape, and the order matters more than it looks. Title, then the sentence that
 * says what the field is for, then the field — and the visibility note sits at the bottom
 * *above* Save, on the line the host's eye crosses on the way to pressing it. That is the
 * last thing they read before committing a door code, which is exactly where it belongs.
 *
 * The frame owns the footer so no editor can forget to say who will read what was typed.
 * `visibility` is required rather than optional for the same reason.
 */
export function ArrivalDetail({
  title,
  subtitle,
  visibility,
  /** Omitted by the two panes that are pure navigation (house rules, guidebooks): they
   *  have nothing of their own to commit. */
  onSave,
  saving = false,
  dirty = false,
  saveLabel,
  savingLabel,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  visibility: ArrivalFieldVisibility;
  onSave?: () => void;
  saving?: boolean;
  dirty?: boolean;
  saveLabel: string;
  savingLabel: string;
  children: React.ReactNode;
}) {
  const { resolve } = useI18n();

  return (
    // `ag-detail-enter` only animates below the split breakpoint, where this pane replaces
    // the list rather than sitting beside it — see globals.css.
    <div className="ag-detail-enter flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto px-6 py-8 lg:px-16 lg:py-14">
        <div className="mx-auto w-full max-w-[560px]">
          <h1 className="text-[2rem] font-semibold leading-9 tracking-[-0.01em]">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-3 text-base leading-[1.375rem] text-[var(--ag-foggy)]">
              {subtitle}
            </p>
          )}
          <div className="mt-8">{children}</div>
        </div>
      </div>

      {onSave && (
        <div className="shrink-0 border-t border-[var(--ag-bebe)] bg-white">
          <div className="mx-auto flex w-full max-w-[860px] flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-16">
            <p className="flex items-center gap-2 text-[0.8125rem] leading-[1.125rem] text-[var(--ag-foggy)]">
              {visibility === "PUBLIC" ? (
                <Info className="size-4 shrink-0" aria-hidden />
              ) : (
                <Lock className="size-4 shrink-0" aria-hidden />
              )}
              {arrivalVisibilityNote({ resolve }, visibility)}
            </p>
            <button
              type="button"
              onClick={onSave}
              // Disabled while clean is Airbnb's behaviour and it is also the honest one:
              // a Save that is always pressable teaches the host that pressing it means
              // nothing, and then they stop noticing when it is the thing they forgot.
              disabled={!dirty || saving}
              className="ag-save shrink-0 self-end sm:self-auto"
            >
              {saving ? savingLabel : saveLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A labelled control in Airbnb's bordered box: an 12px label riding above a 16px value.
 *
 * The label is a real `<label>` bound to the control rather than a placeholder, so it is
 * still there once the field has a value — which is the entire reason Airbnb uses this
 * shape instead of a placeholder that vanishes the moment it stops being needed.
 */
export function ArrivalField({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ag-field">
      <label className="ag-field-label" htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}

/** One or more `ArrivalField`s sharing an outer border, with a hairline between them.
 *  Airbnb joins a check-in window's two selects this way: they are one setting. */
export function ArrivalFieldGroup({ children }: { children: React.ReactNode }) {
  return <div className="ag-field-group bg-white">{children}</div>;
}

/**
 * A native `<select>` wearing Airbnb's field.
 *
 * Native rather than a custom listbox on purpose. This is a list of 48 half-hours, and a
 * phone's own wheel picker beats anything reimplementable — it is searchable by keyboard,
 * it scrolls to the current value, and it cannot trap focus. The appearance is stripped
 * and a chevron drawn in its place, which is all Airbnb's own control is once the popup
 * belongs to the platform.
 */
export function ArrivalSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <ArrivalField id={id} label={label}>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="ag-field-value cursor-pointer appearance-none pr-6 focus:outline-none"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className="pointer-events-none absolute right-0 top-1/2 size-4 -translate-y-1/2 text-[var(--ag-hof)]"
        >
          <path
            d="M4 6l4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </ArrivalField>
  );
}

/** A single-line text field in the same box. Used for the Wi-Fi pair. */
export function ArrivalTextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  autoComplete = "off",
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  autoComplete?: string;
  type?: "text" | "password";
}) {
  return (
    <ArrivalField id={id} label={label}>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete={autoComplete}
        // A Wi-Fi password is a password the browser has no business remembering as one:
        // it belongs to the property, not to this host's account, and offering to save it
        // in a password manager is how it ends up in the wrong vault.
        data-1p-ignore
        data-lpignore="true"
        className="ag-field-value focus:outline-none"
      />
    </ArrivalField>
  );
}

/**
 * The borderless long-form field.
 *
 * It grows with its content rather than scrolling inside a fixed box, because a host
 * writing a house manual needs to see what they have already written — the single most
 * common reason a manual ends up half-finished is that the box only ever showed three
 * lines of it.
 */
export function ArrivalProseField({
  id,
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  rows = 8,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength: number;
  rows?: number;
}) {
  const remaining = maxLength - value.length;
  // Only once the end is in sight. A counter that is always visible turns a description
  // into a form, and hosts start writing to the number instead of to the guest.
  const showCount = remaining <= Math.max(120, Math.round(maxLength * 0.1));

  return (
    <div>
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={rows}
        className="ag-prose-input"
        // Host-authored guest-facing copy: marked so the Google Translate layer leaves it
        // alone, the same treatment the description and the house rules get.
        data-user-generated-content
        translate="yes"
      />
      {showCount && (
        <p
          className={cn(
            "mt-2 text-right text-xs tabular-nums",
            remaining <= 0 ? "text-[var(--ag-arches)]" : "text-[var(--ag-foggy)]",
          )}
        >
          {remaining}
        </p>
      )}
    </div>
  );
}
