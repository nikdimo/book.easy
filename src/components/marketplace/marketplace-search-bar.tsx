"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { format } from "date-fns";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MarketplaceStayDatePicker } from "@/components/marketplace/marketplace-stay-date-picker";
import { MarketplacePlaceSelector } from "@/components/marketplace/marketplace-place-selector";
import {
  MarketplaceGuestSelector,
  countsToGuestsParam,
  guestsParamToCounts,
  type GuestCounts,
} from "@/components/marketplace/marketplace-guest-selector";
import {
  parsePropertyTypesFromSearchParams,
  stringifyPropertyTypesParam,
} from "@/lib/property-type-filter";

type Variant = "hero" | "compact" | "pill" | "summary";

type SearchBarState = {
  city: string;
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
  defaultCheckIn: string;
  defaultCheckOut: string;
  defaultGuests: string;
}): SearchBarState {
  const {
    pathname,
    searchParams,
    defaultCity,
    defaultCheckIn,
    defaultCheckOut,
    defaultGuests,
  } = args;
  const allowRememberedFallback = pathname !== "/properties";

  const city = resolveStringValue(
    defaultCity,
    searchParams.get("city"),
    rememberedSearchState?.city,
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
  const propertyTypes =
    searchParams.get("propertyTypes") !== null
      ? parsePropertyTypesFromSearchParams(searchParams)
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
    checkIn,
    checkOut,
    guestCounts: guestsParamToCounts(guests),
    dateFlexibility,
    propertyTypes,
  };
}

