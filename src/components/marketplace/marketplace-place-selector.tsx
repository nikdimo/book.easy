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
import type { PropertyTypeOption } from "@/lib/types/property-type";
import { cn } from "@/lib/utils";
import { sortPropertyTypesInDisplayOrder } from "@/lib/property-type-filter";
import { placeKey, type PlaceOption } from "@/lib/utils/place";
import {
  isSamePlaceName,
  localizePlaceName,
  localizedPlaceLabel,
  matchPlaceName,
} from "@/lib/i18n/place-name";
import { Button } from "@/components/ui/button";
import { interpolate } from "@/lib/i18n/client";
import { useSearchLabels } from "@/components/marketplace/search-labels";

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
  country = "",
  selectedPropertyTypes,
  onPropertyTypesChange,
  onPlaceChange,
  onNextToDates,
  popularCities = [],
  availablePropertyTypesByCity = {},
  propertyTypes,
  showPropertyTypes = false,
  open: controlledOpen,
  onOpenChange,
  hidePillDivider = false,
  desktopContentRef,
  desktopContentStyle,
  useSharedDesktopShell = false,
  dialogContentId,
  className,
}: {
  layout: Layout;
  city: string;
  /** Only set when `city` is a known exact match (picked from the list), so two
   * same-named cities in different countries aren't conflated. */
  country?: string;
  selectedPropertyTypes: string[];
  onPropertyTypesChange: (types: string[]) => void;
  onPlaceChange: (next: { city: string; country: string }) => void;
  onNextToDates?: () => void;
  popularCities?: PlaceOption[];
  availablePropertyTypesByCity?: Record<string, string[]>;
  propertyTypes: PropertyTypeOption[];
  showPropertyTypes?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hidePillDivider?: boolean;
  desktopContentRef?: React.Ref<HTMLDivElement>;
  desktopContentStyle?: React.CSSProperties;
  useSharedDesktopShell?: boolean;
  dialogContentId?: string;
  className?: string;
}) {
  const labels = useSearchLabels();
  const isPillLayout = layout === "pill";
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
    // Reset the draft fields to the committed values every time the dialog opens
    // (e.g. re-opening after a prior edit was cancelled). Intentional reset-on-open,
    // not derived state that belongs in render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    if (!open || (isPillLayout && window.innerWidth >= 768)) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isPillLayout, open]);

  const filteredCities = React.useMemo(() => {
    const q = draftCity.trim();
    const sorted = [...popularCities].sort((a, b) => a.city.localeCompare(b.city));

    if (!q) return sorted;

    // Matching is script-agnostic: a city stored as "Νέα Φλογητά" is rendered
    // romanized, so it has to answer to "nea", "неа" and "νεα" alike.
    return sorted
      .filter(
        (place) =>
          matchPlaceName(place.city, q).matches ||
          matchPlaceName(place.country, q).matches
      )
      .sort((a, b) => {
        const aStarts = matchPlaceName(a.city, q).startsWith ? 0 : 1;
        const bStarts = matchPlaceName(b.city, q).startsWith ? 0 : 1;
        return aStarts - bStarts || a.city.localeCompare(b.city);
      });
  }, [draftCity, popularCities]);

  // Exact match by city name only — ambiguous if the same city name exists in more
  // than one country; disambiguation happens by picking a specific row instead (see
  // the list's onClick, which carries the full place object).
  const selectedPlace = React.useMemo(() => {
    const normalizedDraftCity = draftCity.trim();
    if (!normalizedDraftCity) return null;

    return (
      popularCities.find((candidate) =>
        isSamePlaceName(candidate.city, normalizedDraftCity)
      ) ?? null
    );
  }, [draftCity, popularCities]);

  const availablePropertyTypes = React.useMemo(() => {
    if (!selectedPlace) return [];
    return availablePropertyTypesByCity[placeKey(selectedPlace)] ?? [];
  }, [availablePropertyTypesByCity, selectedPlace]);
  const allPropertyTypeValues = React.useMemo(
    () => [...new Set(Object.values(availablePropertyTypesByCity).flat())],
    [availablePropertyTypesByCity]
  );

  React.useEffect(() => {
    if (!showPropertyTypes || !open || !selectedPlace) return;
    // Prunes previously-selected property types that no longer apply once the
    // available set changes for the newly selected city. Intentional sync with
    // an external-ish derived list, not plain derived render state.
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
    selectedPlace,
    showPropertyTypes,
  ]);

  const triggerActive = open;
  const currentLabel = city
    ? country
      ? localizedPlaceLabel({ city, country }, labels.locale)
      : localizePlaceName(city, labels.locale)
    : labels.searchDestinations.text;

  const pillFieldClass = cn(
    // Airbnb's leading segment: 32px of horizontal padding against 24px on the rest.
    "relative flex min-w-0 flex-1 cursor-pointer items-center rounded-full px-8 py-[15px] text-left transition-colors duration-200 ease-out",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "after:absolute after:-right-[3px] after:top-1/2 after:h-8 after:w-px after:-translate-y-1/2 after:bg-[#DDDDDD] after:transition-opacity after:duration-150",
    triggerActive
      ? "bg-white shadow-[0_3px_12px_rgba(0,0,0,0.1),0_1px_2px_rgba(0,0,0,0.08)] after:opacity-0"
      : "hover:bg-[#EBEBEB] group-data-[panel-open=true]/pill:hover:bg-[#DDDDDD]",
    hidePillDivider && "after:opacity-0"
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
    setDraftPropertyTypes(
      sortPropertyTypesInDisplayOrder([...next], allPropertyTypeValues)
    );
  };

  const commitDraftSelection = React.useCallback(() => {
    // Commit the canonical DB spelling when the typed text resolves to a known city,
    // so a romanized/Cyrillic query still hits the exact (city, country) branch of the
    // property query instead of a `contains` that can never match.
    onPlaceChange({
      city: selectedPlace?.city ?? draftCity.trim(),
      country: selectedPlace?.country ?? "",
    });
    if (showPropertyTypes) {
      onPropertyTypesChange(
        sortPropertyTypesInDisplayOrder(
          draftPropertyTypes.filter((value) =>
            availablePropertyTypes.includes(value)
          ),
          allPropertyTypeValues
        )
      );
    }
  }, [
    allPropertyTypeValues,
    availablePropertyTypes,
    draftCity,
    draftPropertyTypes,
    onPlaceChange,
    onPropertyTypesChange,
    selectedPlace,
    showPropertyTypes,
  ]);

  const handleReset = () => {
    setDraftCity("");
    if (showPropertyTypes) {
      setDraftPropertyTypes([]);
    }
    if (isPillLayout) {
      onPlaceChange({ city: "", country: "" });
      onPropertyTypesChange([]);
    }
  };

  const handleNext = () => {
    commitDraftSelection();
    setOpen(false);
    onNextToDates?.();
  };

  const triggerInner = (
    <>
      <MapPin
        className={cn(
          "shrink-0 text-muted-foreground",
          layout === "pill" ? "hidden" : "mt-0.5 h-5 w-5"
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <span
          className={cn(
            "block",
            layout === "pill"
              ? "text-xs font-medium leading-4 text-[#222222]"
              : "text-xs font-semibold tracking-wide text-foreground",
            labels.where.translated && "notranslate"
          )}
        >
          {labels.where.text}
        </span>
        <span
          className={cn(
            "block truncate",
            // The pill's value line stays 14px so all three segments (Where / When / Who)
            // read as one row; only the taller hero layout steps up to 16px.
            layout === "pill"
              ? "text-sm font-normal leading-[18px]"
              : "mt-px text-sm font-medium md:text-base",
            layout === "pill"
              ? city
                ? "text-[#222222]"
                : "text-[#6C6C6C]"
              : !city && "text-muted-foreground",
            (city || labels.searchDestinations.translated) && "notranslate"
          )}
          translate={city || labels.searchDestinations.translated ? "no" : undefined}
          suppressHydrationWarning
        >
          {currentLabel}
        </span>
      </div>
    </>
  );

  return (
    <DialogPrimitive.Root
      open={open}
      modal={!isPillLayout}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && isPillLayout) {
          commitDraftSelection();
        }
        setOpen(nextOpen);
      }}
    >
      <div className={cn("min-w-0", className)}>
        {layout === "pill" ? (
          <button
            type="button"
            className={pillFieldClass}
            onClick={() => setOpen(true)}
            aria-expanded={open}
            aria-haspopup="dialog"
            aria-controls={dialogContentId}
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
            aria-controls={dialogContentId}
          >
            {triggerInner}
          </button>
        )}
      </div>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50",
            isPillLayout
              ? "bg-transparent"
              : "bg-black/10 supports-backdrop-filter:backdrop-blur-xs"
          )}
        />
        <DialogPrimitive.Content
          id={dialogContentId}
          ref={desktopContentRef}
          style={desktopContentStyle}
          className={cn(
            useSharedDesktopShell
              ? "fixed z-[52] flex h-auto flex-col overflow-hidden rounded-[1.75rem] border border-border/60 bg-background text-popover-foreground shadow-[0_10px_32px_rgba(0,0,0,0.16)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-top-2 data-[state=open]:duration-150 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:slide-out-to-top-2 data-[state=closed]:duration-100"
              : "fixed z-50 flex flex-col overflow-hidden border border-border/60 bg-background text-popover-foreground shadow-[0_10px_32px_rgba(0,0,0,0.16)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-top-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:slide-out-to-top-2",
            !useSharedDesktopShell &&
              "left-3 right-3 top-4 bottom-4 h-auto max-h-[calc(100dvh-2rem)] rounded-[2rem]",
            !useSharedDesktopShell && isPillLayout
              ? "md:left-[max(1rem,calc(50%-24rem))] md:right-auto md:top-[5.75rem] md:bottom-auto md:h-auto md:max-h-[min(38rem,calc(100dvh-7rem))] md:w-[26rem] md:max-w-[calc(100vw-2rem)] md:rounded-[1.75rem]"
              : !useSharedDesktopShell &&
                  "md:left-1/2 md:right-auto md:top-1/2 md:bottom-auto md:h-[50rem] md:max-h-[calc(100dvh-5rem)] md:w-[44rem] md:max-w-[calc(100vw-6rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[2rem]"
          )}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="sr-only">
            <DialogPrimitive.Title className={labels.where.translated ? "notranslate" : undefined}>{labels.where.text}</DialogPrimitive.Title>
            <DialogPrimitive.Description className={labels.destinationDescription.translated ? "notranslate" : undefined}>
              {labels.destinationDescription.text}
            </DialogPrimitive.Description>
          </div>

          <div className="border-b border-border/70 bg-background px-4 pt-4 pb-4 md:px-6 md:pt-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <p
                className={cn(
                  "text-lg font-semibold text-foreground md:text-2xl",
                  labels.where.translated && "notranslate"
                )}
              >
                {labels.where.text}
              </p>
              <button
                type="button"
                onClick={() => {
                  if (isPillLayout) {
                    commitDraftSelection();
                  }
                  setOpen(false);
                }}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={labels.closeDestinationPicker.text}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-[1.5rem] border border-border bg-background px-4 py-3 md:rounded-[1.75rem] md:px-5 md:py-4">
              <label
                className={cn(
                  "block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground md:text-[11px]",
                  labels.searchDestinations.translated && "notranslate"
                )}
              >
                {labels.searchDestinations.text}
              </label>
              <div className="mt-2 flex items-center gap-3">
                <MapPin className="h-5 w-5 shrink-0 text-muted-foreground" />
                <input
                  ref={inputRef}
                  type="text"
                  value={draftCity}
                  onChange={(e) => setDraftCity(e.target.value)}
                  placeholder={labels.searchListingCities.text}
                  className="w-full min-w-0 border-0 bg-transparent p-0 text-base font-medium text-foreground outline-none placeholder:text-muted-foreground/80"
                />
                {/* Mirrors the clear control in the mobile search flow: emptying the
                    field is what restores the full "cities with listings" list. */}
                {draftCity ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDraftCity("");
                      inputRef.current?.focus();
                    }}
                    aria-label={labels.clearDestination.text}
                    className={cn(
                      "-mr-1 grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:size-7",
                      labels.clearDestination.translated && "notranslate"
                    )}
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-5 md:px-6 md:py-6">
            <div className="mx-auto w-full max-w-2xl">
              <div>
                <p
                  className={cn(
                    "mb-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground",
                    (draftCity.trim() ? labels.matchingCities : labels.citiesWithListings)
                      .translated && "notranslate"
                  )}
                >
                  {draftCity.trim()
                    ? labels.matchingCities.text
                    : labels.citiesWithListings.text}
                </p>
                <ul className="flex flex-col gap-1" role="list">
                  {filteredCities.length === 0 ? (
                    <li
                      className={cn(
                        "py-6 text-center text-sm text-muted-foreground",
                        labels.noMatchingCities.translated && "notranslate"
                      )}
                    >
                      {labels.noMatchingCities.text}
                    </li>
                  ) : (
                    filteredCities.map((place) => {
                      const selected = isSamePlaceName(place.city, draftCity.trim());
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
                            onClick={() => {
                              setDraftCity(place.city);
                              onPlaceChange({
                                city: place.city,
                                country: place.country,
                              });
                              if (showPropertyTypes) {
                                onPropertyTypesChange(
                                  sortPropertyTypesInDisplayOrder(
                                    draftPropertyTypes.filter((value) =>
                                      (
                                        availablePropertyTypesByCity[
                                          placeKey(place)
                                        ] ?? []
                                      ).includes(value)
                                    ),
                                    allPropertyTypeValues
                                  )
                                );
                              }
                              setOpen(false);
                              onNextToDates?.();
                            }}
                          >
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                              <MapPin className="h-5 w-5" strokeWidth={1.75} />
                            </span>
                            <span className="notranslate block min-w-0 font-semibold text-foreground" translate="no">
                              {localizedPlaceLabel(place, labels.locale)}
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
                  <p
                    className={cn(
                      "mb-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground",
                      labels.propertyType.translated && "notranslate"
                    )}
                  >
                    {labels.propertyType.text}
                  </p>
                  {!selectedPlace ? (
                    <p
                      className={cn(
                        "text-sm text-muted-foreground",
                        labels.selectCityFirst.translated && "notranslate"
                      )}
                    >
                      {labels.selectCityFirst.text}
                    </p>
                  ) : availablePropertyTypes.length === 0 ? (
                    (() => {
                      const noTypes = interpolate(labels.noPropertyTypesInCity, {
                        city: selectedPlace.city,
                      });
                      return (
                        <p
                          className={cn(
                            "text-sm text-muted-foreground",
                            noTypes.translated && "notranslate"
                          )}
                        >
                          {noTypes.text}
                        </p>
                      );
                    })()
                  ) : (
                    <div className="flex flex-wrap gap-2 pb-1">
                      {propertyTypes.filter(({ value }) =>
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

          {!isPillLayout ? (
            <div className="shrink-0 border-t border-border bg-background px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:px-6 md:pb-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "self-start rounded-full sm:min-w-[7rem]",
                    labels.reset.translated && "notranslate"
                  )}
                  onClick={handleReset}
                >
                  {labels.reset.text}
                </Button>
                <div className="flex w-full items-center justify-end gap-3 sm:w-auto">
                  <Button
                    type="button"
                    className={cn(
                      "min-w-[7rem] rounded-full",
                      labels.next.translated && "notranslate"
                    )}
                    onClick={handleNext}
                  >
                    {labels.next.text}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
