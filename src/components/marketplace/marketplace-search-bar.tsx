"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { format } from "date-fns";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MarketplaceStayDatePicker } from "@/components/marketplace/marketplace-stay-date-picker";
import { MarketplacePlaceSelector } from "@/components/marketplace/marketplace-place-selector";
import { MarketplaceSearchFlowDialog } from "@/components/marketplace/marketplace-search-flow-dialog";
import {
  MarketplaceGuestSelector,
  countsToGuestsParam,
  formatGuestSummary,
  guestsParamToCounts,
  guestCountsFromParams,
  guestCountsToParams,
  type GuestCounts,
} from "@/components/marketplace/marketplace-guest-selector";
import {
  parsePropertyTypesFromSearchParams,
  stringifyPropertyTypesParam,
} from "@/lib/property-type-filter";
import type { PropertyTypeOption } from "@/lib/types/property-type";
import type { PlaceOption } from "@/lib/utils/place";

type Variant = "hero" | "compact" | "pill" | "summary";

type SearchBarState = {
  city: string;
  /** Only set when `city` is a known exact match (picked from the list), so two
   * same-named cities in different countries aren't conflated. */
  country: string;
  checkIn: string;
  checkOut: string;
  guestCounts: GuestCounts;
  dateFlexibility: number;
  propertyTypes: string[];
};

let rememberedSearchState: SearchBarState | null = null;

function parseDateFlexibility(value: string | null): number {
  const parsed = Number(value);
  return [0, 1, 2, 3, 7, 14].includes(parsed) ? parsed : 0;
}

function resolveStringValue(
  explicitValue: string | undefined,
  searchParamValue: string | null,
  rememberedValue: string | undefined,
  allowRememberedFallback: boolean
): string {
  if (explicitValue && explicitValue.length > 0) return explicitValue;
  if (searchParamValue !== null) return searchParamValue;
  if (allowRememberedFallback && rememberedValue) return rememberedValue;
  return "";
}

function getInitialSearchBarState(args: {
  pathname: string;
  searchParams: ReturnType<typeof useSearchParams>;
  defaultCity: string;
  defaultCountry: string;
  defaultCheckIn: string;
  defaultCheckOut: string;
  defaultGuests: string;
  allPropertyTypeValues: string[];
}): SearchBarState {
  const {
    pathname,
    searchParams,
    defaultCity,
    defaultCountry,
    defaultCheckIn,
    defaultCheckOut,
    defaultGuests,
    allPropertyTypeValues,
  } = args;
  const allowRememberedFallback = pathname !== "/properties";

  const city = resolveStringValue(
    defaultCity,
    searchParams.get("city"),
    rememberedSearchState?.city,
    allowRememberedFallback
  );
  const country = resolveStringValue(
    defaultCountry,
    searchParams.get("country"),
    rememberedSearchState?.country,
    allowRememberedFallback
  );
  const checkIn = resolveStringValue(
    defaultCheckIn,
    searchParams.get("checkIn"),
    rememberedSearchState?.checkIn,
    allowRememberedFallback
  );
  const checkOut = resolveStringValue(
    defaultCheckOut,
    searchParams.get("checkOut"),
    rememberedSearchState?.checkOut,
    allowRememberedFallback
  );
  const guests = resolveStringValue(
    defaultGuests,
    searchParams.get("guests"),
    rememberedSearchState
      ? countsToGuestsParam(rememberedSearchState.guestCounts)
      : undefined,
    allowRememberedFallback
  );
  // Prefer the full adults/children/infants/pets breakdown carried in the URL; only
  // collapse to all-adults from the plain `guests` total when no breakdown is present
  // (e.g. a link that only ever set `guests`, like a property card).
  const guestCounts =
    guestCountsFromParams((key) => searchParams.get(key)) ??
    (allowRememberedFallback ? rememberedSearchState?.guestCounts : undefined) ??
    guestsParamToCounts(guests);
  const propertyTypes =
    searchParams.get("propertyTypes") !== null
      ? parsePropertyTypesFromSearchParams(searchParams, allPropertyTypeValues)
      : allowRememberedFallback && rememberedSearchState
        ? rememberedSearchState.propertyTypes
        : [];
  const dateFlexibility =
    searchParams.get("dateFlexibility") !== null
      ? parseDateFlexibility(searchParams.get("dateFlexibility"))
      : allowRememberedFallback && rememberedSearchState
        ? rememberedSearchState.dateFlexibility
        : 0;

  return {
    city,
    country,
    checkIn,
    checkOut,
    guestCounts,
    dateFlexibility,
    propertyTypes,
  };
}

