"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  BedDouble,
  Building2,
  Castle,
  Home,
  Minus,
  Plus,
  Search,
  Tent,
  TreePine,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  isAllPropertyTypesSelected,
  parsePropertyTypesFromSearchParams,
  sortPropertyTypesInDisplayOrder,
  stringifyPropertyTypesParam,
} from "@/lib/property-type-filter";
import {
  PRICE_RANGE_MAX,
  PRICE_RANGE_MIN,
  PRICE_RANGE_STEP,
  resolvePriceRange,
} from "@/lib/search-filter-config";
import type { SearchFilterPreview } from "@/lib/types/search";
import type { PropertyTypeOption } from "@/lib/types/property-type";
import { cn } from "@/lib/utils";

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

export type SearchFiltersSection =
  | "price"
  | "bedrooms"
  | "propertyType"
  | "amenities";

interface SearchFiltersProps {
  amenities: { id: string; name: string; category: string }[];
  /** Catalog of selectable types (admin-managed) — distinct from the currently
   *  *selected* type values, which live in `SearchFiltersState.propertyTypes`. */
  propertyTypeOptions: PropertyTypeOption[];
  availablePropertyTypes?: string[];
  initialPreview?: SearchFilterPreview;
  variant?: "sidebar" | "embedded";
  onApplied?: () => void;
  focusSection?: SearchFiltersSection | null;
}

type SearchFiltersState = {
  city: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  dateFlexibility: number;
  bedrooms: number;
  priceRange: [number, number];
  propertyTypes: string[];
  selectedAmenities: string[];
};

function parsePositiveInt(value: string | null): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function formatPrice(value: number) {
  return `\u20AC${value}`;
}

function formatResultsLabel(totalCount: number) {
  return `Show ${totalCount} ${totalCount === 1 ? "place" : "places"}`;
}

function parseDateFlexibility(value: string | null): number {
  const parsed = Number(value);
  return [0, 1, 2, 3, 7, 14].includes(parsed) ? parsed : 0;
}

function CounterRow({
  title,
  description,
  value,
  onChange,
  min = 0,
  max = 16,
}: {
  title: string;
  description: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0 pr-3">
        <p className="text-base font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className={cn(
            "inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-foreground transition-colors",
            "hover:bg-muted/40 disabled:pointer-events-none disabled:opacity-35"
          )}
          aria-label={`Decrease ${title}`}
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="min-w-[2ch] text-center text-lg font-semibold tabular-nums text-foreground">
          {value}
        </span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className={cn(
            "inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-foreground transition-colors",
            "hover:bg-muted/40 disabled:pointer-events-none disabled:opacity-35"
          )}
          aria-label={`Increase ${title}`}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-muted/50 text-foreground">
        <Icon className="h-5 w-5" strokeWidth={1.9} />
      </span>
      <div className="min-w-0">
        <h3 className="text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export function SearchFilters({
  amenities,
  propertyTypeOptions,
  availablePropertyTypes = [],
  initialPreview,
  variant = "sidebar",
  onApplied,
  focusSection,
}: SearchFiltersProps) {
  const searchParams = useSearchParams();
  const allPropertyTypeValues = useMemo(
    () => propertyTypeOptions.map((t) => t.value),
    [propertyTypeOptions]
  );

  const initialState = useMemo<SearchFiltersState>(
    () => ({
      city: searchParams.get("city") ?? "",
      checkIn: searchParams.get("checkIn") ?? "",
      checkOut: searchParams.get("checkOut") ?? "",
      guests: parsePositiveInt(searchParams.get("guests")),
      dateFlexibility: parseDateFlexibility(searchParams.get("dateFlexibility")),
      bedrooms: parsePositiveInt(searchParams.get("bedrooms")),
      priceRange: resolvePriceRange(
        searchParams.get("minPrice")
          ? Number(searchParams.get("minPrice"))
          : undefined,
        searchParams.get("maxPrice")
          ? Number(searchParams.get("maxPrice"))
          : undefined
      ),
      propertyTypes: parsePropertyTypesFromSearchParams(searchParams, allPropertyTypeValues),
      selectedAmenities: searchParams.getAll("amenities"),
    }),
    [searchParams, allPropertyTypeValues]
  );

  return (
    <SearchFiltersInner
      key={searchParams.toString()}
      amenities={amenities}
      propertyTypeOptions={propertyTypeOptions}
      availablePropertyTypes={availablePropertyTypes}
      initialPreview={initialPreview}
      baseSearchParamsString={searchParams.toString()}
      variant={variant}
      onApplied={onApplied}
      focusSection={focusSection}
      initialState={initialState}
    />
  );
}

