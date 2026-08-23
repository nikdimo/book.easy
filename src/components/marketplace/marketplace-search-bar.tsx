"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  useSyncExternalStore,
} from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  isFlexibilityValue,
  MarketplaceStayDatePicker,
} from "@/components/marketplace/marketplace-stay-date-picker";
import { MarketplacePlaceSelector } from "@/components/marketplace/marketplace-place-selector";
import { MarketplaceSearchFlowDialog } from "@/components/marketplace/marketplace-search-flow-dialog";
import {
  MarketplaceGuestSelector,
  countsToGuestsParam,
  formatGuestSummary,
  guestsParamToCounts,
  guestCountsFromParams,
  guestCountsToParams,
} from "@/components/marketplace/marketplace-guest-selector";
import {
  parsePropertyTypesFromSearchParams,
  stringifyPropertyTypesParam,
} from "@/lib/property-type-filter";
import { useSearchLabels } from "@/components/marketplace/search-labels";
import type { Resolved } from "@/lib/i18n/t";
import type { PropertyTypeOption } from "@/lib/types/property-type";
import type { PlaceOption } from "@/lib/utils/place";
import { localizePlaceName } from "@/lib/i18n/place-name";
import {
  clearActiveSearchState,
  parseActiveSearchState,
  ACTIVE_SEARCH_STORAGE_KEY,
  writeActiveSearchState,
  type ActiveSearchState,
} from "@/lib/marketplace-search-state";

type Variant = "hero" | "compact" | "pill" | "summary" | "floating";
type DesktopPanel = "where" | "when" | "who";

type CapsuleGeometry = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type PopoverGeometry = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
};

type SearchBarState = ActiveSearchState;

let rememberedSearchState: SearchBarState | null = null;

export function resetRememberedMarketplaceSearch(): void {
  rememberedSearchState = null;
  clearActiveSearchState();
}

function parseDateFlexibility(value: string | null): number {
  const parsed = Number(value);
  return isFlexibilityValue(parsed) ? parsed : 0;
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
  rememberedState?: SearchBarState | null;
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
    rememberedState,
  } = args;
  const fallbackState = rememberedState ?? rememberedSearchState;
  const hasExplicitSearchParams = [
    "city",
    "country",
    "checkIn",
    "checkOut",
    "guests",
    "adults",
    "children",
    "infants",
    "pets",
    "dateFlexibility",
    "propertyTypes",
  ].some((key) => searchParams.has(key));
  const allowRememberedFallback =
    pathname !== "/properties" || !hasExplicitSearchParams;

  const city = resolveStringValue(
    defaultCity,
    searchParams.get("city"),
    fallbackState?.city,
    allowRememberedFallback
  );
  const country = resolveStringValue(
    defaultCountry,
    searchParams.get("country"),
    fallbackState?.country,
    allowRememberedFallback
  );
  const checkIn = resolveStringValue(
    defaultCheckIn,
    searchParams.get("checkIn"),
    fallbackState?.checkIn,
    allowRememberedFallback
  );
  const checkOut = resolveStringValue(
    defaultCheckOut,
    searchParams.get("checkOut"),
    fallbackState?.checkOut,
    allowRememberedFallback
  );
  const guests = resolveStringValue(
    defaultGuests,
    searchParams.get("guests"),
    fallbackState
      ? countsToGuestsParam(fallbackState.guestCounts)
      : undefined,
    allowRememberedFallback
  );
  // Prefer the full adults/children/infants/pets breakdown carried in the URL; only
  // collapse to all-adults from the plain `guests` total when no breakdown is present
  // (e.g. a link that only ever set `guests`, like a property card).
  const guestCounts =
    guestCountsFromParams((key) => searchParams.get(key)) ??
    (allowRememberedFallback ? fallbackState?.guestCounts : undefined) ??
    guestsParamToCounts(guests);
  const propertyTypes =
    searchParams.get("propertyTypes") !== null
      ? parsePropertyTypesFromSearchParams(searchParams, allPropertyTypeValues)
      : allowRememberedFallback && fallbackState
        ? fallbackState.propertyTypes
        : [];
  const dateFlexibility =
    searchParams.get("dateFlexibility") !== null
      ? parseDateFlexibility(searchParams.get("dateFlexibility"))
        : allowRememberedFallback && fallbackState
        ? fallbackState.dateFlexibility
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
      state.dateFlexibility !== 0 ||
      state.propertyTypes.length > 0
  );
}

