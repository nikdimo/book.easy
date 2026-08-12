"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleDollarSign, Globe, Languages, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import {
  readAutoTranslateUserContentPreference,
  writeAutoTranslateUserContentPreference,
} from "@/lib/i18n/user-content-translation";

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
    <div className="grid grid-cols-1 gap-x-2 gap-y-0.5 min-[30rem]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {rows.map((row) => (
        <button
          key={row.key}
          type="button"
          onClick={row.onSelect}
          aria-current={row.selected ? "true" : undefined}
          className={cn(
            "flex items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors",
            "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            row.selected ? "border-foreground" : "border-transparent",
          )}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm leading-5">{row.title}</span>
            <span className="block truncate text-xs leading-4 text-muted-foreground">
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
    <div className="flex min-h-0 flex-1 flex-col gap-3 md:gap-4">
      <div className="relative">
        <Search
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchLabel}
          className="pr-10"
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
  const [activeTab, setActiveTab] = useState<"language" | "currency">("language");
  const [announcement, setAnnouncement] = useState("");
  const [autoTranslateUserContent, setAutoTranslateUserContent] = useState(true);

  function openSettings(tab: "language" | "currency") {
    setActiveTab(tab);
    setOpen(true);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setAutoTranslateUserContent(readAutoTranslateUserContentPreference());
    }
    setOpen(nextOpen);
  }

  function toggleUserContentTranslation() {
    const enabled = !autoTranslateUserContent;
    setAutoTranslateUserContent(enabled);
    writeAutoTranslateUserContentPreference(enabled);
    // Google has already replaced text nodes on the current document. Reloading is
    // the only reliable way to restore host and review source text when disabling,
    // and it also lets Google translate newly enabled content in one clean pass.
    window.location.reload();
  }

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

  /** "mk", "zh-CN" → "MK", "ZH". The region half is dropped: it is the language
   *  being switched, and a four-character badge unbalances the pair. */
  const localeBadge = locale.split("-")[0]!.toUpperCase();

  const triggerLabel = i18n.resolve(
    "regional.trigger_label",
    "Language and currency",
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* Two halves of one control. The language shows its code rather than its
          full name — "Македонски" beside a currency code made the header read as
          loose text, and the name is one hover (or one tap) away either way. */}
      <div className="notranslate flex shrink-0 items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 rounded-full px-2.5 font-semibold"
              aria-label={i18n.resolve("regional.open_language", "Change language").text}
              onClick={() => openSettings("language")}
            >
              <Globe className="size-[18px]" />
              <span className="hidden sm:inline">{localeBadge}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{currentLanguageLabel}</TooltipContent>
        </Tooltip>

        <span aria-hidden className="h-4 w-px shrink-0 bg-border" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 rounded-full px-2.5 font-semibold"
              aria-label={i18n.resolve("regional.open_currency", "Change currency").text}
              onClick={() => openSettings("currency")}
            >
              <CircleDollarSign className="size-[18px]" />
              <span>{currentCurrency}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {currencyDisplayName(currentCurrency, i18n.locale)}
          </TooltipContent>
        </Tooltip>
      </div>

      <DialogContent
        showCloseButton={false}
        className="notranslate flex h-[90vh] max-h-[52rem] w-[calc(100vw-1.5rem)] max-w-none flex-col gap-5 overflow-hidden p-4 max-md:h-[calc(100dvh-1rem)] max-md:max-h-none max-md:w-[calc(100vw-1rem)] max-md:gap-3 max-md:rounded-3xl max-md:p-3 sm:w-[calc(100vw-3rem)] sm:max-w-[78rem] sm:p-6 lg:p-7"
      >
        <DialogTitle className="sr-only">{triggerLabel.text}</DialogTitle>
        <DialogDescription className="sr-only">
          <Tx
            k="regional.dialog_description"
            source="Choose the language you read the site in and the currency prices are shown in. They are separate settings."
          />
        </DialogDescription>

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as "language" | "currency")}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="grid w-full grid-cols-[minmax(0,44rem)_minmax(14rem,1fr)_auto] items-center gap-3 max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-x-2 max-md:gap-y-1">
            <TabsList
              data-desktop-search-pill
              className="relative z-[60] h-auto w-full min-w-0 items-stretch justify-start gap-0 rounded-full border border-black/10 bg-[#f7f7f7] p-1 shadow-[0_1px_2px_rgba(0,0,0,0.08),0_8px_24px_rgba(0,0,0,0.08)] transition-shadow duration-200 group-data-horizontal/tabs:h-auto hover:shadow-[0_2px_4px_rgba(0,0,0,0.10),0_10px_28px_rgba(0,0,0,0.10)] max-md:col-start-1 max-md:row-start-1"
            >
              <TabsTrigger
                value="language"
                className="relative h-auto min-w-0 flex-1 cursor-pointer items-center justify-start rounded-full border-0 px-6 py-2.5 text-left transition-[background-color,box-shadow,transform] duration-200 ease-out after:absolute after:right-0 after:top-1/2 after:h-8 after:w-px after:-translate-y-1/2 after:bg-black/8 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-active:bg-white data-active:shadow-[0_2px_10px_rgba(15,23,42,0.12)] data-active:after:opacity-0 max-md:px-4 max-md:py-2"
              >
                <span className="min-w-0 flex-1 text-left">
                  <span className="block text-[0.72rem] font-semibold leading-4 text-foreground">
                    <Tx k="regional.tab_language" source="Language and region" />
                  </span>
                  <span className="mt-px block truncate text-sm font-normal leading-5 text-muted-foreground">
                    {currentLanguageLabel}
                  </span>
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="currency"
                className="relative h-auto min-w-0 flex-1 cursor-pointer items-center justify-start rounded-full border-0 px-6 py-2.5 text-left transition-[background-color,box-shadow,transform] duration-200 ease-out after:hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-active:bg-white data-active:shadow-[0_2px_10px_rgba(15,23,42,0.12)] max-md:px-4 max-md:py-2"
              >
                <span className="min-w-0 flex-1 text-left">
                  <span className="block text-[0.72rem] font-semibold leading-4 text-foreground">
                    <Tx k="regional.tab_currency" source="Currency" />
                  </span>
                  <span className="mt-px block truncate text-sm font-normal leading-5 text-muted-foreground">
                    {currentCurrency}
                  </span>
                </span>
              </TabsTrigger>
            </TabsList>

            <div className="flex min-w-0 translate-y-1.5 items-center gap-3 rounded-2xl bg-[#f3f4f6] px-5 py-3 text-left max-md:col-span-2 max-md:row-start-2 max-md:translate-y-0 max-md:px-4 max-md:py-3">
              <Languages className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-sm font-semibold leading-5 text-foreground">
                  <Tx k="regional.translation_title" source="Translation" />
                </p>
                <p className="mt-px whitespace-normal text-xs font-normal leading-5 text-muted-foreground">
                  Automatically translate host-written descriptions and guest reviews.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={autoTranslateUserContent}
                aria-label={
                  i18n.resolve(
                    "regional.translation_toggle_label",
                    "Automatically translate descriptions and reviews",
                  ).text
                }
                onClick={toggleUserContentTranslation}
                className={cn(
                  "relative ml-3 h-9 w-14 shrink-0 rounded-full border-2 transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  autoTranslateUserContent
                    ? "border-foreground bg-foreground"
                    : "border-muted-foreground/60 bg-background",
                )}
              >
                <span
                  className={cn(
                    "absolute top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-background shadow transition-transform",
                    autoTranslateUserContent ? "translate-x-[1.35rem]" : "translate-x-0.5",
                  )}
                >
                  {autoTranslateUserContent ? <Check className="h-4 w-4" aria-hidden /> : null}
                </span>
              </button>
            </div>

            <DialogClose asChild>
              <Button
                size="icon"
                className="relative z-10 h-11 w-11 shrink-0 justify-self-end rounded-full bg-primary px-0 text-primary-foreground shadow-none transition-all duration-200 hover:bg-primary/95 max-md:col-start-2 max-md:row-start-1 max-md:h-10 max-md:w-10"
              >
                <X aria-hidden />
                <span className="sr-only">Close</span>
              </Button>
            </DialogClose>
          </div>

          <TabsContent
            value="language"
            className="mt-3 flex min-h-0 flex-1 flex-col md:mt-4"
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
