/** Stable identity used for provider aliases and forgiving catalogue-name matching. */
export function normalizeAmenityName(value: string): string {
  return value.normalize("NFKD").replace(/[^a-z0-9]+/gi, "").toLowerCase();
}
