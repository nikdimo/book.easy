"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * The three groups of the payment-arrangements section, as tabs.
 *
 * They were one long scroll: methods, then deposits, then the cancellation policy,
 * separated by rules. Three separately-saved forms stacked in one column read as one
 * unfinished form — a host who had saved the methods still saw two Save buttons below
 * and could not tell what was outstanding. Tabs make each group a place you are either
 * in or not, and each keeps its own Save exactly as it had.
 *
 * The panels are all mounted and the inactive ones hidden, not unmounted: every editor
 * holds its own unsaved draft in local state, and switching tabs must not be a way to
 * silently discard typing.
 */
export type PaymentArrangementsTabId = "methods" | "deposits" | "cancellation";

export function PaymentArrangementsTabStrip({
  tabs,
  active,
  onSelect,
}: {
  tabs: { id: PaymentArrangementsTabId; label: string }[];
  active: PaymentArrangementsTabId;
  onSelect: (id: PaymentArrangementsTabId) => void;
}) {
  const strip = useRef<HTMLDivElement>(null);

  /** Arrow keys move between tabs, which is what `role="tablist"` promises. */
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const delta =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    const index = tabs.findIndex((tab) => tab.id === active);
    const next = tabs[(index + delta + tabs.length) % tabs.length];
    onSelect(next.id);
    strip.current
      ?.querySelector<HTMLButtonElement>(`#${tabPanelId(next.id)}-tab`)
      ?.focus();
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* Scrolls sideways rather than wrapping: three labels in a long language must
          not become two rows that push the form down on a phone. */}
      <div
        ref={strip}
        role="tablist"
        onKeyDown={onKeyDown}
        className="-mx-4 flex gap-1 overflow-x-auto border-b border-slate-200 px-4 md:mx-0 md:px-0"
      >
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`${tabPanelId(tab.id)}-tab`}
              aria-selected={selected}
              aria-controls={tabPanelId(tab.id)}
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(tab.id)}
              className={cn(
                "-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 pb-3 pt-1 font-heading text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400",
                selected
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** One panel. Hidden rather than unmounted, so an unsaved draft survives a tab change. */
export function PaymentArrangementsTabPanel({
  id,
  active,
  children,
}: {
  id: PaymentArrangementsTabId;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={tabPanelId(id)}
      aria-labelledby={`${tabPanelId(id)}-tab`}
      hidden={!active}
      tabIndex={active ? 0 : -1}
      className={cn("outline-none", active ? "block" : "hidden")}
    >
      {children}
    </div>
  );
}

export function tabPanelId(id: PaymentArrangementsTabId) {
  return `payment-arrangements-${id}`;
}
