"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Check, Globe, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Tx, useI18n } from "@/lib/i18n/client";
import { recordLanguageSelection } from "@/lib/actions/language.actions";
import { setDisplayCurrency } from "@/lib/actions/currency.actions";
import { DEFAULT_LOCALE, normalizeLocaleCode } from "@/lib/i18n/locale-preference";
import {
  getActiveLocale,
  getAutomaticLanguages,
  getServerActiveLocale,
  getServerAutomaticLanguages,
  subscribeActiveLocale,
  subscribeAutomaticLanguages,
  syncBrowserLanguageCookies,
} from "@/lib/i18n/google-translate-runtime";
import {
  getReviewedLanguage,
  reviewedLanguageSearchText,
} from "@/lib/i18n/reviewed-languages";
import {
  currencyDisplayName,
  currencySearchText,
  currencySymbol,
} from "@/lib/currency/currencies";
import { tokenContainmentScore } from "@/lib/utils/search-score";

export interface LanguageOption {
  code: string;
  name: string;
  isDefault: boolean;
  useAiTranslation: boolean;
}

interface PickerRow {
  key: string;
  /** Primary line — the language's own name for itself, or the currency's name. */
  title: string;
  /** Secondary line — the region, or "DKK – kr". */
  subtitle: string;
  /** Everything this row can be searched by. */
  searchText: string;
  selected: boolean;
  onSelect: () => void;
}

/** A language's own name for itself, matching how `collectLanguages` labels
 *  Google's list. Null when the runtime has no data, which keeps an unrecognized
 *  code from rendering as itself. */
function nativeLanguageName(code: string): string | null {
  try {
    const name = new Intl.DisplayNames([code], { type: "language" }).of(code);
    return name && name !== code ? name : null;
  } catch {
    return null;
  }
}

/**
 * The region line under a language, named *in that language* — "Северна
 * Македонија" under "Македонски", the way Airbnb does it. Reviewed languages carry
 * a primary country; Google-only ones have no region to claim, so they get their
 * English name instead of a guess.
 */
function languageRegionLabel(code: string, fallback: string): string {
  const country = getReviewedLanguage(code)?.primaryCountries[0];
  if (!country) return fallback;
  try {
    const region = new Intl.DisplayNames([code], { type: "region" }).of(country);
    if (region && region !== country) return region;
  } catch {
    // Fall through to the English name below.
  }
  return fallback;
}

/** Two lines, a selected ring, and a real button — so keyboard and screen-reader
 *  users get the same grid everyone else does. */
function PickerGrid({ rows, emptyLabel }: { rows: PickerRow[]; emptyLabel: string }) {
  if (rows.length === 0) {
    return <p className="px-1 py-8 text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {rows.map((row) => (
        <button
          key={row.key}
          type="button"
          onClick={row.onSelect}
          aria-current={row.selected ? "true" : undefined}
          className={cn(
            "flex items-start gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors",
            "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            row.selected ? "border-foreground" : "border-transparent",
          )}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm">{row.title}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {row.subtitle}
            </span>
          </span>
          {row.selected && (
            <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          )}
        </button>
      ))}
    </div>
  );
}

/** Search field plus a suggested section plus the full list, shared by both tabs so
 *  they behave identically. */
function PickerPanel({
  rows,
  suggested,
  searchPlaceholder,
  searchLabel,
  suggestedHeading,
  allHeading,
  emptyLabel,
}: {
  rows: PickerRow[];
  suggested: PickerRow[];
  searchPlaceholder: string;
  searchLabel: string;
  suggestedHeading: React.ReactNode;
  allHeading: React.ReactNode;
  emptyLabel: string;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () => rows.filter((row) => tokenContainmentScore(row.searchText, query) === 1),
    [rows, query],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchLabel}
          className="pl-9"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {/* Suggestions are only meaningful against the unfiltered list — once
            someone is searching, the thing they typed is the suggestion. */}
        {query === "" && suggested.length > 0 && (
          <section className="mb-6">
            <h3 className="mb-2 px-1 text-sm font-medium">{suggestedHeading}</h3>
            <PickerGrid rows={suggested} emptyLabel={emptyLabel} />
          </section>
        )}

        <section>
          {query === "" && (
            <h3 className="mb-2 px-1 text-sm font-medium">{allHeading}</h3>
          )}
          <PickerGrid rows={filtered} emptyLabel={emptyLabel} />
        </section>
      </div>
    </div>
  );
}

