"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { ArrowLeft, MapPin, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GuestCounts } from "@/components/marketplace/marketplace-guest-selector";
import {
  DateFlexibilityRow,
  DateRangeCalendarStep,
  GuestCountsStep,
} from "@/components/marketplace/marketplace-stay-date-picker";
import { placeKey, placeLabel, type PlaceOption } from "@/lib/utils/place";

type SearchFlowStep = "where" | "when" | "who";

type SearchFlowState = {
  city: string;
  /** Only set when `city` is a known exact match (picked from the list). */
  country: string;
  checkIn: string;
  checkOut: string;
  guestCounts: GuestCounts;
  dateFlexibility: number;
  propertyTypes: string[];
};

function parseLocalYmd(s: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? undefined : dt;
}

export function MarketplaceSearchFlowDialog({
  open,
  onOpenChange,
  initialState,
  popularCities,
  onApplySearch,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialState: SearchFlowState;
  popularCities: PlaceOption[];
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
    const sorted = [...popularCities].sort((a, b) => a.city.localeCompare(b.city));
    if (!q) return sorted;

    return sorted
      .filter(
        (place) =>
          place.city.toLowerCase().includes(q) ||
          place.country.toLowerCase().includes(q)
      )
      .sort((a, b) => {
        const aStarts = a.city.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.city.toLowerCase().startsWith(q) ? 0 : 1;
        return aStarts - bStarts || a.city.localeCompare(b.city);
      });
  }, [draftCity, popularCities]);

  // Exact match by city name only — ambiguous if the same city name exists in more
  // than one country; disambiguation happens by picking a specific row instead.
  const selectedPlace = React.useMemo(() => {
    const normalizedDraftCity = draftCity.trim().toLowerCase();
    if (!normalizedDraftCity) return null;

    return (
      popularCities.find(
        (candidate) => candidate.city.toLowerCase() === normalizedDraftCity
      ) ?? null
    );
  }, [draftCity, popularCities]);

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
    if (step === "when" && canGoToWho) {
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
      country: selectedPlace?.country ?? "",
      checkIn: draftCheckIn,
      checkOut: draftCheckOut,
      guestCounts: draftGuestCounts,
      dateFlexibility: draftDateFlexibility,
      propertyTypes: draftPropertyTypes,
    });
    handleClose();
  };

  const selectCity = (city: string) => {
    setDraftCity(city);
    // A city tap is unambiguous, so move straight to the next step instead of
    // making the user press an extra "Next" button.
    setStep("when");
  };

  const stepTabs: { key: SearchFlowStep; label: string }[] = [
    { key: "where", label: "Where" },
    { key: "when", label: "When" },
    { key: "who", label: "Who" },
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
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 md:gap-5">
                {stepTabs.map(({ key, label }) => {
                  const active = step === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setStep(key)}
                      className={cn(
                        "border-b-2 pb-1 text-sm font-semibold transition-colors md:text-base",
                        active
                          ? "border-foreground text-foreground"
                          : "border-transparent text-muted-foreground hover:text-foreground/70"
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleApplySearch}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Search now"
                >
                  <Search className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Close search"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
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
                      filteredCities.map((place) => {
                        const selected =
                          draftCity.trim().toLowerCase() === place.city.toLowerCase();
                        return (
                          <li key={placeKey(place)}>
                            <button
                              type="button"
                              className={cn(
                                "flex w-full items-center gap-3 rounded-[1.25rem] border px-4 py-3 text-left transition-colors",
                                selected
                                  ? "border-foreground bg-muted/40"
                                  : "border-transparent hover:bg-muted/50"
                              )}
                              onClick={() => selectCity(place.city)}
                            >
                              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                                <MapPin className="h-5 w-5" strokeWidth={1.75} />
                              </span>
                              <span className="block min-w-0 font-semibold text-foreground">
                                {placeLabel(place)}
                              </span>
                            </button>
                          </li>
                        );
                      })
                    )}
                  </ul>
                </div>
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
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {step !== "where" ? (
                  <button
                    type="button"
                    onClick={handleBack}
                    aria-label="Back"
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-muted"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={handleReset}
                >
                  Reset
                </Button>
              </div>
              {step !== "where" ? (
                step === "who" ? (
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
                    className="min-w-[9rem] rounded-full"
                    disabled={!canGoToWho}
                    onClick={handleNext}
                  >
                    Who&apos;s coming
                  </Button>
                )
              ) : null}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
