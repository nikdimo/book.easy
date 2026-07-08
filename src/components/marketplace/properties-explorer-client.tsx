"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import {
  Map as MapIcon,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import {
  SearchFilters,
  type SearchFiltersSection,
} from "@/components/public/search-filters";
import { PROPERTY_TYPES } from "@/lib/constants";
import type { SearchFilterPreview } from "@/lib/services/search.service";
import {
  isAllPropertyTypesSelected,
  parsePropertyTypesFromSearchParams,
} from "@/lib/property-type-filter";
import {
  PRICE_RANGE_MAX,
  PRICE_RANGE_MIN,
  PRICE_RANGE_STEP,
  resolvePriceRange,
} from "@/lib/search-filter-config";
import { cn } from "@/lib/utils";
import { PropertiesMap, type MapPin } from "@/components/marketplace/properties-map";

const propertyTypeLabelByValue = new Map<string, string>(
  PROPERTY_TYPES.map(({ value, label }) => [value, label] as const)
);

function QuickFilterButton({
  active = false,
  className,
  children,
  ...props
}: React.ComponentProps<typeof Button> & {
  active?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className={cn(
        "h-11 rounded-full border-border/80 bg-background px-4 text-sm font-medium shadow-none",
        "hover:border-foreground/20 hover:bg-muted/25",
        active && "border-foreground bg-muted/35 shadow-sm",
        className
      )}
      {...props}
    >
      {children}
    </Button>
  );
}

function formatPriceChipLabel(minPrice?: number, maxPrice?: number) {
  if (minPrice != null && maxPrice != null) {
    return `\u20AC${minPrice} - \u20AC${maxPrice}`;
  }

  if (minPrice != null) {
    return `\u20AC${minPrice}+`;
  }

  if (maxPrice != null) {
    return `Up to \u20AC${maxPrice}`;
  }

  return "Price";
}

function formatAmenityChipLabel(selectedAmenities: string[]) {
  if (selectedAmenities.length === 0) return "Amenities";
  if (selectedAmenities.length === 1) return selectedAmenities[0] ?? "Amenities";
  return `${selectedAmenities.length} amenities`;
}

