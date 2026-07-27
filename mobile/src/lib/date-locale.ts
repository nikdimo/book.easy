import { format } from "date-fns/format";
import type { Locale } from "date-fns";
import { bg } from "date-fns/locale/bg";
import { de } from "date-fns/locale/de";
import { el } from "date-fns/locale/el";
import { enUS } from "date-fns/locale/en-US";
import { es } from "date-fns/locale/es";
import { fr } from "date-fns/locale/fr";
import { it } from "date-fns/locale/it";
import { mk } from "date-fns/locale/mk";
import { nl } from "date-fns/locale/nl";
import { pl } from "date-fns/locale/pl";
import { ro } from "date-fns/locale/ro";
import { ru } from "date-fns/locale/ru";
import { sq } from "date-fns/locale/sq";
import { sr } from "date-fns/locale/sr";
import { tr } from "date-fns/locale/tr";
import { uk } from "date-fns/locale/uk";

const DATE_LOCALES: Readonly<Record<string, Locale>> = {
  en: enUS,
  mk,
  sq,
  sr,
  tr,
  bg,
  ro,
  de,
  el,
  it,
  fr,
  es,
  nl,
  pl,
  uk,
  ru,
};

export function formatLocalizedDate(
  date: Date,
  pattern: string,
  locale?: string
): string {
  return format(date, pattern, {
    locale: DATE_LOCALES[locale?.toLowerCase() ?? "en"] ?? enUS,
  });
}