function parseLocalYmd(s: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? undefined : dt;
}

function formatDateSummary(
  checkIn: string,
  checkOut: string,
  anyDates: Resolved,
  locale: string
): Resolved {
  const from = parseLocalYmd(checkIn);
  const to = parseLocalYmd(checkOut);

  if (from && to) {
    const formatter = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" });
    return { text: `${formatter.format(from)} - ${formatter.format(to)}`, translated: false };
  }
  if (from) return { text: new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(from), translated: false };
  return anyDates;
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
  const storedSearchRaw = useSyncExternalStore(
    (onChange) => {
      window.addEventListener("storage", onChange);
      return () => window.removeEventListener("storage", onChange);
    },
    () => window.localStorage.getItem(ACTIVE_SEARCH_STORAGE_KEY),
    () => null,
  );
  const storedSearchState = useMemo(
    () => parseActiveSearchState(storedSearchRaw),
    [storedSearchRaw],
  );
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
    rememberedState: storedSearchState,
  });
  const hydratedInitialState = storedSearchState
    ? getInitialSearchBarState({
        pathname,
        searchParams,
        defaultCity,
        defaultCountry,
        defaultCheckIn,
        defaultCheckOut,
        defaultGuests,
        allPropertyTypeValues,
        rememberedState: storedSearchState,
      })
    : initialState;
  const showPropertyTypesInWhere = true;

  useEffect(() => {
    if (pathname !== "/properties") return;
    rememberedSearchState = hasSearchBarState(hydratedInitialState)
      ? hydratedInitialState
      : null;
  }, [hydratedInitialState, pathname]);

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
      initialState={hydratedInitialState}
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
  const labels = useSearchLabels();
  const router = useRouter();
  const isCompact = variant === "compact";
  const isSummary = variant === "summary";
  const isFloating = variant === "floating";
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
  const [floatingExpanded, setFloatingExpanded] = useState(false);
  // Once expanded, the floating search becomes the real desktop pill component. This
  // keeps both placements on one implementation instead of maintaining a lookalike.
  const isPill = variant === "pill" || (isFloating && floatingExpanded);
  const [dateFlexibility, setDateFlexibility] = useState(
    initialState.dateFlexibility
  );
  const [propertyTypes, setPropertyTypes] = useState(initialState.propertyTypes);
  const hasSearchSelection = Boolean(
    city || country || checkIn || checkOut || dateFlexibility ||
      propertyTypes.length || countsToGuestsParam(guestCounts)
  );
  const activeDesktopPanel: DesktopPanel | null = isPill
    ? placeSelectorOpen
      ? "where"
      : datePickerOpen
        ? datePickerInitialStep === "guests"
          ? "who"
          : "when"
        : null
    : null;
  const pillFormRef = useRef<HTMLFormElement>(null);
  const whereFieldRef = useRef<HTMLDivElement>(null);
  const whenFieldRef = useRef<HTMLDivElement>(null);
  const whoFieldRef = useRef<HTMLDivElement>(null);
  const pendingDatePickerCloseFrameRef = useRef<number | null>(null);
  const [capsuleGeometry, setCapsuleGeometry] =
    useState<CapsuleGeometry | null>(null);
  const [renderedDesktopPanel, setRenderedDesktopPanel] =
    useState<DesktopPanel | null>(null);
  const [desktopShellVisible, setDesktopShellVisible] = useState(false);
  const [popoverGeometry, setPopoverGeometry] =
    useState<PopoverGeometry | null>(null);
  const visualDesktopPanel =
    activeDesktopPanel ??
    (desktopShellVisible ? renderedDesktopPanel : null);

  useEffect(
    () => () => {
      if (pendingDatePickerCloseFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingDatePickerCloseFrameRef.current);
      }
    },
    []
  );

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let removeTimer: ReturnType<typeof setTimeout> | undefined;
    let openFrame: number | undefined;

    if (activeDesktopPanel) {
      openFrame = window.requestAnimationFrame(() => {
        setRenderedDesktopPanel(activeDesktopPanel);
        setDesktopShellVisible(true);
      });
    } else {
      // Radix briefly reports the current dialog as closed when a pointer moves
      // from one search trigger to another. Keep the visual shell alive long
      // enough for the next trigger to claim it, avoiding a one-frame flash.
      hideTimer = setTimeout(() => {
        setDesktopShellVisible(false);
        removeTimer = setTimeout(() => setRenderedDesktopPanel(null), 180);
      }, 80);
    }

    return () => {
      if (openFrame !== undefined) window.cancelAnimationFrame(openFrame);
      if (hideTimer !== undefined) clearTimeout(hideTimer);
      if (removeTimer !== undefined) clearTimeout(removeTimer);
    };
  }, [activeDesktopPanel]);

  useLayoutEffect(() => {
    if (!isPill || !renderedDesktopPanel) return;

    const form = pillFormRef.current;
    if (!form) return;

    const updateGeometry = () => {
      const formRect = form.getBoundingClientRect();
      if (formRect.width <= 0 || formRect.height <= 0) return;

      const field =
        activeDesktopPanel === "where"
          ? whereFieldRef.current
          : activeDesktopPanel === "when"
            ? whenFieldRef.current
            : activeDesktopPanel === "who"
              ? whoFieldRef.current
              : null;

      if (field) {
        const fieldRect = field.getBoundingClientRect();
        setCapsuleGeometry({
          left: fieldRect.left - formRect.left,
          top: fieldRect.top - formRect.top,
          width: fieldRect.width,
          height: fieldRect.height,
        });
      }

      const viewportPadding = 16;
      const availableWidth = Math.max(
        0,
        window.innerWidth - viewportPadding * 2
      );
      const targetWidth =
        renderedDesktopPanel === "when"
          ? Math.min(formRect.width, availableWidth)
          : Math.min(
              renderedDesktopPanel === "where" ? 416 : 400,
              formRect.width,
              availableWidth
            );
      const unclampedLeft =
        renderedDesktopPanel === "who"
          ? formRect.right - targetWidth
          : formRect.left;
      const left = Math.min(
        Math.max(viewportPadding, unclampedLeft),
        window.innerWidth - targetWidth - viewportPadding
      );
      const top = formRect.bottom + 12;

      setPopoverGeometry({
        left,
        top,
        width: targetWidth,
        maxHeight: Math.max(180, window.innerHeight - top - viewportPadding),
      });
    };

    updateGeometry();
    const resizeObserver = new ResizeObserver(updateGeometry);
    resizeObserver.observe(form);
    [whereFieldRef.current, whenFieldRef.current, whoFieldRef.current].forEach(
      (node) => {
        if (node) resizeObserver.observe(node);
      }
    );
    window.addEventListener("resize", updateGeometry);
    window.addEventListener("scroll", updateGeometry, true);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateGeometry);
      window.removeEventListener("scroll", updateGeometry, true);
    };
  }, [activeDesktopPanel, isPill, renderedDesktopPanel]);

  const desktopContentStyle: CSSProperties | undefined = popoverGeometry
    ? {
        left: popoverGeometry.left,
        top: popoverGeometry.top,
        right: "auto",
        bottom: "auto",
        width: popoverGeometry.width,
        maxWidth: popoverGeometry.width,
        maxHeight: popoverGeometry.maxHeight,
        transform: "none",
      }
    : { visibility: "hidden" };

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
    if (dateFlexibility !== 0) {
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
    writeActiveSearchState(rememberedSearchState);

    const q = p.toString();
    router.push(q ? `/properties?${q}` : "/properties");
  };

  const clearSearch = () => {
    setCity("");
    setCountry("");
    setCheckIn("");
    setCheckOut("");
    setGuestCounts({ adults: 0, children: 0, infants: 0, pets: 0 });
    setDateFlexibility(0);
    setPropertyTypes([]);
    setPlaceSelectorOpen(false);
    setDatePickerOpen(false);
    setDatePickerCanReturnToPlace(false);
    resetRememberedMarketplaceSearch();
    router.push("/properties");
  };

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submitQuery();
  }

  const openGuestsStep = () => {
    if (pendingDatePickerCloseFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingDatePickerCloseFrameRef.current);
      pendingDatePickerCloseFrameRef.current = null;
    }
    setPlaceSelectorOpen(false);
    // The current popover dismisses on pointer-down. Reopen on the next frame so
    // the guest request always wins over that close event in a single click.
    setDatePickerOpen(false);
    setDatePickerInitialStep("guests");
    window.requestAnimationFrame(() => setDatePickerOpen(true));
  };

  const openPlaceStep = () => {
    if (pendingDatePickerCloseFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingDatePickerCloseFrameRef.current);
      pendingDatePickerCloseFrameRef.current = null;
    }
    setDatePickerCanReturnToPlace(false);
    setDatePickerOpen(false);
    setPlaceSelectorOpen(false);
    window.requestAnimationFrame(() => setPlaceSelectorOpen(true));
  };

  const openDatesStep = () => {
    if (pendingDatePickerCloseFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingDatePickerCloseFrameRef.current);
      pendingDatePickerCloseFrameRef.current = null;
    }
    setDatePickerCanReturnToPlace(true);
    setDatePickerInitialSegment("checkin");
    setDatePickerInitialStep("dates");
    setPlaceSelectorOpen(false);
    setDatePickerOpen(false);
    // Let Radix finish dismissing the destination dialog before mounting the
    // date dialog. Otherwise its late close event can cancel this transition.
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
    if (nextOpen) {
      if (pendingDatePickerCloseFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingDatePickerCloseFrameRef.current);
        pendingDatePickerCloseFrameRef.current = null;
      }
      setDatePickerOpen(true);
      setPlaceSelectorOpen(false);
      return;
    }

    if (!isPill) {
      setDatePickerOpen(false);
      setDatePickerCanReturnToPlace(false);
      setDatePickerInitialStep("dates");
      return;
    }

    if (pendingDatePickerCloseFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingDatePickerCloseFrameRef.current);
    }
    pendingDatePickerCloseFrameRef.current = window.requestAnimationFrame(() => {
      pendingDatePickerCloseFrameRef.current = null;
      setDatePickerOpen(false);
      setDatePickerCanReturnToPlace(false);
      setDatePickerInitialStep("dates");
    });
  };

  // The floating search is only mounted in the desktop header. Keep its collapsed
  // trigger compact, but expand into the same full field layout used by the hero
  // search when it is opened instead of sending desktop users through the mobile flow.
  if (isFloating && !floatingExpanded) {
    const citySummary = city
      ? localizePlaceName(city, labels.locale)
      : labels.whereToPlaceholder.text;
    const dateSummary = formatDateSummary(
      checkIn,
      checkOut,
      labels.anyDates,
      labels.locale,
    );
    const guestSummary = formatGuestSummary(guestCounts, labels);

    return (
      <>
        <button
          type="button"
          onClick={() => setFloatingExpanded(true)}
          aria-label={labels.openSearch.text}
          className="flex h-14 items-center rounded-full border border-border/70 bg-background px-2 pl-5 text-left shadow-[0_8px_28px_rgba(15,23,42,0.16)] transition-shadow hover:shadow-[0_10px_34px_rgba(15,23,42,0.2)]"
        >
          <span className="max-w-40 truncate px-3 text-sm font-semibold text-foreground">
            {citySummary}
          </span>
          <span className="h-7 w-px bg-border" aria-hidden="true" />
          <span className="max-w-32 truncate px-5 text-sm font-semibold text-foreground">
            {dateSummary.text}
          </span>
          <span className="h-7 w-px bg-border" aria-hidden="true" />
          <span className="max-w-32 truncate px-5 text-sm font-semibold text-foreground">
            {guestSummary.text}
          </span>
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
            <Search className="size-4" strokeWidth={2.5} />
          </span>
        </button>

      </>
    );
  }

  if (isSummary) {
    const citySummary = city
      ? localizePlaceName(city, labels.locale)
      : labels.whereToPlaceholder.text;
    const dateSummary = formatDateSummary(checkIn, checkOut, labels.anyDates, labels.locale);
    const guestSummary = formatGuestSummary(guestCounts, labels);

    // The trigger fills whatever room the header gives it and only collapses to the bare
    // search icon when its container is too narrow for the "Where to?" summary. Container
    // queries (the header wraps this in `@container`) rather than viewport breakpoints, so
    // it reacts to the space left over by the account/notification controls beside it.
    // aria-label carries the meaning that the visible text otherwise would.
    return (
      <div className="flex w-full justify-center @min-[200px]:block">
        <button
          type="button"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-left transition-shadow focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background @min-[200px]:h-auto @min-[200px]:min-h-16 @min-[200px]:w-full @min-[200px]:justify-start @min-[200px]:gap-3 @min-[200px]:border @min-[200px]:border-border/70 @min-[200px]:bg-background @min-[200px]:py-3 @min-[200px]:pl-5 @min-[200px]:pr-3 @min-[200px]:shadow-[0_10px_26px_rgba(15,23,42,0.08)] @min-[200px]:hover:shadow-[0_14px_32px_rgba(15,23,42,0.12)]"
          onClick={() => setSearchFlowOpen(true)}
          aria-label={labels.openSearch.text}
        >
          <span className="hidden min-w-0 flex-1 @min-[200px]:block">
            <span
              className={cn(
                "block truncate text-sm font-semibold text-foreground",
                (city || labels.whereToPlaceholder.translated) && "notranslate"
              )}
              translate="no"
              suppressHydrationWarning
            >
              {citySummary}
            </span>
            <span className="mt-1 block truncate text-xs text-muted-foreground">
              <span
                className="notranslate"
                translate="no"
                suppressHydrationWarning
              >
                {dateSummary.text}
              </span> ·{" "}
              <span className={guestSummary.translated ? "notranslate" : undefined}>{guestSummary.text}</span>
            </span>
          </span>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_10px_26px_rgba(15,23,42,0.08)] @min-[200px]:h-10 @min-[200px]:w-10 @min-[200px]:shadow-none">
            <Search className="h-4 w-4" strokeWidth={2.5} />
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
          onApplySearch={(next) => {
            setCity(next.city);
            setCountry(next.country);
            setCheckIn(next.checkIn);
            setCheckOut(next.checkOut);
            setGuestCounts(next.guestCounts);
            setDateFlexibility(next.dateFlexibility);
            setPropertyTypes(next.propertyTypes);

            rememberedSearchState = next;
            writeActiveSearchState(next);
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
            if (next.dateFlexibility !== 0) {
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
      <>
        <form
          ref={pillFormRef}
          data-desktop-search-pill
          onSubmit={onSubmit}
          className={cn(
            "relative z-[60] flex w-full max-w-[64rem] items-center rounded-full border border-black/10 bg-[#f7f7f7] p-1 shadow-[0_1px_2px_rgba(0,0,0,0.08),0_8px_24px_rgba(0,0,0,0.08)] transition-shadow duration-200 hover:shadow-[0_2px_4px_rgba(0,0,0,0.10),0_10px_28px_rgba(0,0,0,0.10)]",
            isFloating && "animate-in fade-in-0 zoom-in-95 duration-300",
          )}
        >
          <span
            aria-hidden
            className="desktop-search-active-capsule pointer-events-none absolute z-0 rounded-full border border-black/[0.04] bg-white shadow-[0_2px_10px_rgba(15,23,42,0.12)]"
            style={
              capsuleGeometry
                ? {
                    left: capsuleGeometry.left,
                    top: capsuleGeometry.top,
                    width: capsuleGeometry.width,
                    height: capsuleGeometry.height,
                    opacity: visualDesktopPanel ? 1 : 0,
                    transform: "translateZ(0)",
                  }
                : { opacity: 0 }
            }
          />

          <div
            ref={whereFieldRef}
            className="relative z-10 flex min-w-0 flex-1 self-stretch"
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
              onNextToDates={openDatesStep}
              popularCities={popularCities}
              availablePropertyTypesByCity={availablePropertyTypesByCity}
              propertyTypes={propertyTypeOptions}
              showPropertyTypes={showPropertyTypesInWhere}
              sharedPillActive
              hidePillDivider={
                visualDesktopPanel === "where" ||
                visualDesktopPanel === "when"
              }
              desktopContentStyle={desktopContentStyle}
              useSharedDesktopShell
              dialogContentId="desktop-search-where-panel"
              className="flex min-w-0 flex-1"
            />
          </div>

          <div
            ref={whenFieldRef}
            className="relative z-10 flex min-w-0 flex-1 self-stretch"
          >
            <MarketplaceStayDatePicker
              layout="pill"
              checkIn={checkIn}
              checkOut={checkOut}
              guestCounts={guestCounts}
              dateFlexibility={dateFlexibility}
              open={datePickerOpen}
              onOpenChange={handleDatePickerOpenChange}
              onStepChange={setDatePickerInitialStep}
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
                openPlaceStep();
              }}
              onSearchRequest={submitQuery}
              showPillGuestAction
              sharedPillActive
              hidePillDivider={
                visualDesktopPanel === "when" ||
                visualDesktopPanel === "who"
              }
              desktopContentStyle={desktopContentStyle}
              useSharedDesktopShell
              dialogContentId="desktop-search-date-panel"
              className="flex min-w-0 flex-1"
            />
          </div>

          <div className="relative z-10 flex min-w-0 shrink-0 items-center pl-0.5 pr-0.5">
            <div ref={whoFieldRef} className="flex min-w-0 self-stretch">
              <MarketplaceGuestSelector
                layout="pill"
                value={guestCounts}
                active={activeDesktopPanel === "who"}
                sharedPillActive
                onOpenRequest={openGuestsStep}
                dialogContentId="desktop-search-date-panel"
                className="min-w-[14rem] flex-1"
              />
            </div>
            {hasSearchSelection && (
              <button
                type="button"
                onClick={clearSearch}
                className="mr-1 inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={labels.reset.text}
              >
                <X className="h-3.5 w-3.5" />
                <span className="hidden xl:inline">{labels.reset.text}</span>
              </button>
            )}
            <Button
              type="submit"
              className={cn(
                "relative z-10 ml-1 h-11 shrink-0 rounded-full bg-primary px-4 text-primary-foreground shadow-none transition-all duration-200 hover:bg-primary/95",
                visualDesktopPanel ? "gap-2 px-5" : "w-11 px-0"
              )}
              aria-label={labels.search.text}
            >
              <Search className="h-4 w-4" strokeWidth={2.5} />
              <span
                className={cn(
                  "overflow-hidden whitespace-nowrap font-semibold transition-[max-width,opacity] duration-200",
                  visualDesktopPanel
                    ? "max-w-20 opacity-100"
                    : "max-w-0 opacity-0",
                  labels.search.translated && "notranslate"
                )}
              >
                {labels.search.text}
              </span>
            </Button>
          </div>
        </form>
      </>
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
          onNextToDates={openDatesStep}
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
            openPlaceStep();
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
          {hasSearchSelection && (
            <button
              type="button"
              onClick={clearSearch}
              className="flex items-center justify-center gap-1 px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              aria-label={labels.reset.text}
            >
              <X className="h-4 w-4" />
              {labels.reset.text}
            </button>
          )}
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
            <span className={cn("hidden sm:inline", labels.search.translated && "notranslate")}>
              {labels.search.text}
            </span>
          </Button>
        </div>
      </div>
    </form>
  );
}
