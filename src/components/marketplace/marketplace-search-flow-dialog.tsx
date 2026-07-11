"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { CalendarRange, MapPin, Search, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PropertyTypeOption } from "@/lib/types/property-type";
import { sortPropertyTypesInDisplayOrder } from "@/lib/property-type-filter";
import {
  countsToGuestsParam,
  type GuestCounts,
} from "@/components/marketplace/marketplace-guest-selector";
import {
  DateFlexibilityRow,
  DateRangeCalendarStep,
  GuestCountsStep,
} from "@/components/marketplace/marketplace-stay-date-picker";

type SearchFlowStep = "where" | "when" | "who";

type SearchFlowState = {
  city: string;
  checkIn: string;
  checkOut: string;
  guestCounts: GuestCounts;
  dateFlexibility: number;
  propertyTypes: string[];
};

const PROPERTY_TYPE_ICONS = {
  APARTMENT: "Building2",
  HOUSE: "Home",
  VILLA: "Castle",
  STUDIO: "Warehouse",
  CABIN: "TreePine",
  COTTAGE: "Tent",
  LOFT: "Building2",
  OTHER: "Home",
} as const;

function parseLocalYmd(s: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? undefined : dt;
}

function formatDateSummary(checkIn: string, checkOut: string): string {
  const from = parseLocalYmd(checkIn);
  const to = parseLocalYmd(checkOut);

  if (from && to) return `${format(from, "MMM d")} - ${format(to, "MMM d")}`;
  if (from) return format(from, "MMM d");
  return "Any dates";
}

function formatGuestSummary(guestCounts: GuestCounts): string {
  const guestsParam = countsToGuestsParam(guestCounts);
  if (!guestsParam) return "Add guests";
  return guestsParam === "1" ? "1 guest" : `${guestsParam} guests`;
}

function getWhereSummary(city: string): string {
  return city.trim() || "Anywhere";
}

