import "server-only";

/*
 * The translator is loaded on demand rather than imported at the top.
 *
 * `@/lib/i18n/t` reaches `unstable_cache` from `next/cache` while it is being evaluated,
 * so importing it here would drag that into every module that returns a message — and
 * into every unit test that mocks `next/cache` for its own reasons. Those tests do not
 * need a catalog: they assert the English sentence, which is exactly what this module
 * falls back to. Deferring the import keeps the fallback covering a missing catalog and
 * a catalog that cannot even be loaded, which are the same thing to a caller.
 */
async function translator() {
  const { getT } = await import("@/lib/i18n/t");
  return getT();
}

/**
 * A sentence a host is meant to read, in the language they are reading the panel in.
 *
 * Server actions used to return bare English — "Please set pricing before submitting",
 * "Add at least 3 photos before publishing" — straight into `toast.error`. Nothing
 * downstream could rescue them: in a catalog language the layout marks the whole
 * document `translate="no"`, precisely so Google does not re-translate copy the catalog
 * already owns, which left these the only English on an otherwise translated screen.
 * Resolving them here puts them through the same catalog as everything else.
 *
 * The English `source` stays a literal at the call site, so `npm run i18n:extract` sees
 * it (see `extract-ui-strings.ts`, which knows this function by name) and it remains the
 * fallback for any language the catalog has not reached yet.
 *
 * `{placeholder}` in the source is substituted from `values`, so a message that quotes a
 * room name or a number is still one translatable sentence rather than English glued
 * around a variable.
 *
 * It returns the string rather than the whole `{ error }` object on purpose. When every
 * `return` in a function is a fresh object literal, TypeScript normalises the inferred
 * union by giving each member the other members' properties as optional `undefined` —
 * which is what lets some thirty call sites across the panel write `result.error` on a
 * `{ error } | { success }` union without narrowing first. One member arriving from a
 * helper with a declared type switches that off for the whole union, so the object
 * literal stays at the call site and only the sentence inside it comes from here.
 */
export async function actionText(
  key: string,
  source: string,
  values?: Record<string, string | number>,
): Promise<string> {
  try {
    const { ti } = await import("@/lib/i18n/t");
    return ti(await translator(), key, source, values ?? {}).text;
  } catch {
    /*
     * `getT` reads request cookies, which exist only inside a request. A unit test
     * calling an action directly, or a script, has none — and neither has a language
     * preference to honour, so the English source is exactly the right answer rather
     * than a degraded one. Swallowing this keeps a missing catalog from turning a
     * validation message into a 500.
     */
    return substitute(source, values);
  }
}

/**
 * A count and a noun, in the target language's own grammar.
 *
 * English needs two forms and picks between them with `=== 1`; Macedonian and every
 * other reviewed Slavic language need more, and a sentence assembled from an English
 * ternary cannot be given them. `{n}` is the count.
 */
export async function actionPlural(
  keyBase: string,
  count: number,
  singular: string,
  plural: string,
  values?: Record<string, string | number>,
): Promise<string> {
  try {
    const { tPlural } = await import("@/lib/i18n/t");
    const resolved = tPlural(await translator(), keyBase, count, singular, plural);
    return substitute(resolved.text, values);
  } catch {
    return substitute(count === 1 ? singular : plural, { n: count, ...values });
  }
}

function substitute(source: string, values?: Record<string, string | number>): string {
  if (!values) return source;
  return source.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}