function hasSearchBarState(state: SearchBarState): boolean {
  return Boolean(
    state.city ||
      state.country ||
      state.checkIn ||
      state.checkOut ||
      countsToGuestsParam(state.guestCounts) ||
      state.dateFlexibility > 0 ||
      state.propertyTypes.length > 0
  );
}

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

export function MarketplaceSearchBar({
  variant = "hero",
  defaultCity = "",
  defaultCountry = "",
  defaultCheckIn = "",
  defaultCheckOut = "",
  defaultGuests = "",
  popularCities = [],
  availablePropertyTypesByCity = {},
  propertyTypes = [],
}: {
  variant?: Variant;
  defaultCity?: string;
  defaultCountry?: string;
  defaultCheckIn?: string;
  defaultCheckOut?: string;
  defaultGuests?: string;
  popularCities?: PlaceOption[];
  availablePropertyTypesByCity?: Record<string, string[]>;
  propertyTypes?: PropertyTypeOption[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const allPropertyTypeValues = getAvailablePropertyTypeValues(
    availablePropertyTypesByCity
  );
  const initialState = getInitialSearchBarState({
    pathname,
    searchParams,
    defaultCity,
    defaultCountry,
    defaultCheckIn,
    defaultCheckOut,
    defaultGuests,
    allPropertyTypeValues,
  });
  const showPropertyTypesInWhere = true;

  useEffect(() => {
    if (pathname !== "/properties") return;
    rememberedSearchState = hasSearchBarState(initialState) ? initialState : null;
  }, [initialState, pathname]);

  const routeKey = [
    pathname,
    searchParams.toString(),
    defaultCity,
    defaultCountry,
    defaultCheckIn,
    defaultCheckOut,
    defaultGuests,
  ].join("|");

  return (
    <MarketplaceSearchBarInner
      key={routeKey}
      variant={variant}
      initialState={initialState}
      showPropertyTypesInWhere={showPropertyTypesInWhere}
      popularCities={popularCities}
      availablePropertyTypesByCity={availablePropertyTypesByCity}
      propertyTypes={propertyTypes}
      allPropertyTypeValues={allPropertyTypeValues}
    />
  );
}

function getAvailablePropertyTypeValues(
  availablePropertyTypesByCity: Record<string, string[]>
): string[] {
  return [...new Set(Object.values(availablePropertyTypesByCity).flat())];
}

function MarketplaceSearchBarInner({
  variant,
  initialState,
  showPropertyTypesInWhere,
  popularCities,
  availablePropertyTypesByCity,
  propertyTypes: propertyTypeOptions,
  allPropertyTypeValues,
}: {
  variant: Variant;
  initialState: SearchBarState;
  showPropertyTypesInWhere: boolean;
  popularCities: PlaceOption[];
  availablePropertyTypesByCity: Record<string, string[]>;
  propertyTypes: PropertyTypeOption[];
  allPropertyTypeValues: string[];
}) {
  const router = useRouter();
  const [city, setCity] = useState(initialState.city);
  const [country, setCountry] = useState(initialState.country);
  const [checkIn, setCheckIn] = useState(initialState.checkIn);
  const [checkOut, setCheckOut] = useState(initialState.checkOut);
  const [guestCounts, setGuestCounts] = useState(initialState.guestCounts);
  const [placeSelectorOpen, setPlaceSelectorOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [datePickerCanReturnToPlace, setDatePickerCanReturnToPlace] =
    useState(false);
  const [datePickerInitialSegment, setDatePickerInitialSegment] = useState<
    "checkin" | "checkout"
  >("checkin");
  const [datePickerInitialStep, setDatePickerInitialStep] = useState<
    "dates" | "guests"
  >("dates");
  const [searchFlowOpen, setSearchFlowOpen] = useState(false);
  const [dateFlexibility, setDateFlexibility] = useState(
    initialState.dateFlexibility
  );
  const [propertyTypes, setPropertyTypes] = useState(initialState.propertyTypes);
  const anyDesktopPillPanelOpen = placeSelectorOpen || datePickerOpen;

  const submitQuery = () => {
    const p = new URLSearchParams();
    if (city.trim()) p.set("city", city.trim());
    if (country.trim()) p.set("country", country.trim());
    if (checkIn) p.set("checkIn", checkIn);
    if (checkOut) p.set("checkOut", checkOut);
    const guestsParam = countsToGuestsParam(guestCounts);
    if (guestsParam) p.set("guests", guestsParam);
    Object.entries(guestCountsToParams(guestCounts)).forEach(([key, value]) =>
      p.set(key, value)
    );
    if (dateFlexibility > 0) {
      p.set("dateFlexibility", String(dateFlexibility));
    }
    p.delete("propertyType");
    const typesParam = stringifyPropertyTypesParam(
      propertyTypes,
      allPropertyTypeValues
    );
    if (typesParam) p.set("propertyTypes", typesParam);

    rememberedSearchState = {
      city: city.trim(),
      country: country.trim(),
      checkIn,
      checkOut,
      guestCounts,
      dateFlexibility,
      propertyTypes,
    };

    const q = p.toString();
    router.push(q ? `/properties?${q}` : "/properties");
  };

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submitQuery();
  }

  const openGuestsStep = () => {
    setPlaceSelectorOpen(false);
    // The current popover dismisses on pointer-down. Reopen on the next frame so
    // the guest request always wins over that close event in a single click.
    setDatePickerOpen(false);
    setDatePickerInitialStep("guests");
    window.requestAnimationFrame(() => setDatePickerOpen(true));
  };

  const handlePlaceOpenChange = (nextOpen: boolean) => {
    setPlaceSelectorOpen(nextOpen);
    if (nextOpen) {
      setDatePickerOpen(false);
      setDatePickerCanReturnToPlace(false);
    }
  };

  const handleDatePickerOpenChange = (nextOpen: boolean) => {
    setDatePickerOpen(nextOpen);
    if (nextOpen) {
      setPlaceSelectorOpen(false);
    } else {
      setDatePickerCanReturnToPlace(false);
      setDatePickerInitialStep("dates");
    }
  };

  const isCompact = variant === "compact";
  const isPill = variant === "pill";
  const isSummary = variant === "summary";

  if (isSummary) {
    const citySummary = city || "Where to?";
    const dateSummary = formatDateSummary(checkIn, checkOut);
    const guestSummary = formatGuestSummary(guestCounts);

    return (
      <div className="w-full">
        <button
          type="button"
          className="flex h-14 w-full items-center gap-3 rounded-full border border-border/70 bg-background px-3 text-left shadow-[0_10px_26px_rgba(15,23,42,0.08)] transition-shadow hover:shadow-[0_14px_32px_rgba(15,23,42,0.12)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          onClick={() => setSearchFlowOpen(true)}
          aria-label="Open search"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Search className="h-4 w-4" strokeWidth={2.5} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-foreground">
              {citySummary}
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {dateSummary} · {guestSummary}
            </span>
          </span>
        </button>

        <MarketplaceSearchFlowDialog
          open={searchFlowOpen}
          onOpenChange={setSearchFlowOpen}
          initialState={{
            city,
            country,
            checkIn,
            checkOut,
            guestCounts,
            dateFlexibility,
            propertyTypes,
          }}
          popularCities={popularCities}
          availablePropertyTypesByCity={availablePropertyTypesByCity}
          propertyTypes={propertyTypeOptions}
          showPropertyTypes={showPropertyTypesInWhere}
          onApplySearch={(next) => {
            setCity(next.city);
            setCountry(next.country);
            setCheckIn(next.checkIn);
            setCheckOut(next.checkOut);
            setGuestCounts(next.guestCounts);
            setDateFlexibility(next.dateFlexibility);
            setPropertyTypes(next.propertyTypes);

            rememberedSearchState = next;
            const p = new URLSearchParams();
            if (next.city.trim()) p.set("city", next.city.trim());
            if (next.country.trim()) p.set("country", next.country.trim());
            if (next.checkIn) p.set("checkIn", next.checkIn);
            if (next.checkOut) p.set("checkOut", next.checkOut);
            const guestsParam = countsToGuestsParam(next.guestCounts);
            if (guestsParam) p.set("guests", guestsParam);
            Object.entries(guestCountsToParams(next.guestCounts)).forEach(
              ([key, value]) => p.set(key, value)
            );
            if (next.dateFlexibility > 0) {
              p.set("dateFlexibility", String(next.dateFlexibility));
            }
            const typesParam = stringifyPropertyTypesParam(
              next.propertyTypes,
              allPropertyTypeValues
            );
            if (typesParam) p.set("propertyTypes", typesParam);

            const q = p.toString();
            router.push(q ? `/properties?${q}` : "/properties");
          }}
        />
      </div>
    );
  }

  if (isPill) {
    return (
      <form
        onSubmit={onSubmit}
        className="relative z-[60] flex w-full max-w-[64rem] items-center rounded-full border border-black/10 bg-[#f7f7f7] p-1 shadow-[0_1px_2px_rgba(0,0,0,0.08),0_8px_24px_rgba(0,0,0,0.08)] transition-shadow duration-200 hover:shadow-[0_2px_4px_rgba(0,0,0,0.10),0_10px_28px_rgba(0,0,0,0.10)]"
      >
        <MarketplacePlaceSelector
          layout="pill"
          city={city}
          country={country}
          selectedPropertyTypes={propertyTypes}
          onPropertyTypesChange={setPropertyTypes}
          onPlaceChange={({ city: c, country: co }) => {
            setCity(c);
            setCountry(co);
          }}
          open={placeSelectorOpen}
          onOpenChange={handlePlaceOpenChange}
          onNextToDates={() => {
            setDatePickerCanReturnToPlace(true);
            setDatePickerInitialSegment("checkin");
            setDatePickerOpen(true);
          }}
          popularCities={popularCities}
          availablePropertyTypesByCity={availablePropertyTypesByCity}
          propertyTypes={propertyTypeOptions}
          showPropertyTypes={showPropertyTypesInWhere}
          className="flex flex-1 min-w-0"
        />
        <MarketplaceStayDatePicker
          key={datePickerInitialStep}
          layout="pill"
          checkIn={checkIn}
          checkOut={checkOut}
          guestCounts={guestCounts}
          dateFlexibility={dateFlexibility}
          open={datePickerOpen}
          onOpenChange={handleDatePickerOpenChange}
          initialSegment={datePickerInitialSegment}
          initialStep={datePickerInitialStep}
          showBackToPlace={datePickerCanReturnToPlace}
          onRangeStringsChange={({ checkIn: ci, checkOut: co }) => {
            setCheckIn(ci);
            setCheckOut(co);
          }}
          onGuestCountsChange={setGuestCounts}
          onDateFlexibilityChange={setDateFlexibility}
          onBackToPlace={() => {
            setDatePickerCanReturnToPlace(false);
            setDatePickerOpen(false);
            setPlaceSelectorOpen(true);
          }}
          onSearchRequest={submitQuery}
          className="flex flex-1 min-w-0"
        />
        <div className="flex min-w-0 shrink-0 items-center pl-0.5 pr-0.5">
          <MarketplaceGuestSelector
            layout="pill"
            value={guestCounts}
            active={datePickerOpen && datePickerInitialStep === "guests"}
            onOpenRequest={openGuestsStep}
            className="min-w-[14rem] flex-1"
          />
          <Button
            type="submit"
            className={cn(
              "ml-1 h-11 shrink-0 rounded-full bg-primary px-4 text-primary-foreground shadow-none transition-all duration-200 hover:bg-primary/95",
              anyDesktopPillPanelOpen ? "gap-2 px-5" : "w-11 px-0"
            )}
            aria-label="Search"
          >
            <Search className="h-4 w-4" strokeWidth={2.5} />
            <span
              className={cn(
                "overflow-hidden whitespace-nowrap font-semibold transition-[max-width,opacity] duration-200",
                anyDesktopPillPanelOpen
                  ? "max-w-20 opacity-100"
                  : "max-w-0 opacity-0"
              )}
            >
              Search
            </span>
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className={cn(
        "w-full border border-border/70 bg-background shadow-[0_18px_46px_rgba(15,23,42,0.1)] transition-all duration-200 ease-out",
        isCompact
          ? "max-w-2xl rounded-[2rem] p-2 md:rounded-full md:p-0"
          : "mx-auto max-w-4xl rounded-3xl md:rounded-full"
      )}
    >
      <div
        className={cn(
          isCompact
            ? "flex flex-col gap-2 md:flex-row md:items-stretch md:gap-0 md:divide-x md:divide-border/80"
            : "flex flex-col divide-y divide-border/80 md:flex-row md:items-stretch md:divide-y-0 md:divide-x",
          isCompact && "md:flex-nowrap"
        )}
      >
        <MarketplacePlaceSelector
          layout={isCompact ? "compact" : "hero"}
          city={city}
          country={country}
          selectedPropertyTypes={propertyTypes}
          onPropertyTypesChange={setPropertyTypes}
          onPlaceChange={({ city: c, country: co }) => {
            setCity(c);
            setCountry(co);
          }}
          open={placeSelectorOpen}
          onOpenChange={handlePlaceOpenChange}
          onNextToDates={() => {
            setDatePickerCanReturnToPlace(true);
            setDatePickerInitialSegment("checkin");
            setDatePickerOpen(true);
          }}
          popularCities={popularCities}
          availablePropertyTypesByCity={availablePropertyTypesByCity}
          propertyTypes={propertyTypeOptions}
          showPropertyTypes={showPropertyTypesInWhere}
          className="flex min-w-0 flex-1"
        />

        <MarketplaceStayDatePicker
          key={datePickerInitialStep}
          layout={isCompact ? "compact" : "hero"}
          checkIn={checkIn}
          checkOut={checkOut}
          guestCounts={guestCounts}
          dateFlexibility={dateFlexibility}
          open={datePickerOpen}
          onOpenChange={handleDatePickerOpenChange}
          initialSegment={datePickerInitialSegment}
          initialStep={datePickerInitialStep}
          showBackToPlace={datePickerCanReturnToPlace}
          onRangeStringsChange={({ checkIn: ci, checkOut: co }) => {
            setCheckIn(ci);
            setCheckOut(co);
          }}
          onGuestCountsChange={setGuestCounts}
          onDateFlexibilityChange={setDateFlexibility}
          onBackToPlace={() => {
            setDatePickerCanReturnToPlace(false);
            setDatePickerOpen(false);
            setPlaceSelectorOpen(true);
          }}
          onSearchRequest={submitQuery}
          className="flex min-w-0 flex-1"
        />

        <MarketplaceGuestSelector
          layout={isCompact ? "compact" : "hero"}
          value={guestCounts}
          active={datePickerOpen && datePickerInitialStep === "guests"}
          onOpenRequest={openGuestsStep}
          className="flex min-w-0 flex-1 md:min-w-[148px]"
        />

        <div
          className={cn(
            "flex items-center justify-center",
            isCompact ? "px-1 pb-1 pt-0" : "p-2 md:justify-end md:pr-2"
          )}
        >
          <Button
            type="submit"
            size={isCompact ? "default" : "lg"}
            className={cn(
              "w-full shadow-none md:w-auto",
              isCompact
                ? "h-14 rounded-[1.6rem] text-base font-semibold"
                : "rounded-full",
              !isCompact && "px-8"
            )}
          >
            <Search className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Search</span>
          </Button>
        </div>
      </div>
    </form>
  );
}