/**
 * One globe, one modal, two independent preferences.
 *
 * Language and currency are deliberately not coupled here: picking a currency does
 * not touch the language cookie and picking a language does not touch the currency
 * cookie. The only place they meet is the "Suggested" section, which reflects the
 * same detected country both defaults came from.
 *
 * They apply differently on purpose. A language change has to reload, because
 * Google Translate re-translates the document from scratch. A currency change must
 * *not* — it goes through `router.refresh()`, which re-renders the server
 * components with the new cookie while leaving client state alone, so the map
 * viewport, the open search sheet and a half-finished booking form all survive it.
 */
export function RegionalSettingsDialog({
  languages,
  currentLocale,
  currencies,
  currentCurrency,
  suggestedLocale,
  suggestedCurrency,
  ratesUnavailable = false,
}: {
  languages: LanguageOption[];
  currentLocale?: string;
  /** Currencies the rate provider can actually quote right now. */
  currencies: string[];
  currentCurrency: string;
  /** From the detected country — a hint, never applied on its own. */
  suggestedLocale?: string | null;
  suggestedCurrency?: string | null;
  /** True when conversion is down and everything is showing official prices. */
  ratesUnavailable?: boolean;
}) {
  const i18n = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const automaticLanguages = useSyncExternalStore(
    subscribeAutomaticLanguages,
    getAutomaticLanguages,
    getServerAutomaticLanguages,
  );
  const activeLocale = useSyncExternalStore(
    subscribeActiveLocale,
    getActiveLocale,
    getServerActiveLocale,
  );

  // The runtime is authoritative once started — it owns the cookies and Google's
  // target. Before hydration it has nothing, so this falls back to the prop and then
  // to `requestedLocale`, never to `i18n.locale`, which is the *catalog* locale and
  // reads "en" for a Google-only selection.
  const locale =
    normalizeLocaleCode(activeLocale) ??
    normalizeLocaleCode(currentLocale) ??
    normalizeLocaleCode(i18n.requestedLocale) ??
    DEFAULT_LOCALE;

  async function selectLanguage(code: string) {
    const next = normalizeLocaleCode(code);
    if (!next) return;
    syncBrowserLanguageCookies(next);
    try {
      await recordLanguageSelection(next);
    } catch {
      // Selection tracking is best-effort; never block switching the language.
    }
    window.location.reload();
  }

  async function selectCurrency(code: string) {
    setAnnouncement(
      `${currencyDisplayName(code, i18n.locale)} (${code})`,
    );
    try {
      await setDisplayCurrency(code);
    } catch {
      // A failed write leaves the previous currency in place; the next render will
      // show it still selected rather than pretending the change took.
      return;
    }
    // Not a reload: prices re-render from the server while client state survives.
    router.refresh();
  }

  const reviewed = languages.filter(
    (language) => language.isDefault || language.useAiTranslation,
  );
  const reviewedCodes = new Set(reviewed.map((language) => language.code));
  const automatic = automaticLanguages.filter(
    (language) => !reviewedCodes.has(language.code),
  );

  const languageRows: PickerRow[] = [
    ...reviewed.map((language) => ({
      key: language.code,
      title: language.name,
      subtitle: languageRegionLabel(language.code, language.name),
      searchText: reviewedLanguageSearchText(language.code, language.name),
      selected: language.code === locale,
      onSelect: () => {
        setOpen(false);
        void selectLanguage(language.code);
      },
    })),
    ...automatic.map((language) => ({
      key: language.code,
      title: language.name,
      subtitle: i18n.resolve("languages.automatic_badge", "Automatic").text,
      searchText: `${language.name} ${language.searchTerms} ${language.code}`,
      selected: language.code === locale,
      onSelect: () => {
        setOpen(false);
        void selectLanguage(language.code);
      },
    })),
  ];

  const currencyRows: PickerRow[] = currencies.map((code) => ({
    key: code,
    title: currencyDisplayName(code, i18n.locale),
    subtitle: `${code} – ${currencySymbol(code, i18n.locale)}`,
    searchText: currencySearchText(code, i18n.locale),
    selected: code === currentCurrency,
    onSelect: () => {
      setOpen(false);
      void selectCurrency(code);
    },
  }));

  const suggestedLanguageRows = languageRows.filter(
    (row) => row.key === suggestedLocale,
  );
  const suggestedCurrencyRows = currencyRows.filter(
    (row) => row.key === suggestedCurrency,
  );

  const currentLanguageLabel =
    languageRows.find((row) => row.key === locale)?.title ??
    // Neither list can name a Google-only language during a server render, and the
    // label visibly flipped once Google's list arrived without this. `Intl` runs on
    // both sides and produces the same native name.
    nativeLanguageName(locale) ??
    languages.find((language) => language.code === DEFAULT_LOCALE)?.name ??
    "English";

  const triggerLabel = i18n.resolve(
    "regional.trigger_label",
    "Language and currency",
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="notranslate gap-1.5 rounded-full px-3 font-medium"
          aria-label={triggerLabel.text}
        >
          <Globe className="h-4 w-4" />
          <span className="hidden sm:inline">
            {currentLanguageLabel} · {currentCurrency}
          </span>
        </Button>
      </DialogTrigger>

      <DialogContent className="notranslate flex h-[85vh] max-h-[46rem] w-[min(64rem,95vw)] max-w-none flex-col gap-4 overflow-hidden p-5 sm:p-6">
        <DialogTitle className="sr-only">{triggerLabel.text}</DialogTitle>
        <DialogDescription className="sr-only">
          <Tx
            k="regional.dialog_description"
            source="Choose the language you read the site in and the currency prices are shown in. They are separate settings."
          />
        </DialogDescription>

        <Tabs defaultValue="language" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="justify-start">
            <TabsTrigger value="language">
              <Tx k="regional.tab_language" source="Language and region" />
            </TabsTrigger>
            <TabsTrigger value="currency">
              <Tx k="regional.tab_currency" source="Currency" />
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="language"
            className="mt-4 flex min-h-0 flex-1 flex-col"
          >
            <PickerPanel
              rows={languageRows}
              suggested={suggestedLanguageRows}
              searchPlaceholder={
                i18n.resolve("languages.search_placeholder", "Search languages").text
              }
              searchLabel={
                i18n.resolve("regional.search_languages_label", "Search languages")
                  .text
              }
              suggestedHeading={
                <Tx
                  k="regional.suggested_languages"
                  source="Suggested languages and regions"
                />
              }
              allHeading={
                <Tx
                  k="regional.all_languages"
                  source="Choose a language and region"
                />
              }
              emptyLabel={
                i18n.resolve("languages.no_results", "No languages found").text
              }
            />
          </TabsContent>

          <TabsContent
            value="currency"
            className="mt-4 flex min-h-0 flex-1 flex-col"
          >
            {ratesUnavailable && (
              <p className="mb-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                <Tx
                  k="regional.rates_unavailable"
                  source="Converted prices are temporarily unavailable. Prices are shown in the property's official currency."
                />
              </p>
            )}
            <PickerPanel
              rows={currencyRows}
              suggested={suggestedCurrencyRows}
              searchPlaceholder={
                i18n.resolve("regional.search_currencies", "Search currencies").text
              }
              searchLabel={
                i18n.resolve("regional.search_currencies_label", "Search currencies")
                  .text
              }
              suggestedHeading={
                <Tx k="regional.suggested_currencies" source="Suggested currencies" />
              }
              allHeading={<Tx k="regional.all_currencies" source="Choose a currency" />}
              emptyLabel={
                i18n.resolve("regional.no_currencies", "No currencies found").text
              }
            />
          </TabsContent>
        </Tabs>
      </DialogContent>

      {/* Selection closes the dialog, so the confirmation has to be announced from
          somewhere that stays mounted. */}
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </Dialog>
  );
}