function SearchFiltersInner({
  amenities,
  propertyTypeOptions,
  availablePropertyTypes,
  initialPreview,
  baseSearchParamsString,
  variant,
  onApplied,
  focusSection,
  initialState,
}: SearchFiltersProps & {
  availablePropertyTypes: string[];
  initialPreview?: SearchFilterPreview;
  baseSearchParamsString: string;
  initialState: SearchFiltersState;
}) {
  const allPropertyTypeValues = useMemo(
    () => propertyTypeOptions.map((t) => t.value),
    [propertyTypeOptions]
  );
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const city = initialState.city;
  const checkIn = initialState.checkIn;
  const checkOut = initialState.checkOut;
  const guests = initialState.guests;
  const [bedrooms, setBedrooms] = useState(initialState.bedrooms);
  const [priceRange, setPriceRange] = useState(initialState.priceRange);
  const [propertyTypes, setPropertyTypes] = useState(initialState.propertyTypes);
  const [selectedAmenities, setSelectedAmenities] = useState(
    initialState.selectedAmenities
  );
  const [preview, setPreview] = useState<SearchFilterPreview>(() => ({
    totalCount: initialPreview?.totalCount ?? 0,
    availablePropertyTypes:
      initialPreview?.availablePropertyTypes ?? availablePropertyTypes,
    availableAmenities: initialPreview?.availableAmenities ?? [],
    maxBedrooms: initialPreview?.maxBedrooms ?? 0,
  }));
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  const sectionRefs = useRef<
    Partial<Record<SearchFiltersSection, HTMLElement | null>>
  >({});

  useEffect(() => {
    if (!focusSection) return;
    const section = sectionRefs.current[focusSection];
    if (!section) return;

    window.requestAnimationFrame(() => {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [focusSection]);

  const groupedAmenities = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; category: string }[]>();

    for (const amenity of amenities) {
      const existing = groups.get(amenity.category) ?? [];
      existing.push(amenity);
      groups.set(amenity.category, existing);
    }

    return [...groups.entries()];
  }, [amenities]);

  const availablePropertyTypeSet = useMemo(
    () => new Set(preview.availablePropertyTypes),
    [preview.availablePropertyTypes]
  );
  const availableAmenitySet = useMemo(
    () => new Set(preview.availableAmenities),
    [preview.availableAmenities]
  );
  const maxBedrooms = Math.max(preview.maxBedrooms, bedrooms);

  const isPriceFiltered =
    priceRange[0] > PRICE_RANGE_MIN || priceRange[1] < PRICE_RANGE_MAX;
  const typeFilterActive = !isAllPropertyTypesSelected(propertyTypes, allPropertyTypeValues);
  const hasFilters =
    bedrooms > 0 ||
    isPriceFiltered ||
    typeFilterActive ||
    selectedAmenities.length > 0;

  useEffect(() => {
    // Nothing has changed from the server-rendered starting point yet — the preview
    // state already equals initialPreview, so there's nothing to refetch. Guards the
    // common case of the effect re-running on mount/focus-section changes with no
    // actual filter edit.
    const matchesInitial =
      initialPreview != null &&
      bedrooms === initialState.bedrooms &&
      priceRange[0] === initialState.priceRange[0] &&
      priceRange[1] === initialState.priceRange[1] &&
      propertyTypes.length === initialState.propertyTypes.length &&
      propertyTypes.every((t) => initialState.propertyTypes.includes(t)) &&
      selectedAmenities.length === initialState.selectedAmenities.length &&
      selectedAmenities.every((a) => initialState.selectedAmenities.includes(a));

    if (matchesInitial) {
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        setIsPreviewLoading(true);

        const response = await fetch("/api/properties/filter-preview", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            city: city.trim() || undefined,
            checkIn: checkIn || undefined,
            checkOut: checkOut || undefined,
            guests: guests > 0 ? guests : undefined,
            minPrice: isPriceFiltered ? priceRange[0] : undefined,
            maxPrice: isPriceFiltered ? priceRange[1] : undefined,
            bedrooms: bedrooms > 0 ? bedrooms : undefined,
            propertyTypes,
            amenities: selectedAmenities,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          return;
        }

        const nextPreview = (await response.json()) as SearchFilterPreview;
        setPreview(nextPreview);
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }
      } finally {
        setIsPreviewLoading(false);
      }
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [
    bedrooms,
    checkIn,
    checkOut,
    city,
    guests,
    isPriceFiltered,
    priceRange,
    propertyTypes,
    selectedAmenities,
    initialState,
    initialPreview,
  ]);

  function buildFilteredParams() {
    const params = new URLSearchParams(baseSearchParamsString);
    params.delete("page");
    params.delete("minPrice");
    params.delete("maxPrice");
    params.delete("bedrooms");
    params.delete("propertyType");
    params.delete("propertyTypes");
    params.delete("amenities");

    if (isPriceFiltered) {
      params.set("minPrice", String(priceRange[0]));
      params.set("maxPrice", String(priceRange[1]));
    }

    if (bedrooms > 0) {
      params.set("bedrooms", String(bedrooms));
    }

    const types = stringifyPropertyTypesParam(
      availablePropertyTypes.length > 0
        ? propertyTypes.filter((value) => availablePropertyTypes.includes(value))
        : propertyTypes,
      allPropertyTypeValues
    );
    if (types) {
      params.set("propertyTypes", types);
    }

    for (const amenity of selectedAmenities) {
      params.append("amenities", amenity);
    }

    return params;
  }

  function applyFilters() {
    const params = buildFilteredParams();

    startTransition(() => {
      router.push(params.toString() ? `/properties?${params.toString()}` : "/properties");
      onApplied?.();
    });
  }

  function clearFilters() {
    setBedrooms(0);
    setPriceRange([PRICE_RANGE_MIN, PRICE_RANGE_MAX]);
    setPropertyTypes([...allPropertyTypeValues]);
    setSelectedAmenities([]);

    startTransition(() => {
      const params = new URLSearchParams(baseSearchParamsString);
      params.delete("page");
      params.delete("minPrice");
      params.delete("maxPrice");
      params.delete("bedrooms");
      params.delete("propertyType");
      params.delete("propertyTypes");
      params.delete("amenities");
      router.push(params.toString() ? `/properties?${params.toString()}` : "/properties");
    });
  }

  function togglePropertyType(value: string) {
    setPropertyTypes((current) => {
      const next = new Set(current);
      if (next.has(value)) {
        if (next.size <= 1) return current;
        next.delete(value);
      } else {
        next.add(value);
      }
      return sortPropertyTypesInDisplayOrder([...next], allPropertyTypeValues);
    });
  }

  function toggleAmenity(name: string) {
    setSelectedAmenities((current) =>
      current.includes(name)
        ? current.filter((value) => value !== name)
        : [...current, name]
    );
  }

  function renderUnavailableWrapper(
    child: React.ReactNode,
    message = "No properties match this filter yet."
  ) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{child}</TooltipTrigger>
        <TooltipContent sideOffset={8}>{message}</TooltipContent>
      </Tooltip>
    );
  }

  const content = (
    <TooltipProvider delayDuration={120}>
      <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 md:px-6 md:py-5">
        <div className="space-y-0">
          <section
            ref={(node) => {
              sectionRefs.current.price = node;
            }}
            className="border-b border-border/70 py-8 first:pt-2"
          >
            <SectionHeading
              icon={Search}
              title="Price range"
              description="Nightly price, before taxes and fees."
            />
            <div className="rounded-[1.75rem] border border-border/80 bg-background px-4 py-5 shadow-sm md:px-5">
              <Slider
                min={PRICE_RANGE_MIN}
                max={PRICE_RANGE_MAX}
                step={PRICE_RANGE_STEP}
                value={priceRange}
                onValueChange={(values) =>
                  setPriceRange([
                    values[0] ?? PRICE_RANGE_MIN,
                    values[1] ?? PRICE_RANGE_MAX,
                  ])
                }
                className="py-4"
              />
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[1.25rem] border border-border bg-background px-4 py-3">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Minimum
                  </span>
                  <span className="mt-1 block text-base font-semibold text-foreground">
                    {formatPrice(priceRange[0])}
                  </span>
                </div>
                <div className="rounded-[1.25rem] border border-border bg-background px-4 py-3">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Maximum
                  </span>
                  <span className="mt-1 block text-base font-semibold text-foreground">
                    {formatPrice(priceRange[1])}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section
            ref={(node) => {
              sectionRefs.current.bedrooms = node;
            }}
            className="border-b border-border/70 py-8"
          >
            <SectionHeading
              icon={BedDouble}
              title="Bedrooms"
              description="Require a minimum bedroom count."
            />
            <div className="rounded-[1.5rem] border border-border/80 bg-background px-4 py-4 shadow-sm md:px-5">
              <CounterRow
                title="Minimum bedrooms"
                description="Perfect when guests need a bit more privacy."
                value={bedrooms}
                onChange={setBedrooms}
                max={Math.max(maxBedrooms, 0)}
              />
            </div>
          </section>

          <section
            ref={(node) => {
              sectionRefs.current.propertyType = node;
            }}
            className="border-b border-border/70 py-8"
          >
            <SectionHeading
              icon={Home}
              title="Property type"
              description="Use the same rounded cards language as the search."
            />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {propertyTypeOptions.map(({ value, label }) => {
                const Icon =
                  PROPERTY_TYPE_ICONS[
                    value as keyof typeof PROPERTY_TYPE_ICONS
                  ] ?? Home;
                const selected = propertyTypes.includes(value);
                const unavailable = !selected && !availablePropertyTypeSet.has(value);
                const button = (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      if (!unavailable) {
                        togglePropertyType(value);
                      }
                    }}
                    aria-disabled={unavailable}
                    className={cn(
                      "flex min-h-[7rem] items-start gap-3 rounded-[1.5rem] border px-4 py-4 text-left transition-all",
                      selected
                        ? "border-foreground bg-muted/35 shadow-sm"
                        : unavailable
                          ? "border-border/70 bg-muted/15 text-muted-foreground opacity-55"
                          : "border-border bg-background hover:bg-muted/25",
                      unavailable && "cursor-not-allowed"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-muted/50",
                        unavailable ? "text-muted-foreground" : "text-foreground"
                      )}
                    >
                      <Icon className="h-5 w-5" strokeWidth={1.9} />
                    </span>
                    <span className="min-w-0 pt-1">
                      <span
                        className={cn(
                          "block text-base font-semibold",
                          unavailable ? "text-muted-foreground" : "text-foreground"
                        )}
                      >
                        {label}
                      </span>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        {selected
                          ? "Included in your search"
                          : unavailable
                            ? "No properties available"
                            : "Tap to include"}
                      </span>
                    </span>
                  </button>
                );

                return unavailable
                  ? renderUnavailableWrapper(button)
                  : button;
              })}
            </div>
          </section>

          <section
            ref={(node) => {
              sectionRefs.current.amenities = node;
            }}
            className="py-8"
          >
            <SectionHeading
              icon={Search}
              title="Amenities"
              description="Pick the essentials you want to keep visible."
            />
            <div className="space-y-6">
              {groupedAmenities.map(([category, items]) => (
                <div key={category}>
                  <h4 className="mb-3 text-base font-semibold text-foreground">
                    {category}
                  </h4>
                  <div className="flex flex-wrap gap-2.5">
                    {items.map((amenity) => {
                      const selected = selectedAmenities.includes(amenity.name);
                      const unavailable =
                        !selected && !availableAmenitySet.has(amenity.name);
                      const button = (
                        <button
                          key={amenity.id}
                          type="button"
                          onClick={() => {
                            if (!unavailable) {
                              toggleAmenity(amenity.name);
                            }
                          }}
                          aria-disabled={unavailable}
                          className={cn(
                            "inline-flex items-center rounded-full border px-4 py-2.5 text-sm font-medium transition-all",
                            selected
                              ? "border-foreground bg-muted/35 text-foreground shadow-sm"
                              : unavailable
                                ? "cursor-not-allowed border-border/70 bg-muted/15 text-muted-foreground opacity-55"
                                : "border-border bg-background text-foreground hover:bg-muted/25"
                          )}
                        >
                          {amenity.name}
                        </button>
                      );

                      return unavailable
                        ? renderUnavailableWrapper(button)
                        : button;
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <div className="shrink-0 border-t border-border/70 bg-background px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:px-6 md:pb-5">
        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            className="rounded-full px-4 text-sm font-semibold underline underline-offset-4 hover:bg-transparent"
            onClick={clearFilters}
            disabled={isPending || !hasFilters}
          >
            Clear all
          </Button>
          <Button
            type="button"
            className="h-11 rounded-full px-6 text-sm font-semibold shadow-none"
            onClick={applyFilters}
            disabled={isPending}
          >
            <Search className="mr-2 h-4 w-4" />
            {isPending || isPreviewLoading
              ? "Updating..."
              : formatResultsLabel(preview.totalCount)}
          </Button>
        </div>
      </div>
      </div>
    </TooltipProvider>
  );

  if (variant === "embedded") {
    return content;
  }

  return (
    <aside className="hidden w-80 shrink-0 lg:block">
      <div className="sticky top-24 overflow-hidden rounded-[2rem] border border-border/70 bg-background shadow-sm">
        {content}
      </div>
    </aside>
  );
}
