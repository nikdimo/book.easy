"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  Building2,
  Castle,
  Home,
  MapPin,
  Tent,
  TreePine,
  Warehouse,
  X,
} from "lucide-react";
import { PROPERTY_TYPES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { sortPropertyTypesInDisplayOrder } from "@/lib/property-type-filter";
import { Button } from "@/components/ui/button";

type Layout = "pill" | "hero" | "compact";

const PROPERTY_TYPE_ICONS = {
  APARTMENT: Building2,
  HOUSE: Home,
  VILLA: Castle,
  STUDIO: Warehouse,
  CABIN: TreePine,
  COTTAGE: Tent,
  LOFT: Building2,
  OTHER: Home,
} as const;

export function MarketplacePlaceSelector({
  layout,
  city,
  selectedPropertyTypes,
  onPropertyTypesChange,
  onCityChange,
  onNextToDates,
  popularCities = [],
  availablePropertyTypesByCity = {},
  showPropertyTypes = false,
  open: controlledOpen,
  onOpenChange,
  className,
}: {
  layout: Layout;
  city: string;
  selectedPropertyTypes: string[];
  onPropertyTypesChange: (types: string[]) => void;
  onCityChange: (value: string) => void;
  onNextToDates?: () => void;
  popularCities?: string[];
  availablePropertyTypesByCity?: Record<string, string[]>;
  showPropertyTypes?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const [draftCity, setDraftCity] = React.useState(city);
  const [draftPropertyTypes, setDraftPropertyTypes] = React.useState(
    selectedPropertyTypes
  );
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setDraftCity(city);
    setDraftPropertyTypes(selectedPropertyTypes);
  }, [open, city, selectedPropertyTypes]);

  React.useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

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

  React.useEffect(() => {
    if (!showPropertyTypes || !open || !selectedCity) return;
    setDraftPropertyTypes((current) =>
      sortPropertyTypesInDisplayOrder(
        current.filter((value) => availablePropertyTypes.includes(value))
      )
    );
  }, [availablePropertyTypes, open, selectedCity, showPropertyTypes]);

  const triggerActive = open;
  const currentLabel = city || "Search destinations";

  const pillFieldClass = cn(
    "flex flex-1 min-w-0 cursor-pointer items-center gap-2 rounded-l-full px-3 py-1.5 text-left transition-all duration-200 ease-out",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    triggerActive
      ? "bg-background shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
      : "hover:bg-muted/25"
  );

  const heroFieldClass = cn(
    "flex min-w-0 flex-1 cursor-pointer gap-3 text-left transition-all duration-200 ease-out",
    layout === "compact"
      ? "rounded-[1.6rem] border px-4 py-4 md:rounded-l-full md:border-0 md:py-2.5"
      : "rounded-t-full px-4 py-3 md:rounded-l-full md:rounded-t-none md:py-4 md:pl-8",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    triggerActive
      ? "border-border/70 bg-background shadow-[0_10px_24px_rgba(15,23,42,0.08)] md:rounded-2xl"
      : layout === "compact"
        ? "border-transparent bg-transparent hover:border-border/60 hover:bg-muted/25"
        : "hover:bg-muted/25"
  );

  const toggleType = (value: string) => {
    if (!availablePropertyTypes.includes(value)) return;
    const next = new Set(draftPropertyTypes);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    setDraftPropertyTypes(sortPropertyTypesInDisplayOrder([...next]));
  };

  const handleReset = () => {
    setDraftCity("");
    if (showPropertyTypes) {
      setDraftPropertyTypes([]);
    }
  };

  const handleNext = () => {
    onCityChange(draftCity.trim());
    if (showPropertyTypes) {
      onPropertyTypesChange(
        sortPropertyTypesInDisplayOrder(
          draftPropertyTypes.filter((value) =>
            availablePropertyTypes.includes(value)
          )
        )
      );
    }
    setOpen(false);
    onNextToDates?.();
  };

  const triggerInner = (
    <>
      <MapPin
        className={cn(
          "shrink-0 text-muted-foreground",
          layout === "pill" ? "hidden h-4 w-4 sm:block" : "mt-0.5 h-5 w-5"
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <span
          className={cn(
            "block font-semibold tracking-wide text-muted-foreground",
            layout === "pill"
              ? "text-[10px] uppercase sm:text-[11px]"
              : "text-xs tracking-wide"
          )}
        >
          Where
        </span>
        <span
          className={cn(
            "block truncate text-sm font-medium md:text-base",
            !city && "text-muted-foreground"
          )}
        >
          {currentLabel}
        </span>
      </div>
    </>
  );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <div className={cn("min-w-0", className)}>
        {layout === "pill" ? (
          <button
            type="button"
            className={pillFieldClass}
            onClick={() => setOpen(true)}
            aria-expanded={open}
            aria-haspopup="dialog"
          >
            {triggerInner}
          </button>
        ) : (
          <button
            type="button"
            className={heroFieldClass}
            onClick={() => setOpen(true)}
            aria-expanded={open}
            aria-haspopup="dialog"
          >
            {triggerInner}
          </button>
        )}
      </div>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs" />
        <DialogPrimitive.Content
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden border border-border/60 bg-background text-popover-foreground shadow-2xl outline-none",
            "left-3 right-3 top-4 bottom-4 h-auto max-h-[calc(100dvh-2rem)] rounded-[2rem]",
            "md:left-1/2 md:right-auto md:top-1/2 md:bottom-auto md:h-[50rem] md:max-h-[calc(100dvh-5rem)] md:w-[44rem] md:max-w-[calc(100vw-6rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[2rem]"
          )}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="sr-only">
            <DialogPrimitive.Title>Where</DialogPrimitive.Title>
            <DialogPrimitive.Description>
              Choose a destination city and optional property type filters.
            </DialogPrimitive.Description>
          </div>

          <div className="border-b border-border/70 bg-background px-4 pt-4 pb-4 md:px-6 md:pt-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <p className="text-lg font-semibold text-foreground md:text-2xl">
                Where
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Close destination picker"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

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
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-5 md:px-6 md:py-6">
            <div className="mx-auto w-full max-w-2xl">
              <div>
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
                      const selected = draftCity.trim().toLowerCase() === name.toLowerCase();
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
                      {PROPERTY_TYPES.filter(({ value }) =>
                        availablePropertyTypes.includes(value)
                      ).map(({ value, label }) => {
                        const Icon =
                          PROPERTY_TYPE_ICONS[
                            value as keyof typeof PROPERTY_TYPE_ICONS
                          ] ?? Home;
                        const selected = draftPropertyTypes.includes(value);
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
                            <Icon
                              className="h-4 w-4 text-muted-foreground"
                              strokeWidth={1.75}
                            />
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

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
                <Button
                  type="button"
                  className="min-w-[7rem] rounded-full"
                  onClick={handleNext}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
