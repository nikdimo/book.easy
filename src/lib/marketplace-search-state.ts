import type { GuestCounts } from "@/components/marketplace/marketplace-guest-selector";

export type ActiveSearchState = {
  city: string;
  country: string;
  checkIn: string;
  checkOut: string;
  guestCounts: GuestCounts;
  dateFlexibility: number;
  propertyTypes: string[];
};

export const ACTIVE_SEARCH_STORAGE_KEY = "bookeasy:active-search:v1";

export function parseActiveSearchState(raw: string | null): ActiveSearchState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ActiveSearchState>;
    if (!parsed || typeof parsed !== "object") return null;
    const counts: Partial<GuestCounts> = parsed.guestCounts ?? {};
    return {
      city: typeof parsed.city === "string" ? parsed.city : "",
      country: typeof parsed.country === "string" ? parsed.country : "",
      checkIn: typeof parsed.checkIn === "string" ? parsed.checkIn : "",
      checkOut: typeof parsed.checkOut === "string" ? parsed.checkOut : "",
      guestCounts: {
        adults: Number.isInteger(counts.adults)
          ? Math.max(0, counts.adults ?? 0)
          : 0,
        children: Number.isInteger(counts.children)
          ? Math.max(0, counts.children ?? 0)
          : 0,
        infants: Number.isInteger(counts.infants)
          ? Math.max(0, counts.infants ?? 0)
          : 0,
        pets: Number.isInteger(counts.pets)
          ? Math.max(0, counts.pets ?? 0)
          : 0,
      },
      dateFlexibility:
        typeof parsed.dateFlexibility === "number" ? parsed.dateFlexibility : 0,
      propertyTypes: Array.isArray(parsed.propertyTypes)
        ? parsed.propertyTypes.filter((value): value is string => typeof value === "string")
        : [],
    };
  } catch {
    return null;
  }
}

export function readActiveSearchState(): ActiveSearchState | null {
  if (typeof window === "undefined") return null;
  try {
    return parseActiveSearchState(
      window.localStorage.getItem(ACTIVE_SEARCH_STORAGE_KEY),
    );
  } catch {
    return null;
  }
}

export function writeActiveSearchState(state: ActiveSearchState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACTIVE_SEARCH_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Search remains usable when browser storage is disabled or full.
  }
}

export function updateActiveSearchState(
  patch: Partial<Pick<ActiveSearchState, "checkIn" | "checkOut" | "guestCounts" | "dateFlexibility">>,
): void {
  const current = readActiveSearchState() ?? {
    city: "",
    country: "",
    checkIn: "",
    checkOut: "",
    guestCounts: { adults: 0, children: 0, infants: 0, pets: 0 },
    dateFlexibility: 0,
    propertyTypes: [],
  };
  writeActiveSearchState({ ...current, ...patch });
}

export function clearActiveSearchState(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ACTIVE_SEARCH_STORAGE_KEY);
  } catch {
    // Search remains usable when browser storage is disabled or full.
  }
}
