"use client";

import { useState } from "react";
import { CalendarCheck2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CALENDAR_BLOCKS,
  FIXED_PERIODS,
  FIXED_PERIODS_EMPTY,
  LAB_TODAY,
  LISTING,
} from "./fixtures";
import { dayMonthYear } from "./display";
import { CalendarStage } from "./calendar-stage";
import { HostPanel } from "./host-panel";
import { GuestPanel, type GuestListingKind } from "./guest-panel";
import {
  MENU_VIEW,
  backFrom,
  openEditor,
  type BookingMode,
  type PanelView,
} from "./panel-view";
import type { FixedStayPeriod } from "./periods";

// Throwaway interactive mockup for the fixed stay periods feature. Nothing outside
// src/app/(dev) imports this file, and nothing here reads or writes anything real.

type Perspective = "host" | "guest";
type Scenario = "populated" | "empty";

const PERSPECTIVES: { value: Perspective; label: string }[] = [
  { value: "host", label: "Host" },
  { value: "guest", label: "Guest" },
];

const SCENARIOS: { value: Scenario; label: string }[] = [
  { value: "populated", label: "With stays" },
  { value: "empty", label: "Empty listing" },
];

export function FixedStaysLab() {
  const [perspective, setPerspective] = useState<Perspective>("host");
  const [scenario, setScenario] = useState<Scenario>("populated");
  const [mode, setMode] = useState<BookingMode>("fixed");
  const [guestKind, setGuestKind] = useState<GuestListingKind>("fixed");
  const [periods, setPeriods] = useState<FixedStayPeriod[]>(FIXED_PERIODS);
  /**
   * Where the host is inside the panel, and the number the flexible half holds.
   *
   * Both live above the panel so neither is lost on the way through it: leaving the
   * Booking method editor and coming back must not reset the minimum stay a host
   * already set, and it must not silently reset the mode either.
   */
  const [view, setView] = useState<PanelView>(MENU_VIEW);
  const [minNights, setMinNights] = useState(5);

  const changeScenario = (next: Scenario) => {
    setScenario(next);
    setPeriods(next === "populated" ? FIXED_PERIODS : FIXED_PERIODS_EMPTY);
  };

  // White, because the product is: `--background` is #ffffff and the host shell is
  // `bg-white`. A tinted lab page would have flattered a card treatment the real pages
  // could never reproduce.
  return (
    <div className="min-h-screen bg-white text-foreground">
      <div className="border-b bg-background/80 px-4 py-2 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            UI lab
          </span>
          <Pills
            options={PERSPECTIVES}
            value={perspective}
            onChange={setPerspective}
          />
          <Pills options={SCENARIOS} value={scenario} onChange={changeScenario} />
          {perspective === "guest" ? (
            <Pills
              options={[
                { value: "fixed" as const, label: "Fixed-stay listing" },
                { value: "flexible" as const, label: "Flexible (today)" },
              ]}
              value={guestKind}
              onChange={setGuestKind}
            />
          ) : null}
          <span className="ml-auto text-xs text-muted-foreground">
            Fixture data · today is {dayMonthYear(LAB_TODAY)}
          </span>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-7 sm:px-6">
        <header className="mb-6">
          <div className="flex items-center gap-2">
            <CalendarCheck2 className="size-5 text-muted-foreground" aria-hidden />
            <h1 className="text-2xl font-semibold tracking-tight">
              Fixed stay periods
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {perspective === "host"
              ? "Host → Calendar → select listing → editing panel → Booking method. Mockup, nothing is saved."
              : `${LISTING.title} · mockup, nothing is saved`}
          </p>
        </header>

        {perspective === "host" ? (
          <CalendarStage>
            {({ closeSheet }) => (
              <HostPanel
                view={view}
                onOpenEditor={(editor) => setView(openEditor(editor))}
                onBack={() => setView(backFrom(view))}
                onClose={closeSheet}
                mode={mode}
                onModeChange={setMode}
                minNights={minNights}
                onMinNightsChange={setMinNights}
                periods={periods}
                blocks={CALENDAR_BLOCKS}
                onPeriodsChange={setPeriods}
              />
            )}
          </CalendarStage>
        ) : (
          <GuestPanel
            kind={guestKind}
            periods={periods}
            blocks={CALENDAR_BLOCKS}
          />
        )}
      </main>
    </div>
  );
}

function Pills<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex gap-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-full px-3 py-1 text-xs transition-colors",
            value === option.value
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
