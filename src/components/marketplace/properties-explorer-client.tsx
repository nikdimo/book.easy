"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import {
  ArrowLeft,
  Map as MapIcon,
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
import type { SearchFilterPreview } from "@/lib/types/search";
import type { CatalogAmenity } from "@/lib/types/amenity-catalog";
import type { PropertyTypeOption } from "@/lib/types/property-type";
import {
  isAllPropertyTypesSelected,
  parsePropertyTypesFromSearchParams,
} from "@/lib/property-type-filter";
import {
  clearPriceParams,
  PRICE_RANGE_MAX,
  PRICE_RANGE_MIN,
  PRICE_RANGE_STEP,
  resolvePriceRange,
  setPriceParams,
} from "@/lib/search-filter-config";
import { cn } from "@/lib/utils";
import { PropertiesMap } from "@/components/marketplace/properties-map";
import { usePinLabel, type MapPin } from "@/components/marketplace/map-pin";
import {
  ResultsSheet,
  SHEET_PEEK_HEIGHT,
  useSheetEnabled,
  type SheetSnap,
} from "@/components/marketplace/results-sheet";
import {
  MAP_BOUNDS_PARAM,
  parseMapBounds,
  stringifyMapBounds,
  type MapBounds,
} from "@/lib/map-bounds";
import { Tx, useI18n } from "@/lib/i18n/client";
import type { Resolved } from "@/lib/i18n/t";
import { useDisplayCurrency } from "@/lib/currency/client";
import { BASE_CURRENCY } from "@/lib/currency/currency-preference";
import { MarketplaceSearchBar } from "@/components/marketplace/marketplace-search-bar";
import { MobileBottomNav } from "@/components/shared/mobile-bottom-nav";
import type { PlaceOption } from "@/lib/utils/place";

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
        "h-11 shrink-0 rounded-full border-border/80 bg-background px-4 text-sm font-medium shadow-none",
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

function formatPriceChipLabel(
  minPrice: number | undefined,
  maxPrice: number | undefined,
  format: (amount: number) => string,
) {
  if (minPrice != null && maxPrice != null) {
    return `${format(minPrice)} - ${format(maxPrice)}`;
  }

  if (minPrice != null) {
    return `${format(minPrice)}+`;
  }

  if (maxPrice != null) {
    return `Up to ${format(maxPrice)}`;
  }

  return "Price";
}

/**
 * The amenities worth a chip of their own, most useful first.
 *
 * Names, not ids: the English name is the catalog's identity — the same token the
 * URL carries and the importer matches on — so this list survives re-seeding and
 * says plainly which filters it names. Anything here that the current results do
 * not offer is dropped, and the row is topped up from catalog order, so a chip
 * never promises a filter that would empty the page.
 */
const QUICK_AMENITY_NAMES = [
  "Wi-Fi",
  "Kitchen",
  "Free parking",
  "Air conditioning",
  "Pool",
  "Pets allowed",
  "Self check-in",
  "Hot tub",
  "Washer",
  "Sea view",
  "TV",
  "Workspace",
];

/** Enough to be useful, few enough that the row still reads as a row. */
const QUICK_AMENITY_LIMIT = 8;

/** The one-tap bedroom threshold. Deeper counts live in the filter panel. */
const QUICK_BEDROOMS = 2;

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
  const display = useDisplayCurrency();
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
              <Tx k="filters.price_range" source="Price range" />
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              <Tx k="filters.price_description" source="Nightly price, before taxes and fees." />
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
                <Tx k="filters.minimum" source="Minimum" />
              </span>
              <span className="notranslate mt-1 block text-base font-semibold text-foreground" translate="no" suppressHydrationWarning>
                {display.format(priceRange[0], BASE_CURRENCY).text}
              </span>
            </div>
            <div className="rounded-[1.25rem] border border-border bg-background px-4 py-3">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <Tx k="filters.maximum" source="Maximum" />
              </span>
              <span className="notranslate mt-1 block text-base font-semibold text-foreground" translate="no" suppressHydrationWarning>
                {display.format(priceRange[1], BASE_CURRENCY).text}
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
              <Tx k="filters.clear" source="Clear" />
            </Button>
            <Button
              type="button"
              className="h-10 rounded-full px-5 text-sm font-semibold shadow-none"
              onClick={() => onApply(priceRange)}
            >
              <Tx k="filters.apply" source="Apply" />
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The tapped pin, shown as a card docked over the map instead of a popup pinned to
 * the marker: on a phone the marker is as likely as not to be under the sheet or at
 * the edge of the screen, and a popup there opens half off-map.
 */
