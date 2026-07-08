/**
 * True when the listings URL carries any non-trivial filter (user has searched or applied filters).
 * Bare `/properties` or only `page=1` stays false so we keep the landing-style UI until then.
 */
export function hasActivePropertySearch(params: URLSearchParams): boolean {
  for (const [key, value] of params.entries()) {
    const v = value.trim();
    if (!v) continue;
    if (key === "page" && v === "1") continue;
    return true;
  }
  return false;
}