function PriceFilterPopover({
  open,
  onOpenChange,
  active,
  label,
  initialRange,
  onApply,
  onClear,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  active: boolean;
  label: string;
  initialRange: [number, number];
  onApply: (range: [number, number]) => void;
  onClear: () => void;
}) {
  const [priceRange, setPriceRange] = useState(initialRange);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <QuickFilterButton active={active}>{label}</QuickFilterButton>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={12}
        className="w-[min(100vw-1.5rem,24rem)] rounded-[1.75rem] border border-border/70 bg-background p-5 shadow-[0_24px_48px_rgba(15,23,42,0.14)]"
      >
        <div className="space-y-5">
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              Price range
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Nightly price, before taxes and fees.
            </p>
          </div>

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

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[1.25rem] border border-border bg-background px-4 py-3">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Minimum
              </span>
              <span className="mt-1 block text-base font-semibold text-foreground">
                {`\u20AC${priceRange[0]}`}
              </span>
            </div>
            <div className="rounded-[1.25rem] border border-border bg-background px-4 py-3">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Maximum
              </span>
              <span className="mt-1 block text-base font-semibold text-foreground">
                {`\u20AC${priceRange[1]}`}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              className="rounded-full px-4 text-sm font-semibold underline underline-offset-4 hover:bg-transparent"
              onClick={onClear}
            >
              Clear
            </Button>
            <Button
              type="button"
              className="h-10 rounded-full px-5 text-sm font-semibold shadow-none"
              onClick={() => onApply(priceRange)}
            >
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function PropertiesExplorerClient({
  amenities,
  availablePropertyTypes,
  initialFilterPreview,
  children,
  totalLabel,
  totalCount,
  mapPins,
}: {
  amenities: { id: string; name: string; category: string }[];
  availablePropertyTypes: string[];
  initialFilterPreview: SearchFilterPreview;
  children: React.ReactNode;
  totalLabel: string;
  totalCount: number;
  mapPins: MapPin[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [priceOpen, setPriceOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [focusedSection, setFocusedSection] =
    useState<SearchFiltersSection | null>(null);

  const params = useMemo(() => {
    const minPrice = searchParams.get("minPrice");
    const maxPrice = searchParams.get("maxPrice");
    return {
      city: searchParams.get("city") ?? "",
      selectedPropertyTypes: parsePropertyTypesFromSearchParams(searchParams),
      selectedAmenities: searchParams.getAll("amenities"),
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      bedrooms: searchParams.get("bedrooms")
        ? Number(searchParams.get("bedrooms"))
        : undefined,
    };
  }, [searchParams]);

  const mutateQuery = useCallback(
    (mutator: (params: URLSearchParams) => void) => {
      const nextParams = new URLSearchParams(searchParams.toString());
      mutator(nextParams);
      nextParams.delete("page");
      const query = nextParams.toString();
      router.push(query ? `/properties?${query}` : "/properties");
    },
    [router, searchParams]
  );

  const clearPrice = useCallback(() => {
    mutateQuery((nextParams) => {
      nextParams.delete("minPrice");
      nextParams.delete("maxPrice");
    });
  }, [mutateQuery]);

  const clearAllFilters = useCallback(() => {
    mutateQuery((nextParams) => {
      nextParams.delete("minPrice");
      nextParams.delete("maxPrice");
      nextParams.delete("bedrooms");
      nextParams.delete("propertyType");
      nextParams.delete("propertyTypes");
      nextParams.delete("amenities");
    });
  }, [mutateQuery]);

  const applyPrice = (nextRange: [number, number]) => {
    setPriceOpen(false);
    mutateQuery((nextParams) => {
      if (
        nextRange[0] <= PRICE_RANGE_MIN &&
        nextRange[1] >= PRICE_RANGE_MAX
      ) {
        nextParams.delete("minPrice");
        nextParams.delete("maxPrice");
        return;
      }

      nextParams.set("minPrice", String(nextRange[0]));
      nextParams.set("maxPrice", String(nextRange[1]));
    });
  };

  const openFilters = (section: SearchFiltersSection | null = null) => {
    setFocusedSection(section);
    setFiltersOpen(true);
  };

  const propertyTypeActive = !isAllPropertyTypesSelected(
    params.selectedPropertyTypes
  );
  const hasPriceFilter =
    params.minPrice !== undefined || params.maxPrice !== undefined;
  const quickFilterCount =
    Number(hasPriceFilter) +
    Number(propertyTypeActive) +
    Number(Boolean(params.bedrooms)) +
    Number(params.selectedAmenities.length > 0);
  const hasActiveFilters = quickFilterCount > 0;

  const propertyTypeLabel = useMemo(() => {
    if (!propertyTypeActive) return "Property type";
    if (params.selectedPropertyTypes.length === 1) {
      return (
        propertyTypeLabelByValue.get(params.selectedPropertyTypes[0] ?? "") ??
        "Property type"
      );
    }
    return `${params.selectedPropertyTypes.length} types`;
  }, [params.selectedPropertyTypes, propertyTypeActive]);

  const bedroomsLabel = params.bedrooms
    ? `${params.bedrooms}+ bedrooms`
    : "Bedrooms";
  const amenitiesLabel = formatAmenityChipLabel(params.selectedAmenities);

  return (
    <div className="flex min-h-0 flex-col">
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="container mx-auto flex items-center justify-between gap-4 px-4 py-4 md:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto no-scrollbar">
            <PriceFilterPopover
              key={`${params.minPrice ?? ""}:${params.maxPrice ?? ""}`}
              open={priceOpen}
              onOpenChange={setPriceOpen}
              active={hasPriceFilter}
              label={formatPriceChipLabel(params.minPrice, params.maxPrice)}
              initialRange={resolvePriceRange(params.minPrice, params.maxPrice)}
              onApply={applyPrice}
              onClear={() => {
                clearPrice();
                setPriceOpen(false);
              }}
            />

            <QuickFilterButton
              active={propertyTypeActive}
              onClick={() => openFilters("propertyType")}
            >
              {propertyTypeLabel}
            </QuickFilterButton>

            <QuickFilterButton
              active={Boolean(params.bedrooms)}
              onClick={() => openFilters("bedrooms")}
            >
              {bedroomsLabel}
            </QuickFilterButton>

            <QuickFilterButton
              active={params.selectedAmenities.length > 0}
              onClick={() => openFilters("amenities")}
            >
              {amenitiesLabel}
            </QuickFilterButton>

            <QuickFilterButton
              active={hasActiveFilters}
              onClick={() => openFilters()}
              className="gap-2"
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span>All filters</span>
              {quickFilterCount > 0 ? (
                <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-foreground px-1.5 text-xs font-semibold text-background">
                  {quickFilterCount}
                </span>
              ) : null}
            </QuickFilterButton>

            {hasActiveFilters ? (
              <button
                type="button"
                onClick={clearAllFilters}
                className="shrink-0 text-sm font-medium text-foreground underline underline-offset-4 transition-colors hover:text-foreground/70"
              >
                Clear all
              </button>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <p className="hidden max-w-[220px] truncate text-sm text-muted-foreground lg:block">
              {totalLabel}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-11 rounded-full px-4 lg:hidden"
              type="button"
              onClick={() =>
                document
                  .getElementById("results-map-mobile")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
            >
              <MapIcon className="mr-2 h-4 w-4" />
              Map
            </Button>
          </div>
        </div>
      </div>

      <DialogPrimitive.Root
        open={filtersOpen}
        onOpenChange={(open) => {
          setFiltersOpen(open);
          if (!open) {
            setFocusedSection(null);
          }
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs" />
          <DialogPrimitive.Content
            className={cn(
              "fixed z-50 flex flex-col overflow-hidden border border-border/70 bg-background text-popover-foreground shadow-[0_24px_64px_rgba(15,23,42,0.18)] outline-none",
              "left-3 right-3 top-4 bottom-4 h-auto max-h-[calc(100dvh-2rem)] rounded-[2rem]",
              "md:left-1/2 md:right-auto md:top-1/2 md:bottom-auto md:h-[50rem] md:max-h-[calc(100dvh-5rem)] md:w-[44rem] md:max-w-[calc(100vw-6rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[2rem]"
            )}
          >
            <div className="sr-only">
              <DialogPrimitive.Title>Filters</DialogPrimitive.Title>
              <DialogPrimitive.Description>
                Refine your search with price, rooms, property type, and amenities.
              </DialogPrimitive.Description>
            </div>

            <div className="shrink-0 border-b border-border/70 bg-background px-4 py-4 md:px-6 md:py-5">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <span />
                <p className="text-center text-xl font-semibold text-foreground">
                  Filters
                </p>
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  className="justify-self-end inline-flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Close filters"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
              <SearchFilters
                amenities={amenities}
                availablePropertyTypes={availablePropertyTypes}
                initialPreview={initialFilterPreview}
                variant="embedded"
                focusSection={focusedSection}
                onApplied={() => {
                  setFiltersOpen(false);
                  setFocusedSection(null);
                }}
              />
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <p className="container mx-auto mt-4 mb-2 flex items-center gap-2 px-4 text-sm text-muted-foreground md:px-8 lg:hidden">
        <Search className="h-4 w-4 shrink-0 opacity-70" />
        {totalLabel}
      </p>

      <div className="relative min-w-0 flex-1">
        <div className="lg:pr-[min(42vw,560px)] xl:pr-[min(45vw,640px)]">
          <div className="px-4 pt-2 pb-6 md:px-8">
            {totalCount > 0 ? (
              <h2 className="mb-6 text-2xl font-semibold tracking-tight text-foreground">
                Over {totalCount.toLocaleString()}{" "}
                {totalCount === 1 ? "home" : "homes"}
              </h2>
            ) : null}
            {children}
          </div>

          <div
            id="results-map-mobile"
            className="scroll-mt-24 px-4 pb-8 md:px-8 lg:hidden"
          >
            <div className="h-[min(50vh,420px)] overflow-hidden rounded-2xl border border-border shadow-sm">
              <PropertiesMap
                pins={mapPins}
                className="min-h-[320px] rounded-2xl border-0"
              />
            </div>
          </div>
        </div>

        <aside
          className="pointer-events-none fixed top-20 right-0 bottom-0 z-30 hidden w-[min(42vw,560px)] border-l border-border bg-muted/20 p-3 pl-2 lg:block xl:w-[min(45vw,640px)]"
          aria-label="Map of listings"
        >
          <div className="pointer-events-auto h-[calc(100dvh-5rem-1.5rem)]">
            <PropertiesMap pins={mapPins} className="h-full rounded-2xl" />
          </div>
        </aside>
      </div>
    </div>
  );
}
