"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
}

function readCurrentLanguage(fallback: string): string {
  const match = document.cookie.match(new RegExp(`${COOKIE_NAME}=/[^/]+/([^;]+)`));
  return match?.[1] ?? fallback;
}

function subscribeToLanguageCookie() {
  return () => {};
}

function setLanguage(code: string, sourceLanguage: string) {
  const hostname = window.location.hostname;
  if (code === sourceLanguage) {
    document.cookie = `${COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC`;
    document.cookie = `${COOKIE_NAME}=; path=/; domain=${hostname}; expires=Thu, 01 Jan 1970 00:00:00 UTC`;
  } else {
    const value = `/${sourceLanguage}/${code}`;
    document.cookie = `${COOKIE_NAME}=${value}; path=/`;
    document.cookie = `${COOKIE_NAME}=${value}; path=/; domain=${hostname}`;
  }
  window.location.reload();
}

export function GoogleTranslateWidget({
  languages,
}: {
  languages: LanguageOption[];
}) {
  const sourceLanguage = FALLBACK_SOURCE_LANGUAGE;
  const current = useSyncExternalStore(
    subscribeToLanguageCookie,
    () => readCurrentLanguage(sourceLanguage),
    () => sourceLanguage
  );

  useEffect(() => {
    if (document.getElementById(SCRIPT_ID)) return;

    window.googleTranslateElementInit = () => {
      new window.google!.translate.TranslateElement(
        {
          pageLanguage: sourceLanguage,
          includedLanguages: languages
            .filter((l) => l.code !== sourceLanguage)
            .map((l) => l.code)
            .join(","),
          autoDisplay: false,
        },
        "google_translate_element"
      );
    };

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src =
      "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    script.async = true;
    document.body.appendChild(script);
    // languages intentionally excluded: the widget only needs to (re)init once per
    // page load, off whatever list was available on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceLanguage]);

  if (languages.length < 2) return null;

  const currentLabel =
    languages.find((l) => l.code === current)?.name ?? languages[0].name;

  return (
    <>
      <div id="google_translate_element" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="notranslate rounded-full font-medium gap-1.5 px-3"
          >
            <Globe className="h-4 w-4" />
            <span className="hidden sm:inline">{currentLabel}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="notranslate w-44">
          {languages.map((lang) => (
            <DropdownMenuItem
              key={lang.code}
              className="cursor-pointer"
              onSelect={() => setLanguage(lang.code, sourceLanguage)}
            >
              <span className={lang.code === current ? "font-semibold" : ""}>
                {lang.name}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
