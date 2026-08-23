import { PriceStep } from "@/components/host/v2/listings/price-step";
import { NewListingHeader } from "@/components/host/v2/listings/new-listing-header";
import { requireHostPage } from "@/lib/auth-helpers";
import { getDisplayCurrency } from "@/lib/currency/server";
import { getExchangeRates } from "@/lib/currency/rates";
import { getT } from "@/lib/i18n/t";
import { requireListingFlowContext, type ListingFlowSearchParams } from "@/lib/listing-flow-context";

export const metadata = { title: "Price" };

/**
 * The first screen of phase three. Nothing is written here: the flow still carries its
 * whole state in the URL, and the nightly price lives only in the tab.
 *
 * The currency is the one a `PricingRule` is created with, so the amount shown here is
 * the amount the listing will be priced in. The host's own display currency is the
 * fallback for a draft that carries none — a host browsing in DKK prices in DKK — and
 * it is only ever a fallback: a draft that already has a currency (an imported listing
 * priced in USD, say) keeps it, and the step reads that from the draft rather than
 * from here.
 *
 * The rate table rides along so that a host who changed currency mid-flow can be
 * *offered* a conversion of the amounts they already entered. The step never applies
 * it on its own, and it never renames an amount without moving it.
 *
 * Keeps the phase-one `md:h-dvh`, so the screen still centres on a desktop viewport, but
 * scrolls rather than clips: this step carries a second amount and an example line now,
 * and on a short laptop `overflow-hidden` would cut the currency line off with no way to
 * reach it. The explanation itself is a sheet precisely so it can never add to this.
 */
export default async function PricePage({ searchParams }: { searchParams: Promise<ListingFlowSearchParams> }) {
  const [params, , t, displayCurrency, rates] = await Promise.all([
    searchParams,
    requireHostPage(),
    getT(),
    getDisplayCurrency(),
    getExchangeRates(),
  ]);
  const { propertyType, spaceType } = await requireListingFlowContext(params);
  return (
    <div className="listing-flow flex min-h-dvh flex-col bg-white text-slate-950 md:h-dvh md:overflow-y-auto">
      <NewListingHeader t={t} exitHref="/host/listings" />
      <PriceStep
        propertyType={propertyType}
        spaceType={spaceType}
        currency={displayCurrency}
        displayCurrency={displayCurrency}
        rates={rates?.rates ?? null}
      />
    </div>
  );
}