function hasSearchBarState(state: SearchBarState): boolean {
  return Boolean(
    state.city ||
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

function formatGuestSummary(guestCounts: GuestCounts): string {
  const guestsParam = countsToGuestsParam(guestCounts);
  if (!guestsParam) return "Add guests";
  return guestsParam === "1" ? "1 guest" : `${guestsParam} guests`;
}

export function MarketplaceSearchBar({
  variant = "hero",
  defaultCity = "",
  defaultCheckIn = "",
  defaultCheckOut = "",
  defaultGuests = "",
  popularCities = [],
  availablePropertyTypesByCity = {},
}: {
  variant?: Variant;
  defaultCity?: string;
  defaultCheckIn?: string;
  defaultCheckOut?: string;
  defaultGuests?: string;
  popularCities?: string[];
  availablePropertyTypesByCity?: Record<string, string[]>;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialState = getInitialSearchBarState({
    pathname,
    searchParams,
    defaultCity,
    defaultCheckIn,
    defaultCheckOut,
    defaultGuests,
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
    />
  );
}

function MarketplaceSearchBarInner({
  variant,
  initialState,
  showPropertyTypesInWhere,
  popularCities,
  availablePropertyTypesByCity,
}: {
  variant: Variant;
  initialState: SearchBarState;
  showPropertyTypesInWhere: boolean;
  popularCities: string[];
  availablePropertyTypesByCity: Record<string, string[]>;
}) {
  const router = useRouter();
  const [city, setCity] = useState(initialState.city);
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
  const [guestSelectorOpen, setGuestSelectorOpen] = useState(false);
  const [dateFlexibility, setDateFlexibility] = useState(
    initialState.dateFlexibility
  );
  const [propertyTypes, setPropertyTypes] = useState(initialState.propertyTypes);

  const submitQuery = () => {
    const p = new URLSearchParams();
    if (city.trim()) p.set("city", city.trim());
    if (checkIn) p.set("checkIn", checkIn);
    if (checkOut) p.set("checkOut", checkOut);
    const guestsParam = countsToGuestsParam(guestCounts);
    if (guestsParam) p.set("guests", guestsParam);
    if (dateFlexibility > 0) {
      p.set("dateFlexibility", String(dateFlexibility));
    }
    p.delete("propertyType");
    const typesParam = stringifyPropertyTypesParam(propertyTypes);
    if (typesParam) p.set("propertyTypes", typesParam);

    rememberedSearchState = {
      city: city.trim(),
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
          onClick={() => setPlaceSelectorOpen(true)}
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

        <div className="hidden">
          <MarketplacePlaceSelector
            layout="compact"
            city={city}
            selectedPropertyTypes={propertyTypes}
            onPropertyTypesChange={setPropertyTypes}
            onCityChange={setCity}
            open={placeSelectorOpen}
            onOpenChange={setPlaceSelectorOpen}
            onNextToDates={() => {
              setDatePickerCanReturnToPlace(true);
              setDatePickerInitialSegment("checkin");
              setDatePickerOpen(true);
            }}
            popularCities={popularCities}
            availablePropertyTypesByCity={availablePropertyTypesByCity}
            showPropertyTypes={showPropertyTypesInWhere}
          />
          <MarketplaceStayDatePicker
            layout="compact"
            checkIn={checkIn}
            checkOut={checkOut}
            guestCounts={guestCounts}
            dateFlexibility={dateFlexibility}
            open={datePickerOpen}
            onOpenChange={(nextOpen) => {
              setDatePickerOpen(nextOpen);
              if (!nextOpen) {
                setDatePickerCanReturnToPlace(false);
              }
            }}
            initialSegment={datePickerInitialSegment}
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
          />
        </div>
      </div>
    );
  }

  if (isPill) {
    return (
      <form
        onSubmit={onSubmit}
        className="flex w-full max-w-2xl items-center divide-x divide-border/70 rounded-full border border-border/70 bg-background px-2 py-2 shadow-[0_12px_30px_rgba(15,23,42,0.08)] transition-shadow hover:shadow-[0_16px_38px_rgba(15,23,42,0.12)]"
      >
        <MarketplacePlaceSelector
          layout="pill"
          city={city}
          selectedPropertyTypes={propertyTypes}
          onPropertyTypesChange={setPropertyTypes}
          onCityChange={setCity}
          open={placeSelectorOpen}
          onOpenChange={setPlaceSelectorOpen}
          onNextToDates={() => {
            setDatePickerCanReturnToPlace(true);
            setDatePickerInitialSegment("checkin");
            setDatePickerOpen(true);
          }}
          popularCities={popularCities}
          availablePropertyTypesByCity={availablePropertyTypesByCity}
          showPropertyTypes={showPropertyTypesInWhere}
          className="flex flex-1 min-w-0"
        />
        <MarketplaceStayDatePicker
          layout="pill"
          checkIn={checkIn}
          checkOut={checkOut}
          guestCounts={guestCounts}
          dateFlexibility={dateFlexibility}
          open={datePickerOpen}
          onOpenChange={(nextOpen) => {
            setDatePickerOpen(nextOpen);
            if (!nextOpen) {
              setDatePickerCanReturnToPlace(false);
            }
          }}
          initialSegment={datePickerInitialSegment}
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
        <div className="flex min-w-0 shrink-0 items-center gap-1 pl-2 pr-1">
          <MarketplaceGuestSelector
            layout="pill"
            value={guestCounts}
            onChange={setGuestCounts}
            open={guestSelectorOpen}
            onOpenChange={setGuestSelectorOpen}
            className="flex min-w-0 max-w-[6rem] sm:max-w-none"
          />
          <Button
            type="submit"
            className="h-9 shrink-0 gap-2 rounded-full px-4 font-semibold shadow-none"
            aria-label="Search"
          >
            <Search className="h-4 w-4" strokeWidth={2.5} />
            <span className="hidden min-[480px]:inline">Search</span>
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
          selectedPropertyTypes={propertyTypes}
          onPropertyTypesChange={setPropertyTypes}
          onCityChange={setCity}
          open={placeSelectorOpen}
          onOpenChange={setPlaceSelectorOpen}
          onNextToDates={() => {
            setDatePickerCanReturnToPlace(true);
            setDatePickerInitialSegment("checkin");
            setDatePickerOpen(true);
          }}
          popularCities={popularCities}
          availablePropertyTypesByCity={availablePropertyTypesByCity}
          showPropertyTypes={showPropertyTypesInWhere}
          className="flex min-w-0 flex-1"
        />

        <MarketplaceStayDatePicker
          layout={isCompact ? "compact" : "hero"}
          checkIn={checkIn}
          checkOut={checkOut}
          guestCounts={guestCounts}
          dateFlexibility={dateFlexibility}
          open={datePickerOpen}
          onOpenChange={(nextOpen) => {
            setDatePickerOpen(nextOpen);
            if (!nextOpen) {
              setDatePickerCanReturnToPlace(false);
            }
          }}
          initialSegment={datePickerInitialSegment}
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
          onChange={setGuestCounts}
          open={guestSelectorOpen}
          onOpenChange={setGuestSelectorOpen}
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
