import "server-only";
import { unstable_cache } from "next/cache";
import { getLanguages } from "@/lib/data/language.repository";

/** Invalidated whenever the admin adds, removes, reorders, enables/disables a
 * language, or toggles its AI translation — see lib/actions/language.actions.ts. */
export const LANGUAGES_TAG = "languages";

/**
 * Read on every page render — the root layout needs it for the consent banner and the
 * public layout for the header's language switcher — but it changes only when an admin
 * edits the language list. Caching it removes two uncached round-trips per render.
 */
export const getEnabledLanguages = unstable_cache(
  async () => {
    const languages = await getLanguages(true);
    return languages.map(({ code, name, isDefault, useAiTranslation }) => ({
      code,
      name,
      isDefault,
      useAiTranslation,
    }));
  },
  ["enabled-languages"],
  { revalidate: 300, tags: [LANGUAGES_TAG] },
);

/** Uncached on purpose: the admin Settings tab must see its own writes immediately. */
export async function getAllLanguages() {
  return getLanguages(false);
}