function SelectedPinCard({
  pin,
  onClose,
}: {
  pin: MapPin;
  onClose: () => void;
}) {
  const i18n = useI18n();
  const pinLabel = usePinLabel();

  return (
    <div
      className="pointer-events-auto relative flex gap-3 rounded-2xl border border-border bg-background p-2.5 shadow-[0_12px_32px_rgba(15,23,42,0.18)]"
    >
      <a
        href={`/properties/${pin.slug}${pin.query ? `?${pin.query}` : ""}`}
        className="flex min-w-0 flex-1 gap-3"
        aria-label={i18n.resolve("map.view_listing", "View listing").text}
      >
        <div className="relative h-[72px] w-24 shrink-0 overflow-hidden rounded-xl bg-muted">
          {pin.imageUrl ? (
            <Image
              src={pin.imageUrl}
              alt={pin.imageAlt || pin.title}
              fill
              className="object-cover"
              sizes="96px"
            />
          ) : null}
        </div>
        <div className="min-w-0 flex-1 pr-7">
          <p className="notranslate truncate text-sm font-semibold" translate="no">
            {pin.location}
          </p>
          <p
            data-user-generated-content
            data-translatable-user-content
            translate="yes"
            className="mt-0.5 line-clamp-2 text-xs text-muted-foreground"
          >
            {pin.title}
          </p>
          <p
            className="notranslate mt-1 text-sm font-semibold"
            translate="no"
            suppressHydrationWarning
          >
            {pinLabel(pin)}
          </p>
        </div>
      </a>
      <button
        type="button"
        onClick={onClose}
        className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-background/90 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label={i18n.resolve("map.close_preview", "Close preview").text}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function PropertiesExplorerClient({
  amenities,
  propertyTypes,
  availablePropertyTypes,
  initialFilterPreview,
  children,
  totalLabel,
  totalCount,
  mapPins,
  popularCities,
  availablePropertyTypesByCity,
  featuredMarket = false,
}: {
  amenities: CatalogAmenity[];
  propertyTypes: PropertyTypeOption[];
  availablePropertyTypes: string[];
  initialFilterPreview: SearchFilterPreview;
  children: React.ReactNode;
  totalLabel: Resolved;
  totalCount: number;
  mapPins: MapPin[];
  popularCities: PlaceOption[];
  availablePropertyTypesByCity: Record<string, string[]>;
  featuredMarket?: boolean;
}) {
  const i18n = useI18n();
  const display = useDisplayCurrency();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [priceOpen, setPriceOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [focusedSection, setFocusedSection] =
    useState<SearchFiltersSection | null>(null);
  // Phones don't switch between a list and a map: the map is always there and the
  // results ride over it on a sheet that drags between three heights. See
  // ResultsSheet — desktop keeps the two side by side and ignores all of this.
  const sheetEnabled = useSheetEnabled();
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>("mid");
  const [listChromeVisible, setListChromeVisible] = useState(true);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  // Expanding the map is a layout change, not something the map can do to itself:
  // the listings step aside and the map takes the whole width, which is the same
  // shape the home page's map view has. See the aside below.
  const [mapExpanded, setMapExpanded] = useState(false);
  const [hoveredPinId, setHoveredPinId] = useState<string | null>(null);

  const handleSheetSnapChange = useCallback((next: SheetSnap) => {
    setSheetSnap(next);
    // Leaving the full, independently scrolling list always restores the search
    // controls and bottom navigation. This belongs to the user action that changes
    // the snap, rather than a second render triggered from an effect.
    if (next !== "full") setListChromeVisible(true);
  }, []);

  const listingIdFromTarget = (target: EventTarget | null) =>
    target instanceof Element
      ? target.closest<HTMLElement>("[data-map-listing-id]")?.dataset
          .mapListingId ?? null
      : null;

  const allPropertyTypeValues = useMemo(
    () => propertyTypes.map((t) => t.value),
    [propertyTypes]
  );

  const params = useMemo(() => {
    const minPrice = searchParams.get("minPrice");
    const maxPrice = searchParams.get("maxPrice");
    return {
      city: searchParams.get("city") ?? "",
      selectedPropertyTypes: parsePropertyTypesFromSearchParams(searchParams, allPropertyTypeValues),
      selectedAmenities: searchParams.getAll("amenities"),
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      bedrooms: searchParams.get("bedrooms")
        ? Number(searchParams.get("bedrooms"))
        : undefined,
    };
  }, [searchParams, allPropertyTypeValues]);

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

  const initialBounds = useMemo(
    () => parseMapBounds(searchParams.get(MAP_BOUNDS_PARAM)),
    [searchParams]
  );

  /**
   * The map is a filter, not just a picture: whatever rectangle it settles on
   * becomes part of the query, so the list, the count and the pins agree — pan
   * somewhere empty and the results go empty too. Replace rather than push so a
   * handful of map moves don't bury the previous page under back-button history.
   */
  const handleBoundsChange = useCallback(
    (bounds: MapBounds) => {
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set(MAP_BOUNDS_PARAM, stringifyMapBounds(bounds));
      nextParams.delete("page");
      router.replace(`/properties?${nextParams.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const selectedPin = useMemo(
    () => mapPins.find((pin) => pin.id === selectedPinId) ?? null,
    [mapPins, selectedPinId]
  );

  /** Tapping a pin is a request to look at the map, so the sheet gets out of the way. */
  const handleSelectedPinChange = useCallback((id: string | null) => {
    setSelectedPinId(id);
    if (id) handleSheetSnapChange("peek");
  }, [handleSheetSnapChange]);

  const toggleAmenity = useCallback(
    (name: string) => {
      mutateQuery((nextParams) => {
        const current = nextParams.getAll("amenities");
        const next = current.includes(name)
          ? current.filter((value) => value !== name)
          : [...current, name];
        nextParams.delete("amenities");
        for (const value of next) nextParams.append("amenities", value);
      });
    },
    [mutateQuery]
  );

  const toggleBedrooms = useCallback(() => {
    mutateQuery((nextParams) => {
      if (nextParams.has("bedrooms")) nextParams.delete("bedrooms");
      else nextParams.set("bedrooms", String(QUICK_BEDROOMS));
    });
  }, [mutateQuery]);

  const clearPrice = useCallback(() => {
    mutateQuery(clearPriceParams);
  }, [mutateQuery]);

  const clearAllFilters = useCallback(() => {
    mutateQuery((nextParams) => {
      clearPriceParams(nextParams);
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
        clearPriceParams(nextParams);
        return;
      }

      setPriceParams(nextParams, nextRange);
    });
  };

  const openFilters = (section: SearchFiltersSection | null = null) => {
    setFocusedSection(section);
    setFiltersOpen(true);
  };

  /**
   * A selected amenity keeps its chip even once the narrowed results stop offering
   * it — otherwise the one filter that emptied the page is the one you cannot see
   * to switch back off.
   */
  const quickAmenities = useMemo(() => {
    const offered = new Set(initialFilterPreview.availableAmenities);
    const selected = new Set(params.selectedAmenities);
    const byName = new Map(amenities.map((amenity) => [amenity.name, amenity] as const));
    const seen = new Set<string>();
    const chips: CatalogAmenity[] = [];

    for (const name of [...QUICK_AMENITY_NAMES, ...amenities.map((a) => a.name)]) {
      if (seen.has(name)) continue;
      seen.add(name);
      if (!offered.has(name) && !selected.has(name)) continue;
      const amenity = byName.get(name);
      if (!amenity) continue;
      chips.push(amenity);
      if (chips.length >= QUICK_AMENITY_LIMIT) break;
    }

    return chips;
  }, [amenities, initialFilterPreview.availableAmenities, params.selectedAmenities]);

  const propertyTypeActive = !isAllPropertyTypesSelected(
    params.selectedPropertyTypes,
    allPropertyTypeValues
  );
  const hasPriceFilter =
    params.minPrice !== undefined || params.maxPrice !== undefined;
  const quickFilterCount =
    Number(hasPriceFilter) +
    Number(propertyTypeActive) +
    Number(Boolean(params.bedrooms)) +
    Number(params.selectedAmenities.length > 0);
  const hasActiveFilters = quickFilterCount > 0;

  const bedroomsLabel = `${params.bedrooms ?? QUICK_BEDROOMS}+ bedrooms`;
  const mobileSearchTitle = searchParams.has(MAP_BOUNDS_PARAM)
    ? i18n.resolve("properties.homes_in_map_area", "Homes in map area")
    : i18n.resolve("properties.homes_nearby", "Homes nearby");
  const quickFiltersVisible = sheetSnap !== "full" || listChromeVisible;
  const mobileNavVisible = sheetSnap !== "peek" && listChromeVisible;

  return (
    <div
      className="flex flex-col"
      style={
        {
          "--mobile-search-filters-height": quickFiltersVisible
            ? "var(--search-filters-height)"
            : "0px",
        } as React.CSSProperties
      }
    >
      <div className="sticky top-0 z-40 hidden h-[var(--site-header-height)] shrink-0 items-center gap-2 bg-background px-3 max-lg:flex">
        <button
          type="button"
          onClick={() => {
            if (window.history.length > 1) router.back();
            else router.push("/");
          }}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted"
          aria-label={i18n.resolve("navigation.back", "Back").text}
        >
          <ArrowLeft className="size-5" />
        </button>

        <div className="min-w-0 flex-1">
          <MarketplaceSearchBar
            variant="mobile-header"
            popularCities={popularCities}
            availablePropertyTypesByCity={availablePropertyTypesByCity}
            propertyTypes={propertyTypes}
            mobileTitle={mobileSearchTitle.text}
          />
        </div>

        <button
          type="button"
          onClick={() => openFilters()}
          className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted"
          aria-label={i18n.resolve("filters.title", "Filters").text}
        >
          <SlidersHorizontal className="size-5" />
          {quickFilterCount > 0 ? (
            <span className="absolute right-0 top-0 inline-flex size-5 items-center justify-center rounded-full bg-foreground text-[0.62rem] font-semibold text-background">
              {quickFilterCount}
            </span>
          ) : null}
        </button>
      </div>

      {/* The second half of the top chrome. It pins directly under the header and
          carries the pair's only rule, fading from the header's white into it, so
          the two rows read as one block instead of two stacked bars. The chips sit
          centred under the search bar with the count parked in the right gutter —
          a plain flex row would push them off-centre by the width of that count. */}
      <div
        className={cn(
          "sticky top-[var(--site-header-height)] z-30 overflow-hidden bg-card bg-gradient-to-b from-card to-muted/60 transition-[height,border-color,opacity] duration-200 lg:h-[var(--search-filters-height)] lg:border-b",
          quickFiltersVisible
            ? "max-lg:h-[var(--search-filters-height)] max-lg:border-b max-lg:opacity-100"
            : "max-lg:h-0 max-lg:border-transparent max-lg:opacity-0",
        )}
      >
        <div className="container mx-auto grid h-full grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 max-lg:flex max-lg:px-4 md:px-8">
          <span aria-hidden className="max-lg:hidden" />
          {/* Airbnb's shape: one button for the whole panel, a hairline, then chips
              that are the filter rather than a door to it — one tap applies, one tap
              takes it back. Only filters this search actually supports get a chip,
              so the row never offers a dead end. Justification is left, not centred:
              the grid column around it is what centres the row, and a centred flex
              row puts its own overflow out of reach when the chips run long. */}
          <div className="flex min-w-0 items-center gap-3 overflow-x-auto no-scrollbar">
            <QuickFilterButton
              active={hasActiveFilters}
              onClick={() => openFilters()}
              className="gap-2 max-lg:hidden"
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span><Tx k="filters.title" source="Filters" /></span>
              {quickFilterCount > 0 ? (
                <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-foreground px-1.5 text-xs font-semibold text-background">
                  {quickFilterCount}
                </span>
              ) : null}
            </QuickFilterButton>

            <span aria-hidden className="h-7 w-px shrink-0 bg-border max-lg:hidden" />

            <PriceFilterPopover
              key={`${params.minPrice ?? ""}:${params.maxPrice ?? ""}`}
              open={priceOpen}
              onOpenChange={setPriceOpen}
              active={hasPriceFilter}
              label={formatPriceChipLabel(
                params.minPrice,
                params.maxPrice,
                (amount) => display.format(amount, BASE_CURRENCY).text,
              )}
              initialRange={resolvePriceRange(params.minPrice, params.maxPrice)}
              onApply={applyPrice}
              onClear={() => {
                clearPrice();
                setPriceOpen(false);
              }}
            />

            {initialFilterPreview.maxBedrooms >= QUICK_BEDROOMS ? (
              <QuickFilterButton
                active={Boolean(params.bedrooms)}
                onClick={toggleBedrooms}
              >
                {bedroomsLabel}
              </QuickFilterButton>
            ) : null}

            {quickAmenities.map((amenity) => (
              <QuickFilterButton
                key={amenity.id}
                active={params.selectedAmenities.includes(amenity.name)}
                onClick={() => toggleAmenity(amenity.name)}
                className={amenity.translated ? "notranslate" : undefined}
                translate={amenity.translated ? "no" : undefined}
              >
                {amenity.label}
              </QuickFilterButton>
            ))}

            {hasActiveFilters ? (
              <button
                type="button"
                onClick={clearAllFilters}
                className="shrink-0 text-sm font-medium text-foreground underline underline-offset-4 transition-colors hover:text-foreground/70"
              >
                <Tx k="filters.clear_all" source="Clear all" />
              </button>
            ) : null}
          </div>

          <p className="hidden max-w-[220px] justify-self-end truncate text-sm text-muted-foreground lg:block">
            <span className={totalLabel.translated ? "notranslate" : undefined}>{totalLabel.text}</span>
          </p>
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
              // A drawer up from the bottom edge on phones, stopping just short of
              // the top — the same gesture vocabulary as the results sheet, rather
              // than a card dropped over the middle of the screen.
              "inset-x-0 bottom-0 top-8 h-auto rounded-t-[1.75rem] border-x-0 border-b-0",
              "max-md:data-open:animate-in max-md:data-open:slide-in-from-bottom max-md:data-closed:animate-out max-md:data-closed:slide-out-to-bottom",
              "md:left-1/2 md:right-auto md:top-1/2 md:bottom-auto md:h-[50rem] md:max-h-[calc(100dvh-5rem)] md:w-[44rem] md:max-w-[calc(100vw-6rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[2rem] md:border"
            )}
          >
            <div className="sr-only">
              <DialogPrimitive.Title><Tx k="filters.title" source="Filters" /></DialogPrimitive.Title>
              <DialogPrimitive.Description>
                <Tx k="filters.description" source="Refine your search with price, rooms, property type, and amenities." />
              </DialogPrimitive.Description>
            </div>

            <div className="shrink-0 border-b border-border/70 bg-background px-4 py-4 md:px-6 md:py-5">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <span />
                <p className="text-center text-xl font-semibold text-foreground">
                  <Tx k="filters.title" source="Filters" />
                </p>
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  className="justify-self-end inline-flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label={i18n.resolve("filters.close", "Close filters").text}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
              <SearchFilters
                amenities={amenities}
                propertyTypeOptions={propertyTypes}
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

      {/* Two layouts in one tree. Desktop is a row: listings, then a sticky map
          beside them, and the page scrolls. Phones make this a fixed stage the
          height of what is left under the chrome — the map fills it, the sheet
          rides over it, and nothing on the page scrolls but the sheet's own list. */}
      <div
        className={cn(
          "relative flex min-w-0",
          // The public shell is zoomed to 90%, so its compensated viewport token
          // is the only height that still reaches the physical bottom edge.
          "max-lg:h-[calc(var(--app-viewport-height)-var(--site-header-height)-var(--mobile-search-filters-height))] max-lg:overflow-hidden max-lg:transition-[height] max-lg:duration-200"
        )}
        onMouseOver={(event) => {
          const listingId = listingIdFromTarget(event.target);
          if (listingId) setHoveredPinId(listingId);
        }}
        onMouseOut={(event) => {
          const fromListingId = listingIdFromTarget(event.target);
          const toListingId = listingIdFromTarget(event.relatedTarget);
          if (fromListingId && fromListingId !== toListingId) {
            setHoveredPinId(null);
          }
        }}
        onFocusCapture={(event) => {
          const listingId = listingIdFromTarget(event.target);
          if (listingId) setHoveredPinId(listingId);
        }}
        onBlurCapture={(event) => {
          const fromListingId = listingIdFromTarget(event.target);
          const toListingId = listingIdFromTarget(event.relatedTarget);
          if (fromListingId && fromListingId !== toListingId) {
            setHoveredPinId(null);
          }
        }}
      >
        {/* At least as tall as the map beside it, so a short result set can never
            leave the sticky map hanging past the end of the page. */}
        <ResultsSheet
          snap={sheetSnap}
          onSnapChange={handleSheetSnapChange}
          onListChromeVisibilityChange={setListChromeVisible}
          enabled={sheetEnabled}
          grabLabel={
            i18n.resolve("properties.toggle_results", "Show or hide the results list")
              .text
          }
          header={
            <span className="block pb-2 text-center text-base font-semibold text-foreground">
              <span className={totalLabel.translated ? "notranslate" : undefined}>
                {totalLabel.text}
              </span>
            </span>
          }
          className={cn(
            "lg:min-h-[calc(var(--app-viewport-height)-var(--site-header-height)-var(--search-filters-height))]",
            mapExpanded && "lg:hidden"
          )}
        >
          <div className="px-4 pt-2 pb-6 max-lg:pb-[calc(var(--mobile-nav-height)+1.5rem)] md:px-8">
            {totalCount > 0 ? (
              <div
                className={cn(
                  "mb-6 flex items-center justify-between gap-4 max-lg:justify-end",
                  // The sheet's own header already carries the count on phones.
                  !featuredMarket && "max-lg:mb-0"
                )}
              >
                <h2 className="text-2xl font-semibold tracking-tight text-foreground max-lg:hidden">
                  {(() => {
                    const value = i18n.plural(
                      "properties.over_results",
                      totalCount,
                      "Over {n} home",
                      "Over {n} homes"
                    );
                    return <span className={value.translated ? "notranslate" : undefined}>{value.text}</span>;
                  })()}
                </h2>
                {featuredMarket ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="shrink-0 rounded-full text-sm font-semibold underline underline-offset-4"
                    onClick={() =>
                      mutateQuery((nextParams) => {
                        nextParams.delete("city");
                        nextParams.delete("country");
                        nextParams.delete("featured");
                        // "Explore all" means the whole map too, not the corner
                        // of it the featured city was framed in.
                        nextParams.delete(MAP_BOUNDS_PARAM);
                        nextParams.set("all", "1");
                      })
                    }
                  >
                    <Tx k="footer.explore_all" source="Explore all" />
                  </Button>
                ) : null}
              </div>
            ) : null}
            {children}
          </div>
        </ResultsSheet>

        {/* Sticky rather than fixed, so the page keeps its own scrollbar at the right
            edge of the window — the listings move under a map that never does, and a
            wheel over the map zooms. `self-start` keeps the flex row from stretching
            it to the full column height, which would leave it nothing to stick to.
            Width is a share of the row: `vw` ignores the page zoom and would leave the
            map narrower than the split it names. Expanded, it takes the row over at the
            same height, so full screen is the page's own frame — inset and rounded,
            below the chrome — rather than a sheet thrown over it.

            On phones the same map fills the stage edge to edge behind the sheet.
            One instance either way: a second <PropertiesMap> would mean a second
            Leaflet map fetching its own copy of every tile. */}
        <aside
          className={cn(
            "max-lg:absolute max-lg:inset-0 max-lg:z-0 max-lg:w-full max-lg:p-0",
            "lg:sticky lg:top-[calc(var(--site-header-height)+var(--search-filters-height))] lg:h-[calc(var(--app-viewport-height)-var(--site-header-height)-var(--search-filters-height))] lg:shrink-0 lg:self-start lg:p-4",
            mapExpanded ? "lg:w-full lg:px-8" : "lg:w-[45%] xl:w-[48%]"
          )}
          aria-label={i18n.resolve("map.listings", "Map of listings").text}
          // Reaching for the map is a request for the map: the sheet drops out of
          // the way. Panning ends in a click too, but the sheet is already down by
          // then, so collapsing again costs nothing.
          onClick={sheetEnabled ? () => handleSheetSnapChange("peek") : undefined}
        >
          <PropertiesMap
            pins={mapPins}
            hoveredPinId={hoveredPinId}
            initialBounds={initialBounds}
            onBoundsChange={handleBoundsChange}
            expanded={mapExpanded}
            onExpandedChange={setMapExpanded}
            // Full screen is what the phone layout already gives the map, and the
            // corner the button would take is over the map the sheet sits on.
            expandable={!sheetEnabled}
            // The sheet covers the bottom of the map, and Leaflet's zoom, scale and
            // attribution controls live there. Lift them clear of it.
            className="h-full max-lg:rounded-none max-lg:border-0 max-lg:[&_.leaflet-bottom]:mb-[6.5rem] lg:rounded-2xl"
            pinPopups={!sheetEnabled}
            selectedPinId={sheetEnabled ? selectedPinId : undefined}
            onSelectedPinChange={handleSelectedPinChange}
          />
        </aside>

        {/* Both float over the sheet, so they are the stage's, not the map's. */}
        {sheetEnabled && selectedPin ? (
          <div
            className="pointer-events-none absolute inset-x-3 z-30 lg:hidden"
            style={{ bottom: SHEET_PEEK_HEIGHT + 12 }}
          >
            <SelectedPinCard
              pin={selectedPin}
              onClose={() => setSelectedPinId(null)}
            />
          </div>
        ) : null}

        {sheetSnap === "full" ? (
          <Button
            type="button"
            className="absolute left-1/2 z-40 h-11 -translate-x-1/2 rounded-full px-5 text-sm font-semibold shadow-[0_10px_28px_rgba(15,23,42,0.28)] transition-[bottom] duration-300 lg:hidden"
            style={{
              bottom: mobileNavVisible
                ? "calc(var(--mobile-nav-height) + 1rem)"
                : "1.5rem",
            }}
            onClick={() => handleSheetSnapChange("peek")}
          >
            <MapIcon className="mr-2 h-4 w-4" />
            <Tx k="properties.map" source="Map" />
          </Button>
        ) : null}

        <MobileBottomNav
          position="absolute"
          visible={mobileNavVisible}
        />
      </div>
    </div>
  );
}