export function MarketplaceSearchFlowDialog({
  open,
  onOpenChange,
  initialState,
  popularCities,
  availablePropertyTypesByCity,
  propertyTypes,
  showPropertyTypes,
  onApplySearch,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialState: SearchFlowState;
  popularCities: string[];
  availablePropertyTypesByCity: Record<string, string[]>;
  propertyTypes: PropertyTypeOption[];
  showPropertyTypes: boolean;
  onApplySearch: (next: SearchFlowState) => void;
}) {
  const [step, setStep] = React.useState<SearchFlowStep>("where");
  const [draftCity, setDraftCity] = React.useState(initialState.city);
  const [draftCheckIn, setDraftCheckIn] = React.useState(initialState.checkIn);
  const [draftCheckOut, setDraftCheckOut] = React.useState(initialState.checkOut);
  const [draftGuestCounts, setDraftGuestCounts] = React.useState(
    initialState.guestCounts
  );
  const [draftDateFlexibility, setDraftDateFlexibility] = React.useState(
    initialState.dateFlexibility
  );
  const [draftPropertyTypes, setDraftPropertyTypes] = React.useState(
    initialState.propertyTypes
  );
  const inputRef = React.useRef<HTMLInputElement>(null);
  const bodyScrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    // Reset the staged flow state every time the dialog opens so re-opening
    // starts from the committed search values instead of abandoned drafts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStep("where");
    setDraftCity(initialState.city);
    setDraftCheckIn(initialState.checkIn);
    setDraftCheckOut(initialState.checkOut);
    setDraftGuestCounts(initialState.guestCounts);
    setDraftDateFlexibility(initialState.dateFlexibility);
    setDraftPropertyTypes(initialState.propertyTypes);
  }, [open, initialState]);

  React.useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open || step !== "where") return;
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [open, step]);

  React.useEffect(() => {
    if (!open) return;
    bodyScrollRef.current?.scrollTo({ top: 0 });
  }, [open, step]);

  const filteredCities = React.useMemo(() => {
    const q = draftCity.trim().toLowerCase();
    const sorted = [...popularCities].sort((a, b) => a.localeCompare(b));
    if (!q) return sorted;

    return sorted
      .filter((name) => name.toLowerCase().includes(q))
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.toLowerCase().startsWith(q) ? 0 : 1;
        return aStarts - bStarts || a.localeCompare(b);
      });
  }, [draftCity, popularCities]);

  const selectedCity = React.useMemo(() => {
    const normalizedDraftCity = draftCity.trim().toLowerCase();
    if (!normalizedDraftCity) return null;

    return (
      popularCities.find(
        (candidate) => candidate.toLowerCase() === normalizedDraftCity
      ) ?? null
    );
  }, [draftCity, popularCities]);

  const availablePropertyTypes = React.useMemo(() => {
    if (!selectedCity) return [];
    return availablePropertyTypesByCity[selectedCity] ?? [];
  }, [availablePropertyTypesByCity, selectedCity]);
  const allPropertyTypeValues = React.useMemo(
    () => [...new Set(Object.values(availablePropertyTypesByCity).flat())],
    [availablePropertyTypesByCity]
  );

  React.useEffect(() => {
    if (!showPropertyTypes || !open || !selectedCity) return;
    // Prunes any previously selected types that no longer belong to the
    // active city. This is an intentional sync against the city-specific list.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraftPropertyTypes((current) =>
      sortPropertyTypesInDisplayOrder(
        current.filter((value) => availablePropertyTypes.includes(value)),
        allPropertyTypeValues
      )
    );
  }, [
    allPropertyTypeValues,
    availablePropertyTypes,
    open,
    selectedCity,
    showPropertyTypes,
  ]);

  const selectedRange = React.useMemo<DateRange | undefined>(() => {
    const from = parseLocalYmd(draftCheckIn);
    const to = parseLocalYmd(draftCheckOut);
    if (!from && !to) return undefined;
    if (from && to) return { from, to };
    if (from) return { from, to: undefined };
    return undefined;
  }, [draftCheckIn, draftCheckOut]);

  const canGoToWho = Boolean(selectedRange?.from && selectedRange?.to);

  const handleClose = () => onOpenChange(false);

  const handleReset = () => {
    if (step === "where") {
      setDraftCity("");
      setDraftPropertyTypes([]);
      return;
    }

    if (step === "when") {
      setDraftCheckIn("");
      setDraftCheckOut("");
      setDraftDateFlexibility(0);
      return;
    }

    setDraftGuestCounts({
      adults: 0,
      children: 0,
      infants: 0,
      pets: 0,
    });
  };

  const handleNext = () => {
    if (step === "where") {
      setStep("when");
      return;
    }

    if (step === "when") {
      if (!canGoToWho) return;
      setStep("who");
    }
  };

  const handleBack = () => {
    if (step === "when") {
      setStep("where");
      return;
    }

    if (step === "who") {
      setStep("when");
    }
  };

  const handleApplySearch = () => {
    onApplySearch({
      city: draftCity.trim(),
      checkIn: draftCheckIn,
      checkOut: draftCheckOut,
      guestCounts: draftGuestCounts,
      dateFlexibility: draftDateFlexibility,
      propertyTypes: draftPropertyTypes,
    });
    handleClose();
  };

  const toggleType = (value: string) => {
    if (!availablePropertyTypes.includes(value)) return;
    const next = new Set(draftPropertyTypes);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setDraftPropertyTypes(
      sortPropertyTypesInDisplayOrder([...next], allPropertyTypeValues)
    );
  };

  const stepCards = [
    {
      key: "where" as const,
      label: "Where",
      summary: getWhereSummary(draftCity),
      icon: MapPin,
      enabled: true,
    },
    {
      key: "when" as const,
      label: "When",
      summary: formatDateSummary(draftCheckIn, draftCheckOut),
      icon: CalendarRange,
      enabled: true,
    },
    {
      key: "who" as const,
      label: "Who",
      summary: formatGuestSummary(draftGuestCounts),
      icon: Users,
      enabled: canGoToWho || step === "who",
    },
  ];

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs" />
        <DialogPrimitive.Content
          className="fixed z-50 flex flex-col overflow-hidden border border-border/60 bg-background text-popover-foreground shadow-2xl outline-none left-3 right-3 top-4 bottom-4 h-auto max-h-[calc(100dvh-2rem)] rounded-[2rem] md:left-1/2 md:right-auto md:top-1/2 md:bottom-auto md:h-[50rem] md:max-h-[calc(100dvh-5rem)] md:w-[44rem] md:max-w-[calc(100vw-6rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[2rem]"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="sr-only">
            <DialogPrimitive.Title>
              {step === "where"
                ? "Where"
                : step === "when"
                  ? "When"
                  : "Who"}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description>
              Complete your stay search in three steps.
            </DialogPrimitive.Description>
          </div>

          <div className="border-b border-border/70 bg-background px-4 pt-4 pb-4 md:px-6 md:pt-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <p className="text-lg font-semibold text-foreground md:text-2xl">
                {step === "where"
                  ? "Where"
                  : step === "when"
                    ? "When"
                    : "Who"}
              </p>
              <button
                type="button"
                onClick={handleClose}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Close search"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 md:gap-3">
              {stepCards.map(({ key, label, summary, icon: Icon, enabled }) => {
                const active = step === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      if (enabled) setStep(key);
                    }}
                    disabled={!enabled}
                    className={cn(
                      "min-w-0 rounded-xl border px-3 py-3 text-left transition-colors md:rounded-2xl md:px-4",
                      active
                        ? "border-foreground bg-muted/40"
                        : "border-border bg-background hover:bg-muted/30",
                      !enabled && "cursor-not-allowed opacity-50 hover:bg-background"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 text-muted-foreground">
                        <Icon className="h-4 w-4" strokeWidth={1.9} />
                      </span>
                      <div className="min-w-0">
                        <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          {label}
                        </span>
                        <span className="mt-1 block truncate text-sm font-semibold text-foreground">
                          {summary}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {step === "when" ? (
            <>
              <DateRangeCalendarStep
                active={open && step === "when"}
                selected={selectedRange}
                onRangeChange={(range) => {
                  if (!range?.from) {
                    setDraftCheckIn("");
                    setDraftCheckOut("");
                    return;
                  }

                  setDraftCheckIn(format(range.from, "yyyy-MM-dd"));
                  setDraftCheckOut(
                    range.to ? format(range.to, "yyyy-MM-dd") : ""
                  );
                }}
              />
              <div className="shrink-0 border-t border-border bg-background px-4 py-3 md:px-6">
                <DateFlexibilityRow
                  value={draftDateFlexibility}
                  onChange={setDraftDateFlexibility}
                />
              </div>
            </>
          ) : (
          <div
            ref={bodyScrollRef}
            className="flex-1 min-h-0 overflow-y-auto px-4 py-5 md:px-6 md:py-6"
          >
            {step === "where" ? (
              <div className="mx-auto w-full max-w-2xl">
                <div className="rounded-[1.5rem] border border-border bg-background px-4 py-3 md:rounded-[1.75rem] md:px-5 md:py-4">
                  <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground md:text-[11px]">
                    Search destinations
                  </label>
                  <div className="mt-2 flex items-center gap-3">
                    <MapPin className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <input
                      ref={inputRef}
                      type="text"
                      value={draftCity}
                      onChange={(e) => setDraftCity(e.target.value)}
                      placeholder="Search listing cities"
                      className="w-full min-w-0 border-0 bg-transparent p-0 text-base font-medium text-foreground outline-none placeholder:text-muted-foreground/80"
                    />
                  </div>
                </div>

                <div className="mt-6">
                  <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    {draftCity.trim() ? "Matching cities" : "Cities with listings"}
                  </p>
                  <ul className="flex flex-col gap-1" role="list">
                    {filteredCities.length === 0 ? (
                      <li className="py-6 text-center text-sm text-muted-foreground">
                        No listing cities match that search
                      </li>
                    ) : (
                      filteredCities.map((name) => {
                        const selected =
                          draftCity.trim().toLowerCase() === name.toLowerCase();
                        return (
                          <li key={name}>
                            <button
                              type="button"
                              className={cn(
                                "flex w-full items-center gap-3 rounded-[1.25rem] border px-4 py-3 text-left transition-colors",
                                selected
                                  ? "border-foreground bg-muted/40"
                                  : "border-transparent hover:bg-muted/50"
                              )}
                              onClick={() => setDraftCity(name)}
                            >
                              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                                <MapPin className="h-5 w-5" strokeWidth={1.75} />
                              </span>
                              <span className="block min-w-0 font-semibold text-foreground">
                                {name}
                              </span>
                            </button>
                          </li>
                        );
                      })
                    )}
                  </ul>
                </div>

                {showPropertyTypes && (
                  <div className="mt-8">
                    <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Property type
                    </p>
                    {!selectedCity ? (
                      <p className="text-sm text-muted-foreground">
                        Select a city first to see available property types.
                      </p>
                    ) : availablePropertyTypes.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No property types are available in {selectedCity}.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2 pb-1">
                        {propertyTypes.filter(({ value }) =>
                          availablePropertyTypes.includes(value)
                        ).map(({ value, label }) => {
                          const selected = draftPropertyTypes.includes(value);
                          void PROPERTY_TYPE_ICONS;
                          return (
                            <button
                              key={value}
                              type="button"
                              onClick={() => toggleType(value)}
                              className={cn(
                                "inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors",
                                selected
                                  ? "border-foreground bg-background text-foreground shadow-sm"
                                  : "border-border bg-background text-foreground hover:bg-muted/50"
                              )}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <GuestCountsStep
                guestCounts={draftGuestCounts}
                onGuestCountsChange={setDraftGuestCounts}
              />
            )}
          </div>
          )}

          <div className="shrink-0 border-t border-border bg-background px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:px-6 md:pb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="outline"
                className="self-start rounded-full sm:min-w-[7rem]"
                onClick={handleReset}
              >
                Reset
              </Button>
              <div className="flex w-full items-center justify-end gap-3 sm:w-auto">
                {step !== "where" ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-w-[7rem] rounded-full"
                    onClick={handleBack}
                  >
                    Back
                  </Button>
                ) : null}
                {step === "who" ? (
                  <Button
                    type="button"
                    className="min-w-[7rem] rounded-full"
                    onClick={handleApplySearch}
                  >
                    <Search className="mr-2 h-4 w-4" />
                    Search
                  </Button>
                ) : (
                  <Button
                    type="button"
                    className="min-w-[7rem] rounded-full"
                    disabled={step === "when" && !canGoToWho}
                    onClick={handleNext}
                  >
                    Next
                  </Button>
                )}
              </div>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
