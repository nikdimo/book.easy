/** Combining diacritical marks, stripped after NFD decomposition. */
const COMBINING_MARKS = /[̀-ͯ]/g;

/** Diacritic- and case-insensitive form used for picker search on both sides of the
 *  regional-settings modal, so "Espanol" finds "Español" and "Krona" finds "króna". */
export function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase().trim();
}

/**
 * cmdk's default fuzzy matcher can surface unrelated entries for short Latin
 * searches — "kr" scores against half the currency list, and two-letter language
 * queries were the original reason this exists. Search is far more predictable when
 * every query token must actually occur in the indexed text.
 */
export function tokenContainmentScore(
  value: string,
  search: string,
  keywords: readonly string[] = [],
): number {
  const query = normalizeSearch(search);
  if (!query) return 1;
  const indexed = normalizeSearch([value, ...keywords].join(" "));
  return query.split(/\s+/).every((token) => indexed.includes(token)) ? 1 : 0;
}
