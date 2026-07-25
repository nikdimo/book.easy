"use client";

import { useEffect, useState } from "react";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tx, useI18n } from "@/lib/i18n/client";
import { recordLanguageSelection } from "@/lib/actions/language.actions";

declare global {
  interface Window {
    googleTranslateElementInit?: () => void;
    google?: {
      translate: {
        TranslateElement: {
          new (
            options: {
              pageLanguage: string;
              includedLanguages?: string;
              autoDisplay?: boolean;
            },
            elementId: string
          ): unknown;
        };
      };
    };
  }
}

const FALLBACK_SOURCE_LANGUAGE = "en";
const SCRIPT_ID = "google-translate-script";
const COOKIE_NAME = "googtrans";

interface LanguageOption {
  code: string;
  name: string;
  isDefault: boolean;
  useAiTranslation: boolean;
}

interface AutomaticLanguage {
  code: string;
  name: string;
}

function googleLanguageOptions(): AutomaticLanguage[] {
  const select = document.querySelector<HTMLSelectElement>(".goog-te-combo");
  if (!select) return [];
  return [...select.options]
    .filter((option) => option.value)
    .map((option) => ({ code: option.value, name: option.text.trim() }))
    .filter((option) => option.name);
}

async function setLanguage(code: string, sourceLanguage: string) {
  const hostname = window.location.hostname;
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  const common = `; path=/; samesite=lax${secure}`;
  const hostnameParts = hostname.split(".");
  const cookieDomains: Array<string | undefined> = [undefined];
  for (let index = 0; index < hostnameParts.length - 1; index += 1) {
    const domain = hostnameParts.slice(index).join(".");
    cookieDomains.push(domain, `.${domain}`);
  }

  if (code === sourceLanguage) {
    for (const domain of cookieDomains) {
      const domainAttribute = domain ? `; domain=${domain}` : "";
      document.cookie = `${COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 UTC${common}${domainAttribute}`;
    }
  } else {
    const value = `/${sourceLanguage}/${code}`;
    for (const domain of cookieDomains) {
      const domainAttribute = domain ? `; domain=${domain}` : "";
      document.cookie = `${COOKIE_NAME}=${value}; max-age=31536000${common}${domainAttribute}`;
    }
    try {
      await recordLanguageSelection(code);
    } catch {
      // Selection tracking is best-effort; never block switching the language.
    }
  }
  window.location.reload();
}

export function GoogleTranslateWidget({
  languages,
  currentLocale = FALLBACK_SOURCE_LANGUAGE,
}: {
  languages: LanguageOption[];
  currentLocale?: string;
}) {
  const i18n = useI18n();
  const sourceLanguage = FALLBACK_SOURCE_LANGUAGE;
  const [open, setOpen] = useState(false);
  const [automaticLanguages, setAutomaticLanguages] = useState<AutomaticLanguage[]>([]);
  // The server has already resolved the request cookie. Using document.cookie here
  // can select a stale duplicate domain cookie and disagree with the rendered locale.
  const current = currentLocale;

  useEffect(() => {
    const collectLanguages = () => {
      const options = googleLanguageOptions();
      if (options.length) setAutomaticLanguages(options);
    };

    const container = document.getElementById("google_translate_element");
    const observer = new MutationObserver(collectLanguages);
    if (container) {
      observer.observe(container, { childList: true, subtree: true });
    }

    const initialize = () => {
      if (!window.google?.translate?.TranslateElement || !container) return;
      if (!container.querySelector(".goog-te-combo")) {
        new window.google.translate.TranslateElement(
          {
            pageLanguage: sourceLanguage,
            autoDisplay: false,
          },
          "google_translate_element"
        );
      }
      collectLanguages();
    };

    window.googleTranslateElementInit = initialize;
    if (document.getElementById(SCRIPT_ID)) {
      initialize();
    } else {
      const script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src =
        "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
      script.async = true;
      document.body.appendChild(script);
    }

    return () => observer.disconnect();
  }, [sourceLanguage]);

  const reviewed = languages.filter(
    (language) => language.isDefault || language.useAiTranslation
  );
  const reviewedCodes = new Set(reviewed.map((language) => language.code));
  const automatic = automaticLanguages.filter(
    (language) => !reviewedCodes.has(language.code)
  );
  const currentLabel =
    reviewed.find((language) => language.code === current)?.name ??
    automatic.find((language) => language.code === current)?.name ??
    languages.find((language) => language.code === sourceLanguage)?.name ??
    "English";
  const searchPlaceholder = i18n.resolve(
    "languages.search_placeholder",
    "Search languages"
  ).text;

  return (
    <>
      <div id="google_translate_element" />
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
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>
                <Tx k="languages.no_results" source="No languages found" />
              </CommandEmpty>
              <CommandGroup
                heading={
                  <Tx
                    k="languages.reviewed_heading"
                    source="AI-translated system text"
                  />
                }
              >
                {reviewed.map((language) => (
                  <CommandItem
                    key={language.code}
                    value={`${language.name} ${language.code}`}
                    data-checked={language.code === current}
                    onSelect={() => {
                      setOpen(false);
                      void setLanguage(language.code, sourceLanguage);
                    }}
                  >
                    <span>{language.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
              {automatic.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup
                    heading={
                      <Tx
                        k="languages.automatic_heading"
                        source="Automatic Google translation"
                      />
                    }
                  >
                    {automatic.map((language) => (
                      <CommandItem
                        key={language.code}
                        value={`${language.name} ${language.code}`}
                        data-checked={language.code === current}
                        onSelect={() => {
                          setOpen(false);
                          void setLanguage(language.code, sourceLanguage);
                        }}
                      >
                        <span className="flex-1">{language.name}</span>
                        <span className="text-[0.68rem] text-muted-foreground">
                          <Tx k="languages.automatic_badge" source="Automatic" />
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}
