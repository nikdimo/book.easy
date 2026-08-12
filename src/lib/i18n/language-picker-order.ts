/** The marketplace's primary browsing languages stay immediately reachable. Every
 * other language follows in one predictable alphabetical list. */
const FEATURED_LANGUAGE_CODES = ["en", "fr", "de", "es", "it", "zh-CN"] as const;

export function sortLanguagePickerRows<T extends { key: string; title: string }>(
  rows: readonly T[],
): T[] {
  const featuredIndex = new Map<string, number>(
    FEATURED_LANGUAGE_CODES.map((code, index) => [code, index]),
  );

  return [...rows].sort((left, right) => {
    const leftFeatured = featuredIndex.get(left.key);
    const rightFeatured = featuredIndex.get(right.key);
    if (leftFeatured !== undefined || rightFeatured !== undefined) {
      if (leftFeatured === undefined) return 1;
      if (rightFeatured === undefined) return -1;
      return leftFeatured - rightFeatured;
    }
    return left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
  });
}
