"use client";

import { Globe } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { useDisplayCurrency } from "@/lib/currency/client";
import { REGIONAL_SETTINGS_OPEN_EVENT } from "@/components/shared/regional-settings-event";
import { currencyDisplayName } from "@/lib/currency/currencies";
import { normalizeLocaleCode } from "@/lib/i18n/locale-preference";
import { cn } from "@/lib/utils";

/**
 * One control that opens the shared regional-settings dialog.
 *
 * Deliberately not a second picker: it renders no list, stores nothing and owns no
 * preference. It dispatches the same `regional-settings:open` event the host panel's
 * account menu uses, so the dialog the surrounding layout mounts once stays the only
 * place a language or a currency is ever chosen. Surfaces whose header has no room
 * for the public site's chip pair — the new-listing flow is one — use this instead.
 *
 * Both current selections come from the same two providers the rest of the app reads,
 * seeded by the server render, so this needs no props and no call site has to thread
 * cookies down to it. `requestedLocale` rather than `locale`, for the reason the
 * dialog documents: `locale` is the *catalog* locale and reads "en" for a language
 * that is only machine-translated.
 *
 * The label shows both selections, so the control states what it will change rather
 * than only inviting a change. `aria-label` spells them out in full, because
 * "EN · EUR" read aloud is two acronyms and no sentence.
 */
export function RegionalSettingsTrigger({
  className,
  tab = "language",
}: {
  className?: string;
  /** Which half of the dialog to open on. */
  tab?: "language" | "currency";
} = {}) {
  const i18n = useI18n();
  const display = useDisplayCurrency();
  const locale = normalizeLocaleCode(i18n.requestedLocale) ?? "en";
  /** "mk", "zh-CN" → "MK". The region half is dropped for the same reason the public
   *  header drops it: it is the language being switched, not the region. */
  const localeBadge = (locale.split("-")[0] || locale).toUpperCase();
  const languageName = nativeLanguageName(locale) ?? localeBadge;
  const label = i18n.resolve("regional.trigger_label", "Language and currency").text;

  return (
    <button
      type="button"
      // `notranslate` for the same reason every other picker chip carries it: a
      // language code and a currency code must not themselves be machine-translated.
      className={cn(
        "notranslate inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-slate-200 px-3 text-[0.8125rem] font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400",
        className,
      )}
      translate="no"
      aria-haspopup="dialog"
      aria-label={`${label}: ${languageName}, ${currencyDisplayName(display.currency, i18n.locale)}`}
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent(REGIONAL_SETTINGS_OPEN_EVENT, { detail: { tab } }),
        )
      }
    >
      <Globe className="size-4 shrink-0" aria-hidden />
      {/* The language code goes only where there is room; the currency always shows.
          Currency is the one of the two a host cannot infer from the words on screen. */}
      <span className="hidden sm:inline" aria-hidden>
        {localeBadge}
      </span>
      <span className="hidden sm:inline" aria-hidden>
        ·
      </span>
      <span aria-hidden>{display.currency}</span>
    </button>
  );
}

/** A language's own name for itself. Null when the runtime has no data for the code,
 *  which keeps an unrecognized locale from being announced as itself. */
function nativeLanguageName(code: string): string | null {
  try {
    const name = new Intl.DisplayNames([code], { type: "language" }).of(code);
    return name && name !== code ? name : null;
  } catch {
    return null;
  }
}
