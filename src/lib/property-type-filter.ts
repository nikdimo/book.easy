// Property types used to be a fixed list (`PROPERTY_TYPES` in constants.ts), so this
// module could build its ALLOWED/ORDER lookups once at module load. They're now an
// admin-managed DB table (see lib/services/property-type.service.ts), so every function
// here takes the current ordered value list as an explicit parameter instead — callers
// (server pages, or client components receiving the list as a prop) own fetching it.

function toOrderMap(allValues: readonly string[]): Map<string, number> {
  return new Map(allValues.map((v, i) => [v, i] as const));
}

export function sortPropertyTypesInDisplayOrder(
  values: readonly string[],
  allValues: readonly string[]
): string[] {
  const order = toOrderMap(allValues);
  return [...values].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

export function isAllPropertyTypesSelected(
  selected: readonly string[],
  allValues: readonly string[]
): boolean {
  if (selected.length < allValues.length) return false;
  const s = new Set(selected);
  return allValues.every((v) => s.has(v));
}

export function parsePropertyTypesSelectionFromParams(
  params: Record<string, string | string[] | undefined>,
  allValues: readonly string[]
): string[] {
  const allowed = new Set(allValues);
  const raw = params.propertyTypes;
  const parts: string[] = [];

  if (typeof raw === "string" && raw.trim()) {
    parts.push(
      ...raw
        .split(",")
        .map((x) => x.trim())
        .filter((x) => allowed.has(x))
    );
  } else if (Array.isArray(raw)) {
    for (const segment of raw) {
      if (typeof segment === "string") {
        parts.push(
          ...segment
            .split(",")
            .map((x) => x.trim())
            .filter((x) => allowed.has(x))
        );
      }
    }
  }

  if (parts.length > 0) {
    return sortPropertyTypesInDisplayOrder([...new Set(parts)], allValues);
  }

  const legacy = params.propertyType;
  if (typeof legacy === "string" && legacy.trim() && allowed.has(legacy.trim())) {
    return [legacy.trim()];
  }

  return [...allValues];
}

export function parsePropertyTypesFromSearchParams(
  searchParams: URLSearchParams,
  allValues: readonly string[]
): string[] {
  const allowed = new Set(allValues);
  const raw = searchParams.get("propertyTypes");
  if (raw) {
    const parts = raw
      .split(",")
      .map((x) => x.trim())
      .filter((x) => allowed.has(x));
    if (parts.length > 0) {
      return sortPropertyTypesInDisplayOrder([...new Set(parts)], allValues);
    }
  }
  const legacy = searchParams.get("propertyType");
  if (legacy && allowed.has(legacy)) {
    return [legacy];
  }
  return [...allValues];
}

export function propertyTypesForSearchQuery(
  selected: readonly string[],
  allValues: readonly string[]
): string[] | undefined {
  if (selected.length === 0) return undefined;
  if (isAllPropertyTypesSelected(selected, allValues)) return undefined;
  return sortPropertyTypesInDisplayOrder(selected, allValues);
}

export function stringifyPropertyTypesParam(
  selected: readonly string[],
  allValues: readonly string[]
): string | null {
  if (isAllPropertyTypesSelected(selected, allValues)) return null;
  return sortPropertyTypesInDisplayOrder(selected, allValues).join(",");
}
