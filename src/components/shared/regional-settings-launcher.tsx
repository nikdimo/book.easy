import { getEnabledLanguages } from "@/lib/services/language.service";
import { getLocale } from "@/lib/i18n/t";
import { getDetectedCountry } from "@/lib/geo/detected-country";
import { getDisplayCurrency } from "@/lib/currency/server";
import { currencyFromCountry } from "@/lib/currency/currency-preference";
import { getExchangeRates, quotableCurrencies } from "@/lib/currency/rates";
import { RegionalSettingsDialog } from "@/components/shared/regional-settings-dialog";

/**
 * Gathers everything the regional-settings modal needs and renders it.
 *
 * A server component so each layout can drop in one tag instead of threading six
 * props through — `(account)` was already rendering the header with no language
 * list at all, which is exactly the kind of drift prop-plumbing invites.
 *
 * Every value here is resilient to a database or provider outage: the modal has to
 * open even when nothing else on the page works, because it is how someone fixes a
 * language they cannot read.
 */
export async function RegionalSettingsLauncher({
  hideTrigger = false,
}: {
  /** For layouts that open the dialog from their own control instead of the chips. */
  hideTrigger?: boolean;
} = {}) {
  const [locale, currency, country] = await Promise.all([
    getLocale(),
    getDisplayCurrency(),
    getDetectedCountry(),
  ]);

  let languages: Awaited<ReturnType<typeof getEnabledLanguages>> = [];
  try {
    languages = await getEnabledLanguages();
  } catch {
    // The picker still opens; it just lists Google's automatic languages only.
  }

  const rates = await getExchangeRates();

  return (
    <RegionalSettingsDialog
      languages={languages}
      currentLocale={locale}
      currencies={quotableCurrencies(rates)}
      currentCurrency={currency}
      suggestedCurrency={currencyFromCountry(country)}
      ratesUnavailable={rates === null}
      hideTrigger={hideTrigger}
    />
  );
}
