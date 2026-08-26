import type { Locale } from "react-day-picker";
import {
  bg,
  de,
  el,
  es,
  fr,
  it,
  mk,
  nl,
  pl,
  ro,
  ru,
  sq,
  sr,
  tr,
  uk,
} from "react-day-picker/locale";

const LOCALES: Record<string, Locale> = {
  bg,
  de,
  el,
  es,
  fr,
  it,
  mk,
  nl,
  pl,
  ro,
  ru,
  sq,
  sr,
  tr,
  uk,
};

/** DayPicker needs a locale object, not just a BCP-47 code, for its visible date
 * formatting and translated screen-reader navigation labels. */
export function dayPickerLocaleFor(locale: string): Locale | undefined {
  return LOCALES[locale.trim().toLowerCase().split(/[-_]/)[0]];
}
