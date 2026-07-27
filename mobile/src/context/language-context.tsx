import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { apiFetch, LanguageOption, LanguagesResponse } from "@/lib/api";

const STORAGE_KEY = "bookeasy:mobile-locale";

interface LanguageState {
  locale: string;
  languages: LanguageOption[];
  t: (source: string, values?: Record<string, string | number>) => string;
  setLocale: (locale: string) => Promise<void>;
}

const LanguageContext = createContext<LanguageState | null>(null);

export function LanguageProvider({ children }: PropsWithChildren) {
  const [locale, setCurrentLocale] = useState("en");
  const [languages, setLanguages] = useState<LanguageOption[]>([
    { code: "en", name: "English", isDefault: true, useAiTranslation: false },
  ]);
  const [messages, setMessages] = useState<Record<string, string>>({});

  const load = useCallback(async (requestedLocale: string) => {
    const result = await apiFetch<LanguagesResponse>(
      `/api/mobile/v1/languages?locale=${encodeURIComponent(requestedLocale)}`
    );
    setCurrentLocale(result.locale);
    setLanguages(result.languages);
    setMessages(result.messages);
    return result.locale;
  }, []);

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => load(stored ?? "en"))
      .catch(() => load("en"))
      .catch(() => {
        // English fallback remains usable while offline.
      });
  }, [load]);

  const setLocale = useCallback(
    async (nextLocale: string) => {
      const previous = locale;
      setCurrentLocale(nextLocale);
      try {
        const resolved = await load(nextLocale);
        await AsyncStorage.setItem(STORAGE_KEY, resolved);
        void apiFetch("/api/mobile/v1/languages", {
          method: "POST",
          body: JSON.stringify({ locale: resolved }),
        }).catch(() => {});
      } catch (error) {
        setCurrentLocale(previous);
        throw error;
      }
    },
    [load, locale]
  );

  const t = useCallback(
    (source: string, values: Record<string, string | number> = {}) => {
      const template = messages[source] ?? source;
      return template.replace(/\{(\w+)\}/g, (match, key: string) =>
        key in values ? String(values[key]) : match
      );
    },
    [messages]
  );

  const value = useMemo(
    () => ({ locale, languages, setLocale, t }),
    [languages, locale, setLocale, t]
  );
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("useLanguage must be used inside LanguageProvider");
  return value;
}
