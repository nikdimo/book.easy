import { PROPERTY_TYPES } from "@/lib/constants";

export const ALL_PROPERTY_TYPE_VALUES: string[] = PROPERTY_TYPES.map(
  (t) => t.value
);

const ALLOWED = new Set(ALL_PROPERTY_TYPE_VALUES);

const ORDER = new Map(
  ALL_PROPERTY_TYPE_VALUES.map((v, i) => [v, i] as const)
);

export function sortPropertyTypesInDisplayOrder(values: readonly string[]): string[] {
  return [...values].sort(
    (a, b) => (ORDER.get(a) ?? 0) - (ORDER.get(b) ?? 0)
  );
}

export function isAllPropertyTypesSelected(selected: readonly string[]): boolean {
  if (selected.length < ALL_PROPERTY_TYPE_VALUES.length) return false;
  const s = new Set(selected);
  return ALL_PROPERTY_TYPE_VALUES.every((v) => s.has(v));
}

/** Parse from Next.js `searchParams` record (server). */
export function parsePropertyTypesSelectionFromParams(
  params: Record<string, string | string[] | undefined>
): string[] {
  const raw = params.propertyTypes;
  const parts: string[] = [];

  if (typeof raw === "string" && raw.trim()) {
    parts.push(
      ...raw
        .split(",")
        .map((x) => x.trim())
        .filter((x) => ALLOWED.has(x))
    );
  } else if (Array.isArray(raw)) {
    for (const segment of raw) {
      if (typeof segment === "string") {
        parts.push(
          ...segment
            .split(",")
            .map((x) => x.trim())
            .filter((x) => ALLOWED.has(x))
        );
      }
    }
  }

  if (parts.length > 0) {
    return sortPropertyTypesInDisplayOrder([...new Set(parts)]);
  }

  const legacy = params.propertyType;
  if (
    typeof legacy === "string" &&
    legacy.trim() &&
    ALLOWED.has(legacy.trim())
  ) {
    return [legacy.trim()];
  }

  return [...ALL_PROPERTY_TYPE_VALUES];
}

/** Client: read current selection from URL (default = all types). */
export function parsePropertyTypesFromSearchParams(
  searchParams: URLSearchParams
): string[] {
  const raw = searchParams.get("propertyTypes");
  if (raw) {
    const parts = raw
      .split(",")
      .map((x) => x.trim())
      .filter((x) => ALLOWED.has(x));
    if (parts.length > 0) {
      return sortPropertyTypesInDisplayOrder([...new Set(parts)]);
    }
  }
  const legacy = searchParams.get("propertyType");
  if (legacy && ALLOWED.has(legacy)) {
    return [legacy];
  }
  return [...ALL_PROPERTY_TYPE_VALUES];
}

/** `undefined` = no Prisma filter (all types). */
export function propertyTypesForSearchQuery(
  selected: readonly string[]
): string[] | undefined {
  if (selected.length === 0) return undefined;
  if (isAllPropertyTypesSelected(selected)) return undefined;
  return sortPropertyTypesInDisplayOrder(selected);
}

/** `null` = omit query param (all types). */
export function stringifyPropertyTypesParam(
  selected: readonly string[]
): string | null {
  if (isAllPropertyTypesSelected(selected)) return null;
  return sortPropertyTypesInDisplayOrder(selected).join(",");
}
