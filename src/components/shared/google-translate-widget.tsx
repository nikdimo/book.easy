"use client";

import { useState, useSyncExternalStore } from "react";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tx, useI18n } from "@/lib/i18n/client";
import { recordLanguageSelection } from "@/lib/actions/language.actions";
import { DEFAULT_LOCALE, normalizeLocaleCode } from "@/lib/i18n/locale-preference";
import {
  getActiveLocale,
  getAutomaticLanguages,
  getFallbackAutomaticLanguages,
  getServerActiveLocale,
  getServerAutomaticLanguages,
  subscribeActiveLocale,
  subscribeAutomaticLanguages,
  syncBrowserLanguageCookies,
} from "@/lib/i18n/google-translate-runtime";
import {
  languageSearchScore,
  reviewedLanguageSearchText,
} from "@/lib/i18n/reviewed-languages";
import { sortLanguagePickerRows } from "@/lib/i18n/language-picker-order";

interface LanguageOption {
  code: string;
  name: string;
  isDefault: boolean;
  useAiTranslation: boolean;
}

/** A language's own name for itself, matching how `collectLanguages` labels Google's
 *  list. Returns null when the runtime has no data for the code, which keeps an
 *  unrecognized value from rendering as itself. */
function nativeLanguageName(code: string): string | null {
  try {
    const name = new Intl.DisplayNames([code], { type: "language" }).of(code);
    return name && name !== code ? name : null;
  } catch {
    return null;
  }
}

async function setLanguage(code: string) {
  const locale = normalizeLocaleCode(code);
  if (!locale) return;

  syncBrowserLanguageCookies(locale);
  try {
    await recordLanguageSelection(locale);
  } catch {
    // Selection tracking is best-effort; never block switching the language.
  }
  window.location.reload();
}

/**
 * Presentation only. Google's script, the hidden translate element, cookie
 * normalization and every retranslation pass belong to `GoogleTranslateController`,
 * which the root layout mounts once — this component may safely appear several times
 * (header, both responsive sidebars) without multiplying translation work.
 */
export function GoogleTranslateWidget({
  languages,
  currentLocale,
}: {
  languages: LanguageOption[];
  currentLocale?: string;
}) {
  const i18n = useI18n();
  const [open, setOpen] = useState(false);
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
  // The runtime is authoritative once it has started, because it owns the cookies and
  // Google's target. Before hydration it has nothing to report, so the server render
  // falls back to the prop and then to the root provider's `requestedLocale` — never to
  // `i18n.locale`, which is the *catalog* locale and reads "en" for an automatic
  // (Google-only) selection. Host and admin mount four selectors between them with no
  // prop to pass, so that last fallback is what they actually render from: getting it
  // wrong showed "English" in both panels while the visitor was reading Portuguese.
  const current =
    normalizeLocaleCode(activeLocale) ??
    normalizeLocaleCode(currentLocale) ??
    normalizeLocaleCode(i18n.requestedLocale) ??
    DEFAULT_LOCALE;

  const reviewed = languages.filter(
    (language) => language.isDefault || language.useAiTranslation,
  );
  const reviewedCodes = new Set(reviewed.map((language) => language.code));
  const availableAutomaticLanguages =
    automaticLanguages.length > 0
      ? automaticLanguages
      : getFallbackAutomaticLanguages(i18n.requestedLocale);
  const automatic = availableAutomaticLanguages.filter(
    (language) => !reviewedCodes.has(language.code),
  );
  const languageOptions = sortLanguagePickerRows(
    [
      ...reviewed.map((language) => ({
        code: language.code,
        name: language.name,
        searchTerms: reviewedLanguageSearchText(language.code, language.name),
        automatic: false,
      })),
      ...automatic.map((language) => ({ ...language, automatic: true })),
    ].map((language) => ({ ...language, key: language.code, title: language.name })),
  );
  const currentLabel =
    reviewed.find((language) => language.code === current)?.name ??
    automatic.find((language) => language.code === current)?.name ??
    // Neither list can name a Google-only language during a server render: it is absent
    // from the reviewed catalog by definition, and `automaticLanguages` is populated from
    // Google's `<select>`, which exists only in the browser. Without this the server
    // rendered "English" for an automatic selection and the label visibly flipped once
    // Google's list arrived — most obviously in host and admin, whose selectors have no
    // `currentLocale` prop. `Intl` runs on both sides and produces the same native name
    // `collectLanguages` derives, so the first paint is already correct.
    nativeLanguageName(current) ??
    languages.find((language) => language.code === DEFAULT_LOCALE)?.name ??
    "English";
  const searchPlaceholder = i18n.resolve(
    "languages.search_placeholder",
    "Search languages",
  ).text;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="notranslate rounded-full font-medium gap-1.5 px-3"
        >
          <Globe className="h-4 w-4" />
          <span className="hidden sm:inline">{currentLabel}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="notranslate w-80 p-0">
        <Command filter={languageSearchScore}>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>
              <Tx k="languages.no_results" source="No languages found" />
            </CommandEmpty>
            <CommandGroup>
              {languageOptions.map((language) => (
                <CommandItem
                  key={language.code}
                  value={language.searchTerms}
                  data-checked={language.code === current}
                  onSelect={() => {
                    setOpen(false);
                    void setLanguage(language.code);
                  }}
                >
                  <span className="flex-1">{language.name}</span>
                  {language.automatic ? (
                    <span className="text-[0.68rem] text-muted-foreground">
                      <Tx k="languages.automatic_badge" source="Automatic" />
                    </span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
